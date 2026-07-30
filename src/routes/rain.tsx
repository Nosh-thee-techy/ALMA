import { createFileRoute, Link } from "@tanstack/react-router";
import { CloudRain } from "lucide-react";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { TrendChart } from "@/components/turkana/TrendChart";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/lib/require-auth";
import { lightMeta, tierToLight } from "@/lib/status-light";
import { rainfallTrigger, upstreamRainMetrics } from "@/lib/turkana-data";
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
  const rain = upstreamRainMetrics;
  const light = tierToLight(rainfallTrigger.tier);
  const lm = lightMeta[light];

  return (
    <AppShell>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="font-bold text-primary">
          <Link to="/home">← Back to home</Link>
        </Button>
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
          <p className="mt-2 text-xs font-bold text-muted-foreground">{rain.lastUpdatedLabel}</p>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Current metrics"
            description="Upstream rainfall picture in plain numbers."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DeskMetric label="Rain last 24 hours" value={`${rain.rain24hMm} mm`} note="Rain that fell above the dam" />
            <DeskMetric label="Rain last 7 days" value={`${rain.rain7dMm} mm`} note="Recent wet spell" />
            <DeskMetric
              label="Soil wetness"
              value={`${rain.saturationPercent}%`}
              note="Wet soil means new rain reaches the river faster"
            />
            <DeskMetric
              label="Rain risk (dam not included)"
              value={rainfallTrigger.label}
              note={`If only rain were driving floods: about ${rainfallTrigger.etaHours ?? "—"} hours`}
            />
            <DeskMetric label="Data source" value="Demo / Open-Meteo" note={rain.sourceLabel} />
          </div>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Last 7 days"
            description="How rainfall climbed vs reservoir fill (reservoir line is simulated)."
          />
          <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
            <TrendChart />
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
              — if Gibe III is also releasing, Home may turn red for Compound Risk.
            </li>
            <li>Live CHIRPS API is not connected yet; numbers are demo estimates.</li>
          </ul>
        </DeskCard>
      </div>
    </AppShell>
  );
}
