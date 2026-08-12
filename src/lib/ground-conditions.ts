/**
 * Ground-conditions translation layer.
 *
 * eventPhase drives which guidance set (before/after) is shown on Sector Guidance —
 * derived from risk tier history, not a separate model.
 *
 * All other fields pull from rain data already used by the rain trigger
 * (Open-Meteo via the ALMA engine) — no new external sources.
 */
import type { GuidanceTier, RiskTier, SectorId } from "@/lib/turkana-data";

export type RegionId = "omo" | "turkana";
export type EventPhase = "pre_risk" | "active_risk" | "post_risk";
export type CropStage = "planting" | "growing" | "harvest";
export type SoilMoisture = "low" | "moderate" | "high";
export type GrazingCondition = "adequate" | "stressed";
export type ClimateState = "dry_spell" | "wet_trend" | "stable";

export type RegionStatus = {
  regionId: RegionId;
  label: string;
  cropStage: CropStage;
  soilMoisture: SoilMoisture;
  grazingCondition: GrazingCondition;
  climateState: ClimateState;
  eventPhase: EventPhase;
  /** Plain-language agriculture line */
  agricultureSummary: string;
  /** Plain-language livestock line */
  livestockSummary: string;
  /** Climate snapshot line */
  climateSummary: string;
  dryDays: number;
  wetStreakDays: number;
  rain24hMm: number;
  rain7dMm: number;
  tier: RiskTier;
  compoundActive: boolean;
  /**
   * Audience-tiered display — farmers get fused consequence (impact-based),
   * NGOs get full mechanism (technical). Same underlying data, different
   * presentation layer. Existing compound tier, relabeled for farmer channels.
   */
  farmerFloodRisk: GuidanceTier;
  /** Parallel drought tier from climateState / dry_spell — Safe/Watch/Warning/Severe */
  droughtRisk: Exclude<RiskTier, never>;
  /**
   * This is an eligibility FLAG only, not a payment system. Real disbursement
   * remains manual/off-platform. Mirrors the logic of parametric insurance
   * (event-threshold-triggered) without building actual financial rails.
   */
  recoveryEligible: boolean;
  severeOrCompoundHours: number;
};

export type RainInputs = {
  rain24hMm: number;
  rain7dMm: number;
  /** Daily precipitation mm, oldest → newest (Open-Meteo daily already on desk) */
  dailyMm: number[];
  tier: RiskTier;
  compoundActive: boolean;
};

const HISTORY_KEY = "alma_tier_history_v1";
const POST_RISK_WINDOW_S = 72 * 3600;

type TierEvent = { regionId: RegionId; tier: RiskTier; compound: boolean; at: number };

const TIER_RANK: Record<RiskTier, number> = {
  safe: 0,
  watch: 1,
  warning: 2,
  severe: 3,
};

function isElevated(tier: RiskTier, compoundActive: boolean): boolean {
  // Warning / Severe / Compound window → active_risk
  return compoundActive || TIER_RANK[tier] >= TIER_RANK.warning;
}

function wasSevereOrCompound(ev: TierEvent): boolean {
  return ev.compound || ev.tier === "severe";
}

/** Parametric-style threshold: ≥6h at Severe/Compound in the event window. */
export const RECOVERY_SEVERE_HOURS = 6;

/**
 * Audience-tiered display — farmers get fused consequence (impact-based),
 * NGOs get full mechanism (technical). Same underlying data, different
 * presentation layer. No new risk calculation — display filter on compound output.
 */
export function deriveFarmerFloodRisk(tier: RiskTier, compoundActive: boolean): GuidanceTier {
  return compoundActive ? "compound" : tier;
}

/** Parallel drought tier from existing climateState / dry_spell detection. */
export function deriveDroughtRisk(climateState: ClimateState, dryDays: number): RiskTier {
  if (climateState === "dry_spell") {
    if (dryDays >= 14) return "severe";
    if (dryDays >= 10) return "warning";
    return "watch";
  }
  if (climateState === "wet_trend") return "safe";
  if (dryDays >= 5) return "watch";
  return "safe";
}

