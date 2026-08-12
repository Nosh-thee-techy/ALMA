import { createFileRoute, Link } from "@tanstack/react-router";
import { AlmaLogo } from "@/components/turkana/AlmaLogo";
import { PhoneSimulator } from "@/components/turkana/PhoneSimulator";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/phone")({
  head: () => ({
    meta: [
      { title: "Feature phone simulator — ALMA" },
      {
        name: "description",
        content:
          "Simulate USSD, SMS, and voice helpline on a feature phone — rehearse farmer last-mile channels.",
      },
    ],
  }),
  component: PhoneSimulatorPage,
});

function PhoneSimulatorPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <AlmaLogo className="h-9 w-9 rounded-lg object-cover" />
            <span className="font-bold">ALMA</span>
          </Link>
          <Button asChild variant="outline" size="sm" className="font-bold">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </header>
      <PhoneSimulator />
    </div>
  );
}
