import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/turkana/AppShell";
import { VoiceHelpline } from "@/components/turkana/VoiceHelpline";
import { WeatherHeatMap } from "@/components/turkana/WeatherHeatMap";
import { RequireAuth } from "@/lib/require-auth";
import { useState } from "react";

export const Route = createFileRoute("/helpline")({
  head: () => ({
    meta: [{ title: "Voice helpline — ALMA" }],
  }),
  component: () => (
    <RequireAuth>
      <HelplinePage />
    </RequireAuth>
  ),
});

function HelplinePage() {
  const [wardId, setWardId] = useState("kalokol");

  return (
    <AppShell>
      <header className="mb-6">
        <p className="text-sm font-bold text-primary">Farmer helpline + desk brief</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Hear the risk in plain words
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Pick a ward on the map, then play the voice agent breakdown. Farmers without data use the phone menu
          or USSD <strong className="text-foreground">*384*96428#</strong>.
        </p>
      </header>
      <div className="space-y-5">
        <WeatherHeatMap onSelectWard={(w) => setWardId(w.wardId)} />
        <VoiceHelpline wardId={wardId} key={wardId} />
      </div>
    </AppShell>
  );
}
