// CommunityList: monitored communities with live arrival ETAs from the engine.
import { useEffect, useState } from "react";
import { MapPin, Users, Clock, Radio } from "lucide-react";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { tierMeta, type Community } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

export function CommunityList() {
  const { data, loading, error, isLive } = useLiveBasin();
  const list = data.communities;
  const [selected, setSelected] = useState<Community>(list[0]);

  useEffect(() => {
    if (!list.length) return;
    setSelected((prev) => list.find((c) => c.id === prev.id) || list[0]);
  }, [list]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Monitored communities</h2>
            <p className="text-xs text-muted-foreground">
              {list.length} points · tiers & ETAs from live compound risk
            </p>
          </div>
          <ul className="divide-y divide-border">
            {list.map((c) => {
              const meta = tierMeta[c.tier];
              const active = c.id === selected.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c)}
                    className={cn(
                      "flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-secondary/40",
                      active && "bg-secondary/60",
                    )}
                  >
                    <span className={cn("h-3 w-3 shrink-0 rounded-full", meta.dot)} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">· {c.region}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.population.toLocaleString()} people · {c.distanceFromDamKm} km from dam
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                        meta.badge,
                      )}
                    >
                      {c.tier}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      last: {c.lastAlert}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">{selected.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {selected.region} · Lake Turkana area
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                  tierMeta[selected.tier].badge,
                )}
              >
                {tierMeta[selected.tier].label}
              </span>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={Users} label="Population" value={selected.population.toLocaleString()} />
              <Stat icon={Radio} label="Last alert" value={selected.lastAlert} />
              <Stat
                icon={MapPin}
                label="From Gibe III"
                value={`${selected.distanceFromDamKm} km`}
              />
              <Stat
                icon={MapPin}
                label="From rain area"
                value={`${selected.distanceFromCatchmentKm} km`}
              />
            </div>

            <div className="rounded-md border border-border bg-secondary/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" /> How soon floodwater may arrive (live)
              </div>
              <div className="space-y-2 text-sm">
                <PropRow
                  label="From heavy rain"
                  value={`${selected.rainEtaHours} hours`}
                  tone="warning"
                />
                <PropRow
                  label="From dam release"
                  value={`${selected.damEtaHours} hours`}
                  tone="watch"
                />
                <PropRow
                  label="When both arrive together"
                  value={`${Math.min(selected.rainEtaHours, selected.damEtaHours)}–${Math.max(selected.rainEtaHours, selected.damEtaHours)}h`}
                  tone="severe"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PropRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "watch" | "warning" | "severe";
}) {
  const toneCls =
    tone === "severe"
      ? "bg-risk-severe-bg text-risk-severe-foreground"
      : tone === "warning"
        ? "bg-risk-warning-bg text-risk-warning-foreground"
        : "bg-risk-watch-bg text-risk-watch-foreground";
  return (
    <div className="flex items-center justify-between rounded px-3 py-2 text-sm">
      <span>{label}</span>
      <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", toneCls)}>{value}</span>
    </div>
  );
}
