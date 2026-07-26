import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { SectorGuidance } from "@/components/turkana/SectorGuidance";

export const Route = createFileRoute("/sector-guidance")({
  head: () => ({
    meta: [
      { title: "Sector guidance — ALMA" },
      {
        name: "description",
        content:
          "Agriculture, livestock, fisheries and health actions mapped to the current Omo–Turkana compound flood risk tier.",
      },
      { property: "og:title", content: "Sector guidance — ALMA" },
      {
        property: "og:description",
        content: "Tier-by-sector action matrix for disaster managers in the Omo–Turkana basin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SectorGuidancePage,
});

function SectorGuidancePage() {
  return (
    <AppShell showRegion={false}>
      <SectorGuidance />
    </AppShell>
  );
}