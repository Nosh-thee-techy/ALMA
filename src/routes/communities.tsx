import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { CommunityList } from "@/components/turkana/CommunityList";
import { WeatherHeatMap } from "@/components/turkana/WeatherHeatMap";
import { RequireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/communities")({
  head: () => ({
    meta: [{ title: "Communities — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <AppShell showRegion={false}>
        <header className="mb-5">
          <p className="text-sm font-bold text-primary">Communities</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Who is downstream</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Heat map shows weather change by ward — then the community list for population and ETA.
          </p>
        </header>
        <div className="space-y-5">
          <WeatherHeatMap />
          <CommunityList />
        </div>
      </AppShell>
    </RequireAuth>
  ),
});
