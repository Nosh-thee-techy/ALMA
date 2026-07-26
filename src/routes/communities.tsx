import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { CommunityList } from "@/components/turkana/CommunityList";

export const Route = createFileRoute("/communities")({
  head: () => ({
    meta: [
      { title: "Communities — ALMA" },
      {
        name: "description",
        content:
          "Monitored downstream communities along the Omo River and Lake Turkana shoreline, with per-community flood propagation timing.",
      },
      { property: "og:title", content: "Communities — ALMA" },
      {
        property: "og:description",
        content: "Population, distances, and propagation ETAs for each monitored point.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommunitiesPage,
});

function CommunitiesPage() {
  return (
    <AppShell showRegion={false}>
      <CommunityList />
    </AppShell>
  );
}