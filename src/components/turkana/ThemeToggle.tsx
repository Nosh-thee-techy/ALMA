import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const { theme, cycleTheme } = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const nextHint =
    theme === "light" ? "Switch to dark" : theme === "dark" ? "Use system theme" : "Switch to light";

  if (collapsed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 text-muted-foreground hover:bg-dust hover:text-foreground", className)}
        onClick={cycleTheme}
        aria-label={nextHint}
        title={`${LABEL[theme]} · ${nextHint}`}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-dust",
        className,
      )}
      aria-label={nextHint}
      title={nextHint}
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block font-bold text-foreground">Appearance</span>
        <span className="block text-muted-foreground">{LABEL[theme]} · tap to change</span>
      </span>
    </button>
  );
}
