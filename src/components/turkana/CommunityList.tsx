import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertTriangle,
  Clock,
  Home,
  Loader2,
  MapPin,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { Button } from "@/components/ui/button";
import { useLiveBasin } from "@/hooks/use-live-basin";
import {
  dispatchCommunityFollowUp,
  engineBaseUrl,
  fetchSosQueue,
  markCommunityReached,
  type SosEntry,
} from "@/lib/alma-engine";
import { farmerAppHref } from "@/lib/farmer-app";
import { coordsForCommunity } from "@/lib/basin-geo";
import {
  afterGuidance,
  beforeGuidance,
  buildRegionStatus,
  eventPhaseLabel,
  recoverySupportLine,
  type EventPhase,
} from "@/lib/ground-conditions";
import {
  tierMeta,
  type RiskTier,
  type SectorId,
  type VerificationState,
} from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const TIER_HEX: Record<RiskTier, string> = {
  safe: "#3d8f5a",
  watch: "#c9a227",
  warning: "#d97706",
  severe: "#c2410c",
};

const SECTOR_BY_SIDE: Record<"omo" | "turkana", SectorId> = {
  omo: "agriculture",
  turkana: "livestock",
};

type RollupRow = { community: string; farmers: number; pctComplete: number };
type ObserverRow = {
  phoneNumber?: string;
  organizationId?: string;
  registeredLocation?: string;
  verified?: boolean;
};
type ReportRow = {
  phone?: string;
  reportType?: string;
  value?: string;
  createdAt?: number;
  registeredLocation?: string;
  organizationId?: string;
};

function wardKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, "_");
}

function sideLabel(side: "omo" | "turkana") {
  return side === "omo" ? "Omo side" : "Turkana side";
}