/** Hours at Severe/Compound from local tier history (mirrors engine SQLite logic). */
export function severeOrCompoundHours(regionId: RegionId, nowSec = Date.now() / 1000): number {
  const hist = loadHistory()
    .filter((e) => e.regionId === regionId && nowSec - e.at <= POST_RISK_WINDOW_S)
    .sort((a, b) => a.at - b.at);
  if (!hist.length) return 0;
  let hours = 0;
  for (let i = 0; i < hist.length; i++) {
    const start = hist[i].at;
    const end = i + 1 < hist.length ? hist[i + 1].at : nowSec;
    if (wasSevereOrCompound(hist[i])) hours += Math.max(0, (end - start) / 3600);
  }
  return Math.round(hours * 100) / 100;
}

/**
 * This is an eligibility FLAG only, not a payment system. Real disbursement
 * remains manual/off-platform. Mirrors the logic of parametric insurance
 * (event-threshold-triggered) without building actual financial rails.
 */
export function recoveryEligible(regionId: RegionId, nowSec = Date.now() / 1000): boolean {
  return severeOrCompoundHours(regionId, nowSec) >= RECOVERY_SEVERE_HOURS;
}

function loadHistory(): TierEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TierEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(events: TierEvent[]) {
  if (typeof window === "undefined") return;
  const cutoff = Date.now() / 1000 - POST_RISK_WINDOW_S * 2;
  const pruned = events.filter((e) => e.at >= cutoff).slice(-200);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));
}

/** Record current tier so post_risk can look back 72h. */
export function recordTierSnapshot(regionId: RegionId, tier: RiskTier, compoundActive: boolean) {
  const now = Date.now() / 1000;
  const hist = loadHistory();
  const last = [...hist].reverse().find((e) => e.regionId === regionId);
  // Avoid spamming identical ticks every poll
  if (last && last.tier === tier && last.compound === compoundActive && now - last.at < 600) {
    return;
  }
  hist.push({ regionId, tier, compound: compoundActive, at: now });
  saveHistory(hist);
}

/**
 * eventPhase drives which guidance set (before/after) is shown on Sector Guidance —
 * derived from risk tier history, not a separate model.
 */
export function deriveEventPhase(
  regionId: RegionId,
  tier: RiskTier,
  compoundActive: boolean,
  nowSec = Date.now() / 1000,
): EventPhase {
  if (isElevated(tier, compoundActive)) return "active_risk";

  const hist = loadHistory().filter((e) => e.regionId === regionId);
  const recentSevere = hist.some(
    (e) => wasSevereOrCompound(e) && nowSec - e.at <= POST_RISK_WINDOW_S,
  );
  if (recentSevere) return "post_risk";
  return "pre_risk";
}

/** Map calendar month → crop stage for Omo–Turkana (static seasonal lookup). */
export function cropStageForMonth(monthIndex: number, regionId: RegionId): CropStage {
  // Why: East African long rains ~Mar–May planting/early growth; mid-year growing;
  // short rains / harvest window late year. Slight Omo lag vs Turkana is ignored for demo.
  void regionId;
  if (monthIndex >= 2 && monthIndex <= 4) return "planting";
  if (monthIndex >= 5 && monthIndex <= 8) return "growing";
  return "harvest";
}

/**
 * soilMoisture from rainfall accumulation already used by the rain trigger.
 * Why: 7d sum is a coarse proxy for profile wetness without a soil probe feed.
 */
export function deriveSoilMoisture(rain7dMm: number): SoilMoisture {
  if (rain7dMm < 25) return "low";
  if (rain7dMm < 80) return "moderate";
  return "high";
}

/**
 * grazingCondition from rainfall trend over available daily series (~7–14d).
 * Why: dry trend (recent half colder than earlier half) → stressed forage.
 */
export function deriveGrazingCondition(dailyMm: number[]): GrazingCondition {
  if (dailyMm.length < 4) {
    const sum = dailyMm.reduce((a, b) => a + b, 0);
    return sum < 20 ? "stressed" : "adequate";
  }
  const mid = Math.floor(dailyMm.length / 2);
  const earlier = dailyMm.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const later = dailyMm.slice(mid).reduce((a, b) => a + b, 0) / (dailyMm.length - mid);
  // Dry trend = later period clearly drier
  return later + 2 < earlier * 0.75 || later < 2 ? "stressed" : "adequate";
}

/**
 * climateState from existing Open-Meteo daily rain.
 * dry_spell = no rainfall >5mm in past 7 days
 * wet_trend = recent consecutive days with rain ≥2mm
 */
