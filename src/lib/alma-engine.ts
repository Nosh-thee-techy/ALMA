/**
 * Browser client for the ALMA FastAPI engine (live Open-Meteo + USSD action ledger).
 */
import {
  communities as staticCommunities,
  tierMeta,
  type AlertRecord,
  type Community,
  type DamMetrics,
  type RainMetrics,
  type RiskTier,
  type TrendPoint,
  type TriggerStatus,
  type TriggerType,
  type VerificationState,
} from "@/lib/turkana-data";

export function engineBaseUrl(): string {
  const fromVite =
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ALMA_ENGINE_URL) ||
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.ALMA_ENGINE_URL);
  const fromProcess =
    typeof process !== "undefined" ? process.env?.ALMA_ENGINE_URL || process.env?.VITE_ALMA_ENGINE_URL : undefined;
  return (fromVite || fromProcess || "http://127.0.0.1:8787").replace(/\/$/, "");
}

export type LiveRisk = {
  rain_mm: number;
  dam_discharge_m3s: number;
  rain_score: number;
  dam_score: number;
  t_rain_arrival_h: number;
  t_dam_arrival_h: number;
  overlap_hours: number;
  compound_active: boolean;
  compound_severity: number;
  tier: RiskTier;
  data_quality: string;
  plain_summary: string;
};

export type LiveSignalsResponse = {
  ok: boolean;
  rain: {
    ok?: boolean;
    rain_24h_mm?: number;
    rain_7d_mm?: number;
    daily_mm?: number[];
    dates?: string[];
    label?: string;
    source?: string;
    error?: string;
  };
  dam_alternative: {
    estimated_release_m3s?: number;
    method?: string;
    honesty?: string;
    dam_score?: number;
    rain_score?: number;
  };
  partner_dam?: { ok?: boolean; source?: string } | null;
  risk: LiveRisk;
  pitch_line?: string;
};

export type EngineAction = {
  id: number;
  phone: string | null;
  ward_id: string | null;
  action_type: string;
  created_at: number;
  details: Record<string, unknown>;
};

function scoreToTier(score: number): RiskTier {
  if (score >= 75) return "severe";
  if (score >= 55) return "warning";
  if (score >= 30) return "watch";
  return "safe";
}

function tierLabel(tier: RiskTier, compound?: boolean): string {
  if (compound && tier !== "safe") return `${tierMeta[tier].label} — rain and dam together`;
  return tierMeta[tier].label;
}

