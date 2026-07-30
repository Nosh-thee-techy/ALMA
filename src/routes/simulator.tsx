import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { SimulatorPanel } from "@/components/turkana/SimulatorPanel";
import { RequireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/simulator")({
  head: () => ({
    meta: [{ title: "Warn people — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <AppShell showRegion={false}>
        <SimulatorPanel />
      </AppShell>
    </RequireAuth>
  ),
});
