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

export function SosQueuePanel() {
  const [items, setItems] = useState<SosEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSosQueue({ limit: 20, includeResolved: false });
      setItems(res.items || []);
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
    // Priority queue: unresolved SOS first.
    return items
      .slice()
      .sort(
        (a, b) =>
          (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) ||
          b.last_received_at - a.last_received_at,
      );
  }, [items]);

  const updateStatus = async (it: SosEntry, next: SosStatus) => {
    if (savingId !== null) return;
    setSavingId(it.id);
    try {
      // Optimistic update so responders see feedback even if network is degraded.
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
            : "Emergency requests (SMS / USSD). One-way log + immediate WhatsApp notify."
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
              {urgentItems.length > 0 ? `${urgentItems.length} waiting` : "No SOS"}
            </span>
          </div>
        }
      />

      <div className="mt-4 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" aria-hidden />
        <p className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : "Collapse dedupe applies: repeated SOS from same phone within a short window updates one queue entry."}
        </p>
      </div>

      <DeskList>
        {urgentItems.length === 0 ? (
          <DeskListItem>
            <p className="text-sm text-muted-foreground">
              No SOS requests yet. If someone is in danger, they can send “SOS”.
            </p>
          </DeskListItem>
        ) : (
          urgentItems.map((it) => (
            <DeskListItem key={it.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-foreground">{it.phone}</p>
                    {it.resent_count > 0 ? (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-700 border border-red-500/40">
                        resent {it.resent_count}x
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {it.community ? `Community: ${it.community}` : "Community: Unknown"} ·{" "}
                    {it.channel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {it.received_at_label} · waiting {formatWaiting(it.time_since_received_s)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-[180px]">
                    <Select
                      value={it.status}
                      disabled={savingId === it.id}
                      onValueChange={(v) => void updateStatus(it, v as SosStatus)}
                    >
                      <SelectTrigger className="h-9 w-full bg-background">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="being_handled">Being handled</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
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
          ))
        )}
      </DeskList>
    </DeskCard>
  );
}
