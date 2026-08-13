import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared cream desk card — matches the “Alerts to look at” treatment. */
export function DeskCard({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-[0_1px_2px_rgba(40,30,20,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)]",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function DeskCardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function DeskMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-dust/80 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums leading-tight text-foreground">{value}</p>
      {note ? <p className="mt-1 text-xs leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function DeskList({ children }: { children: ReactNode }) {
  return <ul className="mt-4 divide-y divide-border/80">{children}</ul>;
}

export function DeskListItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("py-4 first:pt-2 last:pb-0", className)}>{children}</li>;
}
