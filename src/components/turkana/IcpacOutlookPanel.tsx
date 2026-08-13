/**
 * ICPAC regional outlook — manually curated context (not a live API feed).
 */
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { engineBaseUrl } from "@/lib/alma-engine";

type Outlook = {
  summary?: string;
  issuedDate?: string | null;
  source?: string;
  updatedAt?: number | null;
};

export function IcpacOutlookPanel({
  initial,
}: {
  initial?: { outlook?: Outlook; honesty?: string } | null;
}) {
  const [summary, setSummary] = useState(initial?.outlook?.summary || "");
  const [issuedDate, setIssuedDate] = useState(initial?.outlook?.issuedDate || "");
  const [source, setSource] = useState(initial?.outlook?.source || "ICPAC (manual curation)");
  const [honesty, setHonesty] = useState(initial?.honesty || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial?.outlook?.summary) setSummary(initial.outlook.summary);
    if (initial?.outlook?.issuedDate) setIssuedDate(initial.outlook.issuedDate || "");
    if (initial?.outlook?.source) setSource(initial.outlook.source);
    if (initial?.honesty) setHonesty(initial.honesty);
  }, [initial]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${engineBaseUrl()}/api/dashboard/icpac-outlook`);
        const json = await res.json();
        if (json.ok && json.outlook) {
          setSummary(json.outlook.summary || "");
          setIssuedDate(json.outlook.issuedDate || "");
          setSource(json.outlook.source || "ICPAC (manual curation)");
          setHonesty(json.honesty || "");
        }
      } catch {
        /* offline */
      }
    })();
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/icpac-outlook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          issuedDate: issuedDate || null,
          source,
          updatedBy: "desk",
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "Save failed");
        return;
      }
      toast.success("ICPAC outlook updated");
      setHonesty(json.honesty || "");
    } catch {
      toast.error("Engine offline");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-primary">Regional context</p>
      <h2 className="mt-1 text-lg font-bold">ICPAC Seasonal Outlook</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Manually curated from ICPAC Weekly/Monthly/Seasonal Forecast and GHACOF statements — not an
        automated feed.
      </p>

      {summary && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-dust px-3 py-2.5">
          <p className="text-sm leading-snug">{summary}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {issuedDate ? `Issued ${issuedDate}` : "Issue date not set"}
            {source ? ` · ${source}` : ""}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="icpac-summary">Update summary</Label>
          <Textarea
            id="icpac-summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Paste the current ICPAC / GHACOF outlook in plain language…"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="icpac-date">Issued date</Label>
            <Input
              id="icpac-date"
              placeholder="2026-08-01"
              value={issuedDate || ""}
              onChange={(e) => setIssuedDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="icpac-source">Source label</Label>
            <Input
              id="icpac-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={busy || summary.trim().length < 8}
          onClick={() => void save()}
          className="gap-2 bg-act font-bold text-act-foreground hover:bg-act/90"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save outlook
        </Button>
        {honesty ? <p className="text-[11px] text-muted-foreground">{honesty}</p> : null}
      </div>
    </section>
  );
}
