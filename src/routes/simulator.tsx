import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { SimulatorPanel } from "@/components/turkana/SimulatorPanel";

export const Route = createFileRoute("/simulator")({
  head: () => ({
    meta: [
      { title: "Alert simulator — ALMA" },
      {
        name: "description",
        content:
          "Interactive compound flood risk simulator: model rainfall and Gibe III reservoir changes and preview the resulting multilingual alert.",
      },
      { property: "og:title", content: "Alert simulator — ALMA" },
      {
        property: "og:description",
        content: "Live compound-risk demo with sample alert messages in English, Swahili, and local language.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SimulatorPage,
});

function SimulatorPage() {
  return (
    <AppShell showRegion={false}>
      <SimulatorPanel />
    </AppShell>
  );
}