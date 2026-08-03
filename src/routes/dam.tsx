import { createFileRoute, Link } from "@tanstack/react-router";
import { Dam } from "lucide-react";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
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

function DamPage() {
  const { data, loading, error, isLive } = useLiveBasin();
  const dam = data.dam;
  const damTrigger = data.damTrigger;
  const light = tierToLight(damTrigger.tier);
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
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-foreground">{dam.plainSummary}</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {dam.lastUpdatedLabel} · quality: {dam.dataQuality}
          </p>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Live dam pressure (rain proxy)"
            description="No public Gibe III SCADA — release is estimated from live Upper Omo rain."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DeskMetric
              label="Estimated release"
              value={`${dam.releaseM3s} m³/s`}
              note="From Open-Meteo rain → release pressure"
            />
            <DeskMetric
              label="Pressure index"
              value={`${dam.fillPercent}`}
              note="Derived index (not official reservoir %)"
            />
            <DeskMetric
              label="Spillway estimate"
              value={dam.spillwayStatus === "partial" ? "Partly open" : dam.spillwayStatus}
              note="Heuristic from release pressure"
            />
            <DeskMetric label="Turbines / SCADA" value="Not live" note={dam.turbineStatus} />
            <DeskMetric
              label="Dam-only risk"
              value={damTrigger.label}
              note={`Arrival ~${damTrigger.etaHours ?? "—"} hours if only dam signal`}
            />
            <DeskMetric
              label="Compound with rain"
              value={data.compoundTrigger.tier}
              note={data.risk?.compound_active ? "Collision window OPEN" : "No collision window"}
            />
          </div>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader title="What this means" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Estimated release</strong> updates from live upstream
              rain; it is not EEP telemetry.
            </li>
            <li>
              Set <code className="text-xs">DAM_TELEMETRY_URL</code> on the engine when a partner feed
              exists — quality becomes <strong className="text-foreground">live_feed</strong>.
            </li>
            <li>
              Compare with the{" "}
              <Link to="/rain" className="font-bold text-primary">
                Rain page
              </Link>
              . Home uses both for the traffic light.
            </li>
          </ul>
        </DeskCard>
      </div>
    </AppShell>
  );
}
