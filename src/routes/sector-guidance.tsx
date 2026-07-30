import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { SectorGuidance } from "@/components/turkana/SectorGuidance";
import { RequireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/sector-guidance")({
  head: () => ({
    meta: [{ title: "What to do — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <AppShell showRegion={false}>
        <SectorGuidance />
      </AppShell>
    </RequireAuth>
  ),
});
