import { createFileRoute, Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { GroundObserversPanel } from "@/components/turkana/GroundObserversPanel";
import { IcpacOutlookPanel } from "@/components/turkana/IcpacOutlookPanel";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { RiskOutlookPanel } from "@/components/turkana/RiskOutlookPanel";
import { Button } from "@/components/ui/button";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { RequireAuth } from "@/lib/require-auth";
import { lightMeta, tierToLight, worstLight } from "@/lib/status-light";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/compound")({
  head: () => ({
    meta: [{ title: "Compound risk — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <CompoundPage />
    </RequireAuth>
  ),
});

const SCORE_COLORS = ["var(--chart-2)", "var(--chart-1)", "var(--chart-3)"];

function CompoundPage() {
  const { data, loading, error, isLive } = useLiveBasin();
  const rain = data.rainfallTrigger;
  const dam = data.damTrigger;
  const compound = data.compoundTrigger;
  const overall = worstLight([
    tierToLight(rain.tier),
    tierToLight(dam.tier),
    tierToLight(compound.tier),
  ]);
  const lm = lightMeta[overall];

  const dualBars = [
    { name: "Rain score", score: Number(data.risk?.rain_score ?? rain.metric ?? 0) },
    { name: "Dam score", score: Number(data.risk?.dam_score ?? dam.metric ?? 0) },
    {
      name: "Compound",
      score: Number(data.risk?.compound_severity ?? compound.metric ?? 0),
    },
  ];

  const etaBars = [
    { name: "Rain ETA", hours: Number(data.risk?.t_rain_arrival_h ?? rain.etaHours ?? 0) },
    { name: "Dam ETA", hours: Number(data.risk?.t_dam_arrival_h ?? dam.etaHours ?? 0) },
    {
      name: "Overlap",
      hours: Number(
        data.risk?.overlap_hours ?? (Math.min(rain.etaHours ?? 0, dam.etaHours ?? 0) || 0),
      ),
    },
  ];

  const corroboration = [
    {
      name: "Calibrated flood",
      value: Math.round((data.trainedRisk?.floodProbability ?? 0) * 100),
    },
    {
      name: "Remainder",
      value: Math.max(0, 100 - Math.round((data.trainedRisk?.floodProbability ?? 0) * 100)),
    },
  ];

  const dualTrend = (data.trend || []).map((t) => ({
    day: t.day,
    rainMm: t.rainfallMm,
    damPressure: t.reservoirPct,
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
                <Layers className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Compound risk</p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  When rain and dam hit together
                </h1>
              </div>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-bold", lm.badge)}>
              {overall.toUpperCase()} · {compound.label}
            </span>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed">{compound.detail}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Collision window{" "}
            <strong className="text-foreground">
              {data.risk?.compound_active ? "OPEN" : "closed"}
            </strong>
            . Open{" "}
            <Link to="/dam" className="font-bold text-primary">
              Dam
            </Link>{" "}
            or{" "}
            <Link to="/rain" className="font-bold text-primary">
              Rain
            </Link>{" "}
            for single-signal detail.
          </p>
        </DeskCard>

        <div className="grid gap-3 sm:grid-cols-3">
          <DeskCard>
            <DeskMetric label="Rain trigger" value={rain.label} note={`${rain.metric ?? "—"} score`} />
          </DeskCard>
          <DeskCard>
            <DeskMetric label="Dam trigger" value={dam.label} note={`${dam.metric ?? "—"} score`} />
          </DeskCard>
          <DeskCard>
            <DeskMetric
              label="Combined"
              value={compound.label}
              note={`ETA ~${compound.etaHours ?? "—"} h`}
            />
          </DeskCard>
        </div>

        {data.riskOutlook && (
          <RiskOutlookPanel
            downstreamFlood={data.riskOutlook.downstreamFlood}
            damReleaseOutlook={data.riskOutlook.damReleaseOutlook}
            note={data.riskOutlook.note}
            downstreamForecast3dMm={data.riskOutlook.downstreamForecast3dMm}
            damForecast3dMm={data.riskOutlook.damForecast3dMm}
          />
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <DeskCard padded={false}>
            <div className="border-b border-border/80 px-5 py-4">
              <DeskCardHeader
                title="Dual-trigger scores"
                description="Rain vs dam vs compound severity (0–100)."
              />
            </div>
            <div className="h-64 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dualBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="score" name="Score" radius={[6, 6, 0, 0]}>
                    {dualBars.map((_, i) => (
                      <Cell key={dualBars[i].name} fill={SCORE_COLORS[i % SCORE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DeskCard>

          <DeskCard padded={false}>
            <div className="border-b border-border/80 px-5 py-4">
              <DeskCardHeader
                title="Arrival timing"
                description="Hours until rain pulse, dam wave, and overlap window."
              />
            </div>
            <div className="h-64 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={etaBars} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} unit="h" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="hours" name="Hours" fill="var(--chart-3)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DeskCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <DeskCard padded={false}>
            <div className="border-b border-border/80 px-5 py-4">
              <DeskCardHeader
                title="7-day dual series"
                description="Rainfall mm alongside dam pressure index — the collision story over time."
              />
            </div>
            <div className="h-72 p-4">
              {dualTrend.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No trend yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dualTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis yAxisId="l" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis
                      yAxisId="r"
                      orientation="right"
                      domain={[40, 100]}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
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
                      name="Rain (mm)"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="damPressure"
                      name="Dam pressure idx"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </DeskCard>

          <DeskCard padded={false}>
            <div className="border-b border-border/80 px-5 py-4">
              <DeskCardHeader
                title="Calibrated flood corroboration"
                description="Model probability used only as extra confidence — not a replacement tier."
              />
            </div>
            <div className="flex h-72 flex-col items-center justify-center p-4">
              {data.trainedRisk?.floodProbability == null ? (
                <p className="text-sm text-muted-foreground">No calibrated score yet.</p>
              ) : (
                <>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={corroboration}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                        >
                          <Cell fill="var(--chart-3)" />
                          <Cell fill="var(--muted)" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">
                    {Math.round(data.trainedRisk.floodProbability * 100)}%
                  </p>
                  <p className="text-xs text-muted-foreground">Downstream flood probability</p>
                </>
              )}
              {data.glofasForecast?.dischargeForecast != null && (
                <p className="mt-3 text-xs text-muted-foreground">
                  GloFAS discharge ~{data.glofasForecast.dischargeForecast} m³/s
                </p>
              )}
            </div>
          </DeskCard>
        </div>

        <GroundObserversPanel liveLayer={data.groundObservers?.layer ?? null} />
        <IcpacOutlookPanel initial={data.icpacOutlook} />
      </div>
    </AppShell>
  );
}
