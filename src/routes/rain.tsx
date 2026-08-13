import { createFileRoute, Link } from "@tanstack/react-router";
import { CloudRain } from "lucide-react";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { OutlookBadge } from "@/components/turkana/RiskOutlookPanel";
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
  const upstream = data.catchments?.damUpstream;
  const downstream = data.catchments?.downstream;
  const modelFeatures = data.trainedRisk?.features as Record<string, unknown> | undefined;
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
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {rain.catchmentName}
                </h1>
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
          <DeskCardHeader
            title="Live metrics"
            description="Open-Meteo precipitation over Upper Omo."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DeskMetric
              label="Rain last 24 hours"
              value={`${rain.rain24hMm} mm`}
              note="Live Open-Meteo"
            />
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
            title="Rain forecast (Open-Meteo forward)"
            description="Past rain is above; these are predicted totals ahead. The calibrated risk model uses the downstream catchment row."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <CatchmentForecastBlock
              title="Upstream — Gibe III basin"
              subtitle="Catchment feeding the reservoir (inflow / fill-rate)"
              forecast3d={upstream?.forecast_rainfall?.next3_day}
              forecast7d={upstream?.forecast_rainfall?.next7_day}
              outlook={upstream?.risk_outlook}
              soilTrend={upstream?.soil_moisture?.trend}
              soilRole="inflow"
            />
            <CatchmentForecastBlock
              title="Downstream — Omo / Turkana edge"
              subtitle="Flood impact severity once water arrives (not dam structure)"
              forecast3d={downstream?.forecast_rainfall?.next3_day}
              forecast7d={downstream?.forecast_rainfall?.next7_day}
              outlook={downstream?.risk_outlook}
              soilTrend={downstream?.soil_moisture?.trend}
              soilRole="impact"
              highlight
            />
          </div>
          {data.trainedRisk && (
            <div className="mt-4 rounded-md border border-border bg-dust/50 px-4 py-3 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                Calibrated model ({data.trainedRisk.modelMode || "chirps_open_meteo_only"})
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Logistic score from 3d/7d forecast rain + soil trend + season + optional GloFAS.
                Corroborates the compound tier on Home — Gemma only translates guidance text.
              </p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <ForecastFeature label="3-day rain (model input)" value={modelFeatures?.rain_3d_mm} unit="mm" />
                <ForecastFeature label="7-day rain (model input)" value={modelFeatures?.rain_7d_mm} unit="mm" />
                <ForecastFeature label="Soil trend" value={modelFeatures?.soil_moisture_trend} />
                <ForecastFeature
                  label="Flood probability"
                  value={
                    data.trainedRisk.floodProbability != null
                      ? Math.round(data.trainedRisk.floodProbability * 100)
                      : undefined
                  }
                  unit="%"
                />
              </dl>
            </div>
          )}
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
            <li>Heavy 24h rain on wet soils means water reaches the Omo faster (downstream soil = flood-impact severity).</li>
            <li>
              Check the{" "}
              <Link to="/dam" className="font-bold text-primary">
                Dam page
              </Link>{" "}
              — estimated operational release pressure updates from upstream rain + catchment soil
              (inflow / fill-rate), not dam structural sensors.
            </li>
          </ul>
        </DeskCard>
      </div>
    </AppShell>
  );
}

function CatchmentForecastBlock({
  title,
  subtitle,
  forecast3d,
  forecast7d,
  outlook,
  soilTrend,
  soilRole,
  highlight,
}: {
  title: string;
  subtitle: string;
  forecast3d?: number;
  forecast7d?: number;
  outlook?: "Rising" | "Stable" | "Falling";
  soilTrend?: string;
  soilRole?: "inflow" | "impact";
  highlight?: boolean;
}) {
  const soilLabel =
    soilRole === "inflow"
      ? "Soil · reservoir inflow"
      : soilRole === "impact"
        ? "Soil · flood impact"
        : "Soil moisture";
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background/80",
      )}
    >
      <p className="text-sm font-bold">{title}</p>
      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Next 3 days</p>
          <p className="text-lg font-bold tabular-nums">
            {forecast3d != null ? `${forecast3d} mm` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Next 7 days</p>
          <p className="text-lg font-bold tabular-nums">
            {forecast7d != null ? `${forecast7d} mm` : "—"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {outlook && <OutlookBadge outlook={outlook} />}
        {soilTrend && (
          <span className="text-xs text-muted-foreground">
            {soilLabel} {soilTrend}
          </span>
        )}
      </div>
    </div>
  );
}

function ForecastFeature({
  label,
  value,
  unit,
}: {
  label: string;
  value?: unknown;
  unit?: string;
}) {
  const display =
    value == null || value === "" ? "—" : unit ? `${value}${unit}` : String(value);
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold tabular-nums text-foreground">{display}</dd>
    </div>
  );
}
