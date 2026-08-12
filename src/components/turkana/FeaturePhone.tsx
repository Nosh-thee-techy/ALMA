import type { ReactNode } from "react";
import { Signal } from "lucide-react";
import { cn } from "@/lib/utils";

type FeaturePhoneProps = {
  title: string;
  subtitle?: string;
  screen: ReactNode;
  footer?: ReactNode;
  onKey: (key: string) => void;
  onCall?: () => void;
  onEnd?: () => void;
  callActive?: boolean;
  className?: string;
};

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
] as const;

export function FeaturePhone({
  title,
  subtitle,
  screen,
  footer,
  onKey,
  onCall,
  onEnd,
  callActive,
  className,
}: FeaturePhoneProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[280px] rounded-[2rem] border-4 border-zinc-800 bg-zinc-900 p-3 shadow-2xl",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between px-2 text-[10px] text-zinc-400">
        <span className="font-bold tracking-wide text-zinc-300">ALMA</span>
        <span className="flex items-center gap-1">
          <Signal className="h-3 w-3" aria-hidden />
          Safaricom
        </span>
      </div>

      <div className="rounded-lg border border-zinc-700 bg-[#1a2e1a] px-3 py-2 shadow-inner">
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-lime-400/90">
          {title}
        </p>
        {subtitle ? <p className="truncate text-[9px] text-lime-300/60">{subtitle}</p> : null}
        <div className="mt-2 min-h-[140px] max-h-[200px] overflow-y-auto font-mono text-[11px] leading-relaxed text-lime-100 whitespace-pre-wrap">
          {screen}
        </div>
        {footer ? <div className="mt-2 border-t border-lime-900/50 pt-2">{footer}</div> : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 px-1">
        {KEYS.flat().map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKey(k)}
            className="flex h-10 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-zinc-100 shadow active:bg-zinc-700"
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-6 pb-1">
        <button
          type="button"
          onClick={onEnd}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-red-700 text-xs font-bold text-white shadow active:bg-red-600"
          aria-label="End"
        >
          ■
        </button>
        <button
          type="button"
          onClick={onCall}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow",
            callActive ? "bg-amber-600 active:bg-amber-500" : "bg-green-600 active:bg-green-500",
          )}
          aria-label={callActive ? "In call" : "Call"}
        >
          ●
        </button>
      </div>
    </div>
  );
}
