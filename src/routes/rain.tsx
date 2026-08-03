import { createFileRoute, Link } from "@tanstack/react-router";
import { CloudRain } from "lucide-react";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { TrendChart } from "@/components/turkana/TrendChart";
import { Button } from "@/components/ui/button";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { RequireAuth } from "@/lib/require-auth";
import { lightMeta, tierToLight } from "@/lib/status-light";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rain")({
  head: () => ({
    meta: [{ title: "Rain status — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <RainPage />
    </RequireAuth>
  ),
});

function RainPage() {
  const { data, loading, error, isLive } = useLiveBasin();
  const rain = data.rain;
  const rainfallTrigger = data.rainfallTrigger;
  const light = tierToLight(rainfallTrigger.tier);
  const lm = lightMeta[light];

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="font-bold text-primary">
          <Link to="/home">← Back to home</Link>
        </Button>
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
      </div>

      <div className="space-y-5">
        <DeskCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dust text-primary">
                <CloudRain className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Rain page</p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{rain.catchmentName}</h1>
              </div>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-bold", lm.badge)}>
              {light.toUpperCase()} · {rainfallTrigger.label}
            </span>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed">{rain.plainSummary}</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {rain.lastUpdatedLabel} · {rain.sourceLabel}
          </p>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader title="Live metrics" description="Open-Meteo precipitation over Upper Omo." />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DeskMetric label="Rain last 24 hours" value={`${rain.rain24hMm} mm`} note="Live Open-Meteo" />
            <DeskMetric label="Rain last 7 days" value={`${rain.rain7dMm} mm`} note="Live sum" />
            <DeskMetric
              label="Soil wetness (estimate)"
              value={`${rain.saturationPercent}%`}
              note="Derived from 24h + 7d rain"
            />
            <DeskMetric
              label="Rain-only risk"
              value={rainfallTrigger.label}
              note={`Arrival ~${rainfallTrigger.etaHours ?? "—"} hours`}
            />
            <DeskMetric label="Data quality" value={rain.dataQuality} note={rain.sourceLabel} />
          </div>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Last 7 days (live)"
            description="Daily Open-Meteo rain. Right axis is a pressure index, not SCADA fill %."
          />
          <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
            <TrendChart data={data.trend} live />
          </div>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader title="What this means" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Heavy 24h rain on wet soils means water reaches the Omo faster.</li>
            <li>
              Check the{" "}
              <Link to="/dam" className="font-bold text-primary">
                Dam page
              </Link>{" "}
              — estimated release pressure updates from this same live rain.
            </li>
          </ul>
        </DeskCard>
      </div>
    </AppShell>
  );
}
