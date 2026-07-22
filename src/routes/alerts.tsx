import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { AlertsTable } from "@/components/turkana/AlertsTable";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts log — Turkana Watch" },
      {
        name: "description",
        content:
          "Log of past flood alerts dispatched to downstream Omo–Turkana communities across SMS, USSD, and dashboard channels.",
      },
      { property: "og:title", content: "Alerts log — Turkana Watch" },
      {
        property: "og:description",
        content: "Historical flood alerts and delivery status for basin communities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <AppShell showRegion={false}>
      <AlertsTable />
    </AppShell>
  );
}