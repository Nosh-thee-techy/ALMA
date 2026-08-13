// App shell: side navigation on desktop/tablet landscape; drawer on phone.
// Operators (NGO / county), not farmers — keep labels plain and few.
import { Link, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  CloudRain,
  Construction,
  Dam,
  Layers,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  MessageSquareWarning,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  PhoneCall,
  X,
} from "lucide-react";
import { AlmaLogo, AlmaMark } from "@/components/turkana/AlmaLogo";
import { ThemeToggle } from "@/components/turkana/ThemeToggle";
import { Button } from "@/components/ui/button";

const AlmaAgentDock = lazy(() =>
  import("@/components/turkana/AlmaAgentDock").then((m) => ({ default: m.AlmaAgentDock })),
);
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth, roleLabels } from "@/lib/auth";
import { pilots, type PilotId } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSE_KEY = "alma_sidebar_collapsed";

const nav = [
  { to: "/home", label: "Home", hint: "Green / yellow / red + actions", icon: LayoutDashboard },
  { to: "/dam", label: "Dam", hint: "Gibe III metrics + charts", icon: Dam },
  { to: "/rain", label: "Rain", hint: "Upstream rainfall", icon: CloudRain },
  { to: "/compound", label: "Compound", hint: "Rain + dam collision", icon: Layers },
  { to: "/simulator", label: "Warn people", hint: "SMS demo", icon: MessageSquareWarning },
  {
    to: "/phone",
    label: "Feature phone",
    hint: "SMS 51567 · USSD · voice on one screen",
    icon: Phone,
  },
  {
    to: "/helpline",
    label: "Helpline",
    hint: "Voice brief + what each sector should do",
    icon: PhoneCall,
  },
  { to: "/alerts", label: "Alerts", hint: "Sent + verified", icon: Bell },
  {
    to: "/communities",
    label: "Communities",
    hint: "Heat map + who is downstream",
    icon: MapPinned,
  },
] as const;

function NavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
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
            title={collapsed ? `${item.label} — ${item.hint}` : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={cn(
              "flex rounded-lg transition-colors",
              collapsed
                ? "items-center justify-center px-2 py-2.5"
                : "items-start gap-3 px-3 py-2.5",
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-dust",
            )}
          >
            <Icon className={cn("h-5 w-5 shrink-0", !collapsed && "mt-0.5")} aria-hidden />
            {!collapsed && (
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
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandBlock({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex justify-center" title="ALMA">
        <AlmaMark className="h-10 w-10" />
      </div>
    );
  }

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

function SidebarBody({
  collapsed = false,
  onNavigate,
  onToggleCollapse,
  pilot,
  setPilot,
  region,
  onRegionChange,
  showRegion,
  session,
  signOut,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  pilot: PilotId;
  setPilot: (v: PilotId) => void;
  region?: string;
  onRegionChange?: (r: string) => void;
  showRegion?: boolean;
  session: ReturnType<typeof useAuth>["session"];
  signOut: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div
        className={cn(
          "flex items-start gap-2",
          collapsed ? "flex-col items-center" : "justify-between",
        )}
      >
        <BrandBlock collapsed={collapsed} />
        {onToggleCollapse && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>

      {!collapsed && (
        <div className="rounded-lg bg-dust px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">Communities dial</p>
          <p className="font-bold tabular-nums">*384*96428#</p>
        </div>
      )}

      <NavLinks onNavigate={onNavigate} collapsed={collapsed} />

      <div className="mt-auto space-y-3 border-t border-border pt-3">
        <ThemeToggle collapsed={collapsed} />
        {!collapsed ? (
          <>
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
          </>
        ) : (
          session && (
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-primary hover:bg-dust"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  region,
  onRegionChange,
  showRegion = false,
  fullBleed = false,
}: {
  children: ReactNode;
  region?: string;
  onRegionChange?: (r: string) => void;
  showRegion?: boolean;
  /** Drop max-width / fill the column (map desks like Communities). */
  fullBleed?: boolean;
}) {
  const { session, signOut } = useAuth();
  const [pilot, setPilot] = useState<PilotId>("omo-turkana");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const activePilot = pilots.find((p) => p.id === pilot)!;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // ignore storage errors
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const drawerSidebar = (
    <SidebarBody
      onNavigate={() => setOpen(false)}
      pilot={pilot}
      setPilot={setPilot}
      region={region}
      onRegionChange={onRegionChange}
      showRegion={showRegion}
      session={session}
      signOut={signOut}
    />
  );

  return (
    <div
      className={cn(
        "bg-background font-sans text-foreground md:flex",
        fullBleed ? "h-svh overflow-hidden" : "min-h-screen",
      )}
    >
      {/* Desktop / large tablet side nav */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 border-r border-border bg-card p-3 transition-[width] duration-200 ease-out md:block",
          collapsed ? "w-[4.25rem]" : "w-64 lg:w-72 lg:p-4",
        )}
      >
        <SidebarBody
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          pilot={pilot}
          setPilot={setPilot}
          region={region}
          onRegionChange={onRegionChange}
          showRegion={showRegion}
          session={session}
          signOut={signOut}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Phone / small tablet top bar + drawer */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <AlmaMark className="h-9 w-9" />
            <div>
              <p className="text-sm font-bold leading-none">ALMA</p>
              <p className="text-[11px] text-muted-foreground">Early Action</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle collapsed />
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                {drawerSidebar}
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main
          className={cn(
            "flex w-full min-h-0 flex-1 flex-col",
            fullBleed
              ? "px-3 py-3 sm:px-4 sm:py-4"
              : "mx-auto max-w-5xl px-4 py-5 sm:px-6",
          )}
        >
          {activePilot.active ? (
            children
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <Construction className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <h2 className="mt-3 text-lg font-bold">This pilot is not open yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Switch to Omo–Turkana in the menu. Live pages use Open-Meteo rain + estimated dam
                pressure.
              </p>
            </div>
          )}
        </main>

        {!fullBleed ? (
          <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6">
            <p className="mx-auto max-w-5xl">
              Rainfall can use a live Open-Meteo pull via the ALMA engine (or demo estimates on this
              page). Gibe III has <strong className="text-foreground">no public live feed</strong> —
              we show demo dam numbers plus an{" "}
              <strong className="text-foreground">upstream-rain release estimate</strong>. Farmers and
              fishers get SMS / WhatsApp / USSD{" "}
              <strong className="text-foreground">*384*96428#</strong> — this site is for NGO / county
              operators. Tap the Alma circle (bottom-right) to talk with your voice agent.
            </p>
          </footer>
        ) : null}
      </div>

      <Suspense fallback={null}>
        <AlmaAgentDock />
      </Suspense>
    </div>
  );
}