export function deriveClimateState(dailyMm: number[]): {
  climateState: ClimateState;
  dryDays: number;
  wetStreakDays: number;
} {
  const last7 = dailyMm.slice(-7);
  const significant = last7.map((mm) => mm > 5);
  let dryDays = 0;
  for (let i = last7.length - 1; i >= 0; i--) {
    if (last7[i] > 5) break;
    dryDays++;
  }
  let wetStreakDays = 0;
  for (let i = last7.length - 1; i >= 0; i--) {
    if (last7[i] < 2) break;
    wetStreakDays++;
  }
  // dry_spell = no rainfall >5mm in past 7 days, using existing Open-Meteo data
  if (last7.length >= 5 && significant.every((s) => !s)) {
    return { climateState: "dry_spell", dryDays: Math.max(dryDays, last7.length), wetStreakDays };
  }
  if (wetStreakDays >= 3) {
    return { climateState: "wet_trend", dryDays, wetStreakDays };
  }
  return { climateState: "stable", dryDays, wetStreakDays };
}

function climateSummary(state: ClimateState, dryDays: number, wetStreakDays: number): string {
  if (state === "dry_spell") {
    return `Dry spell — ${dryDays} days with no significant rainfall`;
  }
  if (state === "wet_trend") {
    return `Wet trend — ${wetStreakDays}${ordinal(wetStreakDays)} consecutive day of rainfall`;
  }
  return "Conditions stable";
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[v % 10] || "th";
}

const REGION_META: Record<RegionId, { label: string; rainFactor: number }> = {
  // Why slight rainFactor: upstream Omo sees the Open-Meteo pulse first; Turkana is attenuated.
  omo: { label: "Omo side (Ethiopia)", rainFactor: 1.12 },
  turkana: { label: "Turkana side (Kenya)", rainFactor: 0.88 },
};

export function buildRegionStatus(
  regionId: RegionId,
  inputs: RainInputs,
  now = new Date(),
): RegionStatus {
  const meta = REGION_META[regionId];
  const rain24 = Math.round(inputs.rain24hMm * meta.rainFactor * 10) / 10;
  const rain7 = Math.round(inputs.rain7dMm * meta.rainFactor * 10) / 10;
  const daily = inputs.dailyMm.map((mm) => Math.round(mm * meta.rainFactor * 10) / 10);

  recordTierSnapshot(regionId, inputs.tier, inputs.compoundActive);
  const eventPhase = deriveEventPhase(regionId, inputs.tier, inputs.compoundActive);

  const cropStage = cropStageForMonth(now.getMonth(), regionId);
  const soilMoisture = deriveSoilMoisture(rain7);
  const grazingCondition = deriveGrazingCondition(daily);
  const { climateState, dryDays, wetStreakDays } = deriveClimateState(daily);

  const agricultureSummary = `${capitalize(cropStage)} season, ${soilMoisture} soil moisture`;
  const livestockSummary =
    grazingCondition === "stressed"
      ? `Grazing stressed — ${Math.max(dryDays, 1)} days below average rainfall`
      : "Grazing adequate for current forage window";

  // Audience-tiered display — farmers get fused consequence (impact-based),
  // NGOs get full mechanism (technical). Same underlying data, different
  // presentation layer.
  const flood = deriveFarmerFloodRisk(inputs.tier, inputs.compoundActive);
  const drought = deriveDroughtRisk(climateState, dryDays);
  // This is an eligibility FLAG only, not a payment system.
  const eligible = recoveryEligible(regionId);
  const severeHours = severeOrCompoundHours(regionId);

  return {
    regionId,
    label: meta.label,
    cropStage,
    soilMoisture,
    grazingCondition,
    climateState,
    eventPhase,
    agricultureSummary,
    livestockSummary,
    climateSummary: climateSummary(climateState, dryDays, wetStreakDays),
    dryDays,
    wetStreakDays,
    rain24hMm: rain24,
    rain7dMm: rain7,
    tier: inputs.tier,
    compoundActive: inputs.compoundActive,
    farmerFloodRisk: flood,
    droughtRisk: drought,
    recoveryEligible: eligible,
    severeOrCompoundHours: severeHours,
  };
}

