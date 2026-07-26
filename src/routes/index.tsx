import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/turkana/AppShell";
import { StatusCard } from "@/components/turkana/StatusCard";
import { RiskMap } from "@/components/turkana/RiskMap";
import { TrendChart } from "@/components/turkana/TrendChart";
import {
  communities,
  compoundTrigger,
  damTrigger,
  rainfallTrigger,
  type Region,
} from "@/lib/turkana-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ALMA — Omo–Turkana flood early warning" },
      {
        name: "description",
        content:
          "Dual-trigger flood early warning dashboard monitoring rainfall and Gibe III dam releases for the Omo River–Lake Turkana basin.",
      },
      { property: "og:title", content: "ALMA — Omo–Turkana flood early warning" },
      {
        property: "og:description",
        content:
          "Dual-trigger flood early warning dashboard monitoring rainfall and Gibe III dam releases for the Omo River–Lake Turkana basin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [region, setRegion] = useState<Region>("all");

  // Compound is "active" when both individual triggers register a signal.
  const compoundActive = useMemo(
    () => rainfallTrigger.tier !== "safe" && damTrigger.tier !== "safe",
    [],
  );

  return (
    <AppShell region={region} onRegionChange={(r) => setRegion(r as Region)}>
      {/* Top row: three trigger status cards. Compound is prominent. */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard kind="rain" title="Rainfall trigger" status={rainfallTrigger} />
        <StatusCard kind="dam" title="Dam trigger" status={damTrigger} />
        <StatusCard
          kind="compound"
          title="Compound risk"
          status={compoundTrigger}
          prominent
          active={compoundActive}
        />
      </section>

      {/* Basin map with color-coded community pins */}
      <section className="mt-6">
        <RiskMap communities={communities} region={region} />
      </section>

      {/* 7-day trend of rainfall and reservoir fill */}
      <section className="mt-6">
        <TrendChart />
      </section>
    </AppShell>
  );
}
