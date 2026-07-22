// RiskMap: schematic SVG map of the Omo River flowing from Gibe III dam
// down into Lake Turkana, with community pins color-coded by risk tier.
import { useState } from "react";
import { Dam } from "lucide-react";
import type { Community, Region } from "@/lib/turkana-data";
import { tierMeta } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const tierColor: Record<Community["tier"], string> = {
  safe: "var(--risk-safe)",
  watch: "var(--risk-watch)",
  warning: "var(--risk-warning)",
  severe: "var(--risk-severe)",
};

export function RiskMap({
  communities,
  region,
}: {
  communities: Community[];
  region: Region;
}) {
  const [hovered, setHovered] = useState<Community | null>(null);
  const visible = communities.filter((c) =>
    region === "all" ? true : region === "turkana" ? c.side === "turkana" : c.side === "omo",
  );

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold">Basin overview</h3>
          <p className="text-xs text-muted-foreground">
            Gibe III → Omo River → Lake Turkana
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {(["safe", "watch", "warning", "severe"] as const).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
                style={{ background: tierColor[t] }}
              />
              <span className="capitalize text-muted-foreground">{tierMeta[t].label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-secondary/40 to-background">
        <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {/* Terrain shading */}
          <defs>
            <linearGradient id="lake" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.75 0.08 220)" />
              <stop offset="100%" stopColor="oklch(0.55 0.12 240)" />
            </linearGradient>
            <linearGradient id="river" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.65 0.12 230)" />
              <stop offset="100%" stopColor="oklch(0.5 0.15 240)" />
            </linearGradient>
          </defs>

          {/* Ethiopia / Kenya divider (dashed) */}
          <line x1="0" y1="42" x2="100" y2="38" stroke="oklch(0.7 0.02 240)" strokeWidth="0.2" strokeDasharray="1 1" />
          <text x="2" y="40" fontSize="2.2" fill="oklch(0.5 0.02 240)">Ethiopia</text>
          <text x="2" y="44.5" fontSize="2.2" fill="oklch(0.5 0.02 240)">Kenya</text>

          {/* River path */}
          <path
            d="M 15 12 Q 25 20 30 30 T 45 45 T 65 62"
            stroke="url(#river)"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />

          {/* Lake Turkana */}
          <ellipse cx="82" cy="78" rx="18" ry="12" fill="url(#lake)" opacity="0.85" />
          <text x="82" y="80" fontSize="2.5" fill="white" textAnchor="middle" fontWeight="600">
            Lake Turkana
          </text>

          {/* Dam icon */}
          <g transform="translate(12 8)">
            <rect x="-2" y="-2" width="6" height="4" fill="oklch(0.35 0.03 250)" rx="0.5" />
            <text x="1" y="6" fontSize="2.2" fill="oklch(0.35 0.03 250)" textAnchor="middle">
              Gibe III
            </text>
          </g>

          {/* Community pins */}
          {visible.map((c) => (
            <g
              key={c.id}
              transform={`translate(${c.x} ${c.y * 0.6})`}
              onMouseEnter={() => setHovered(c)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <circle r="1.8" fill={tierColor[c.tier]} stroke="white" strokeWidth="0.4" />
              {c.tier === "severe" && (
                <circle r="3" fill="none" stroke={tierColor[c.tier]} strokeWidth="0.3" opacity="0.5">
                  <animate attributeName="r" from="1.8" to="4" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <text x="2.5" y="1" fontSize="2" fill="oklch(0.2 0.03 240)" fontWeight="500">
                {c.name}
              </text>
            </g>
          ))}
        </svg>

        {hovered && (
          <div
            className={cn(
              "pointer-events-none absolute z-10 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md",
            )}
            style={{ left: `${hovered.x}%`, top: `${hovered.y * 0.6}%` }}
          >
            <div className="font-semibold">{hovered.name}</div>
            <div className="text-muted-foreground">
              {hovered.region} · {hovered.population.toLocaleString()} people
            </div>
            <div className="mt-1">
              Rain ETA {hovered.rainEtaHours}h · Dam ETA {hovered.damEtaHours}h
            </div>
          </div>
        )}
      </div>
    </div>
  );
}