function formatWhen(sec: number | null | undefined): string {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function verificationLabel(v: VerificationState): string {
  if (v === "confirmed") return "Confirmed";
  if (v === "false-alarm") return "False alarm";
  return "Unconfirmed";
}

export function CommunityList({ fill = false }: { fill?: boolean }) {
  const { data, loading, error, isLive, refresh } = useLiveBasin();
  const list = data.communities;
  const [selectedId, setSelectedId] = useState<string>(list[0]?.id || "c1");
  const [busy, setBusy] = useState(false);
  const [sos, setSos] = useState<SosEntry[]>([]);
  const [rollup, setRollup] = useState<RollupRow[]>([]);
  const [observers, setObservers] = useState<ObserverRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!list.length) return;
    setSelectedId((prev) => (list.some((c) => c.id === prev) ? prev : list[0].id));
  }, [list]);

  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) || list[0],
    [list, selectedId],
  );

  const compoundActive = Boolean(data.risk?.compound_active || data.compoundTrigger.tier === "severe");

  const regionStatus = useMemo(() => {
    if (!selected) return null;
    return buildRegionStatus(selected.side, {
      rain24hMm: Number(data.rain?.rain24hMm ?? data.risk?.rain_mm ?? 0),
      rain7dMm: Number(data.rain?.rain7dMm ?? 0),
      dailyMm: (data.trend || []).map((t) => t.rainfallMm),
      tier: selected.tier,
      compoundActive,
    });
  }, [selected, data.rain, data.risk, data.trend, compoundActive]);

  const guidance = useMemo(() => {
    if (!selected || !regionStatus) return "";
    const sector = SECTOR_BY_SIDE[selected.side];
    if (regionStatus.eventPhase === "post_risk") return afterGuidance(sector);
    return beforeGuidance(
      sector,
      regionStatus.climateState,
      selected.tier,
      compoundActive,
      selected.rainEtaHours,
    );
  }, [selected, regionStatus, compoundActive]);

  const latestAlert = useMemo(() => {
    if (!selected) return null;
    return (
      (data.alerts || []).find((a) => a.communities.includes(selected.name)) ||
      data.alerts?.[0] ||
      null
    );
  }, [data.alerts, selected]);

  const communitySos = useMemo(() => {
    if (!selected) return [];
    const key = wardKey(selected.name);
    return sos.filter(
      (s) =>
        (s.community && s.community.toLowerCase() === selected.name.toLowerCase()) ||
        (s.ward_id && s.ward_id.toLowerCase() === key),
    );
  }, [sos, selected]);

  const communityObservers = useMemo(() => {
    if (!selected) return [];
    const key = selected.name.toLowerCase();
    return observers.filter((o) =>
      String(o.registeredLocation || "")
        .toLowerCase()
        .includes(key),
    );
  }, [observers, selected]);

  const latestReport = useMemo(() => {
    if (!selected) return null;
    const key = selected.name.toLowerCase();
    const match = reports.find((r) =>
      String(r.registeredLocation || r.organizationId || "")
        .toLowerCase()
        .includes(key),
    );
    return match || reports[0] || null;
  }, [reports, selected]);

  const readiness = useMemo(() => {
    if (!selected) return null;
    return rollup.find((r) => r.community.toLowerCase() === selected.name.toLowerCase()) || null;
  }, [rollup, selected]);

  // Load SOS + readiness + observers for the detail panel
  useEffect(() => {
    let cancelled = false;
    async function loadExtras() {
      try {
        const [sosRes, rollRes, obsRes, repRes] = await Promise.all([
          fetchSosQueue({ limit: 40, includeResolved: false }).catch(() => null),
          fetch(`${engineBaseUrl()}/api/dashboard/readiness-rollup`, {
            headers: { Accept: "application/json" },
          })
            .then((r) => r.json())
            .catch(() => null),
          fetch(`${engineBaseUrl()}/api/dashboard/ground-observers`, {
            headers: { Accept: "application/json" },
          })
            .then((r) => r.json())
            .catch(() => null),
          fetch(`${engineBaseUrl()}/api/dashboard/ground-observer-reports?limit=40`, {
            headers: { Accept: "application/json" },
          })
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (cancelled) return;
        if (sosRes?.items) setSos(sosRes.items);
        if (rollRes?.ok && Array.isArray(rollRes.communities)) setRollup(rollRes.communities);
        if (obsRes?.ok && Array.isArray(obsRes.observers)) setObservers(obsRes.observers);
        else if (Array.isArray(obsRes?.observers)) setObservers(obsRes.observers);
        if (repRes?.ok && Array.isArray(repRes.reports)) setReports(repRes.reports);
        else if (Array.isArray(repRes?.reports)) setReports(repRes.reports);
      } catch {
        /* desk still works offline */
      }
    }
    void loadExtras();
    const id = window.setInterval(() => void loadExtras(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Init map once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView([4.1, 35.85], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 16,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    const t2 = window.setTimeout(() => map.invalidateSize(), 400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Full-bleed resize — Leaflet needs a second pass after flex layout settles.
  useEffect(() => {
    if (!fill || !mapRef.current) return;
    const map = mapRef.current;
    const id = window.setTimeout(() => map.invalidateSize(), 120);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", onResize);
    };
  }, [fill, selectedId]);

  // Sync pins
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    list.forEach((c) => {
      const coords = coordsForCommunity(c.name);
      if (!coords) return;
      const active = c.id === selected?.id;
      const color = TIER_HEX[c.tier] || TIER_HEX.watch;
      const marker = L.circleMarker([coords.lat, coords.lon], {
        radius: active ? 11 : 8,
        color: active ? "#0e7490" : color,
        weight: active ? 3 : 1.5,
        fillColor: color,
        fillOpacity: active ? 0.95 : 0.8,
      });
      marker.bindTooltip(`${c.name} · ${tierMeta[c.tier].label}`, {
        direction: "top",
        offset: [0, -6],
      });
      marker.on("click", () => setSelectedId(c.id));
      marker.addTo(layer);
    });
  }, [list, selected?.id]);

  // Pan to selection
  useEffect(() => {
    if (!selected || !mapRef.current) return;
    const coords = coordsForCommunity(selected.name);
    if (!coords) return;
    mapRef.current.panTo([coords.lat, coords.lon], { animate: true });
  }, [selected?.id]);

  async function sendToCommunity() {
    if (!selected || !guidance) return;
    setBusy(true);
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/community-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          community: selected.name,
          region_id: selected.side,
          message: guidance,
          sector: SECTOR_BY_SIDE[selected.side],
        }),
      });
      const json = (await res.json()) as { ok?: boolean; contactCount?: number; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `Dispatch failed (${res.status})`);
      toast.success(`Sent to ${selected.name} (${json.contactCount ?? 0} contact(s))`);
      void refresh?.();
    } catch (e) {
      toast.message(`Demo: guidance prepared for ${selected.name}`, {
        description: e instanceof Error ? e.message : "Engine dispatch unavailable",
      });
    } finally {
      setBusy(false);
    }
  }

  async function followUpReach() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await dispatchCommunityFollowUp(selected.name, selected.side);
      if (!res.ok) throw new Error(res.error || "Follow-up failed");
      toast.success(`Follow-up SMS queued for ${selected.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send follow-up");
    } finally {
      setBusy(false);
    }
  }

  async function markReached() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await markCommunityReached(
        wardKey(selected.name),
        "Manual",
        "Operator follow-up from Communities",
      );
      if (!res.ok) throw new Error(res.error || "Could not mark reached");
      toast.success(`Marked ${selected.name} as reached`);
      void refresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark reached");
    } finally {
      setBusy(false);
    }
  }

  if (!selected) {
    return (
      <p className="text-sm text-muted-foreground">No monitored communities loaded.</p>
    );
  }

  const reach = selected.lastReachedVia || "Unreached";
  const unreached = reach === "Unreached";
  const meta = tierMeta[selected.tier];
  const coords = coordsForCommunity(selected.name);
  const phase: EventPhase = regionStatus?.eventPhase || "pre_risk";
  const recoveryEligible = Boolean(regionStatus?.recoveryEligible);

  return (
    <div className={cn("flex flex-col gap-2", fill && "h-full min-h-0 overflow-hidden")}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Tap a pin for that community&apos;s full picture — not the basin average.
        </p>
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
      </div>

      <div
        className={cn(
          "grid gap-0 overflow-hidden rounded-xl border border-border bg-card",
          fill
            ? "min-h-0 flex-1 grid-rows-[minmax(200px,36vh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)] lg:grid-rows-1"
            : "min-h-[320px] grid-rows-[minmax(280px,auto)_auto] sm:min-h-[420px] lg:grid-cols-[1.45fr_1fr] lg:grid-rows-1",
        )}
      >
        {/* Map + pin strip */}
        <div
          className={cn(
            "relative min-h-0 border-b border-border lg:border-b-0 lg:border-r",
            !fill && "min-h-[280px] sm:min-h-[360px]",
          )}
        >
          <div ref={mapEl} className="absolute inset-0 z-0 h-full w-full" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[400] bg-gradient-to-t from-card/95 to-transparent p-3 pt-10">
            <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
              {list.map((c) => {
                const active = c.id === selected.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "shrink-0 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 font-bold text-foreground"
                        : "border-border/80 bg-card/90 text-muted-foreground hover:bg-secondary/60",
                    )}
                  >
                    <span
                      className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", tierMeta[c.tier].dot)}
                    />
                    {c.name}
                    <span className="ml-1.5 tabular-nums text-[10px] opacity-80">
                      {(c.population / 1000).toFixed(c.population >= 10000 ? 0 : 1)}k
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="absolute left-3 top-3 z-[400] rounded-md border border-border bg-card/95 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur-sm">
            {(Object.keys(TIER_HEX) as RiskTier[]).map((t) => (
              <div key={t} className="flex items-center gap-2 capitalize">
                <span className="h-2 w-2 rounded-full" style={{ background: TIER_HEX[t] }} />
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel — scrolls inside the viewport, never grows the page */}
        <div
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            !fill && "max-h-[70vh] lg:max-h-[520px]",
          )}
        >
          <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight">
                  {selected.name} · {sideLabel(selected.side)}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.areaLabel}
                  {coords
                    ? ` · ${coords.lat.toFixed(2)}°N, ${coords.lon.toFixed(2)}°E`
                    : null}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold capitalize",
                  meta.badge,
                )}
              >
                {compoundActive && selected.distanceFromDamKm < 560
                  ? `${meta.label} / compound`
                  : meta.label}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <Section title="People in this area">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  icon={Users}
                  label="Population exposed"
                  value={selected.population.toLocaleString()}
                />
                <MiniStat
                  icon={Home}
                  label="Households (est.)"
                  value={selected.households.toLocaleString()}
                />
              </div>
              <p className="mt-2 text-sm text-foreground">
                <strong>{selected.primaryLivelihood}</strong>
                <span className="text-muted-foreground"> · {selected.region}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{selected.exposureNote}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Planning estimates for flood exposure — not a live census feed.
              </p>
            </Section>

            {/* Risk state */}
            <Section title="Risk for this community">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  icon={MapPin}
                  label="From Gibe III"
                  value={`${selected.distanceFromDamKm} km`}
                />
                <MiniStat
                  icon={MapPin}
                  label="From rain catchment"
                  value={`${selected.distanceFromCatchmentKm} km`}
                />
                <MiniStat
                  icon={Clock}
                  label="Rain arrival"
                  value={`~${selected.rainEtaHours}h`}
                  tone="warning"
                />
                <MiniStat
                  icon={Clock}
                  label="Dam wave"
                  value={`~${selected.damEtaHours}h`}
                  tone="watch"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Phase: {eventPhaseLabel[phase]}. Arrival windows are community-specific (distance
                from dam + catchment), not a single basin ETA.
              </p>
            </Section>

            {/* Ground truth & reach */}
            <Section title="Ground truth & reach">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    unreached
                      ? "bg-risk-warning/15 text-risk-warning"
                      : "bg-risk-safe-bg text-risk-safe-foreground",
                  )}
                >
                  {unreached ? "Unreached" : `Reached · ${reach}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {unreached ? "No timestamp" : formatWhen(selected.lastReachedAt)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Latest alert verification:{" "}
                <strong className="text-foreground">
                  {latestAlert
                    ? verificationLabel(latestAlert.verification)
                    : "Unconfirmed"}
                </strong>
                {latestAlert ? ` · ${latestAlert.message.slice(0, 80)}` : null}
              </p>
              {communityObservers.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {communityObservers.slice(0, 3).map((o) => (
                    <li key={o.phoneNumber || o.organizationId}>
                      Observer {o.organizationId || "field"}{" "}
                      {o.verified ? "(verified)" : "(unverified)"}
                      {o.phoneNumber ? ` · ${o.phoneNumber}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No ground observers registered to this community yet.
                </p>
              )}
              {latestReport ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Latest report: {latestReport.reportType || "update"} = {latestReport.value || "—"}
                  {latestReport.createdAt ? ` · ${formatWhen(latestReport.createdAt)}` : ""}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="font-bold"
                  disabled={busy}
                  onClick={() => void followUpReach()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Follow-up SMS"}
                </Button>
                {unreached ? (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-act font-bold text-act-foreground hover:bg-act/90"
                    disabled={busy}
                    onClick={() => void markReached()}
                  >
                    Mark reached
                  </Button>
                ) : null}
              </div>
            </Section>

            {/* Sector guidance */}
            <Section title="Sector guidance (localized)">
              <p className="text-sm text-foreground">{guidance}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                From Sector Guidance · {SECTOR_BY_SIDE[selected.side]} · {eventPhaseLabel[phase]}
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-3 bg-act font-bold text-act-foreground hover:bg-act/90"
                disabled={busy}
                onClick={() => void sendToCommunity()}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                Send to Community
              </Button>
            </Section>

            {/* Recovery + readiness */}
            <Section title="Recovery & readiness">
              <p
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  recoveryEligible
                    ? "border-act/40 bg-act/10 text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground",
                )}
              >
                {recoverySupportLine(recoveryEligible)}
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                {readiness ? (
                  <span>
                    <strong className="tabular-nums">{Math.round(readiness.pctComplete)}%</strong> of{" "}
                    {readiness.farmers} registered farmers here completed current after-actions.{" "}
                    <a href={farmerAppHref()} className="font-bold text-primary">
                      Open After app
                    </a>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    <a href={farmerAppHref()} className="font-bold text-primary">
                      Open After app
                    </a>
                    . Farmers also use USSD option 7 or voice press 6.
                  </span>
                )}
              </div>
            </Section>

            {/* Active SOS */}
            <Section title="Active emergencies here">
              {communitySos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No open SOS tied to {selected.name}.{" "}
                  <Link to="/" className="font-bold text-primary underline-offset-2 hover:underline">
                    Full SOS queue on Home
                  </Link>
                </p>
              ) : (
                <ul className="space-y-2">
                  {communitySos.map((s) => (
                    <li
                      key={s.id}
                      className={cn(
                        "rounded-md border px-3 py-2 text-xs",
                        s.status === "reopened"
                          ? "border-risk-severe/50 bg-risk-severe/10"
                          : "border-risk-warning/40 bg-risk-warning/5",
                      )}
                    >
                      <div className="flex items-center gap-2 font-bold text-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-risk-severe" />
                        {s.phone} · {s.status.replace("_", " ")}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {s.channel} · waiting {Math.round(s.time_since_received_s / 60)}m
                        {s.message_body ? ` · ${s.message_body.slice(0, 60)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <p className="text-[11px] text-muted-foreground">
              Full alert history lives in the{" "}
              <Link to="/alerts" className="font-bold text-primary underline-offset-2 hover:underline">
                Alerts Log
              </Link>
              . Dam/rain mechanics stay on those detail pages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: "watch" | "warning";
}) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums",
          tone === "warning" && "text-risk-warning",
          tone === "watch" && "text-risk-watch",
        )}
      >
        {value}
      </div>
    </div>
  );
}
