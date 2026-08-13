// Operator dam ground truth — last-mile / phone desk entry (not on Dam analytics page).
import { useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import { DeskCard, DeskCardHeader } from "@/components/turkana/DeskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchDamObservations,
  submitDamObservation,
  type DamObservation,
} from "@/lib/alma-engine";

function spillwayLabel(status: string): string {
  if (status === "partial") return "Partly open";
  if (status === "open") return "Open";
  return "Closed";
}

export function DamObservationForm({ className }: { className?: string }) {
  const [observations, setObservations] = useState<DamObservation[]>([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [release, setRelease] = useState("");
  const [fill, setFill] = useState("");
  const [spillway, setSpillway] = useState("");
  const [notes, setNotes] = useState("");
  const [reporter, setReporter] = useState("");

  async function loadObservations() {
    setObsLoading(true);
    try {
      const res = await fetchDamObservations(8);
      if (res.ok) setObservations(res.observations || []);
    } catch {
      // offline ok
    } finally {
      setObsLoading(false);
    }
  }

  useEffect(() => {
    void loadObservations();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await submitDamObservation({
        release_m3s: release.trim() ? Number(release) : null,
        fill_percent: fill.trim() ? Number(fill) : null,
        spillway_status:
          spillway === "closed" || spillway === "partial" || spillway === "open"
            ? spillway
            : null,
        notes: notes.trim() || null,
        reporter: reporter.trim() || null,
      });
      if (!res.ok) throw new Error(res.error || "Could not save report");
      toast.success("Report saved — Dam prediction will blend this on refresh");
      setRelease("");
      setFill("");
      setSpillway("");
      setNotes("");
      await loadObservations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={className}>
      <DeskCard>
        <DeskCardHeader
          title="Dam ground truth (WhatsApp / field / USSD desk)"
          description="Operators log release and fill from phone reports here — not on the Dam analytics page. Same data still improves the prediction blend."
          action={<PenLine className="h-5 w-5 text-primary" aria-hidden />}
        />
        <form className="mt-5 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone-dam-release">Observed release (m³/s)</Label>
              <Input
                id="phone-dam-release"
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 420"
                value={release}
                onChange={(e) => setRelease(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-dam-fill">Reservoir level (%)</Label>
              <Input
                id="phone-dam-fill"
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder="e.g. 91"
                value={fill}
                onChange={(e) => setFill(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone-dam-spill">Spillway status</Label>
            <Select value={spillway || undefined} onValueChange={setSpillway}>
              <SelectTrigger id="phone-dam-spill">
                <SelectValue placeholder="Select if known" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="partial">Partly open</SelectItem>
                <SelectItem value="open">Open</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone-dam-notes">Field notes</Label>
            <Textarea
              id="phone-dam-notes"
              rows={3}
              placeholder="WhatsApp / radio note from EEP or field team…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone-dam-reporter">Reporter (optional)</Label>
            <Input
              id="phone-dam-reporter"
              placeholder="Name or channel (WhatsApp, USSD desk…)"
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full font-bold" disabled={submitting}>
            {submitting ? "Saving…" : "Save dam report"}
          </Button>
        </form>
      </DeskCard>

      <DeskCard className="mt-5">
        <DeskCardHeader
          title="Recent dam reports"
          description="Fresh entries (under 48h) blend into Dam prediction."
        />
        {obsLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : observations.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No manual dam reports yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {observations.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-border/70 bg-dust/50 px-3 py-2.5 text-sm"
              >
                <p className="font-semibold">
                  {new Date(o.created_at * 1000).toLocaleString()}
                  {o.reporter ? ` · ${o.reporter}` : ""}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {[
                    o.release_m3s != null ? `${o.release_m3s} m³/s` : null,
                    o.fill_percent != null ? `${o.fill_percent}% full` : null,
                    o.spillway_status ? spillwayLabel(o.spillway_status) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Notes only"}
                </p>
                {o.notes ? <p className="mt-1 text-xs">{o.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </DeskCard>
    </div>
  );
}
