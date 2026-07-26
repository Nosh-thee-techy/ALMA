// Shared layout chrome: header with brand, live clock, region selector,
// pilot-zone selector, and primary nav across the sections.
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CloudRain, Dam, ShieldAlert, Waves, Construction } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pilots, type PilotId } from "@/lib/turkana-data";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/alerts", label: "Alerts Log" },
  { to: "/communities", label: "Communities" },
  { to: "/simulator", label: "Simulator" },
  { to: "/sector-guidance", label: "Sector Guidance" },
] as const;

export function AppShell({
  children,
  region,
  onRegionChange,
  showRegion = true,
}: {
  children: ReactNode;
  region?: string;
  onRegionChange?: (r: string) => void;
  showRegion?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pilot zone selection. Only the Omo–Turkana pilot has real (mock) data;
  // the other zones render an expansion placeholder instead of page content.
  const [pilot, setPilot] = useState<PilotId>("omo-turkana");
  const activePilot = pilots.find((p) => p.id === pilot)!;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Waves className="h-5 w-5" />
              <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-severe opacity-70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-risk-severe" />
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">ALMA</h1>
              <p className="text-xs font-medium text-foreground/80">Automated Land &amp; Moisture Action</p>
              <p className="text-xs text-muted-foreground">Omo River – Lake Turkana flood EWS</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
              <div className="text-muted-foreground">UTC+3 · {now.toLocaleDateString()}</div>
              <div className="font-semibold text-foreground">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            </div>
            {showRegion && (
              <Select value={region} onValueChange={onRegionChange}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  <SelectItem value="turkana">Turkana (Kenya side)</SelectItem>
                  <SelectItem value="omo">Omo (Ethiopia side)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-2 sm:px-4">
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: true }}
                className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          {/* Pilot / expansion zone selector — scalability signal. */}
          <Select value={pilot} onValueChange={(v) => setPilot(v as PilotId)}>
            <SelectTrigger className="my-2 w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pilots.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activePilot.active ? (
          children
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <Construction className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">
              Expansion zone — {activePilot.hazardFocus} monitoring coming soon
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {activePilot.label.replace(" (Coming Soon)", "")} is queued for rollout. Switch back to
              the Omo–Turkana active pilot to view live monitoring.
            </p>
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-xs text-muted-foreground sm:px-6">
        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <span className="inline-flex items-center gap-2"><CloudRain className="h-3.5 w-3.5" /> Rainfall trigger</span>
          <span className="inline-flex items-center gap-2"><Dam className="h-3.5 w-3.5" /> Dam trigger</span>
          <span className="inline-flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5" /> Compound risk engine</span>
          {/* Accuracy note: rainfall is CHIRPS-modeled; dam levels are prototype estimates — never imply live telemetry. */}
          <span className="ml-auto max-w-full text-right sm:max-w-[520px]">
            Rainfall data modeled on CHIRPS satellite estimates. Dam reservoir levels are
            simulated/estimated for this prototype, not live telemetry.
          </span>
        </div>
      </footer>
    </div>
  );
}