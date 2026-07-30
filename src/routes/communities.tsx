import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { CommunityList } from "@/components/turkana/CommunityList";
import { RequireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/communities")({
  head: () => ({
    meta: [{ title: "Communities — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <AppShell showRegion={false}>
        <CommunityList />
      </AppShell>
    </RequireAuth>
  ),
});
