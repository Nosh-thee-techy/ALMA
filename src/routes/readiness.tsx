/**
 * My Readiness Portal — farmer-facing web view (phone + PIN).
 *
 * Lightweight demo auth for hackathon prototype — production version would
 * need OTP verification via existing AT SMS integration.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, LogOut, Sprout } from "lucide-react";
import { toast } from "sonner";
import { AlmaLogo } from "@/components/turkana/AlmaLogo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ussdDialCode } from "@/lib/ussd-dial";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/readiness")({
  head: () => ({
    meta: [{ title: "My Readiness — ALMA" }],
  }),
  component: ReadinessPortal,
});

type ChecklistItem = {
  id: string;
  task: string;
  linkedClimateState?: string;
  completed: boolean;
  completedAt?: number | null;
};

type FarmerProfile = {
  phoneNumber: string;
  community: string;
  cropTypes: string[];
  livestockTypes: string[];
  readinessChecklist: ChecklistItem[];
  completedCount: number;
  totalCount: number;
  recoveryEligible?: boolean;
  region?: {
    climate_state?: string;
    climate_summary?: string;
    agriculture_summary?: string;
    livestock_summary?: string;
    tier?: string;
    event_phase?: string;
    farmer_flood_risk?: string;
    drought_risk?: string;
    recovery_eligible?: boolean;
  };
};

const SESSION_KEY = "alma_farmer_phone";

const CROP_OPTIONS = ["maize", "sorghum", "beans", "other"];
const LIVESTOCK_OPTIONS = ["cattle", "goats", "camels", "sheep"];

function ReadinessPortal() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [community, setCommunity] = useState(communities[5]?.name || "Kalokol");
  const [crops, setCrops] = useState<string[]>(["maize"]);
  const [livestock, setLivestock] = useState<string[]>([]);
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [interestLogged, setInterestLogged] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    void (async () => {
      try {
        const res = await fetch(
          `${engineBaseUrl()}/api/farmer/profile?phone=${encodeURIComponent(saved)}`,
        );
        const json = (await res.json()) as { ok?: boolean; profile?: FarmerProfile };
        if (json.ok && json.profile) setProfile(json.profile);
        else localStorage.removeItem(SESSION_KEY);
      } catch {
        /* stay on login */
      }
    })();
  }, []);

  async function login() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${engineBaseUrl()}/api/farmer/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: FarmerProfile;
      };
      if (json.error === "not_found") {
        setMode("signup");
        setError("Number not registered — create a readiness profile below.");
        return;
      }
      if (!json.ok || !json.profile) {
        setError(json.error === "bad_pin" ? "Wrong PIN." : "Login failed.");
        return;
      }
      localStorage.setItem(SESSION_KEY, json.profile.phoneNumber);
      setProfile(json.profile);
      toast.success("Welcome back");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Engine offline");
    } finally {
      setBusy(false);
    }
  }

  async function signup() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${engineBaseUrl()}/api/farmer/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          pin,
          community,
          crop_types: crops,
          livestock_types: livestock,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: FarmerProfile;
      };
      if (!json.ok || !json.profile) {
        setError(json.error || "Signup failed");
        return;
      }
      localStorage.setItem(SESSION_KEY, json.profile.phoneNumber);
      setProfile(json.profile);
      toast.success("Profile created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Engine offline");
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(item: ChecklistItem, completed: boolean) {
    if (!profile) return;
    try {
      const res = await fetch(`${engineBaseUrl()}/api/farmer/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: profile.phoneNumber,
          item_id: item.id,
          completed,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; profile?: FarmerProfile };
      if (json.ok && json.profile) setProfile(json.profile);
    } catch {
      toast.error("Could not update checklist");
    }
  }

  async function logRecoveryInterest() {
    if (!profile) return;
    try {
      const res = await fetch(`${engineBaseUrl()}/api/farmer/recovery-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phoneNumber }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: FarmerProfile;
        note?: string;
      };
      if (!json.ok) {
        toast.error(json.error === "not_eligible" ? "Not eligible yet" : "Could not log interest");
        return;
      }
      if (json.profile) setProfile(json.profile);
      setInterestLogged(true);
      toast.success("Interest logged — responders follow up off-platform");
    } catch {
      toast.error("Engine offline");
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setProfile(null);
    setPin("");
  }

  function toggleCrop(c: string) {
    setCrops((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function toggleLive(c: string) {
    setLivestock((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  if (profile) {
    const active = profile.readinessChecklist.filter(
      (i) => !i.completed || i.linkedClimateState === profile.region?.climate_state,
    );
    const history = profile.readinessChecklist.filter(
      (i) => i.completed && i.linkedClimateState !== profile.region?.climate_state,
    );
    // Audience-tiered display — farmers get fused consequence (impact-based),
    // NGOs get full mechanism (technical). Same underlying data, different
    // presentation layer.
    const flood = profile.region?.farmer_flood_risk || profile.region?.tier || "watch";
    const drought = profile.region?.drought_risk || "safe";
    const eligible =
      Boolean(profile.recoveryEligible) || Boolean(profile.region?.recovery_eligible);

    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-lg">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlmaLogo className="h-10 w-10 rounded-lg object-cover" />
              <div>
                <p className="text-lg font-bold leading-none">My Readiness</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {profile.community} · {profile.phoneNumber}
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={logout} className="gap-1">
              <LogOut className="h-4 w-4" />
              Out
            </Button>
          </header>

          <div className="mt-6 rounded-xl border border-act/30 bg-dust px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Readiness</p>
            <p className="mt-1 text-xl font-bold">
              {profile.completedCount} of {profile.totalCount} readiness actions complete
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {profile.region?.climate_summary ||
                `Climate: ${(profile.region?.climate_state || "stable").replace(/_/g, " ")}`}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Flood risk
              </p>
              <p className="mt-1 text-lg font-bold capitalize">{flood}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Drought risk
              </p>
              <p className="mt-1 text-lg font-bold capitalize">{drought}</p>
            </div>
          </div>

          {/* This is an eligibility FLAG only, not a payment system. Real disbursement
              remains manual/off-platform. Mirrors the logic of parametric insurance
              (event-threshold-triggered) without building actual financial rails. */}
          {eligible && (
            <div className="mt-4 rounded-lg border border-act/40 bg-card p-4">
              <p className="text-sm font-semibold leading-snug">
                This flood event qualifies you for recovery support. Reply/press 1 to log your
                interest.
              </p>
              <Button
                type="button"
                className="mt-3 w-full bg-act font-bold text-act-foreground hover:bg-act/90"
                disabled={interestLogged}
                onClick={() => void logRecoveryInterest()}
              >
                {interestLogged ? "Interest logged" : "Log my interest"}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Eligibility flag only — aid is arranged manually off-platform. Or dial{" "}
                {ussdDialCode} → 7.
              </p>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Sprout className="h-3.5 w-3.5" /> Crops
              </p>
              <p className="mt-1 text-sm font-semibold capitalize">
                {profile.cropTypes.join(", ") || "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-bold text-primary">Livestock</p>
              <p className="mt-1 text-sm font-semibold capitalize">
                {profile.livestockTypes.join(", ") || "None registered"}
              </p>
            </div>
          </div>

          {(profile.region?.agriculture_summary || profile.region?.livestock_summary) && (
            <div className="mt-4 space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
              {profile.region.agriculture_summary && (
                <p>
                  <span className="font-bold">Ag: </span>
                  {profile.region.agriculture_summary}
                </p>
              )}
              {profile.region.livestock_summary && (
                <p>
                  <span className="font-bold">Livestock: </span>
                  {profile.region.livestock_summary}
                </p>
              )}
            </div>
          )}

          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ClipboardList className="h-4 w-4" />
              Checklist
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              From Sector Guidance before-actions for your crops and current climate — not a
              separate content set.
            </p>
            <ul className="mt-3 space-y-2">
              {active.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3",
                    item.completed && "opacity-70",
                  )}
                >
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={(v) => void toggleItem(item, Boolean(v))}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium leading-snug">{item.task}</p>
                    {item.linkedClimateState && (
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        When {item.linkedClimateState.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {history.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-bold text-muted-foreground">Completed history</h2>
              <ul className="mt-2 space-y-1.5">
                {history.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-act" />
                    <span>{item.task}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Prefer feature phone? Dial <strong className="text-foreground">{ussdDialCode}</strong> →
            6 My Readiness.{" "}
            <Link to="/" className="font-bold text-primary">
              Operator desk
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <AlmaLogo className="h-12 w-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-bold">My Readiness</h1>
            <p className="text-sm text-muted-foreground">
              Track crop & livestock prep for your ward
            </p>
          </div>
        </div>

        {/* Lightweight demo auth for hackathon prototype — production version would need OTP verification via existing AT SMS integration */}
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "login") void login();
            else void signup();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+2547XXXXXXXX"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin">4-digit PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>

          {mode === "signup" && (
            <>
              <div className="space-y-1.5">
                <Label>Community</Label>
                <Select value={community} onValueChange={setCommunity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {communities.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name} ({c.side === "omo" ? "Omo" : "Turkana"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Crops</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CROP_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCrop(c)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-bold capitalize",
                        crops.includes(c)
                          ? "bg-primary text-primary-foreground"
                          : "bg-dust text-foreground",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">Livestock (optional)</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LIVESTOCK_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleLive(c)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-bold capitalize",
                        livestock.includes(c)
                          ? "bg-primary text-primary-foreground"
                          : "bg-dust text-foreground",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {error && <p className="text-sm font-bold text-risk-severe">{error}</p>}

          <Button
            type="submit"
            disabled={busy || pin.length !== 4}
            className="w-full bg-act font-bold text-act-foreground hover:bg-act/90"
          >
            {mode === "login" ? "Sign in" : "Create profile"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              First time?{" "}
              <button
                type="button"
                className="font-bold text-primary"
                onClick={() => setMode("signup")}
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button
                type="button"
                className="font-bold text-primary"
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Demo auth only (hashed PIN, no OTP). USSD option 6 works without PIN via SIM.
        </p>
      </div>
    </div>
  );
}
