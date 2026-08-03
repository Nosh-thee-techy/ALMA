// App shell: side navigation on desktop/tablet landscape; drawer on phone.
// Operators (NGO / county), not farmers — keep labels plain and few.
import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  CloudRain,
  Construction,
  Dam,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  MessageSquareWarning,
  PhoneCall,
  X,
} from "lucide-react";
import { AlmaLogo, AlmaMark } from "@/components/turkana/AlmaLogo";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth, roleLabels } from "@/lib/auth";
import { pilots, type PilotId } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/home", label: "Home", hint: "Green / yellow / red + actions", icon: LayoutDashboard },
  { to: "/dam", label: "Dam", hint: "Gibe III metrics", icon: Dam },
  { to: "/rain", label: "Rain", hint: "Upstream rainfall", icon: CloudRain },
  { to: "/sector-guidance", label: "What to do", hint: "What each sector should do", icon: BookOpen },
  { to: "/simulator", label: "Warn people", hint: "SMS demo", icon: MessageSquareWarning },
  { to: "/helpline", label: "Helpline", hint: "Voice agent for farmers", icon: PhoneCall },
  { to: "/alerts", label: "Alerts", hint: "Sent + verified", icon: Bell },
  { to: "/communities", label: "Communities", hint: "Heat map + who is downstream", icon: MapPinned },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {nav.map((item) => {
        const active = pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-dust",
            )}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>
              <span className="block text-sm font-bold leading-tight">{item.label}</span>
              <span
                className={cn(
                  "block text-xs leading-snug",
                  active ? "text-primary-foreground/85" : "text-muted-foreground",
                )}
              >
                {item.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-3">
      <AlmaLogo className="h-11 w-11 rounded-lg object-cover shadow-sm" />
      <div className="min-w-0">
        <p className="truncate text-base font-bold leading-none">ALMA</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">Early Action · Omo–Turkana</p>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  region,
  onRegionChange,
  showRegion = false,
}: {
  children: ReactNode;
  region?: string;
  onRegionChange?: (r: string) => void;
  showRegion?: boolean;
}) {
  const { session, signOut } = useAuth();
  const [pilot, setPilot] = useState<PilotId>("omo-turkana");
  const [open, setOpen] = useState(false);
  const activePilot = pilots.find((p) => p.id === pilot)!;

  const sidebar = (
    <div className="flex h-full flex-col gap-4">
      <BrandBlock />
      <div className="rounded-lg bg-dust px-3 py-2 text-sm">
        <p className="text-xs text-muted-foreground">Communities dial</p>
        <p className="font-bold tabular-nums">*384*96428#</p>
      </div>
      <NavLinks onNavigate={() => setOpen(false)} />
      <div className="mt-auto space-y-3 border-t border-border pt-3">
        <Select value={pilot} onValueChange={(v) => setPilot(v as PilotId)}>
          <SelectTrigger className="h-10 w-full" aria-label="Pilot zone">
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
        {showRegion && onRegionChange && (
          <Select value={region} onValueChange={onRegionChange}>
            <SelectTrigger className="h-10 w-full" aria-label="Map region">
              <SelectValue placeholder="Map region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Map: all</SelectItem>
              <SelectItem value="turkana">Map: Kenya</SelectItem>
              <SelectItem value="omo">Map: Ethiopia</SelectItem>
            </SelectContent>
          </Select>
        )}
        {session && (
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <p className="font-bold text-foreground">{session.orgName}</p>
            <p className="text-muted-foreground">{roleLabels[session.role]}</p>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 inline-flex items-center gap-1 font-bold text-primary"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-sans text-foreground md:flex">
      {/* Desktop / large tablet side nav */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-card p-4 md:block lg:w-72">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone / small tablet top bar + drawer */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <AlmaMark className="h-9 w-9" />
            <div>
              <p className="text-sm font-bold leading-none">ALMA</p>
              <p className="text-[11px] text-muted-foreground">Early Action</p>
            </div>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(100%,20rem)] bg-card p-4">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mb-3 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {sidebar}
            </SheetContent>
          </Sheet>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6">
          {activePilot.active ? (
            children
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <Construction className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <h2 className="mt-3 text-lg font-bold">This pilot is not open yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Switch to Omo–Turkana in the menu. Live pages use Open-Meteo rain + estimated dam pressure.
              </p>
            </div>
          )}
        </main>

        <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p className="mx-auto max-w-5xl">
            Rainfall can use a live Open-Meteo pull via the ALMA engine (or demo estimates on this page).
            Gibe III has <strong className="text-foreground">no public live feed</strong> — we show demo
            dam numbers plus an <strong className="text-foreground">upstream-rain release estimate</strong>.
            Farmers and fishers get SMS / WhatsApp / USSD <strong className="text-foreground">*384*96428#</strong>{" "}
            — this site is for NGO / county operators.
          </p>
        </footer>
      </div>
    </div>
  );
}
