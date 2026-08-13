/**
 * Ground Observer admin panel — register/verify observers + recent reports.
 *
 * Where sensor networks are unavailable/expensive, ALMA formalizes human
 * observation as a structured input (CBEWS via SMS/USSD). Verified vs Estimated
 * stay labeled — never blended into one silent number.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
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
import { engineBaseUrl } from "@/lib/alma-engine";
import { communities } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

type Observer = {
  phoneNumber: string;
  organizationId: string;
  observerName?: string | null;
  registeredLocation?: string | null;
  verified: boolean;
};

type Report = {
  id: number;
  phoneNumber: string;
  organizationId: string;
  reportType: string;
  value: string;
  verifiedObserver: boolean;
  source?: string;
  createdAt: number;
  needsReview?: boolean;
};

const ORGS = ["WRA", "KMD", "TurkanaCountyDMU", "Community", "Other"];

export function GroundObserversPanel({
  liveLayer,
}: {
  liveLayer?: {
    estimated?: { rain_24h_mm?: number; dam_release_m3s?: number };
    ground_verified?: {
      rain_mm_nudge?: number;
      dam_m3s_nudge?: number;
      verified_report_count?: number;
      unverified_report_count?: number;
    };
    blended_for_risk?: { rain_24h_mm?: number; dam_release_m3s?: number };
  } | null;
}) {
  const [observers, setObservers] = useState<Observer[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [honesty, setHonesty] = useState("");
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [org, setOrg] = useState("WRA");
  const [name, setName] = useState("");
  const [location, setLocation] = useState(communities[5]?.name || "Kalokol");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([
        fetch(`${engineBaseUrl()}/api/dashboard/ground-observers`).then((x) => x.json()),
        fetch(`${engineBaseUrl()}/api/dashboard/ground-observer-reports?limit=12`).then((x) =>
          x.json(),
        ),
      ]);
      if (o.ok) setObservers(o.observers || []);
      if (r.ok) {
        setReports(r.reports || []);
        setHonesty(r.honesty || "");
      }
    } catch {
      /* engine offline */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 30000);
    return () => window.clearInterval(id);
  }, [reload]);

  async function register() {
    setBusy(true);
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/ground-observers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phone,
          organizationId: org,
          observerName: name || null,
          registeredLocation: location,
          verified: false,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error("Could not register observer");
        return;
      }
      toast.success("Observer registered (unverified)");
      setPhone("");
      setName("");
      void reload();
    } catch {
      toast.error("Engine offline");
    } finally {
      setBusy(false);
    }
  }

  async function toggleVerify(obs: Observer) {
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/ground-observers/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: obs.phoneNumber, verified: !obs.verified }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error("Verify failed");
        return;
      }
      toast.success(obs.verified ? "Unverified" : "Marked verified — higher model weight");
      void reload();
    } catch {
      toast.error("Engine offline");
    }
  }

  const est = liveLayer?.estimated;
  const gv = liveLayer?.ground_verified;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Ground observers</p>
        <h2 className="mt-1 text-lg font-bold">Human-verified field inputs</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Where sensor networks are unavailable/expensive, ALMA formalizes human observation as a
          structured input — the same principle as community-based early warning systems, via
          SMS/USSD.
        </p>
      </header>

      {(est || gv) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-dust px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Estimated
            </p>
            <p className="mt-1 text-sm font-semibold">
              Rain {est?.rain_24h_mm ?? "—"} mm · Dam ~{est?.dam_release_m3s ?? "—"} m³/s
            </p>
          </div>
          <div className="rounded-lg border border-act/30 bg-act/10 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
              Ground-Verified layer
            </p>
            <p className="mt-1 text-sm font-semibold">
              Nudge rain +{gv?.rain_mm_nudge ?? 0} mm · dam +{gv?.dam_m3s_nudge ?? 0} m³/s
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {gv?.verified_report_count ?? 0} verified · {gv?.unverified_report_count ?? 0}{" "}
              corroborating
            </p>
          </div>
        </div>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void register();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="obs-phone">Phone</Label>
          <Input
            id="obs-phone"
            type="tel"
            required
            placeholder="+2547…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Organization</Label>
          <Select value={org} onValueChange={setOrg}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORGS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {communities.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="obs-name">Name (optional)</Label>
          <Input id="obs-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          type="submit"
          disabled={busy || !phone}
          className="gap-2 bg-act font-bold text-act-foreground hover:bg-act/90 sm:col-span-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add observer
        </Button>
      </form>

      <div>
        <p className="text-xs font-bold text-muted-foreground">Registered</p>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : observers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            None yet — field staff can also register via USSD option 6.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {observers.map((o) => (
              <li
                key={o.phoneNumber}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-bold">
                    {o.organizationId}
                    {o.observerName ? ` · ${o.observerName}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.phoneNumber}
                    {o.registeredLocation ? ` · ${o.registeredLocation}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={o.verified ? "default" : "outline"}
                  className={cn("gap-1 font-bold", o.verified && "bg-act text-act-foreground")}
                  onClick={() => void toggleVerify(o)}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {o.verified ? "Verified" : "Verify"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-bold text-muted-foreground">Recent reports</p>
        <ul className="mt-2 space-y-1.5">
          {reports.slice(0, 8).map((r) => (
            <li key={r.id} className="rounded-md bg-dust px-3 py-2 text-xs">
              <span className="font-bold">{r.organizationId}</span> · {r.reportType.replace(/_/g, " ")}{" "}
              = <span className="font-semibold">{r.value}</span>
              <span
                className={cn(
                  "ml-2 rounded px-1.5 py-0.5 font-bold",
                  r.verifiedObserver
                    ? "bg-act/20 text-act-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {r.verifiedObserver ? "Ground-Verified" : "Unverified"}
              </span>
              {r.needsReview ? (
                <span className="ml-1 font-bold text-risk-warning">Needs review</span>
              ) : null}
            </li>
          ))}
        </ul>
        {honesty ? <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{honesty}</p> : null}
      </div>
    </section>
  );
}
