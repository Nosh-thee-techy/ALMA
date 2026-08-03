// Real 2D basin map (Leaflet + OSM) with colored flood/rain zones per ward.
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { basinWards, weatherForWard, type AreaWeather, type BasinWard } from "@/lib/basin-geo";
import { tierMeta, type RiskTier } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const TIER_FILL: Record<RiskTier, string> = {
  safe: "#3d8f5a",
  watch: "#c9a227",
  warning: "#d97706",
  severe: "#c2410c",
};

function zoneRadiusKm(ward: BasinWard, rain24: number): number {
  // Larger rain → slightly larger influence zone (km)
  const base = ward.sector === "fisher" ? 14 : 18;
  return base + Math.min(10, rain24 * 0.4);
}

export function WeatherHeatMap({
  className,
  onSelectWard,
}: {
  className?: string;
  onSelectWard?: (ward: BasinWard, weather: AreaWeather) => void;
}) {
  const { data, loading, error, isLive } = useLiveBasin();
  const [selectedId, setSelectedId] = useState<string>("kalokol");
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const areas = useMemo(() => {
    const rain24 = Number(data.rain?.rain24hMm ?? data.risk?.rain_mm ?? 0);
    const rain7 = Number(data.rain?.rain7dMm ?? 0);
    const release = Number(data.dam?.releaseM3s ?? data.risk?.dam_discharge_m3s ?? 0);
    const tier = (data.risk?.tier || data.compoundTrigger.tier || "watch") as RiskTier;
    const dailyMm = (data.trend || []).map((t) => Number(t.rainfallMm ?? 0));
    const dates = (data.trend || []).map((t) => t.day);

    return basinWards.map((ward) =>
      weatherForWard(ward, {
        rain24hMm: rain24,
        rain7dMm: rain7,
        releaseM3s: release,
        tier,
        rainEtaH: Number(data.risk?.t_rain_arrival_h ?? data.rainfallTrigger.etaHours ?? 48),
        damEtaH: Number(data.risk?.t_dam_arrival_h ?? data.damTrigger.etaHours ?? 18),
        dailyMm: dailyMm.length ? dailyMm : undefined,
        dates: dates.length ? dates : undefined,
      }),
    );
  }, [data]);

  const selected = areas.find((a) => a.wardId === selectedId) || areas[0];
  const selectedWard = basinWards.find((w) => w.wardId === selected.wardId)!;

  function pick(wardId: string) {
    setSelectedId(wardId);
    const weather = areas.find((a) => a.wardId === wardId);
    const ward = basinWards.find((w) => w.wardId === wardId);
    if (weather && ward) onSelectWard?.(ward, weather);
  }

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

    // Basin outline cue (rough Omo–Turkana corridor)
    L.polyline(
      [
        [5.0, 36.15],
        [4.8, 36.05],
        [4.45, 35.95],
        [3.95, 35.85],
        [3.52, 35.75],
        [3.35, 35.7],
      ],
      { color: "#0e7490", weight: 3, opacity: 0.55, dashArray: "6 8" },
    ).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Draw / redraw color zones when weather or selection changes
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    for (const area of areas) {
      const ward = basinWards.find((w) => w.wardId === area.wardId)!;
      const active = area.wardId === selectedId;
      const fill = TIER_FILL[area.tier];
      const radiusM = zoneRadiusKm(ward, area.rain24hMm) * 1000;

      const circle = L.circle([ward.lat, ward.lon], {
        radius: radiusM,
        color: active ? "#0f766e" : fill,
        weight: active ? 3 : 1.5,
        fillColor: fill,
        fillOpacity: active ? 0.45 : 0.28,
      });

      circle.bindTooltip(
        `<strong>${area.name}</strong><br/>${area.tier} · ${area.rain24hMm} mm/24h`,
        { sticky: true, className: "alma-map-tip" },
      );
      circle.on("click", () => pick(area.wardId));
      circle.addTo(group);

      const marker = L.circleMarker([ward.lat, ward.lon], {
        radius: active ? 8 : 6,
        color: "#fff",
        weight: 2,
        fillColor: fill,
        fillOpacity: 1,
      });
      marker.bindTooltip(area.name, { direction: "top", offset: [0, -6] });
      marker.on("click", () => pick(area.wardId));
      marker.addTo(group);

      L.marker([ward.lat, ward.lon], {
        interactive: false,
        icon: L.divIcon({
          className: "alma-ward-label",
          html: `<span>${area.name}</span>`,
          iconSize: [90, 18],
          iconAnchor: [45, -8],
        }),
      }).addTo(group);
    }

    if (selectedWard) {
      map.panTo([selectedWard.lat, selectedWard.lon], { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pick is stable enough via selectedId
  }, [areas, selectedId]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-bold">Basin weather map</h2>
          <p className="text-xs text-muted-foreground">
            Real map · color zones show flood level. Tap a ward for rain change.
          </p>
        </div>
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.45fr_1fr]">
        <div className="relative min-h-[320px] sm:min-h-[400px]">
          <div ref={mapEl} className="absolute inset-0 z-0 h-full w-full" />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[10px] shadow-sm">
            {(["safe", "watch", "warning", "severe"] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 capitalize">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_FILL[t] }} />
                {tierMeta[t].label}
              </span>
            ))}
          </div>
        </div>

        <aside className="border-t border-border bg-background/50 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="flex flex-wrap gap-1.5">
            {basinWards.map((w) => (
              <button
                key={w.wardId}
                type="button"
                onClick={() => pick(w.wardId)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
                  w.wardId === selectedId
                    ? "bg-primary text-primary-foreground"
                    : "bg-dust text-foreground hover:bg-secondary",
                )}
              >
                {w.name}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-bold text-primary">
            {selectedWard.country} · {selectedWard.sector}
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight">{selected.name}</h3>
          <span
            className={cn(
              "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
              tierMeta[selected.tier].badge,
            )}
          >
            {tierMeta[selected.tier].label}
          </span>
          <p className="mt-3 text-sm leading-relaxed text-foreground">{selected.plain}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Rain 24h</dt>
              <dd className="font-bold tabular-nums">{selected.rain24hMm} mm</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Change vs yesterday</dt>
              <dd
                className={cn(
                  "font-bold tabular-nums",
                  selected.rainDeltaMm > 0 && "text-risk-warning",
                  selected.rainDeltaMm < 0 && "text-risk-safe",
                )}
              >
                {selected.rainDeltaMm > 0 ? "+" : ""}
                {selected.rainDeltaMm} mm
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Rain ETA</dt>
              <dd className="font-bold tabular-nums">~{selected.rainEtaH}h</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Dam wave ETA</dt>
              <dd className="font-bold tabular-nums">~{selected.damEtaH}h</dd>
            </div>
          </dl>

          {selected.daily.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-muted-foreground">7-day rain</p>
              <div className="mt-2 flex h-14 items-end gap-1">
                {selected.daily.slice(-7).map((d) => {
                  const max = Math.max(1, ...selected.daily.map((x) => x.mm));
                  return (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${Math.max(8, (d.mm / max) * 100)}%`,
                          background: TIER_FILL[selected.tier],
                          minHeight: 6,
                          opacity: 0.75,
                        }}
                        title={`${d.day}: ${d.mm} mm`}
                      />
                      <span className="text-[9px] tabular-nums text-muted-foreground">{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Corridor: {selectedWard.corridor} · forage ~{selectedWard.forageDays} days
          </p>
        </aside>
      </div>

      <style>{`
        .alma-ward-label {
          background: transparent !important;
          border: none !important;
        }
        .alma-ward-label span {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 999px;
          background: color-mix(in oklab, var(--card) 92%, transparent);
          border: 1px solid var(--border);
          font-size: 10px;
          font-weight: 700;
          color: var(--foreground);
          white-space: nowrap;
        }
        .leaflet-container {
          font: inherit;
          background: var(--dust);
        }
      `}</style>
    </div>
  );
}
