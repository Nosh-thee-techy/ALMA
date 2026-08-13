import { useEffect, useState, type ReactNode } from "react";
import { ClipboardCheck, MessageSquare, Phone, Signal, Waves } from "lucide-react";
import { FARMER_LANGS, farmerCopy, type FarmerLang } from "@/lib/farmer-locale";
import { cn } from "@/lib/utils";

export type FarmerTab = "after" | "do" | "alma" | "dial";

export function FarmerPhoneShell({
  children,
  tab,
  onTab,
  title,
  subtitle,
  showNav = true,
  lang = "en",
  onLang,
  speaking = false,
}: {
  children: ReactNode;
  tab: FarmerTab;
  onTab: (t: FarmerTab) => void;
  title: string;
  subtitle?: string;
  showNav?: boolean;
  lang?: FarmerLang;
  onLang?: (lang: FarmerLang) => void;
  speaking?: boolean;
}) {
  const [now, setNow] = useState("");
  const copy = farmerCopy(lang);
  const tabs: { id: FarmerTab; label: string; icon: typeof Waves }[] = [
    { id: "after", label: copy.after, icon: Waves },
    { id: "do", label: copy.todo, icon: ClipboardCheck },
    { id: "alma", label: copy.alma, icon: MessageSquare },
    { id: "dial", label: copy.dial, icon: Phone },
  ];

  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-dvh bg-[#1f1810] md:flex md:items-center md:justify-center md:py-6">
      <div
        className={cn(
          "relative mx-auto flex h-dvh w-full flex-col bg-background text-foreground",
          "md:h-[min(844px,calc(100dvh-3rem))] md:w-[390px] md:overflow-hidden",
          "md:rounded-[2.25rem] md:border-[10px] md:border-zinc-800",
          "md:shadow-[0_28px_70px_rgba(20,12,6,0.55)]",
        )}
      >
        <header className="shrink-0 border-b border-border bg-[oklch(0.93_0.03_78)] px-4 pb-3 pt-[max(0.65rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums font-bold text-foreground">{now}</span>
            <span className="font-bold tracking-wide">ALMA After</span>
            <span className="flex items-center gap-1" aria-hidden>
              <Signal className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div className={cn("relative shrink-0", speaking && "alma-speak-ring rounded-full")}>
              <img
                src="/alma-agent-portrait.png"
                alt=""
                className="h-12 w-12 rounded-full object-cover object-top"
              />
              {speaking ? (
                <span className="alma-vibe-overlay pointer-events-none absolute inset-0 rounded-full" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold leading-tight">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-sm text-foreground/80">{subtitle}</p> : null}
            </div>
          </div>
          {onLang ? (
            <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Language">
              {FARMER_LANGS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onLang(item.id)}
                  className={cn(
                    "min-h-8 rounded-md px-2 text-xs font-bold",
                    lang === item.id ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                  )}
                  aria-pressed={lang === item.id}
                  title={item.name}
                >
                  {item.short}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</main>

        {showNav ? (
          <nav
            className="grid shrink-0 grid-cols-4 border-t border-border bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
            aria-label="After app"
          >
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTab(item.id)}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold",
                    active ? "text-act" : "text-muted-foreground",
                    item.id === "alma" && active && "text-act",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("h-5 w-5", item.id === "alma" && speaking && "text-act")} aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
