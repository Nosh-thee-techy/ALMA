// Mock data for Turkana Watch. Structured so it can later be swapped
// for a real API (rainfall telemetry, dam SCADA feeds, community registry).

export type RiskTier = "safe" | "watch" | "warning" | "severe";
export type Region = "turkana" | "omo" | "all";
export type TriggerType = "rain" | "dam" | "compound";
// Ground-truth verification state of a dispatched alert. This closes the
// two-way loop: field reports feed back and adjust system confidence.
export type VerificationState = "unconfirmed" | "confirmed" | "false-alarm";

export interface TriggerStatus {
  tier: RiskTier;
  label: string;
  detail: string;
  etaHours: number | null;
  trend: "up" | "down" | "flat";
  metric: number; // 0-100 for gauge
}

export interface Community {
  id: string;
  name: string;
  region: "Kenya" | "Ethiopia";
  side: "turkana" | "omo";
  population: number;
  distanceFromDamKm: number;
  distanceFromCatchmentKm: number;
  rainEtaHours: number;
  damEtaHours: number;
  tier: RiskTier;
  lastAlert: string;
  // Position on our schematic map (0-100 % of viewbox)
  x: number;
  y: number;
}

export interface AlertRecord {
  id: string;
  timestamp: string;
  trigger: TriggerType;
  severity: RiskTier;
  communities: string[];
  delivery: Array<"SMS" | "USSD" | "Dashboard" | "Radio">;
  message: string;
  verification: VerificationState;
}

export interface TrendPoint {
  day: string;
  rainfallMm: number;
  reservoirPct: number;
}

export const rainfallTrigger: TriggerStatus = {
  tier: "warning",
  label: "Warning",
  detail: "Upstream catchment 78% saturated · 62mm/24h",
  etaHours: 14,
  trend: "up",
  metric: 74,
};

export const damTrigger: TriggerStatus = {
  tier: "watch",
  label: "Watch",
  detail: "Gibe III reservoir at 91% · controlled release forecast",
  etaHours: 22,
  trend: "up",
  metric: 58,
};

// Compound is elevated when both individual triggers are >= watch.
export const compoundTrigger: TriggerStatus = {
  tier: "severe",
  label: "Compound Severe",
  detail:
    "Rainfall + dam release windows overlap in ~14h. Downstream Turkana communities at extreme risk.",
  etaHours: 14,
  trend: "up",
  metric: 88,
};

export const communities: Community[] = [
  {
    id: "c1",
    name: "Omorate",
    region: "Ethiopia",
    side: "omo",
    population: 8400,
    distanceFromDamKm: 465,
    distanceFromCatchmentKm: 40,
    rainEtaHours: 6,
    damEtaHours: 18,
    tier: "severe",
    lastAlert: "2h ago",
    x: 24,
    y: 22,
  },
  {
    id: "c2",
    name: "Kalam",
    region: "Ethiopia",
    side: "omo",
    population: 3200,
    distanceFromDamKm: 495,
    distanceFromCatchmentKm: 70,
    rainEtaHours: 9,
    damEtaHours: 21,
    tier: "warning",
    lastAlert: "3h ago",
    x: 32,
    y: 34,
  },
  {
    id: "c3",
    name: "Todonyang",
    region: "Kenya",
    side: "turkana",
    population: 5100,
    distanceFromDamKm: 540,
    distanceFromCatchmentKm: 115,
    rainEtaHours: 13,
    damEtaHours: 26,
    tier: "warning",
    lastAlert: "1h ago",
    x: 44,
    y: 48,
  },
  {
    id: "c4",
    name: "Nachukui",
    region: "Kenya",
    side: "turkana",
    population: 2700,
    distanceFromDamKm: 580,
    distanceFromCatchmentKm: 155,
    rainEtaHours: 17,
    damEtaHours: 30,
    tier: "watch",
    lastAlert: "6h ago",
    x: 56,
    y: 60,
  },
  {
    id: "c5",
    name: "Lowarengak",
    region: "Kenya",
    side: "turkana",
    population: 6200,
    distanceFromDamKm: 610,
    distanceFromCatchmentKm: 185,
    rainEtaHours: 20,
    damEtaHours: 34,
    tier: "watch",
    lastAlert: "8h ago",
    x: 66,
    y: 70,
  },
  {
    id: "c6",
    name: "Kalokol",
    region: "Kenya",
    side: "turkana",
    population: 12500,
    distanceFromDamKm: 680,
    distanceFromCatchmentKm: 255,
    rainEtaHours: 28,
    damEtaHours: 42,
    tier: "safe",
    lastAlert: "3d ago",
    x: 78,
    y: 82,
  },
  {
    id: "c7",
    name: "Eliye Springs",
    region: "Kenya",
    side: "turkana",
    population: 1800,
    distanceFromDamKm: 710,
    distanceFromCatchmentKm: 285,
    rainEtaHours: 32,
    damEtaHours: 46,
    tier: "safe",
    lastAlert: "5d ago",
    x: 86,
    y: 90,
  },
];

