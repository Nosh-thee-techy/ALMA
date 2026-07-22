// Shared layout chrome: header with brand, live clock, region selector,
// and primary nav across the four sections.
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CloudRain, Dam, ShieldAlert, Waves } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/alerts", label: "Alerts Log" },
  { to: "/communities", label: "Communities" },
  { to: "/simulator", label: "Simulator" },
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
              <h1 className="text-lg font-bold leading-tight tracking-tight">Turkana Watch</h1>
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

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              className="border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-xs text-muted-foreground sm:px-6">
        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <span className="inline-flex items-center gap-2"><CloudRain className="h-3.5 w-3.5" /> Rainfall trigger</span>
          <span className="inline-flex items-center gap-2"><Dam className="h-3.5 w-3.5" /> Dam trigger</span>
          <span className="inline-flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5" /> Compound risk engine</span>
          <span className="ml-auto">Mock data · Field prototype</span>
        </div>
      </footer>
    </div>
  );
}