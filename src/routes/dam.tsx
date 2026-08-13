import { createFileRoute, Link } from "@tanstack/react-router";
import { Dam } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { OutlookBadge } from "@/components/turkana/RiskOutlookPanel";
import { Button } from "@/components/ui/button";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { RequireAuth } from "@/lib/require-auth";
import { lightMeta, tierToLight } from "@/lib/status-light";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dam")({
  head: () => ({
    meta: [{ title: "Dam status — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <DamPage />
    </RequireAuth>
  ),
});

function spillwayLabel(status: string): string {
  if (status === "partial") return "Partly open";
  if (status === "open") return "Open";
  return "Closed";
}

function DamPage() {
  const { data, loading, error, isLive } = useLiveBasin();
  const dam = data.dam;
  const damTrigger = data.damTrigger;
  const pred = data.damPrediction;
  const upstream = data.catchments?.damUpstream;
  const light = tierToLight(damTrigger.tier);
  const lm = lightMeta[light];

  const rainBars = [
    { label: "24h", mm: Number(data.rain.rain24hMm ?? 0) },
    { label: "7d", mm: Number(data.rain.rain7dMm ?? 0) },
    {
      label: "3d fcst",
      mm: Number(upstream?.forecast_rainfall?.next3_day ?? 0),
    },
    {
      label: "7d fcst",
      mm: Number(upstream?.forecast_rainfall?.next7_day ?? 0),
    },
  ];

  const pressureSeries = (data.trend || []).map((t) => ({
    day: t.day,
    rainMm: t.rainfallMm,
    releaseProxy: Math.round((t.reservoirPct / 100) * Math.max(120, dam.releaseM3s || 200)),
    fillIndex: t.reservoirPct,
  }));

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
                <Dam className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Dam only</p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {dam.name}{" "}
                  <span className="font-normal text-muted-foreground">· {dam.basin}</span>
                </h1>
              </div>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-bold", lm.badge)}>
              {light.toUpperCase()} · {damTrigger.label}
            </span>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-foreground">
            {dam.plainSummary}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {dam.lastUpdatedLabel} · quality: {dam.dataQuality} · predicted release{" "}
            {dam.releaseM3s} m³/s · spillway {spillwayLabel(dam.spillwayStatus)}
            {data.riskOutlook ? ` · outlook ${data.riskOutlook.damReleaseOutlook}` : ""}
          </p>
          {data.riskOutlook ? (
            <div className="mt-2">
              <OutlookBadge outlook={data.riskOutlook.damReleaseOutlook} />
            </div>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            Ground-truth forms live on the{" "}
            <Link to="/phone" className="font-bold text-primary">
              phone / USSD desk
            </Link>{" "}
            (WhatsApp &amp; field reports). Rain + dam collision is on the{" "}
            <Link to="/compound" className="font-bold text-primary">
              Compound page
            </Link>
            .
          </p>
        </DeskCard>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DeskCard>
            <DeskMetric
              label="Predicted release"
              value={`${dam.releaseM3s} m³/s`}
              note={pred?.method === "blended" ? "Blended with reports" : "Rain → release model"}
            />
          </DeskCard>
          <DeskCard>
            <DeskMetric
              label="Reservoir index"
              value={`${dam.fillPercent}%`}
              note="Not official EEP SCADA %"
            />
          </DeskCard>
          <DeskCard>
            <DeskMetric
              label="Spillway"
              value={spillwayLabel(dam.spillwayStatus)}
              note={`Storage ~${dam.liveStorageBcm} BCM`}
            />
          </DeskCard>
          <DeskCard>
            <DeskMetric
              label="Dam ETA"
              value={`~${damTrigger.etaHours ?? "—"} h`}
              note="Wave travel estimate"
            />
          </DeskCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <DeskCard padded={false}>
            <div className="border-b border-border/80 px-5 py-4">
              <DeskCardHeader
                title="Upstream rain feeding the dam"
                description="Past totals vs forward forecast for the Gibe catchment."
              />
            </div>
            <div className="h-64 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rainBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} unit=" mm" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="mm" name="Rain (mm)" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DeskCard>

          <DeskCard padded={false}>
            <div className="border-b border-border/80 px-5 py-4">
              <DeskCardHeader
                title="Pressure index vs rain"
                description="7-day series — fill index and release proxy (not live SCADA)."
              />
            </div>
            <div className="h-64 p-4">
              {pressureSeries.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No trend series yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pressureSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis yAxisId="l" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis
                      yAxisId="r"
                      orientation="right"
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      domain={[40, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="l"
                      type="monotone"
                      dataKey="rainMm"
                      name="Rain mm"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="fillIndex"
                      name="Fill index %"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </DeskCard>
        </div>

        <DeskCard>
          <DeskCardHeader
            title="Honest labels"
            description="This page is dam-only. Compound collision lives on its own page."
          />
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              No public Gibe III SCADA — numbers are estimated unless a partner feed or phone report
              is blended in.
            </li>
            <li>
              Log operator reports via{" "}
              <Link to="/phone" className="font-bold text-primary">
                Phone / USSD desk
              </Link>
              .
            </li>
            <li>
              See rain + dam together on{" "}
              <Link to="/compound" className="font-bold text-primary">
                Compound risk
              </Link>
              .
            </li>
          </ul>
        </DeskCard>
      </div>
    </AppShell>
  );
}
