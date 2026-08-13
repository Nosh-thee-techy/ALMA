import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { DeskCard, DeskCardHeader, DeskList, DeskListItem } from "@/components/turkana/DeskCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchSosQueue, setSosStatus, type SosEntry, type SosStatus } from "@/lib/alma-engine";

function formatWaiting(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function friendlySosError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("404")) {
    return "SOS queue API not loaded — restart the ALMA engine (npm run engine) and refresh this page.";
  }
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
    return "Cannot reach the ALMA engine — start it with npm run engine on port 8787.";
  }
  return "Could not load the SOS queue. Check that the engine is running.";
}

function statusRank(s: SosStatus): number {
  if (s === "reopened") return 0;
  if (s === "new") return 1;
  if (s === "being_handled") return 2;
  return 3;
}

export function SosQueuePanel() {
  const [items, setItems] = useState<SosEntry[]>([]);
  const [honesty, setHonesty] = useState<string | null>(null);
  const [backupNumber, setBackupNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSosQueue({ limit: 20, includeResolved: false });
      setItems(res.items || []);
      setHonesty(res.honesty || null);
      setBackupNumber(res.backup_emergency_number || null);
    } catch (e) {
      setError(friendlySosError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, []);

  const urgentItems = useMemo(() => {
    return items
      .slice()
      .sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          Number(b.ack_overdue) - Number(a.ack_overdue) ||
          b.last_received_at - a.last_received_at,
      );
  }, [items]);

  const updateStatus = async (it: SosEntry, next: SosStatus) => {
    if (savingId !== null) return;
    if (next === "reopened") return;
    setSavingId(it.id);
    try {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: next } : p)));
      await setSosStatus(it.id, next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update SOS status");
      await load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <DeskCard className="border-2 border-red-500/40 bg-red-500/5 shadow-[0_1px_2px_rgba(220,20,60,0.10)]">
      <DeskCardHeader
        title="SOS priority queue"
        description={
          error
            ? error
            : "Routing + escalation only — ALMA notifies responders; humans respond. Not a rescue service."
        }
        action={
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
                urgentItems.length > 0
                  ? "bg-red-500/15 text-red-600 border border-red-500/40"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {urgentItems.length > 0 ? `${urgentItems.length} open` : "No SOS"}
            </span>
          </div>
        }
      />

      <div className="mt-4 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            {loading
              ? "Loading…"
              : "SMS SOS/HELP · dedicated USSD · dedicated SOS call-in. Same phone within 5 minutes collapses to one row (resent Xx) — confirmation still goes out every time."}
          </p>
          {honesty ? <p>{honesty}</p> : null}
          {backupNumber ? (
            <p>
              Off-platform backup line (for reopen voice): {backupNumber}
            </p>
          ) : null}
        </div>
      </div>

      <DeskList>
        {urgentItems.length === 0 ? (
          <DeskListItem>
            <p className="text-sm text-muted-foreground">
              No open SOS. Entry: text SOS/HELP, dial SOS USSD, or the dedicated SOS voice number.
            </p>
          </DeskListItem>
        ) : (
          urgentItems.map((it) => {
            const reopened = it.status === "reopened";
            const overdue = Boolean(it.ack_overdue) || (it.escalation_count || 0) > 0;
            return (
              <DeskListItem
                key={it.id}
                className={cn(
                  reopened && "border border-red-600 bg-red-600/10 animate-pulse",
                  !reopened && overdue && "border border-amber-500/60 bg-amber-500/10",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-foreground">{it.phone}</p>
                      {reopened ? (
                        <span className="rounded-full bg-red-700 px-2 py-0.5 text-[11px] font-bold text-white">
                          RE-OPENED — not confirmed safe
                        </span>
                      ) : null}
                      {it.resent_count > 0 ? (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-700 border border-red-500/40">
                          resent {it.resent_count}x
                        </span>
                      ) : null}
                      {(it.escalation_count || 0) > 0 ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-500/40">
                          escalated {it.escalation_count}x
                        </span>
                      ) : null}
                      {it.ack_overdue && it.status === "new" ? (
                        <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          ack overdue
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {it.community ? `Community: ${it.community}` : "Community: Unknown"} ·{" "}
                      {it.channel}
                    </p>
                    <p className="mt-1 text-xs font-medium text-foreground/80">
                      Waiting {formatWaiting(it.time_since_received_s)} · {it.received_at_label}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-[200px]">
                      <Select
                        value={it.status === "reopened" ? "reopened" : it.status}
                        disabled={savingId === it.id}
                        onValueChange={(v) => void updateStatus(it, v as SosStatus)}
                      >
                        <SelectTrigger className="h-9 w-full bg-background">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">Received</SelectItem>
                          <SelectItem value="being_handled">Being handled</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          {reopened ? (
                            <SelectItem value="reopened" disabled>
                              Re-opened
                            </SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                {it.message_body ? (
                  <p className="mt-3 max-w-[520px] truncate text-xs text-muted-foreground">
                    Message: {it.message_body}
                  </p>
                ) : null}
              </DeskListItem>
            );
          })
        )}
      </DeskList>
    </DeskCard>
  );
}
