import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Dam, PenLine, Radio, Satellite } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { OutlookBadge } from "@/components/turkana/RiskOutlookPanel";
import { TrendChart } from "@/components/turkana/TrendChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLiveBasin } from "@/hooks/use-live-basin";
import {
  engineBaseUrl,
  fetchDamObservations,
  submitDamObservation,
  type DamObservation,
  type DamPointerSource,
  type DamPredictionPointer,
} from "@/lib/alma-engine";
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

const sourceBadge: Record<DamPointerSource | "sensor", string> = {
  estimated: "bg-secondary text-foreground",
  forecast: "bg-primary/10 text-primary",
  manual: "bg-act/15 text-act-foreground",
  partner: "bg-risk-warning/15 text-risk-warning",
  sensor: "bg-muted text-muted-foreground",
};

function methodLabel(method?: string): string {
  if (method === "blended") return "Predicted + operator blend";
  if (method === "manual") return "Operator report";
  if (method === "partner") return "Partner telemetry";
  return "Rain + forecast model";
}

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

  const [observations, setObservations] = useState<DamObservation[]>([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [release, setRelease] = useState("");
  const [fill, setFill] = useState("");
  const [spillway, setSpillway] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [reporter, setReporter] = useState("");

  async function loadObservations() {
    setObsLoading(true);
    try {
      const res = await fetchDamObservations(10);
      if (res.ok) setObservations(res.observations || []);
    } catch {
      // Desk still works offline
    } finally {
      setObsLoading(false);
    }
  }

  useEffect(() => {
    void loadObservations();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await submitDamObservation({
        release_m3s: release.trim() ? Number(release) : null,
        fill_percent: fill.trim() ? Number(fill) : null,
        spillway_status:
          spillway === "closed" || spillway === "partial" || spillway === "open"
            ? spillway
            : null,
        notes: notes.trim() || null,
        reporter: reporter.trim() || null,
      });
      if (!res.ok) throw new Error(res.error || "Could not save report");
      toast.success("Operator report saved — prediction will blend on next refresh");
      setRelease("");
      setFill("");
      setSpillway("");
      setNotes("");
      await loadObservations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const pointers: DamPredictionPointer[] = pred?.pointers ?? [];

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
                <p className="text-sm font-bold text-primary">Dam page</p>
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
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {dam.lastUpdatedLabel} · quality: {dam.dataQuality} ·{" "}
            {methodLabel(pred?.method)}
          </p>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Yes — we predict dam levels"
            description="No public Gibe III SCADA in this prototype. ALMA estimates reservoir pressure and release from upstream rain, soil wetness, forward forecast, optional GloFAS, and your manual reports."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DeskMetric
              label="Predicted release"
              value={`${dam.releaseM3s} m³/s`}
              note={pred?.method === "blended" ? "Rain model + operator blend" : "Rain → release heuristic"}
            />
            <DeskMetric
              label="Reservoir level (index)"
              value={`${dam.fillPercent}%`}
              note="Derived index — not official EEP %"
            />
            <DeskMetric
              label="Spillway (predicted)"
              value={spillwayLabel(dam.spillwayStatus)}
              note="From release pressure or your report"
            />
            <DeskMetric
              label="Dam overflow outlook"
              value={data.riskOutlook?.damOverflow ?? "Stable"}
              note={`3d forecast ${data.riskOutlook?.damForecast3dMm ?? "—"} mm upstream`}
            />
          </div>
          {data.riskOutlook && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">Forward trend:</span>
              <OutlookBadge outlook={data.riskOutlook.damOverflow} />
              {data.riskOutlook.note ? (
                <span className="text-xs text-muted-foreground">{data.riskOutlook.note}</span>
              ) : null}
            </div>
          )}
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Prediction inputs"
            description="Every pointer below feeds the estimated operating picture. Manual reports nudge the blend for 48 hours."
          />
          <ul className="mt-4 divide-y divide-border/80">
            {pointers.length > 0 ? (
              pointers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{p.label}</p>
                    {p.role ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{p.role}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">{p.value}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        sourceBadge[p.source] ?? sourceBadge.estimated,
                      )}
                    >
                      {p.source}
                    </span>
                  </div>
                </li>
              ))
            ) : (
              <>
                <PointerFallback label="Upstream rain (24h)" value={`${data.rain.rain24hMm} mm`} />
                <PointerFallback label="Upstream rain (7d)" value={`${data.rain.rain7dMm} mm`} />
                <PointerFallback
                  label="Forecast rain (3d)"
                  value={`${upstream?.forecast_rainfall?.next3_day ?? "—"} mm`}
                  source="forecast"
                />
                <PointerFallback
                  label="Soil moisture trend"
                  value={upstream?.soil_moisture?.trend ?? "stable"}
                  source="forecast"
                />
              </>
            )}
          </ul>
        </DeskCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <DeskCard>
            <DeskCardHeader
              title="Add operator ground truth"
              description="Phone call from EEP, field visit, or partner report — improves the prediction until sensors arrive."
              action={<PenLine className="h-5 w-5 text-primary" aria-hidden />}
            />
            <form className="mt-5 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dam-release">Observed release (m³/s)</Label>
                  <Input
                    id="dam-release"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 420"
                    value={release}
                    onChange={(e) => setRelease(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dam-fill">Reservoir level (%)</Label>
                  <Input
                    id="dam-fill"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="e.g. 91"
                    value={fill}
                    onChange={(e) => setFill(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dam-spill">Spillway status</Label>
                <Select
                  value={spillway || undefined}
                  onValueChange={setSpillway}
                >
                  <SelectTrigger id="dam-spill">
                    <SelectValue placeholder="Select if known" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="partial">Partly open</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dam-notes">Field notes</Label>
                <Textarea
                  id="dam-notes"
                  rows={3}
                  placeholder="e.g. Increased evening release after upstream storms…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dam-reporter">Reporter (optional)</Label>
                <Input
                  id="dam-reporter"
                  placeholder="Name or desk role"
                  value={reporter}
                  onChange={(e) => setReporter(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full font-bold" disabled={submitting}>
                {submitting ? "Saving…" : "Save & improve prediction"}
              </Button>
            </form>
          </DeskCard>

          <DeskCard>
            <DeskCardHeader
              title="Recent operator reports"
              description="Fresh entries (under 48h) are blended 55% with the rain model."
            />
            {obsLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading reports…</p>
            ) : observations.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No manual reports yet. Add one when you get word from the dam operator or a field
                team.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {observations.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-lg border border-border/70 bg-dust/50 px-3 py-2.5 text-sm"
                  >
                    <p className="font-semibold">
                      {new Date(o.created_at * 1000).toLocaleString()}
                      {o.reporter ? ` · ${o.reporter}` : ""}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {[
                        o.release_m3s != null ? `${o.release_m3s} m³/s` : null,
                        o.fill_percent != null ? `${o.fill_percent}% full` : null,
                        o.spillway_status ? spillwayLabel(o.spillway_status) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Notes only"}
                    </p>
                    {o.notes ? <p className="mt-1 text-xs">{o.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </DeskCard>
        </div>

        <DeskCard>
          <DeskCardHeader
            title="Live risk context"
            description="Dam signal alone and combined with rain."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DeskMetric label="Turbines / SCADA" value="Not live" note={dam.turbineStatus} />
            <DeskMetric
              label="Dam-only risk"
              value={damTrigger.label}
              note={`Arrival ~${damTrigger.etaHours ?? "—"} hours`}
            />
            <DeskMetric
              label="Compound with rain"
              value={data.compoundTrigger.tier}
              note={data.risk?.compound_active ? "Collision window OPEN" : "No collision window"}
            />
            <DeskMetric
              label="GloFAS discharge"
              value={
                data.glofasForecast?.dischargeForecast != null
                  ? `${data.glofasForecast.dischargeForecast} m³/s`
                  : "—"
              }
              note={data.glofasForecast?.honesty ?? "Best-effort river model"}
            />
            <DeskMetric
              label="Calibrated flood score"
              value={
                data.trainedRisk?.floodProbability != null
                  ? `${Math.round(data.trainedRisk.floodProbability * 100)}%`
                  : "—"
              }
              note="Downstream catchment corroboration"
            />
            <DeskMetric
              label="Storage (estimate)"
              value={`${dam.liveStorageBcm} BCM`}
              note={`~${dam.waterLevelMasl} m ASL (proxy)`}
            />
          </div>
        </DeskCard>

        {data.trend.length > 0 && (
          <DeskCard padded={false}>
            <div className="border-b border-border/80 px-5 py-4 sm:px-6">
              <DeskCardHeader
                title="7-day pressure trend"
                description="Reservoir index tracks rain + release proxy — not SCADA fill."
              />
            </div>
            <div className="px-2 pb-4 pt-2 sm:px-4">
              <TrendChart data={data.trend} />
            </div>
          </DeskCard>
        )}

        <DeskCard>
          <DeskCardHeader
            title="Sensor roadmap"
            description="Designed for live hardware when partners connect."
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <SensorSlot
              icon={Satellite}
              label="Reservoir level"
              status="Planned"
              note="Ultrasonic / pressure sensor at full supply datum"
            />
            <SensorSlot
              icon={Activity}
              label="Spillway gates"
              status="Planned"
              note="Gate position + overflow camera feed"
            />
            <SensorSlot
              icon={Radio}
              label="Turbine discharge"
              status="Planned"
              note="SCADA m³/s replaces rain proxy when live"
            />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Until sensors land: set{" "}
            <code className="text-xs">DAM_TELEMETRY_URL</code> on the engine (
            {engineBaseUrl()}) for partner JSON feeds, or use operator reports above. Quality
            upgrades to <strong className="text-foreground">live_feed</strong> when a partner URL
            returns <code className="text-xs">release_m3s</code>.
          </p>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader title="What this means" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Yes — we predict</strong> release and reservoir
              pressure from rain, forecast, soil trend, and your manual reports.
            </li>
            <li>
              Labels stay honest: <strong className="text-foreground">estimated</strong> (model),{" "}
              <strong className="text-foreground">manual</strong> (operator),{" "}
              <strong className="text-foreground">partner</strong> (telemetry URL), future{" "}
              <strong className="text-foreground">sensor</strong>.
            </li>
            <li>
              Compare with the{" "}
              <Link to="/rain" className="font-bold text-primary">
                Rain page
              </Link>{" "}
              — Home uses both for the traffic light.
            </li>
          </ul>
        </DeskCard>
      </div>
    </AppShell>
  );
}

function PointerFallback({
  label,
  value,
  source = "estimated",
}: {
  label: string;
  value: string;
  source?: DamPointerSource;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold tabular-nums">{value}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
            sourceBadge[source],
          )}
        >
          {source}
        </span>
      </div>
    </li>
  );
}

function SensorSlot({
  icon: Icon,
  label,
  status,
  note,
}: {
  icon: typeof Satellite;
  label: string;
  status: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <p className="text-sm font-bold">{label}</p>
      </div>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {status}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
