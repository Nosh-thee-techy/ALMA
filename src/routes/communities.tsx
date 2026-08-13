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
      <AppShell showRegion={false} fullBleed>
        <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <header className="shrink-0">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-primary sm:text-sm">Communities</p>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Who is downstream</h1>
              </div>
              <p className="max-w-xl text-xs text-muted-foreground sm:text-sm">
                Pin = that place&apos;s tier. Open for population, ETA, reach, and SOS.
              </p>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CommunityList fill />
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  ),
});
