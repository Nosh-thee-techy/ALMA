// StatusCard: shows a single trigger's current risk level with a gauge,
// trend arrow, and estimated flood arrival. The compound variant is
// visually dominant when both triggers align, and carries detect-to-action links.
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUp, CloudRain, Dam, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tierMeta, type RiskTier, type TriggerStatus } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const iconMap: Record<"rain" | "dam" | "compound", LucideIcon> = {
  rain: CloudRain,
  dam: Dam,
  compound: ShieldAlert,
};

const metricUnit: Record<"rain" | "dam" | "compound", string> = {
  rain: "index",
  dam: "fill",
  compound: "compound index",
};

function TrendIcon({ trend }: { trend: TriggerStatus["trend"] }) {
  const Icon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : ArrowRight;
  return <Icon className="h-4 w-4" aria-hidden />;
}

function Gauge({ value, tier, inverted }: { value: number; tier: RiskTier; inverted?: boolean }) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor =
    tier === "severe"
      ? "bg-risk-severe"
      : tier === "warning"
        ? "bg-risk-warning"
        : tier === "watch"
          ? "bg-risk-watch"
          : "bg-risk-safe";
  return (
    <div className="mt-3">
      <div
        className={cn(
          "flex justify-between text-xs font-medium uppercase tracking-wider",
          inverted ? "text-risk-severe-foreground/75" : "text-muted-foreground",
        )}
      >
        <span>Safe</span>
        <span>Watch</span>
        <span>Warning</span>
        <span>Severe</span>
      </div>
      <div
        className={cn(
          "mt-1 h-2.5 w-full overflow-hidden rounded-full",
          inverted ? "bg-white/20" : "bg-secondary",
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all", inverted ? "bg-white" : barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function StatusCard({
  kind,
  title,
  status,
  prominent = false,
  active = false,
  className,
}: {
  kind: "rain" | "dam" | "compound";
  title: string;
  status: TriggerStatus;
  prominent?: boolean;
  active?: boolean;
  className?: string;
}) {
  const Icon = iconMap[kind];
  const meta = tierMeta[status.tier];
  const severeCompound = prominent && active && status.tier === "severe";
  const showActions = prominent && active;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card p-5 shadow-sm transition-all",
        prominent && "md:col-span-2 lg:col-span-2",
        severeCompound
          ? "border-risk-severe bg-risk-severe text-risk-severe-foreground shadow-lg ring-2 ring-risk-severe/40"
          : prominent
            ? "border-border ring-1 ring-border"
            : "border-border",
        className,
      )}
    >
      {severeCompound && (
        <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-risk-severe-foreground/30" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md",
              severeCompound ? "bg-white/15" : "bg-secondary",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                severeCompound ? "text-risk-severe-foreground/80" : "text-muted-foreground",
              )}
            >
              {title}
            </p>
            <p className={cn("text-lg font-bold leading-tight", prominent && "text-xl")}>
              {status.label}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            severeCompound ? "bg-white/20 text-risk-severe-foreground" : meta.badge,
          )}
          title={`${metricUnit[kind]} ${status.metric}%`}
        >
          <TrendIcon trend={status.trend} />
          <span className="sr-only">{metricUnit[kind]} </span>
          {status.metric}%
        </span>
      </div>

      <p
        className={cn(
          "mt-3 text-sm",
          severeCompound ? "text-risk-severe-foreground/90" : "text-muted-foreground",
        )}
      >
        {status.detail}
      </p>

      <Gauge value={status.metric} tier={status.tier} inverted={severeCompound} />

      <div
        className={cn(
          "mt-4 flex items-baseline justify-between border-t pt-3 text-sm",
          severeCompound ? "border-white/20" : "border-border",
        )}
      >
        <span
          className={cn(
            severeCompound ? "text-risk-severe-foreground/80" : "text-muted-foreground",
          )}
        >
          Est. arrival
        </span>
        <span className="text-lg font-bold tabular-nums">
          {status.etaHours == null ? "—" : `${status.etaHours}h`}
        </span>
      </div>

      {/* Detect-to-action: compound risk must lead to playbooks / fan-out / verification. */}
      {showActions && (
        <div
          className={cn(
            "mt-4 flex flex-wrap gap-2 border-t pt-3",
            severeCompound ? "border-white/20" : "border-border",
          )}
        >
          <Button
            asChild
            size="sm"
            variant={severeCompound ? "secondary" : "default"}
            className={cn(
              severeCompound &&
                "bg-white text-[oklch(0.35_0.16_28)] hover:bg-white/90 dark:bg-card dark:text-foreground",
            )}
          >
            <Link to="/helpline">Open sector playbooks</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className={cn(
              severeCompound &&
                "border-white/40 bg-transparent text-risk-severe-foreground hover:bg-white/10",
            )}
          >
            <Link to="/simulator">Fan-out in Simulator</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className={cn(
              severeCompound &&
                "border-white/40 bg-transparent text-risk-severe-foreground hover:bg-white/10",
            )}
          >
            <Link to="/alerts">Verify in Alerts</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
