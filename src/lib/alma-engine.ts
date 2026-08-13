/**
 * Browser client for the ALMA FastAPI engine (live Open-Meteo + USSD action ledger).
 */
import {
  communities as staticCommunities,
  tierMeta,
  type AlertRecord,
  type Community,
  type DamMetrics,
  type LastReachedVia,
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
    typeof process !== "undefined"
      ? process.env?.ALMA_ENGINE_URL || process.env?.VITE_ALMA_ENGINE_URL
      : undefined;

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
  ml_flood_probability?: number | null;

  ml_model_mode?: string | null;

  ml_honesty?: string | null;

  plain_summary: string;
};

export type RiskOutlook = "Rising" | "Stable" | "Falling";

export type CatchmentForecast = {
  id?: string;

  label?: string;

  rain_24h_mm?: number;

  rain_7d_mm?: number;

  forecast_rainfall?: { next3_day?: number; next7_day?: number };

  soil_moisture?: { current?: number; trend?: "rising" | "falling" | "stable" };

  risk_outlook?: RiskOutlook;

  honesty?: string;

  error?: string;
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
    forecast_rainfall?: { next3_day?: number; next7_day?: number };

    soil_moisture?: { current?: number; trend?: string };

    risk_outlook?: RiskOutlook;
  };

  catchments?: {
    dam_upstream?: CatchmentForecast;

    downstream?: CatchmentForecast;
  };

  risk_outlook?: {
    downstream_flood?: RiskOutlook;

    /** Operational release risk outlook (preferred). */
    dam_release_outlook?: RiskOutlook;

    /** @deprecated Prefer dam_release_outlook — kept for older engine payloads. */
    dam_overflow?: RiskOutlook;

    downstream_forecast_3d_mm?: number;

    dam_forecast_3d_mm?: number;

    note?: string;
  };
  farmer_early_heads_up?: string | null;

  dam_alternative: {
    estimated_release_m3s?: number;
    method?: string;
    honesty?: string;
    dam_score?: number;
    rain_score?: number;
  };
  dam_prediction?: DamPredictionResponse | null;
  partner_dam?: { ok?: boolean; source?: string } | null;
  risk: LiveRisk;
  glofasForecast?: {
    ok?: boolean;

    source?: string;

    dischargeForecast?: number | null;

    exceedanceProbability?: number | null;

    forecastDate?: string | null;

    honesty?: string;

    error?: string | null;
  };

  trainedRisk?: {
    floodProbability?: number;

    floodScore?: number;

    modelMode?: string;

    honesty?: string;

    features?: Record<string, unknown>;
  };

  pitch_line?: string;

  ground_observers?: {
    layer?: {
      estimated?: { rain_24h_mm?: number; dam_release_m3s?: number; label?: string };
      ground_verified?: {
        rain_mm_nudge?: number;
        dam_m3s_nudge?: number;
        verified_report_count?: number;
        unverified_report_count?: number;
        label?: string;
      };
      blended_for_risk?: { rain_24h_mm?: number; dam_release_m3s?: number };
    };
    recent?: Array<Record<string, unknown>>;
    honesty?: string;
  };

  climatic_impact?: {
    state?: string;
    label?: string;
    sectors?: Record<
      string,
      { whatIsHappening?: string; mechanism?: string }
    >;
    marketEconomic?: { whatIsHappening?: string; mechanism?: string };
  };

  climatic_state?: string;

  icpac_regional_outlook?: {
    ok?: boolean;
    outlook?: {
      summary?: string;
      issuedDate?: string | null;
      source?: string;
      updatedAt?: number | null;
    };
    manual?: boolean;
    honesty?: string;
  };
};

export type DamPointerSource = "estimated" | "manual" | "forecast" | "partner";

export type DamPredictionPointer = {
  id: string;
  label: string;
  value: string;
  source: DamPointerSource;
  role?: string;
};

export type DamPredictionResponse = {
  release_m3s?: number;
  fill_percent?: number;
  spillway_status?: "closed" | "partial" | "open";
  method?: "estimated" | "manual" | "partner" | "blended";
  data_quality?: string;
  honesty?: string;
  pointers?: DamPredictionPointer[];
  manual_observation?: Record<string, unknown> | null;
  sensor_slot?: { status: string; label: string; note: string };
};

