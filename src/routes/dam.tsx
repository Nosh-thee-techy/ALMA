import { createFileRoute, Link } from "@tanstack/react-router";
import { Dam } from "lucide-react";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskMetric } from "@/components/turkana/DeskCard";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/lib/require-auth";
import { lightMeta, tierToLight } from "@/lib/status-light";
import { damTrigger, gibeIIIMetrics } from "@/lib/turkana-data";
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
  const dam = gibeIIIMetrics;
  const light = tierToLight(damTrigger.tier);
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
          <p className="mt-2 text-xs font-bold text-muted-foreground">{dam.lastUpdatedLabel}</p>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Current dam status"
            description="How full the dam is and how much water it is releasing."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DeskMetric label="How full the dam is" value={`${dam.fillPercent}%`} note="Lake behind the dam" />
            <DeskMetric
              label="Water level"
              value={`${dam.waterLevelMasl} m`}
              note={`Full supply level ${dam.fullSupplyMasl} m`}
            />
            <DeskMetric
              label="Water stored now"
              value={`${dam.liveStorageBcm} bcm`}
              note="Billion cubic metres available"
            />
            <DeskMetric
              label="Water being released"
              value={`${dam.releaseM3s} m³/s`}
              note={`Overflow gates: ${dam.spillwayStatus === "partial" ? "partly open" : dam.spillwayStatus}`}
            />
            <DeskMetric label="Turbines" value={dam.turbineStatus} note="Power house status" />
            <DeskMetric
              label="Dam risk (rain not included)"
              value={damTrigger.label}
              note={`If only the dam were releasing: water could arrive in about ${damTrigger.etaHours ?? "—"} hours`}
            />
          </div>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader
            title="Live alternatives (no public Gibe SCADA)"
            description="What ALMA can use instead of a fake live dam gauge."
          />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Upstream rain → release pressure</strong> — live
              Open-Meteo rain over Upper Omo estimates how hard water is pushing into the dam (not
              official Gibe III readings). Engine:{" "}
              <code className="text-xs">GET /api/dashboard/live-signals</code>.
            </li>
            <li>
              <strong className="text-foreground">Partner dam feed</strong> — if EEP / basin authority
              give a URL, set <code className="text-xs">DAM_TELEMETRY_URL</code> on the engine.
            </li>
            <li>
              <strong className="text-foreground">Practice warnings</strong> — use Simulator to rehearse
              SMS / WhatsApp / USSD without claiming live dam SCADA.
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground" id="live-signals-hint">
            Open{" "}
            <a className="font-bold text-primary" href="http://127.0.0.1:8787/api/dashboard/live-signals">
              live signals JSON
            </a>{" "}
            while the engine is running.
          </p>
        </DeskCard>

        <DeskCard>
          <DeskCardHeader title="What this means" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Nearly full</strong> means less spare room if more
              water arrives from upstream rain.
            </li>
            <li>
              <strong className="text-foreground">Partly open overflow gates</strong> means water is
              already being let out on purpose.
            </li>
            <li>
              Compare with the{" "}
              <Link to="/rain" className="font-bold text-primary">
                Rain page
              </Link>
              . If both Dam and Rain are yellow/red, Home puts joint flood actions first.
            </li>
          </ul>
        </DeskCard>
      </div>
    </AppShell>
  );
}