export const alerts: AlertRecord[] = [
  {
    id: "a1",
    timestamp: "2026-07-22 08:14",
    trigger: "compound",
    severity: "severe",
    communities: ["Omorate", "Kalam", "Todonyang"],
    delivery: ["SMS", "USSD", "Radio", "Dashboard"],
    message: "COMPOUND FLOOD ALERT — move to higher ground within 12 hours.",
    verification: "confirmed",
  },
  {
    id: "a2",
    timestamp: "2026-07-22 06:02",
    trigger: "rain",
    severity: "warning",
    communities: ["Omorate", "Kalam"],
    delivery: ["SMS", "Dashboard"],
    message: "Heavy rainfall upstream. River rise expected in 8-12 hours.",
    verification: "confirmed",
  },
  {
    id: "a3",
    timestamp: "2026-07-21 22:47",
    trigger: "dam",
    severity: "watch",
    communities: ["Todonyang", "Nachukui", "Lowarengak"],
    delivery: ["SMS", "USSD"],
    message: "Gibe III controlled release detected. Monitor water levels.",
    verification: "unconfirmed",
  },
  {
    id: "a4",
    timestamp: "2026-07-21 14:20",
    trigger: "rain",
    severity: "watch",
    communities: ["Omorate"],
    delivery: ["Dashboard"],
    message: "Rainfall accumulation crossing watch threshold.",
    verification: "unconfirmed",
  },
  {
    id: "a5",
    timestamp: "2026-07-20 09:11",
    trigger: "compound",
    severity: "warning",
    communities: ["Kalam", "Todonyang", "Nachukui"],
    delivery: ["SMS", "USSD", "Dashboard"],
    message: "Combined rain + reservoir signal. Prepare evacuation routes.",
    verification: "confirmed",
  },
  {
    id: "a6",
    timestamp: "2026-07-19 17:34",
    trigger: "dam",
    severity: "watch",
    communities: ["Nachukui", "Lowarengak", "Kalokol"],
    delivery: ["SMS"],
    message: "Minor turbine release. No immediate downstream risk.",
    verification: "false-alarm",
  },
];

export const trend: TrendPoint[] = [
  { day: "Jul 16", rainfallMm: 8, reservoirPct: 82 },
  { day: "Jul 17", rainfallMm: 14, reservoirPct: 84 },
  { day: "Jul 18", rainfallMm: 22, reservoirPct: 86 },
  { day: "Jul 19", rainfallMm: 31, reservoirPct: 88 },
  { day: "Jul 20", rainfallMm: 48, reservoirPct: 89 },
  { day: "Jul 21", rainfallMm: 55, reservoirPct: 90 },
  { day: "Jul 22", rainfallMm: 62, reservoirPct: 91 },
];

// Risk tier metadata — colors read from CSS tokens defined in styles.css.
export const tierMeta: Record<
  RiskTier,
  { label: string; dot: string; badge: string; ring: string; text: string }
> = {
  safe: {
    label: "Safe",
    dot: "bg-risk-safe",
    badge: "bg-risk-safe-bg text-risk-safe-foreground",
    ring: "ring-risk-safe/40",
    text: "text-risk-safe-foreground",
  },
  watch: {
    label: "Watch",
    dot: "bg-risk-watch",
    badge: "bg-risk-watch-bg text-risk-watch-foreground",
    ring: "ring-risk-watch/50",
    text: "text-risk-watch-foreground",
  },
  warning: {
    label: "Warning",
    dot: "bg-risk-warning",
    badge: "bg-risk-warning-bg text-risk-warning-foreground",
    ring: "ring-risk-warning/60",
    text: "text-risk-warning-foreground",
  },
  severe: {
    label: "Severe",
    dot: "bg-risk-severe",
    badge: "bg-risk-severe text-risk-severe-foreground",
    ring: "ring-risk-severe/70",
    text: "text-risk-severe-foreground",
  },
};

// Compound risk calculation — used by both dashboard and simulator.
// Rule: compound tier is the MAX of the two individual triggers,
// escalated one tier when both are >= watch (windows overlap).
export function computeCompound(rain: RiskTier, dam: RiskTier): RiskTier {
  const order: RiskTier[] = ["safe", "watch", "warning", "severe"];
  const ri = order.indexOf(rain);
  const di = order.indexOf(dam);
  const max = Math.max(ri, di);
  const bothActive = ri >= 1 && di >= 1;
  const escalated = bothActive ? Math.min(max + 1, 3) : max;
  return order[escalated];
}

export function tierFromMetric(v: number): RiskTier {
  if (v >= 75) return "severe";
  if (v >= 55) return "warning";
  if (v >= 30) return "watch";
  return "safe";
}