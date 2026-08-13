/**
 * Forecast-informed risk outlook badge — NGO/responder tier only.
 * Not AI-predicted flood forecasting; rules-based Open-Meteo trend indicator.
 */
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import type { RiskOutlook } from "@/lib/alma-engine";
import { cn } from "@/lib/utils";

const outlookMeta: Record<RiskOutlook, { icon: typeof ArrowUp; label: string; className: string }> =
  {
    Rising: {
      icon: ArrowUp,
      label: "Rising",
      className: "text-risk-warning bg-risk-warning/15 border-risk-warning/30",
    },
    Stable: {
      icon: ArrowRight,
      label: "Stable",
      className: "text-muted-foreground bg-secondary border-border",
    },
    Falling: {
      icon: ArrowDown,
      label: "Falling",
      className: "text-risk-safe-foreground bg-risk-safe-bg border-risk-safe/30",
    },
  };

export function OutlookBadge({ outlook, className }: { outlook: RiskOutlook; className?: string }) {
  const meta = outlookMeta[outlook] || outlookMeta.Stable;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold",
        meta.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}

export function RiskOutlookPanel({
  downstreamFlood,
  damReleaseOutlook,
  note,
  downstreamForecast3dMm,
  damForecast3dMm,
  compact = false,
}: {
  downstreamFlood: RiskOutlook;
  damReleaseOutlook: RiskOutlook;
  note?: string;
  downstreamForecast3dMm?: number;
  damForecast3dMm?: number;
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", compact ? "p-3" : "p-4")}>
      <p className="text-xs font-bold uppercase tracking-wide text-primary">
        Forecast-informed outlook
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Rules-based trend from Open-Meteo forecast rain + soil moisture (inflow / flood-impact
        indicators) — not ML/LSTM forecasting or dam structural monitoring. Does not override
        current tier.
      </p>
      <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <div className="rounded-md border border-border bg-background/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Downstream flood outlook
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <OutlookBadge outlook={downstreamFlood} />
            {downstreamForecast3dMm != null && (
              <span className="text-xs text-muted-foreground">
                ~{downstreamForecast3dMm} mm / 3d forecast
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Operational release risk outlook
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <OutlookBadge outlook={damReleaseOutlook} />
            {damForecast3dMm != null && (
              <span className="text-xs text-muted-foreground">
                ~{damForecast3dMm} mm / 3d upstream forecast
              </span>
            )}
          </div>
        </div>
      </div>
      {note && !compact && <p className="mt-2 text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}