export type DamObservation = {
  id: number;
  reporter: string | null;
  release_m3s: number | null;
  fill_percent: number | null;
  spillway_status: string | null;
  notes: string | null;
  created_at: number;
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
  glofasForecast: LiveSignalsResponse["glofasForecast"] | null;

  trainedRisk: LiveSignalsResponse["trainedRisk"] | null;

  riskOutlook: {
    downstreamFlood: RiskOutlook;

    /** Operational release risk (unexpected/elevated discharge) — not overflow. */
    damReleaseOutlook: RiskOutlook;

    note?: string;

    downstreamForecast3dMm?: number;

    damForecast3dMm?: number;
  } | null;

  farmerEarlyHeadsUp: string | null;

  catchments: {
    damUpstream: CatchmentForecast | null;
    downstream: CatchmentForecast | null;
  } | null;

  damPrediction: DamPredictionResponse | null;

  climaticState: string | null;

  climaticImpact: LiveSignalsResponse["climatic_impact"] | null;

  groundObservers: LiveSignalsResponse["ground_observers"] | null;

  icpacOutlook: LiveSignalsResponse["icpac_regional_outlook"] | null;
};

async function getJson<T>(path: string, timeoutMs = 8_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${engineBaseUrl()}${path}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

function mapBasin(
  signals: LiveSignalsResponse,
  actions: EngineAction[],
  reachByWard: Record<string, LastReachedVia | { via: LastReachedVia; at: number | null }> = {},
): LiveBasin {
  const risk = signals.risk;
  const rainMm = Number(signals.rain?.rain_24h_mm ?? risk.rain_mm ?? 0);
  const rain7 = Number(signals.rain?.rain_7d_mm ?? 0);
  const release = Number(
    signals.dam_alternative?.estimated_release_m3s ?? risk.dam_discharge_m3s ?? 0,
  );
  const rainTier = scoreToTier(Number(risk.rain_score ?? 0));
  const damTier = scoreToTier(Number(risk.dam_score ?? 0));
  const quality = (
    risk.data_quality === "live_feed" ? "live" : "estimated"
  ) as DamMetrics["dataQuality"];
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
    label: risk.compound_active ? tierLabel(risk.tier, true) : tierLabel(risk.tier),

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

  const fillEstimate = Math.min(
    98,
    Math.max(55, Math.round(signals.dam_prediction?.fill_percent ?? 70 + release / 40)),
  );
  const predSpill = signals.dam_prediction?.spillway_status;
  const dam: DamMetrics = {
    name: "Gibe III",
    basin: "Omo River, Ethiopia",
    fillPercent: fillEstimate,
    waterLevelMasl: Math.round(880 + fillEstimate / 10),
    fullSupplyMasl: 892,
    liveStorageBcm: Math.round((fillEstimate / 100) * 14.7 * 100) / 100,
    releaseM3s: Math.round(release * 10) / 10,
    spillwayStatus:
      predSpill === "open" || predSpill === "partial" || predSpill === "closed"
        ? predSpill
        : release >= 800
          ? "open"
          : release >= 350
            ? "partial"
            : "closed",
    turbineStatus: "Estimated from rain proxy (not live SCADA)",
    lastUpdatedLabel: nowLabel,
    dataQuality: quality,
    plainSummary:
      signals.dam_prediction?.honesty ||
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
            reservoirPct: Math.min(
              98,

              Math.max(50, Math.round(60 + Number(mm) * 0.8 + release / 80)),
            ),
          };
        })
      : [];

  const communities = staticCommunities.map((c) => {
    const distFactor = Math.min(1.2, c.distanceFromDamKm / 520);
    const etaRain = Math.round(risk.t_rain_arrival_h * distFactor);
    const etaDam = Math.round(risk.t_dam_arrival_h * distFactor);
    const wardKey = c.name.toLowerCase().replace(/\s+/g, "_");

    const reach = reachByWard[wardKey];
    const via = typeof reach === "string" ? reach : reach?.via;
    const reachedAt = typeof reach === "object" && reach ? reach.at : null;

    // Downstream communities cool slightly; upstream / near-dam stay hotter.
    const order: RiskTier[] = ["safe", "watch", "warning", "severe"];
    let ti = order.indexOf((risk.tier || "watch") as RiskTier);
    if (ti < 0) ti = 1;
    if (c.distanceFromDamKm > 680) ti = Math.max(0, ti - 1);
    if (c.distanceFromDamKm > 720) ti = Math.max(0, ti - 1);
    if (risk.compound_active && c.distanceFromDamKm < 560) ti = Math.min(3, ti + 1);

    return {
      ...c,
      tier: order[ti],
      rainEtaHours: etaRain,
      damEtaHours: etaDam,
      lastAlert: actions[0] ? "live feed" : "live risk",
      lastReachedVia: via,
      lastReachedAt: reachedAt ?? null,
    };
  });

  const alerts = actionsToAlerts(actions, risk.tier);

  const outlook = signals.risk_outlook;

  const riskOutlook = outlook
    ? {
        downstreamFlood: (outlook.downstream_flood || "Stable") as RiskOutlook,

        damReleaseOutlook: (outlook.dam_release_outlook ||
          outlook.dam_overflow ||
          "Stable") as RiskOutlook,

        note: outlook.note,

        downstreamForecast3dMm: outlook.downstream_forecast_3d_mm,

        damForecast3dMm: outlook.dam_forecast_3d_mm,
      }
    : null;

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
    riskOutlook,

    farmerEarlyHeadsUp: signals.farmer_early_heads_up || null,

    glofasForecast: signals.glofasForecast ?? null,

    trainedRisk: signals.trainedRisk ?? null,

    catchments: signals.catchments
      ? {
          damUpstream: signals.catchments.dam_upstream ?? null,
          downstream: signals.catchments.downstream ?? null,
        }
      : null,

    damPrediction: signals.dam_prediction ?? null,

    climaticState: signals.climatic_state ?? null,

    climaticImpact: signals.climatic_impact ?? null,

    groundObservers: signals.ground_observers ?? null,

    icpacOutlook: signals.icpac_regional_outlook ?? null,
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
    const delivery: AlertRecord["delivery"] = ["USSD", "Dashboard"];

    if (a.action_type === "ground_truth") {
      trigger = "rain";
      verification = "confirmed";
      message = `Field report: ${details.water_level_status || "update"} (${details.affected_entity || "community"}) @ ${details.node_id || ward}`;
      const status = String(details.water_level_status || "");
      severity = status.includes("Severe")
        ? "severe"
        : status.includes("Moderate")
          ? "warning"
          : "watch";
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
      delivery,

      message,
      verification,
    };
  });
}

