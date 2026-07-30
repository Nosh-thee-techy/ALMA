import type { RiskTier } from "@/lib/turkana-data";

/** Simple traffic light for operators: green / yellow / red. */
export type TrafficLight = "green" | "yellow" | "red";

export function tierToLight(tier: RiskTier): TrafficLight {
  if (tier === "severe") return "red";
  if (tier === "warning" || tier === "watch") return "yellow";
  return "green";
}

export function worstLight(lights: TrafficLight[]): TrafficLight {
  if (lights.includes("red")) return "red";
  if (lights.includes("yellow")) return "yellow";
  return "green";
}

export const lightMeta: Record<
  TrafficLight,
  { label: string; meaning: string; panel: string; badge: string; dot: string }
> = {
  green: {
    label: "Green — OK for now",
    meaning: "No urgent flood action. Keep normal monitoring.",
    panel: "border-risk-safe/40 bg-risk-safe-bg text-risk-safe-foreground",
    badge: "bg-risk-safe text-risk-safe-foreground",
    dot: "bg-risk-safe",
  },
  yellow: {
    label: "Yellow — Watch closely",
    meaning: "Conditions are rising. Read the summary and get each sector’s action list ready.",
    panel: "border-risk-warning/50 bg-risk-warning-bg text-risk-warning-foreground",
    badge: "bg-risk-warning text-risk-warning-foreground",
    dot: "bg-risk-warning",
  },
  red: {
    label: "Red — Act now",
    meaning: "Rain and dam danger are both high — do the actions below before opening detailed numbers.",
    panel: "border-risk-severe bg-risk-severe text-risk-severe-foreground",
    badge: "bg-white/20 text-risk-severe-foreground",
    dot: "bg-risk-severe",
  },
};
