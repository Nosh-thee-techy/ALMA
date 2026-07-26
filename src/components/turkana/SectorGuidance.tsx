// SectorGuidance: translates the current compound risk tier into concrete,
// sector-specific actions. Tabs give the detailed card per sector; the matrix
// below gives a disaster manager every sector's action for every tier at once.
import { useState } from "react";
import { Sprout, Beef, Fish, HeartPulse, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  compoundTrigger,
  guidanceTierLabel,
  sectorDetails,
  sectorMatrix,
  tierMeta,
  type GuidanceTier,
  type SectorId,
} from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const sectorIcons: Record<SectorId, typeof Sprout> = {
  agriculture: Sprout,
  livestock: Beef,
  fisheries: Fish,
  health: HeartPulse,
};

const sectorOrder: SectorId[] = ["agriculture", "livestock", "fisheries", "health"];
const tierOrder: GuidanceTier[] = ["safe", "watch", "warning", "severe", "compound"];

// The active guidance tier comes from the same mock compound trigger the
// dashboard uses. When both triggers overlap we surface the "compound" row.
const activeTier: GuidanceTier = compoundTrigger.label.toLowerCase().includes("compound")
  ? "compound"
  : compoundTrigger.tier;

export function SectorGuidance() {
  const [sector, setSector] = useState<SectorId>("agriculture");
  const badge = tierMeta[compoundTrigger.tier].badge;

  return (
    <div className="space-y-6">
      {/* Current tier banner — shared source of truth with the dashboard. */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-4">
        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <h2 className="text-base font-semibold">Sector guidance</h2>
          <p className="text-xs text-muted-foreground">{compoundTrigger.detail}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", badge)}>
          Current tier · {guidanceTierLabel[activeTier]}
        </span>
      </div>

      {/* Per-sector detailed action card */}
      <Tabs value={sector} onValueChange={(v) => setSector(v as SectorId)}>
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
          return (
            <TabsContent key={s} value={s} className="mt-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-secondary p-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{d.headline}</h3>
                    <p className="text-xs text-muted-foreground">{d.label} cluster guidance</p>
                  </div>
                  <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs font-semibold", badge)}>
                    {guidanceTierLabel[activeTier]}
                  </span>
                </div>

                <p className="mt-4 rounded-md border border-border bg-background p-3 text-sm font-medium leading-snug">
                  {d.action}
                </p>

                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {d.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* At-a-glance matrix: every tier x sector action summary. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Tier × sector action matrix</h3>
          <p className="text-xs text-muted-foreground">
            Current tier row is highlighted. Use this to brief all four clusters at once.
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
                  {/* Same tier badges as Dashboard/Communities so managers read risk the same way everywhere. */}
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