export type ReachBlindSpotWard = {
  ward_id: string;
  community: string;
  last_reached_via: string;
};

export type ReachBlindSpots = {
  ok: boolean;
  active_event: boolean;
  tier: string;
  compound_active: boolean;
  unreached: string[];
  unconfirmed: string[];
  unreached_or_unconfirmed_count: number;
  wards?: ReachBlindSpotWard[];
  honesty_note?: string;
};

export async function fetchReachBlindSpots(): Promise<ReachBlindSpots | null> {
  try {
    return await getJson<ReachBlindSpots>("/api/dashboard/reach-blind-spots");
  } catch {
    return null;
  }
}

export async function markCommunityReached(
  wardId: string,
  via: Exclude<LastReachedVia, "Unreached"> = "Manual",
  note?: string,
): Promise<{ ok: boolean; ward_id?: string; error?: string }> {
  const res = await fetch(
    `${engineBaseUrl()}/api/dashboard/community-reach/${encodeURIComponent(wardId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ via, note }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    ward_id?: string;
    error?: string;
  };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error || `Mark reach failed (${res.status})` };
  }
  return { ok: true, ward_id: json.ward_id };
}

export async function dispatchCommunityFollowUp(
  community: string,
  regionId: "omo" | "turkana" = "turkana",
  message?: string,
): Promise<{ ok: boolean; contactCount?: number; error?: string }> {
  const res = await fetch(`${engineBaseUrl()}/api/dashboard/community-dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      community,
      region_id: regionId,
      message:
        message ||
        "ALMA follow-up: We could not confirm you received the flood alert. Reply SOS if in danger, or dial *384*96428# for guidance.",
      sector: "agriculture",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    contactCount?: number;
    error?: string;
  };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error || `Dispatch failed (${res.status})` };
  }
  return { ok: true, contactCount: json.contactCount };
}

