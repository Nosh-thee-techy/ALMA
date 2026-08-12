import { cn } from "@/lib/utils";

export function LiveSourceBadge({
  isLive,
  loading,
  error,
  className,
}: {
  isLive: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
}) {
  if (loading && !isLive) {
    return (
      <span
        className={cn(
          "rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground",
          className,
        )}
      >
        Connecting to engine…
      </span>
    );
  }
  if (isLive) {
    return (
      <span
        className={cn(
          "rounded-full bg-risk-safe-bg px-2.5 py-1 text-xs font-bold text-risk-safe-foreground",
          className,
        )}
      >
        LIVE · Open-Meteo + engine
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-full bg-risk-watch-bg px-2.5 py-1 text-xs font-bold text-risk-watch-foreground",
        className,
      )}
      title={error || undefined}
    >
      Offline · mock fallback
    </span>
  );
}
