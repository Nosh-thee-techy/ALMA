import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { SectorGuidance } from "@/components/turkana/SectorGuidance";
import { VoiceHelpline } from "@/components/turkana/VoiceHelpline";
import { RequireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/helpline")({
  head: () => ({
    meta: [{ title: "Helpline & what to do — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <HelplinePage />
    </RequireAuth>
  ),
});

function HelplinePage() {
  return (
    <AppShell showRegion={false}>
      <header className="mb-6">
        <p className="text-sm font-bold text-primary">Helpline · sector playbooks</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Hear the risk · tell people what to do
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Same job in one place: Alma briefs the desk and farmers by voice, then sector playbooks
          show the before/after actions to send. USSD{" "}
          <strong className="text-foreground">*384*96428#</strong> for phones without data.
        </p>
      </header>
      <div className="space-y-8">
        <VoiceHelpline />
        <section id="guidance" aria-label="Sector playbooks">
          <SectorGuidance />
        </section>
      </div>
    </AppShell>
  );
}