export type LiveBasin = {
  source: "live" | "fallback";
  fetchedAt: string;
  rain: RainMetrics;
  dam: DamMetrics;
  rainfallTrigger: TriggerStatus;
  damTrigger: TriggerStatus;
  compoundTrigger: TriggerStatus;
  trend: TrendPoint[];
  communities: Community[];
  alerts: AlertRecord[];
  risk: LiveRisk | null;
  pitchLine: string;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${engineBaseUrl()}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function mapBasin(signals: LiveSignalsResponse, actions: EngineAction[]): LiveBasin {
  const risk = signals.risk;
  const rainMm = Number(signals.rain?.rain_24h_mm ?? risk.rain_mm ?? 0);
  const rain7 = Number(signals.rain?.rain_7d_mm ?? 0);
  const release = Number(signals.dam_alternative?.estimated_release_m3s ?? risk.dam_discharge_m3s ?? 0);
  const rainTier = scoreToTier(Number(risk.rain_score ?? 0));
  const damTier = scoreToTier(Number(risk.dam_score ?? 0));
  const quality = (risk.data_quality === "live_feed" ? "live" : "estimated") as DamMetrics["dataQuality"];
  const sat = Math.min(100, Math.round(rain7 / 3.5 + rainMm / 2));
  const nowLabel = `Live · updated ${new Date().toLocaleTimeString()}`;

  const rainfallTrigger: TriggerStatus = {
    tier: rainTier,
    label: tierLabel(rainTier),
    detail: `Upstream Open-Meteo ${rainMm.toFixed(1)} mm / 24h · 7d ${rain7.toFixed(0)} mm`,
    etaHours: Math.round(risk.t_rain_arrival_h),
    trend: rainMm >= 20 ? "up" : "flat",
    metric: Math.round(Number(risk.rain_score ?? 0)),
  };

  const damTrigger: TriggerStatus = {
    tier: damTier,
    label: tierLabel(damTier),
    detail: `Estimated release ~${release.toFixed(0)} m³/s from upstream rain (not Gibe SCADA)`,
    etaHours: Math.round(risk.t_dam_arrival_h),
    trend: release >= 400 ? "up" : "flat",
    metric: Math.round(Number(risk.dam_score ?? 0)),
  };

  const compoundTrigger: TriggerStatus = {
    tier: risk.tier,
    label: risk.compound_active
      ? tierLabel(risk.tier, true)
      : tierLabel(risk.tier),
    detail: risk.plain_summary,
    etaHours: Math.round(Math.min(risk.t_rain_arrival_h, risk.t_dam_arrival_h)),
    trend: risk.compound_active ? "up" : "flat",
    metric: Math.round(Number(risk.compound_severity ?? 0)),
  };

  const rain: RainMetrics = {
    catchmentName: "Upper Omo area above Gibe III",
    rain24hMm: Math.round(rainMm * 10) / 10,
    rain7dMm: Math.round(rain7 * 10) / 10,
    saturationPercent: sat,
    stationsReporting: 1,
    sourceLabel: signals.rain?.label || "Live Open-Meteo precipitation",
    lastUpdatedLabel: nowLabel,
    dataQuality: signals.rain?.ok === false ? "modeled" : "live",
    plainSummary:
      rainMm < 5
        ? `Live rain is light upstream (${rainMm.toFixed(1)} mm in 24h). Soil wetness estimate ~${sat}%.`
        : `Live Open-Meteo shows ${rainMm.toFixed(1)} mm in 24h upstream (${rain7.toFixed(0)} mm over 7 days). Wet soils mean new rain reaches the river faster.`,
  };

  const fillEstimate = Math.min(98, Math.max(55, Math.round(70 + release / 40)));
  const dam: DamMetrics = {
    name: "Gibe III",
    basin: "Omo River, Ethiopia",
    fillPercent: fillEstimate,
    waterLevelMasl: Math.round(880 + fillEstimate / 10),
    fullSupplyMasl: 892,
    liveStorageBcm: Math.round((fillEstimate / 100) * 14.7 * 100) / 100,
    releaseM3s: Math.round(release * 10) / 10,
    spillwayStatus: release >= 800 ? "open" : release >= 350 ? "partial" : "closed",
    turbineStatus: "Estimated from rain proxy (not live SCADA)",
    lastUpdatedLabel: nowLabel,
    dataQuality: quality,
    plainSummary:
      signals.dam_alternative?.honesty ||
      `Estimated release pressure ~${release.toFixed(0)} m³/s from live upstream rain. Not official Gibe III telemetry.`,
  };

  const daily = signals.rain?.daily_mm || [];
  const dates = signals.rain?.dates || [];
  const trend: TrendPoint[] =
    daily.length > 0
      ? daily.map((mm, i) => {
          const d = dates[i] ? new Date(dates[i]) : null;
          const day = d
            ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : `D${i + 1}`;
          return {
            day,
            rainfallMm: Math.round(Number(mm) * 10) / 10,
            // Pressure index for chart (not SCADA fill)
            reservoirPct: Math.min(98, Math.max(50, Math.round(60 + Number(mm) * 0.8 + release / 80))),
          };
        })
      : [];

  const communities = staticCommunities.map((c) => {
    const distFactor = Math.min(1.2, c.distanceFromDamKm / 520);
    const etaRain = Math.round(risk.t_rain_arrival_h * distFactor);
    const etaDam = Math.round(risk.t_dam_arrival_h * distFactor);
    return {
      ...c,
      tier: risk.tier,
      rainEtaHours: etaRain,
      damEtaHours: etaDam,
      lastAlert: actions[0] ? "live feed" : "live risk",
    };
  });

  const alerts = actionsToAlerts(actions, risk.tier);

  return {
    source: "live",
    fetchedAt: new Date().toISOString(),
    rain,
    dam,
    rainfallTrigger,
    damTrigger,
    compoundTrigger,
    trend,
    communities,
    alerts,
    risk,
    pitchLine: signals.pitch_line || "Live Open-Meteo rain + estimated dam pressure.",
  };
}

function actionsToAlerts(actions: EngineAction[], liveTier: RiskTier): AlertRecord[] {
  return actions.slice(0, 40).map((a) => {
    const when = new Date((a.created_at || 0) * 1000);
    const ts = Number.isNaN(when.getTime())
      ? "—"
      : when.toISOString().slice(0, 16).replace("T", " ");
    const ward = a.ward_id || "basin";
    const details = a.details || {};
    let trigger: TriggerType = "compound";
    let verification: VerificationState = "confirmed";
    let message = `${a.action_type}`;
    let severity: RiskTier = liveTier;

    if (a.action_type === "ground_truth") {
      trigger = "rain";
      verification = "confirmed";
      message = `Field report: ${details.water_level_status || "update"} (${details.affected_entity || "community"}) @ ${details.node_id || ward}`;
      const status = String(details.water_level_status || "");
      severity = status.includes("Severe") ? "severe" : status.includes("Moderate") ? "warning" : "watch";
    } else if (a.action_type === "evacuation_confirmed") {
      trigger = "compound";
      message = `Herd evacuation confirmed for ${details.ward_name || ward}`;
      severity = "severe";
    } else if (a.action_type === "voucher_issued" || a.action_type === "voucher_redeemed") {
      trigger = "compound";
      message = `Feed voucher ${details.code || ""} (${a.action_type})`;
      severity = "warning";
    } else if (a.action_type === "cash_stk_queued") {
      trigger = "compound";
      message = `Emergency cash STK queued ${details.ref || ""} KES ${details.amount_kes || ""}`;
      severity = "warning";
    } else if (a.action_type === "risk_check") {
      trigger = "compound";
      verification = "unconfirmed";
      message = `USSD live risk check — ${ward}`;
      const live = details.live as { tier?: RiskTier } | undefined;
      if (live?.tier) severity = live.tier;
    }

    return {
      id: `live-${a.id}`,
      timestamp: ts,
      trigger,
      severity,
      communities: [ward],
      delivery: ["USSD", "Dashboard"],
      message,
      verification,
    };
  });
}

export async function fetchLiveBasin(): Promise<LiveBasin> {
  const [signals, actionsRes] = await Promise.all([
    getJson<LiveSignalsResponse>("/api/dashboard/live-signals"),
    getJson<{ ok: boolean; actions: EngineAction[] }>("/api/dashboard/actions?limit=40").catch(() => ({
      ok: false,
      actions: [] as EngineAction[],
    })),
  ]);
  if (!signals?.risk) throw new Error("live-signals missing risk");
  return mapBasin(signals, actionsRes.actions || []);
}
