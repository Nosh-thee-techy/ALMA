import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { AlertsTable } from "@/components/turkana/AlertsTable";
import { RequireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [{ title: "Alerts log — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <AppShell showRegion={false}>
        <AlertsTable />
      </AppShell>
    </RequireAuth>
  ),
});
