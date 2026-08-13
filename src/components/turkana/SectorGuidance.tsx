// Sector Guidance ΓÇö NGO ground-truth: region summary + per-community cards + send.

import { useEffect, useMemo, useState } from "react";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Beef,
  ChevronDown,
  CloudRain,
  Fish,
  HeartPulse,
  Loader2,
  Send,
  ShieldAlert,
  Sprout,
} from "lucide-react";

import { toast } from "sonner";

import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { RiskOutlookPanel } from "@/components/turkana/RiskOutlookPanel";
import { IcpacOutlookPanel } from "@/components/turkana/IcpacOutlookPanel";

import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { engineBaseUrl } from "@/lib/alma-engine";

import {
  RECOVERY_SUPPORT_LINE,
  afterGuidance,
  beforeGuidance,
  buildAllRegionStatuses,
  eventPhaseLabel,
  recoverySupportLine,
  type EventPhase,
  type RegionId,
  type RegionStatus,
} from "@/lib/ground-conditions";

import {
  communities,
  guidanceTierLabel,
  sectorDetails,
  sectorMatrix,
  tierMeta,
  type GuidanceTier,
  type SectorId,
} from "@/lib/turkana-data";
import { cn } from "@/lib/utils";
import type { RiskOutlook } from "@/lib/alma-engine";
import {
  climaticImpactCascade,
  ngoSectorCascade,
  resolveCascadeState,
  type CascadeState,
} from "@/lib/climatic-impact-cascade";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