export async function fetchLiveBasin(): Promise<LiveBasin> {
  // Cap the hot path — desk should fall back rather than hang on a slow engine.
  const [signals, actionsRes, reachRes] = await Promise.all([
    getJson<LiveSignalsResponse>("/api/dashboard/live-signals", 9_000),
    getJson<{ ok: boolean; actions: EngineAction[] }>(
      "/api/dashboard/actions?limit=40",
      4_000,
    ).catch(() => ({
      ok: false,
      actions: [] as EngineAction[],
    })),

    getJson<{
      ok: boolean;
      reach: Array<{ ward_id: string; last_reached_via: string; updated_at?: number }>;
    }>("/api/dashboard/community-reach", 4_000).catch(() => ({ ok: false, reach: [] })),
  ]);
  if (!signals?.risk) throw new Error("live-signals missing risk");
  const reachByWard: Record<string, { via: LastReachedVia; at: number | null }> = {};

  for (const r of reachRes.reach || []) {
    const via = r.last_reached_via;

    if (
      via === "SMS" ||
      via === "USSD" ||
      via === "Voice" ||
      via === "Manual" ||
      via === "Unreached"
    ) {
      reachByWard[r.ward_id] = {
        via,
        at: typeof r.updated_at === "number" ? r.updated_at : null,
      };
    }
  }

  return mapBasin(signals, actionsRes.actions || [], reachByWard);
}

export type SosChannel = "SMS" | "USSD" | "CALL";

export type SosStatus = "new" | "being_handled" | "resolved" | "reopened";

export type SosEntry = {
  id: number;

  phone: string;

  community: string | null;

  ward_id: string | null;

  channel: string;

  message_body: string | null;

  status: SosStatus;

  resent_count: number;

  escalation_count?: number;

  acknowledged_by?: string | null;

  check_in_response?: string | null;

  reopened_at?: number | null;

  first_received_at: number;

  last_received_at: number;

  received_at_label: string;

  time_since_received_s: number;

  ack_overdue?: boolean;

  backup_emergency_number?: string;
};

export async function fetchSosQueue(opts?: { limit?: number; includeResolved?: boolean }): Promise<{
  ok: boolean;

  items: SosEntry[];

  honesty?: string;

  backup_emergency_number?: string;
}> {
  const limit = opts?.limit ?? 20;

  const includeResolved = opts?.includeResolved ?? false;

  return await getJson(
    `/api/dashboard/sos?limit=${encodeURIComponent(String(limit))}&include_resolved=${encodeURIComponent(String(includeResolved))}`,
    5_000,
  );
}

export async function setSosStatus(
  sosId: number,

  status: SosStatus,
): Promise<{ ok: boolean; item: SosEntry }> {
  const res = await fetch(`${engineBaseUrl()}/api/dashboard/sos/${sosId}/status`, {
    method: "POST",

    headers: { "Content-Type": "application/json", Accept: "application/json" },

    body: JSON.stringify({ status }),
  });

  if (!res.ok) throw new Error(`sos status update failed (${res.status})`);

  return (await res.json()) as { ok: boolean; item: SosEntry };
}

export async function ingestSosDemo(body: {
  phone: string;
  channel?: "SMS" | "USSD" | "CALL";
  message_body?: string;
}): Promise<{ ok: boolean; entry?: SosEntry; confirm_message?: string }> {
  const res = await fetch(`${engineBaseUrl()}/api/dashboard/sos/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`sos ingest failed (${res.status})`);
  return (await res.json()) as { ok: boolean; entry?: SosEntry; confirm_message?: string };
}

export async function fetchDamObservations(limit = 15): Promise<{
  ok: boolean;
  observations: DamObservation[];
}> {
  return getJson(`/api/dashboard/dam-observations?limit=${limit}`);
}

export async function submitDamObservation(body: {
  release_m3s?: number | null;
  fill_percent?: number | null;
  spillway_status?: "closed" | "partial" | "open" | null;
  notes?: string | null;
  reporter?: string | null;
}): Promise<{ ok: boolean; observation?: DamObservation; error?: string }> {
  const res = await fetch(`${engineBaseUrl()}/api/dashboard/dam-observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; observation?: DamObservation; error?: string }>;
}
