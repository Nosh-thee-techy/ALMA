import { createFileRoute, Link } from "@tanstack/react-router";
import { AlmaLogo } from "@/components/turkana/AlmaLogo";
import { PhoneSimulator } from "@/components/turkana/PhoneSimulator";
import { Button } from "@/components/ui/button";
import { smsShortcode } from "@/lib/sms-shortcode";
import { ussdDialCode } from "@/lib/ussd-dial";

export const Route = createFileRoute("/phone")({
  head: () => ({
    meta: [
      { title: "Feature phone demo — ALMA" },
      {
        name: "description",
        content: `One-screen feature phone demo: SMS shortcode ${smsShortcode}, USSD ${ussdDialCode}, and voice helpline.`,
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              SMS {smsShortcode} · {ussdDialCode}
            </span>
            <Button asChild variant="outline" size="sm" className="font-bold">
              <Link to="/home">Desk home</Link>
            </Button>
          </div>
        </div>
      </header>
      <PhoneSimulator />
    </div>
  );
}