function CascadeBriefingCard({
  climaticState,
  compoundActive,
  tier,
  climateState,
  droughtRisk,
  rainScore,
  damScore,
  liveImpact,
  sector,
}: {
  climaticState?: string | null;
  compoundActive: boolean;
  tier: string;
  climateState: string;
  droughtRisk: string;
  rainScore?: number;
  damScore?: number;
  liveImpact?: {
    state?: string;
    label?: string;
    sectors?: Record<string, { whatIsHappening?: string; mechanism?: string }>;
    marketEconomic?: { whatIsHappening?: string; mechanism?: string };
  } | null;
  sector: SectorId;
}) {
  const state = resolveCascadeState({
    climaticState: climaticState || liveImpact?.state,
    compoundActive,
    tier,
    climateState,
    droughtRisk,
    rainScore,
    damScore,
  });
  const sectorKey =
    sector === "agriculture"
      ? "crops"
      : sector === "fisheries"
        ? "water"
        : sector === "health"
          ? "health"
          : "livestock";
  const fromLive = liveImpact?.sectors?.[sectorKey];
  const fallback = ngoSectorCascade(state, sector);
  const what = fromLive?.whatIsHappening || fallback.whatIsHappening;
  const mechanism = fromLive?.mechanism || fallback.mechanism;
  const label = liveImpact?.label || climaticImpactCascade[state as CascadeState]?.label || fallback.label;
  const market =
    liveImpact?.marketEconomic ||
    liveImpact?.sectors?.marketEconomic ||
    climaticImpactCascade[state as CascadeState]?.marketEconomic;

  return (
    <Collapsible className="mt-3 rounded-md border border-border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-bold hover:bg-dust">
        <span>What&apos;s actually happening · {label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-border px-3 py-3 text-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
            What is happening
          </p>
          <p className="mt-1 leading-snug">{what}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Mechanism (NGO / technical)
          </p>
          <p className="mt-1 leading-snug text-muted-foreground">{mechanism}</p>
        </div>
        {market?.whatIsHappening ? (
          <div className="rounded-md bg-dust px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
              Market / economic (guidance only — not live prices)
            </p>
            <p className="mt-1 text-xs leading-snug">{market.whatIsHappening}</p>
            {market.mechanism ? (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{market.mechanism}</p>
            ) : null}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

const sectorIcons: Record<SectorId, typeof Sprout> = {
  agriculture: Sprout,
  livestock: Beef,
  fisheries: Fish,
  health: HeartPulse,
};

const sectorOrder: SectorId[] = ["agriculture", "livestock", "fisheries", "health"];
const tierOrder: GuidanceTier[] = ["safe", "watch", "warning", "severe", "compound"];

function OutlookInline({ outlook }: { outlook: RiskOutlook }) {
  const meta: Record<
    RiskOutlook,
    { icon: typeof ArrowUp; className: string; label: string }
  > = {
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

  const m = meta[outlook];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold",
        m.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {m.label}
    </span>
  );
}

function sideLabel(id: RegionId): string {
  return id === "omo" ? "Omo side" : "Turkana side";
}

function communityGuidanceLine(st: RegionStatus, rainEtaH: number): string {
  if (st.eventPhase === "post_risk") return afterGuidance("agriculture");
  return beforeGuidance(
    "agriculture",
    st.climateState,
    st.tier,
    st.compoundActive,
    rainEtaH,
  );
}

function livestockGuidanceLine(st: RegionStatus, rainEtaH: number): string {
  if (st.eventPhase === "post_risk") return afterGuidance("livestock");
  return beforeGuidance("livestock", st.climateState, st.tier, st.compoundActive, rainEtaH);
}

type RollupRow = { community: string; pctComplete: number; farmers: number };

type RecoveryData = {
  communities: RollupRow[];
  farmers: Array<{ community: string; regionId: RegionId }>;
  interestLogs: unknown[];
};

export function SectorGuidance() {
  const { data, loading, error, isLive } = useLiveBasin();
  const compoundTrigger = data.compoundTrigger;
  const [sector, setSector] = useState<SectorId>("agriculture");
  const [regionId, setRegionId] = useState<RegionId>("turkana");
  const [recoveryOnly, setRecoveryOnly] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [recoveryData, setRecoveryData] = useState<RecoveryData | null>(null);
  const badge = tierMeta[compoundTrigger.tier].badge;
  // Live compound window → matrix "compound" row; else use live tier.
  const activeTier: GuidanceTier = data.risk?.compound_active ? "compound" : compoundTrigger.tier;

  const riskOutlook = data.riskOutlook;
  const rainEta = data.risk?.t_rain_arrival_h ?? compoundTrigger.etaHours ?? 24;
  const liveTier = data.risk?.tier ?? compoundTrigger.tier;
  const compoundActive = Boolean(data.risk?.compound_active);

  const rainInputs = useMemo(
    () => ({
      rain24hMm: data.rain.rain24hMm,
      rain7dMm: data.rain.rain7dMm,
      dailyMm: data.trend.map((t) => t.rainfallMm),
      tier: liveTier,
      compoundActive,
    }),
    [data.rain, data.trend, liveTier, compoundActive],
  );

  const regions = useMemo(() => buildAllRegionStatuses(rainInputs), [rainInputs]);
  const status = regions[regionId];
  const phase = status.eventPhase;
  const showBefore = phase === "pre_risk" || phase === "active_risk";
  const showAfter = phase === "post_risk";

  const regionCommunities = useMemo(
    () => communities.filter((c) => c.side === regionId),
    [regionId],
  );

  const rollupForRegion = useMemo(() => {
    const names = new Set(regionCommunities.map((c) => c.name));
    return (recoveryData?.communities || []).filter((r) => names.has(r.community));
  }, [recoveryData, regionCommunities]);

  const summary = useMemo(() => {
    const st = status;
    const tier: GuidanceTier = st.compoundActive ? "compound" : st.tier;
    return {
      text: `${sideLabel(regionId)} — ${eventPhaseLabel[st.eventPhase]}. ${st.climateSummary}. Combined flood signal ${guidanceTierLabel[tier]}; parallel drought ${guidanceTierLabel[st.droughtRisk]}. On the ground: ${st.agricultureSummary}; ${st.livestockSummary}.`,
    };
  }, [status, regionId]);

  const actionLine = useMemo(() => {
    if (phase === "post_risk") return afterGuidance(sector);
    return beforeGuidance(
      sector,
      status.climateState,
      status.tier,
      status.compoundActive,
      rainEta,
    );
  }, [phase, sector, status, rainEta]);

  useEffect(() => {
    let cancelled = false;
    async function loadRollup() {
      try {
        const res = await fetch(`${engineBaseUrl()}/api/dashboard/readiness-rollup`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; communities?: RollupRow[] };
        if (!json.ok || cancelled) return;
        const byName = new Map(communities.map((c) => [c.name.toLowerCase(), c.side]));
        const farmers = (json.communities || []).flatMap((row) =>
          Array.from({ length: row.farmers }, () => ({
            community: row.community,
            regionId: (byName.get(row.community.toLowerCase()) || "turkana") as RegionId,
          })),
        );
        setRecoveryData({
          communities: json.communities || [],
          farmers,
          interestLogs: [],
        });
      } catch {
        // Desk still works when readiness API is offline.
      }
    }
    void loadRollup();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendToCommunity(community: string, side: RegionId, message: string) {
    setSendingId(community);
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/community-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ community, region_id: side, message, sector }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        contactCount?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error || `Dispatch failed (${res.status})`);
      toast.success(`Sent to ${community} (${json.contactCount ?? 0} contact(s))`);
    } catch (e) {
      toast.message(`Demo: guidance prepared for ${community}`, {
        description: e instanceof Error ? e.message : "Engine dispatch unavailable",
      });
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current tier banner — shared source of truth with the dashboard. */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-4">
        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <h2 className="text-base font-semibold">What each sector should do</h2>
          <p className="text-xs text-muted-foreground">{compoundTrigger.detail}</p>
        </div>
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", badge)}>
          Current tier · {guidanceTierLabel[activeTier]}
        </span>
      </div>

      {riskOutlook && (
        <RiskOutlookPanel
          downstreamFlood={riskOutlook.downstreamFlood}

          damReleaseOutlook={riskOutlook.damReleaseOutlook}

          note={riskOutlook.note}

          downstreamForecast3dMm={riskOutlook.downstreamForecast3dMm}

          damForecast3dMm={riskOutlook.damForecast3dMm}

          compact
        />
      )}

      <IcpacOutlookPanel initial={data.icpacOutlook} />

      {/* A1 ΓÇö Region summary */}

      <div className="rounded-lg border border-primary/25 bg-dust px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Region summary</p>

        <p className="mt-2 text-sm font-semibold leading-snug text-foreground">{summary.text}</p>

        {rollupForRegion.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {rollupForRegion.map((r) => (
              <li key={r.community} className="rounded-md bg-background/80 px-2.5 py-1">
                {r.pctComplete}% of registered farmers in {r.community} have completed current
                readiness actions ({r.farmers} farmers)
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["turkana", "Turkana side"],

            ["omo", "Omo side"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}

            type="button"

            onClick={() => setRegionId(id)}

            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",

              regionId === id
                ? "bg-primary text-primary-foreground"
                : "bg-dust text-foreground hover:bg-secondary",
            )}
          >
            {label}

            <span className="ml-2 opacity-80">({eventPhaseLabel[regions[id].eventPhase]})</span>
          </button>
        ))}
      </div>

      {/* A2 ΓÇö Per-community cards */}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Communities ┬╖ {sideLabel(regionId)}</h3>

            <p className="mt-1 text-xs text-muted-foreground">
              Same community list as Communities view. Status from region ground conditions;
              guidance from existing Sector Guidance content. NGO view keeps full mechanism
              (dam/rain/drought).
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"

              checked={recoveryOnly}

              onChange={(e) => setRecoveryOnly(e.target.checked)}

              className="h-3.5 w-3.5 accent-primary"
            />
            Recovery-eligible only
          </label>
        </div>

        {/* This is an eligibility FLAG only, not a payment system. Real disbursement

            remains manual/off-platform. Mirrors the logic of parametric insurance

            (event-threshold-triggered) without building actual financial rails. */}

        {regions[regionId].recoveryEligible && (
          <div className="mt-3 rounded-md border border-act/30 bg-dust px-3 py-2 text-xs">
            <p className="font-bold text-primary">
              {sideLabel(regionId)} recovery-eligible
              {" ┬╖ "}
              {regions[regionId].severeOrCompoundHours}h at Severe/Compound (threshold 6h)
            </p>

            <p className="mt-1 text-muted-foreground">
              Flag only ΓÇö prioritize aid distribution manually off-platform.{" "}
              {(recoveryData?.farmers || []).filter((f) => f.regionId === regionId).length}{" "}
              registered farmers in eligible region
              {(recoveryData?.interestLogs || []).length
                ? ` ┬╖ ${(recoveryData?.interestLogs || []).length} interest log(s)`
                : ""}
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {regionCommunities

            .filter((c) => !recoveryOnly || regions[c.side].recoveryEligible)

            .map((c) => {
              const st = regions[c.side];

              const cardTier: GuidanceTier = st.compoundActive ? "compound" : st.tier;

              const tierBadge =
                cardTier === "compound" ? tierMeta.severe.badge : tierMeta[cardTier].badge;

              const agriLine = communityGuidanceLine(st, rainEta);

              const liveLine = livestockGuidanceLine(st, rainEta);

              const sendText =
                st.eventPhase === "post_risk"
                  ? `Recovery: ${agriLine}`
                  : `${agriLine} ┬╖ ${liveLine}`;

              return (
                <article
                  key={c.id}

                  className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-bold leading-tight">{c.name}</h4>

                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.name} ┬╖ {sideLabel(c.side)}
                        {st.recoveryEligible ? " ┬╖ recovery-eligible" : ""}
                      </p>
                    </div>

                    <span
                      className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", tierBadge)}
                    >
                      {guidanceTierLabel[cardTier]}
                    </span>
                  </div>

                  <dl className="mt-3 space-y-1.5 text-xs">
                    <div>
                      <dt className="font-medium text-muted-foreground">Agriculture</dt>

                      <dd className="text-sm text-foreground">{st.agricultureSummary}</dd>
                    </div>

                    <div>
                      <dt className="font-medium text-muted-foreground">Livestock</dt>

                      <dd className="text-sm text-foreground">{st.livestockSummary}</dd>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="rounded bg-secondary px-2 py-0.5 font-semibold">
                        Drought {guidanceTierLabel[st.droughtRisk]}
                      </span>

                      <span className="rounded bg-secondary px-2 py-0.5 font-semibold">
                        Rain {st.rain24hMm} mm / 24h
                      </span>
                    </div>
                  </dl>

                  <div className="mt-3 rounded-md border border-act/25 bg-dust px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
                      {st.eventPhase === "post_risk"
                        ? "Recovery guidance"
                        : "Before / active guidance"}
                    </p>

                    <p className="mt-1 text-sm font-medium leading-snug">{agriLine}</p>

                    {st.eventPhase !== "post_risk" && (
                      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                        {liveLine}
                      </p>
                    )}
                  </div>

                  <CascadeBriefingCard
                    climaticState={data.climaticState}
                    compoundActive={st.compoundActive}
                    tier={st.tier}
                    climateState={st.climateState}
                    droughtRisk={st.droughtRisk}
                    rainScore={data.risk?.rain_score}
                    damScore={data.risk?.dam_score}
                    liveImpact={data.climaticImpact}
                    sector={sector}
                  />

                  {riskOutlook && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Downstream
                      </span>

                      <OutlookInline outlook={riskOutlook.downstreamFlood} />

                      <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Release risk
                      </span>

                      <OutlookInline outlook={riskOutlook.damReleaseOutlook} />
                    </div>
                  )}

                  <Button
                    type="button"

                    className="mt-4 w-full gap-2 bg-act font-bold text-act-foreground hover:bg-act/90"

                    disabled={sendingId === c.name}

                    onClick={() => void sendToCommunity(c.name, c.side, sendText)}
                  >
                    {sendingId === c.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send to Community
                  </Button>
                </article>
              );
            })}
        </div>
      </div>

      {/* Ground conditions snapshot */}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-1">
          <p className="text-xs font-bold text-primary">Agriculture on the ground</p>

          <p className="mt-2 text-sm font-semibold leading-snug">{status.agricultureSummary}</p>

          <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>Crop stage</dt>

              <dd className="font-bold capitalize text-foreground">{status.cropStage}</dd>
            </div>

            <div className="flex justify-between gap-2">
              <dt>Soil moisture</dt>

              <dd className="font-bold capitalize text-foreground">{status.soilMoisture}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-1">
          <p className="text-xs font-bold text-primary">Livestock on the ground</p>

          <p className="mt-2 text-sm font-semibold leading-snug">{status.livestockSummary}</p>

          <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>Grazing</dt>

              <dd className="font-bold capitalize text-foreground">{status.grazingCondition}</dd>
            </div>

            <div className="flex justify-between gap-2">
              <dt>Water points</dt>

              <dd className="font-bold text-foreground">
                {status.grazingCondition === "stressed"
                  ? "Prioritize known sources"
                  : "Routine access"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-1">
          <div className="flex items-center gap-2">
            <CloudRain className="h-4 w-4 text-primary" aria-hidden />

            <p className="text-xs font-bold text-primary">Climate snapshot</p>
          </div>

          <p className="mt-2 text-sm font-semibold leading-snug">{status.climateSummary}</p>

          <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>Rain 24h</dt>

              <dd className="font-bold tabular-nums text-foreground">{status.rain24hMm} mm</dd>
            </div>

            <div className="flex justify-between gap-2">
              <dt>Rain 7d</dt>

              <dd className="font-bold tabular-nums text-foreground">{status.rain7dMm} mm</dd>
            </div>

            <div className="flex justify-between gap-2">
              <dt>Event phase</dt>

              <dd className="font-bold text-foreground">{eventPhaseLabel[phase]}</dd>
            </div>
          </dl>
        </div>
      </div>

      {showBefore && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", badge)}>
              Before / active guidance
            </span>

            <span className="text-xs text-muted-foreground">
              Branches on climate ({status.climateState}) + tier ({status.tier})
            </span>
          </div>

          <Tabs value={sector} onValueChange={(v) => setSector(v as SectorId)} className="mt-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              {sectorOrder.map((s) => {
                const Icon = sectorIcons[s];

                return (
                  <TabsTrigger key={s} value={s} className="gap-2">
                    <Icon className="h-4 w-4" />

                    {sectorDetails[s].label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {sectorOrder.map((s) => {
              const d = sectorDetails[s];

              const Icon = sectorIcons[s];

              const line = beforeGuidance(
                s,

                status.climateState,

                status.tier,

                status.compoundActive,

                rainEta,
              );

              return (
                <TabsContent key={s} value={s} className="mt-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-secondary p-2">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <h3 className="text-base font-semibold">{d.headline}</h3>

                      <p className="text-xs text-muted-foreground">
                        {d.label} ┬╖ {status.label}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-md border border-border bg-background p-3 text-sm font-medium leading-snug">
                    {line}
                  </p>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      )}

      {showAfter && (
        <div className="rounded-lg border-2 border-act/40 bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-act px-2.5 py-0.5 text-xs font-bold text-act-foreground">
              Recovery
            </span>

            <span className="text-xs text-muted-foreground">
              eventPhase = post_risk (severe/compound within last 72h, now Watch/Safe)
            </span>
          </div>

          <Tabs value={sector} onValueChange={(v) => setSector(v as SectorId)} className="mt-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              {sectorOrder.map((s) => {
                const Icon = sectorIcons[s];

                return (
                  <TabsTrigger key={s} value={s} className="gap-2">
                    <Icon className="h-4 w-4" />

                    {sectorDetails[s].label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {sectorOrder.map((s) => {
              const Icon = sectorIcons[s];

              return (
                <TabsContent key={s} value={s} className="mt-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-act/15 p-2 text-act">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <h3 className="text-base font-semibold">{sectorDetails[s].label} recovery</h3>

                      <p className="text-xs text-muted-foreground">{status.label}</p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-md border border-act/30 bg-background p-3 text-sm font-medium leading-snug">
                    {afterGuidance(s)}
                  </p>

                  <p className="mt-3 rounded-md bg-dust px-3 py-2 text-xs font-medium text-foreground">
                    {recoverySupportLine(status.recoveryEligible) || RECOVERY_SUPPORT_LINE}
                  </p>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-background/60 p-4 text-sm">
        <p className="font-semibold">Active line for {sectorDetails[sector].label}</p>

        <p className="mt-1 text-muted-foreground">{actionLine}</p>
      </div>

      {/* Matrix retained for briefing ΓÇö secondary */}

      <div className="overflow-x-auto rounded-lg border border-border bg-card opacity-90">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Actions by danger level and sector</h3>
          <p className="text-xs text-muted-foreground">
            Reference matrix. Community cards above are the primary ops view.
          </p>
        </div>
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 font-medium">Tier</th>
              {sectorOrder.map((s) => (
                <th key={s} className="px-4 py-3 font-medium">
                  {sectorDetails[s].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tierOrder.map((t) => (
              <tr
                key={t}
                className={cn(
                  "border-b border-border last:border-0",
                  t === activeTier && "bg-secondary/60",
                )}
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                      t === "compound" ? tierMeta.severe.badge : tierMeta[t].badge,
                    )}
                  >
                    {guidanceTierLabel[t]}
                  </span>
                </td>
                {sectorOrder.map((s) => (
                  <td key={s} className="px-4 py-3 text-muted-foreground">
                    {sectorMatrix[t][s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
