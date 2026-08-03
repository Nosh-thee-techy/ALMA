// 3D weather heatmap — pick a ward to see rain change + flood timing.
import { useMemo, useState } from "react";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { basinWards, weatherForWard, type AreaWeather, type BasinWard } from "@/lib/basin-geo";
import { tierMeta, type RiskTier } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const heatColor = (intensity: number) => {
  // 0–1 → safe→severe ladder (hazard meaning only)
  if (intensity < 0.25) return "var(--risk-safe)";
  if (intensity < 0.45) return "var(--risk-watch)";
  if (intensity < 0.7) return "var(--risk-warning)";
  return "var(--risk-severe)";
};

function intensityFor(w: AreaWeather, maxRain: number): number {
  return Math.min(1, w.rain24hMm / Math.max(12, maxRain));
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

  const maxRain = Math.max(12, ...areas.map((a) => a.rain24hMm));
  const selected = areas.find((a) => a.wardId === selectedId) || areas[0];
  const selectedWard = basinWards.find((w) => w.wardId === selected.wardId)!;

  function pick(wardId: string) {
    setSelectedId(wardId);
    const weather = areas.find((a) => a.wardId === wardId);
    const ward = basinWards.find((w) => w.wardId === wardId);
    if (weather && ward) onSelectWard?.(ward, weather);
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-bold">3D weather heat map</h2>
          <p className="text-xs text-muted-foreground">
            Pick a ward — rain change and flood timing update for that place.
          </p>
        </div>
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
        {/* 3D stage */}
        <div className="relative min-h-[280px] overflow-hidden bg-gradient-to-b from-secondary/50 to-dust px-4 py-8 sm:min-h-[340px]">
          <div
            className="relative mx-auto h-[220px] w-full max-w-xl sm:h-[260px]"
            style={{ perspective: "900px" }}
          >
            <div
              className="absolute inset-0 origin-center rounded-lg border border-border/80 bg-card/90 shadow-md"
              style={{
                transform: "rotateX(58deg) rotateZ(-18deg) translateY(12px)",
                transformStyle: "preserve-3d",
              }}
            >
              {/* Heat grid */}
              <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 gap-0.5 p-2 opacity-90">
                {Array.from({ length: 48 }).map((_, i) => {
                  const col = i % 8;
                  const row = Math.floor(i / 8);
                  // Sample nearest ward intensity for cell
                  const u = (col + 0.5) / 8;
                  const v = (row + 0.5) / 6;
                  let best = areas[0];
                  let bestD = 99;
                  for (const a of areas) {
                    const w = basinWards.find((x) => x.wardId === a.wardId)!;
                    const d = (w.u - u) ** 2 + (w.v - v) ** 2;
                    if (d < bestD) {
                      bestD = d;
                      best = a;
                    }
                  }
                  const inten = intensityFor(best, maxRain) * (0.55 + (1 - bestD) * 0.9);
                  return (
                    <div
                      key={i}
                      className="rounded-[2px] transition-colors duration-700"
                      style={{
                        background: heatColor(Math.min(1, inten)),
                        opacity: 0.35 + Math.min(1, inten) * 0.55,
                      }}
                    />
                  );
                })}
              </div>

              {/* River / lake cues */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" viewBox="0 0 100 100">
                <path
                  d="M18 8 Q 35 30 48 55 T 78 82"
                  fill="none"
                  stroke="oklch(0.45 0.1 220)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <ellipse cx="86" cy="86" rx="12" ry="8" fill="oklch(0.55 0.1 230)" />
              </svg>

              {/* Extruded ward columns */}
              {areas.map((a) => {
                const w = basinWards.find((x) => x.wardId === a.wardId)!;
                const inten = intensityFor(a, maxRain);
                const h = 18 + inten * 72;
                const active = a.wardId === selectedId;
                return (
                  <button
                    key={a.wardId}
                    type="button"
                    onClick={() => pick(a.wardId)}
                    className="absolute -translate-x-1/2 -translate-y-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    style={{
                      left: `${w.u * 100}%`,
                      top: `${w.v * 100}%`,
                      transform: `translate(-50%, -100%) rotateZ(18deg) rotateX(-58deg)`,
                      height: h,
                      width: active ? 18 : 14,
                      zIndex: active ? 5 : 2,
                    }}
                    aria-pressed={active}
                    aria-label={`${a.name}, rain ${a.rain24hMm} mm`}
                  >
                    <span
                      className={cn(
                        "block h-full w-full rounded-t-sm border border-white/40 shadow-sm transition-all duration-500",
                        active && "ring-2 ring-primary ring-offset-1",
                      )}
                      style={{ background: heatColor(inten) }}
                    />
                    <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-foreground drop-shadow-sm">
                      {a.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Column height = local 24h rain heat · tilt = basin view
          </p>
        </div>

        {/* Area weather breakdown */}
        <aside className="border-t border-border bg-background/50 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <p className="text-xs font-bold text-primary">{selectedWard.country} · {selectedWard.sector}</p>
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
              <p className="text-xs font-bold text-muted-foreground">7-day rain change</p>
              <div className="mt-2 flex h-16 items-end gap-1">
                {selected.daily.slice(-7).map((d) => {
                  const max = Math.max(1, ...selected.daily.map((x) => x.mm));
                  return (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-sm transition-all duration-500"
                        style={{
                          height: `${Math.max(8, (d.mm / max) * 100)}%`,
                          background: heatColor(d.mm / Math.max(12, max)),
                          minHeight: 6,
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
    </div>
  );
}
