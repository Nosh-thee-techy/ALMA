/*
  Operator Home — traffic light + actions first. Deep dam/rain live on their own pages.
*/
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CloudRain, Dam } from "lucide-react";
import { AppShell } from "@/components/turkana/AppShell";
import { DeskCard, DeskCardHeader, DeskList, DeskListItem } from "@/components/turkana/DeskCard";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { VoiceHelpline } from "@/components/turkana/VoiceHelpline";
import { WeatherHeatMap } from "@/components/turkana/WeatherHeatMap";
import { Button } from "@/components/ui/button";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { RequireAuth } from "@/lib/require-auth";
import { lightMeta, tierToLight, worstLight, type TrafficLight } from "@/lib/status-light";
import { tierMeta, verificationMeta } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [{ title: "Home — ALMA desk" }],
  }),
  component: () => (
    <RequireAuth>
      <HomePage />
    </RequireAuth>
  ),
});

function HomePage() {
  const { data, loading, error, isLive } = useLiveBasin();
  const { damTrigger, rainfallTrigger, compoundTrigger, dam, rain, alerts } = data;

  const damLight = tierToLight(damTrigger.tier);
  const rainLight = tierToLight(rainfallTrigger.tier);
  const overall = worstLight([damLight, rainLight, tierToLight(compoundTrigger.tier)]);
  const meta = lightMeta[overall];

  const openAlerts = alerts
    .filter((a) => a.verification === "unconfirmed" || a.severity === "severe" || a.id.startsWith("live-"))
    .slice(0, 5);

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-primary">Operator home</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">What needs you right now?</h1>
        </div>
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
      </header>

      <div className="space-y-5">
        <DeskCard
          className={cn(
            "border-2",
            overall === "red" ? "border-risk-severe bg-risk-severe text-risk-severe-foreground" : meta.panel,
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("h-3.5 w-3.5 rounded-full ring-2 ring-white/50", meta.dot)} aria-hidden />
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{meta.label}</h2>
          </div>
          <p
            className={cn(
              "mt-3 max-w-2xl text-base leading-relaxed",
              overall === "red" ? "text-risk-severe-foreground/95" : "opacity-95",
            )}
          >
            {compoundTrigger.detail || meta.meaning}
          </p>
          <p className={cn("mt-2 text-xs font-bold", overall === "red" ? "opacity-80" : "text-muted-foreground")}>
            {data.pitchLine}
          </p>

          {overall === "red" && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="lg" className="bg-act font-bold text-act-foreground hover:bg-act/90">
                <Link to="/sector-guidance">
                  What should each sector do?
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent font-bold hover:bg-white/10"
              >
                <Link to="/simulator">Warn people (SMS)</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent font-bold hover:bg-white/10"
              >
                <Link to="/alerts">Open alerts</Link>
              </Button>
            </div>
          )}

          {overall === "yellow" && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="lg" className="bg-act font-bold text-act-foreground hover:bg-act/90">
                <Link to="/sector-guidance">Review sector playbooks</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border/80 bg-card/60 font-bold">
                <Link to="/alerts">Check alerts</Link>
              </Button>
            </div>
          )}

          {overall === "green" && (
            <p className="mt-4 text-sm opacity-90">
              No urgent action. Open Dam or Rain below when you want the live numbers.
            </p>
          )}
        </DeskCard>

        <div className="grid gap-5 sm:grid-cols-2">
          <SummaryCard
            icon={<Dam className="h-5 w-5" aria-hidden />}
            title="Dam (Gibe III)"
            light={damLight}
            line={`Est. release ${dam.releaseM3s} m³/s · pressure index ${dam.fillPercent}`}
            plain={dam.plainSummary}
            to="/dam"
            cta="Open dam details"
          />
          <SummaryCard
            icon={<CloudRain className="h-5 w-5" aria-hidden />}
            title="Rain (upstream)"
            light={rainLight}
            line={`${rain.rain24hMm} mm / 24h · soil ~${rain.saturationPercent}%`}
            plain={rain.plainSummary}
            to="/rain"
            cta="Open rain details"
          />
        </div>

        <WeatherHeatMap />
        <VoiceHelpline />

        <DeskCard>
          <DeskCardHeader
            title="Live field actions & alerts"
            description="USSD writes and risk checks from the engine — full log on Alerts."
            action={
              <Button asChild variant="outline" size="sm" className="rounded-full border-border/80 bg-dust font-bold">
                <Link to="/alerts">All alerts</Link>
              </Button>
            }
          />
          <DeskList>
            {openAlerts.length === 0 ? (
              <DeskListItem>
                <p className="text-sm text-muted-foreground">
                  No USSD actions yet. Dial *384*96428# or wait for the next live risk poll.
                </p>
              </DeskListItem>
            ) : (
              openAlerts.map((a) => (
                <DeskListItem key={a.id}>
                  <p className="font-bold leading-snug text-foreground">
                    {a.message.slice(0, 110)}
                    {a.message.length > 110 ? "…" : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.timestamp} · {a.communities.join(", ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", tierMeta[a.severity].badge)}>
                      {tierMeta[a.severity].label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                        verificationMeta[a.verification].badge,
                      )}
                    >
                      {verificationMeta[a.verification].label}
                    </span>
                  </div>
                </DeskListItem>
              ))
            )}
          </DeskList>
        </DeskCard>
      </div>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  title,
  light,
  line,
  plain,
  to,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  light: TrafficLight;
  line: string;
  plain: string;
  to: "/dam" | "/rain";
  cta: string;
}) {
  const lm = lightMeta[light];
  return (
    <DeskCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-dust text-primary">{icon}</div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
            lm.badge,
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", lm.dot)} />
          {light.toUpperCase()}
        </span>
      </div>
      <p className="mt-4 text-sm font-bold tabular-nums text-foreground">{line}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3">{plain}</p>
      <Button asChild variant="outline" size="sm" className="mt-5 rounded-full border-border/80 bg-dust font-bold">
        <Link to={to}>{cta}</Link>
      </Button>
    </DeskCard>
  );
}