export function buildAllRegionStatuses(inputs: RainInputs): Record<RegionId, RegionStatus> {
  return {
    omo: buildRegionStatus("omo", inputs),
    turkana: buildRegionStatus("turkana", inputs),
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Before-guidance: climate-triggered + severity, for pre_risk / active_risk. */
export function beforeGuidance(
  sector: SectorId,
  climateState: ClimateState,
  tier: RiskTier,
  compoundActive: boolean,
  rainEtaH: number,
): string {
  const guidanceTier: GuidanceTier = compoundActive ? "compound" : tier;
  const hours = Math.max(6, Math.round(rainEtaH));

  if (guidanceTier === "severe" || guidanceTier === "compound") {
    const severe: Record<SectorId, string> = {
      agriculture: "Secure feed stores and seed stock now. Evacuate floodplain plots.",
      livestock: "Move livestock to higher ground immediately.",
      fisheries: "Pull boats now. No night fishing. High-ground camps only.",
      health: "Activate outbreak readiness; secure clean-water supply at posts.",
    };
    return severe[sector];
  }

  if (climateState === "dry_spell") {
    const dry: Record<SectorId, string> = {
      agriculture: "Consider drought-resistant varieties. Delay water-intensive planting.",
      livestock: "Move herds toward known water points early.",
      fisheries: "Expect lower lake edge; secure nets above the dry-season line.",
      health: "Stock ORS early — dry-spell heat and water stress raise AWD risk.",
    };
    return dry[sector];
  }

  if (climateState === "wet_trend" && (tier === "watch" || tier === "warning")) {
    const wet: Record<SectorId, string> = {
      agriculture: `Harvest maturing crops within ${hours}h if in flood path. Move seed stock to elevated storage.`,
      livestock: "Begin moving herds toward higher ground.",
      fisheries: `Anchor boats above the waterline; surge window ~${hours}h.`,
      health: "Pre-position ORS and aquatabs; brief community volunteers.",
    };
    return wet[sector];
  }

  // Default: reuse matrix-style tier guidance
  const fallback: Record<RiskTier, Record<SectorId, string>> = {
    safe: {
      agriculture: "Normal operations. Routine drainage maintenance.",
      livestock: "Normal grazing rotation on floodplain pasture.",
      fisheries: "Normal fishing activity across the lake.",
      health: "Routine surveillance. No additional stock needed.",
    },
    watch: {
      agriculture: "Inspect drainage; plan an early harvest of mature plots.",
      livestock: "Identify high-ground corridors and confirm forage.",
      fisheries: "Check moorings; log boats going out on the delta.",
      health: "Verify purification supplies at riverside posts.",
    },
    warning: {
      agriculture: "Harvest mature crops now; move stored grain up.",
      livestock: "Begin herd movement to the high-ground corridor.",
      fisheries: "Anchor boats above the waterline; suspend night fishing.",
      health: "Pre-position ORS and aquatabs; brief volunteers.",
    },
    severe: {
      agriculture: "Abandon field work. Secure inputs and evacuate plots.",
      livestock: "Complete evacuation of all herds to the corridor.",
      fisheries: "All boats off the water; move gear to high ground.",
      health: "Activate outbreak readiness; secure clean-water supply.",
    },
  };
  return fallback[tier][sector];
}

/** After-guidance: only when eventPhase === post_risk. */
export function afterGuidance(sector: SectorId, avoidGrazingDays = 7): string {
  const lines: Record<SectorId, string> = {
    agriculture:
      "Inspect crops for waterlogging or contamination before consuming or selling. Test soil before replanting in affected plots. Floodwater silt is nutrient-rich — consider fast-growing cover crops to recover seasonal revenue and stabilize topsoil.",
    livestock: `Check herds for signs of waterborne illness. Avoid grazing on recently flooded land for ${avoidGrazingDays} days.`,
    fisheries:
      "Check nets and gear for damage. Water quality may be affected — inspect before resuming normal fishing.",
    health:
      "Elevated waterborne disease risk — prioritize water purification and monitor for symptoms in the community.",
  };
  return lines[sector];
}

/**
 * This is an eligibility FLAG only, not a payment system. Real disbursement
 * remains manual/off-platform. Mirrors the logic of parametric insurance
 * (event-threshold-triggered) without building actual financial rails.
 */
export function recoverySupportLine(eligible: boolean): string {
  if (eligible) {
    return "This flood event qualifies you for recovery support. Reply/press 1 to log your interest.";
  }
  return "Recovery support flag not yet met (Severe/Compound for under 6h in this event window).";
}

/** @deprecated Prefer recoverySupportLine(recoveryEligible) */
export const RECOVERY_SUPPORT_LINE =
  "This flood event qualifies you for recovery support. Reply/press 1 to log your interest.";

export const eventPhaseLabel: Record<EventPhase, string> = {
  pre_risk: "Before / watch",
  active_risk: "Active risk",
  post_risk: "Recovery",
};
