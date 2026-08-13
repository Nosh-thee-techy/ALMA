/**
 * Farmer After app — phone UI, not the operator desk.
 * Tabs: After (situation + SMS) · To do · Alma · Dial (USSD/voice).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FarmerAfterHome } from "@/components/turkana/FarmerAfterHome";
import { FarmerAlmaChat } from "@/components/turkana/FarmerAlmaChat";
import { FarmerPhoneShell, type FarmerTab } from "@/components/turkana/FarmerPhoneShell";
import { FarmerTaskPanel } from "@/components/turkana/FarmerTaskPanel";
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
import { useAlmaVoice } from "@/hooks/use-alma-voice";
import { engineBaseUrl } from "@/lib/alma-engine";
import { FARMER_LANGS, LANG_STORAGE_KEY, type FarmerLang } from "@/lib/farmer-locale";
import { lightMeta, tierToLight } from "@/lib/status-light";
import { communities, type RiskTier } from "@/lib/turkana-data";
import { ussdDialCode } from "@/lib/ussd-dial";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  id: string;
  task: string;
  completed: boolean;
  how?: string;
  afterEffect?: string;
};

type FarmerProfile = {
  phoneNumber: string;
  community: string;
  cropTypes: string[];
  livestockTypes: string[];
  fisheryTypes?: string[];
  sectorRoles?: string[];
  readinessChecklist: ChecklistItem[];
  completedCount: number;
  totalCount: number;
  todoCount?: number;
  doneCount?: number;
  recoveryEligible?: boolean;
  preparednessState?: "UNPREPARED" | "MODERATE" | "READY";
  hazardLevel?: "WATCH" | "WARNING" | "SEVERE" | "COMPOUND";
  readiness?: {
    scorePercent?: number;
    preparednessState?: string;
    hazardLevel?: string;
    notCreditScore?: boolean;
    components?: { preEvent?: number; verification?: number; postEvent?: number };
  };
  recoveryEligibility?: {
    recovery_eligibility_flag?: boolean;
    deny_reasons?: string[];
    note?: string;
  };
  smsTip?: string;
  channels?: { ussd?: string; voice?: string; sms?: string };
  region?: {
    climate_state?: string;
    climate_summary?: string;
    tier?: string;
    event_phase?: string;
    farmer_flood_risk?: string;
    recovery_eligible?: boolean;
  };
  climaticImpact?: {
    intro?: string;
    whatThisMeans?: string[];
    howToGetBetter?: string[];
  };
  assets?: { kind: string; name: string; howTheyAre: string }[];
  gap?: {
    youAre?: string;
    youShouldBe?: string;
    howToGetBetter?: string[];
    done?: number;
    total?: number;
  };
  climate?: {
    place?: string;
    summary?: string;
    prediction?: string;
    phasePlain?: string;
    climateState?: string;
  };
};

const SESSION_KEY = "alma_farmer_phone";
const CROP_OPTIONS = ["maize", "sorghum", "beans", "other"];
const LIVESTOCK_OPTIONS = ["cattle", "goats", "camels", "sheep"];
const FISHERY_OPTIONS = ["boats", "nets"];

function asTier(value: string | undefined): RiskTier {
  if (value === "compound" || value === "COMPOUND" || value === "severe") {
    return "severe";
  }
  if (value === "safe" || value === "watch" || value === "warning") {
    return value;
  }
  return "watch";
}

export function FarmerAfterApp() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [community, setCommunity] = useState(
    () => communities.find((c) => c.name === "Kalokol")?.name || "Kalokol",
  );
  const [crops, setCrops] = useState<string[]>(["maize"]);
  const [livestock, setLivestock] = useState<string[]>([]);
  const [fishery, setFishery] = useState<string[]>([]);
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [interestLogged, setInterestLogged] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [tab, setTab] = useState<FarmerTab>("after");
  const [almaSeed, setAlmaSeed] = useState<string | undefined>();
  const [lang, setLang] = useState<FarmerLang>("en");
  const [chatSpeaking, setChatSpeaking] = useState(false);
  const alma = useAlmaVoice(profile?.phoneNumber, lang);

  useEffect(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (FARMER_LANGS.some((l) => l.id === saved)) setLang(saved as FarmerLang);
  }, []);

  function changeLang(next: FarmerLang) {
    setLang(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  }

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) {
      setRestoring(false);
      return;
    }
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
      } finally {
        setRestoring(false);
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
        setAuthMode("signup");
        setError("This number is new — register your ward and crops.");
        return;
      }
      if (!json.ok || !json.profile) {
        setError(
          json.error === "bad_pin"
            ? "Wrong PIN. Try again, or register if this is a new number."
            : "Could not sign in. Check the engine is running.",
        );
        return;
      }
      localStorage.setItem(SESSION_KEY, json.profile.phoneNumber);
      setProfile(json.profile);
      setTab("after");
      toast.success("Welcome back");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Engine offline — start npm run engine.");
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
          fishery_types: fishery,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: FarmerProfile;
      };
      if (!json.ok || !json.profile) {
        setError(json.error || "Could not create profile.");
        return;
      }
      localStorage.setItem(SESSION_KEY, json.profile.phoneNumber);
      setProfile(json.profile);
      setTab("after");
      toast.success("After is ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Engine offline — start npm run engine.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(item: ChecklistItem, completed: boolean) {
    if (!profile) return;
    setPendingId(item.id);
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
      toast.error("Could not update — try USSD option 7");
    } finally {
      setPendingId(null);
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
      const json = (await res.json()) as { ok?: boolean; error?: string; profile?: FarmerProfile };
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

  if (restoring) {
    return (
      <FarmerPhoneShell
        tab="after"
        onTab={setTab}
        title="My Readiness"
        subtitle="Signing you back in…"
        showNav={false}
        lang={lang}
        onLang={changeLang}
      >
        <p className="text-sm text-muted-foreground">Loading After…</p>
      </FarmerPhoneShell>
    );
  }

  if (!profile) {
    return (
      <FarmerPhoneShell
        tab="after"
        onTab={setTab}
        title="My Readiness"
        subtitle={`USSD ${ussdDialCode} → 7 · Voice 6`}
        showNav={false}
        lang={lang}
        onLang={changeLang}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          After the flood. Same SMS tips as your feature phone — not the operator desk.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (authMode === "login") void login();
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
              autoComplete="tel"
              className="h-12"
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
              className="h-12"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          {authMode === "signup" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="community">Community</Label>
                <Select value={community} onValueChange={setCommunity}>
                  <SelectTrigger id="community" className="h-12">
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
              <fieldset>
                <legend className="text-sm font-medium">Crops</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CROP_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setCrops((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                        )
                      }
                      className={cn(
                        "min-h-11 rounded-lg px-3 py-2 text-sm font-bold capitalize",
                        crops.includes(c) ? "bg-primary text-primary-foreground" : "bg-dust",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">Livestock</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LIVESTOCK_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setLivestock((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                        )
                      }
                      className={cn(
                        "min-h-11 rounded-lg px-3 py-2 text-sm font-bold capitalize",
                        livestock.includes(c) ? "bg-primary text-primary-foreground" : "bg-dust",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">Fishing gear</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {FISHERY_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setFishery((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                        )
                      }
                      className={cn(
                        "min-h-11 rounded-lg px-3 py-2 text-sm font-bold capitalize",
                        fishery.includes(c) ? "bg-primary text-primary-foreground" : "bg-dust",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {error ? (
            <p className="text-sm font-bold text-risk-severe" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={busy || pin.length !== 4 || (authMode === "signup" && crops.length + livestock.length + fishery.length === 0)}
            className="h-12 w-full bg-act font-bold text-act-foreground hover:bg-act/90"
          >
            {busy ? "Working…" : authMode === "login" ? "Open After" : "Create profile"}
          </Button>
        </form>
        <p className="mt-3 text-sm text-muted-foreground">
          {authMode === "login" ? (
            <>
              First time?{" "}
              <button type="button" className="font-bold text-primary" onClick={() => setAuthMode("signup")}>
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button type="button" className="font-bold text-primary" onClick={() => setAuthMode("login")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </FarmerPhoneShell>
    );
  }

  const todo = profile.readinessChecklist.filter((i) => !i.completed);
  const done = profile.readinessChecklist.filter((i) => i.completed);
  const flood = asTier(
    profile.hazardLevel?.toLowerCase() || profile.region?.farmer_flood_risk || profile.region?.tier,
  );
  const light = tierToLight(flood);
  const meta = lightMeta[light];
  const eligible = Boolean(profile.recoveryEligible) || Boolean(profile.region?.recovery_eligible);
  const smsTip = profile.smsTip || profile.channels?.sms || "";
  const doneCount = profile.doneCount ?? profile.completedCount;
  const hazard = profile.hazardLevel || profile.readiness?.hazardLevel || "WATCH";
  const prep = profile.preparednessState || profile.readiness?.preparednessState || "UNPREPARED";

  function openAlmaWithContext() {
    const intro = profile?.climaticImpact?.intro || "What should I do after this event?";
    const next = todo
      .map((i) => i.task)
      .slice(0, 3)
      .join("; ");
    setAlmaSeed(
      `After-event in ${profile?.community}. ${intro} Next: ${next || "all done"}. Speak as Alma. Do not invent flood conditions.`,
    );
    setTab("alma");
  }

  return (
    <FarmerPhoneShell
      tab={tab}
      onTab={setTab}
      title={tab === "after" ? "After the event" : tab === "do" ? "To do" : tab === "alma" ? "Alma" : "Dial"}
      subtitle={`${profile.community} · ${prep} · ${doneCount}/${profile.totalCount}`}
      lang={lang}
      onLang={changeLang}
      speaking={alma.speaking || chatSpeaking}
    >
      {tab === "after" && (
        <FarmerAfterHome
          lang={lang}
          hazard={hazard}
          bannerClass={
            light === "red"
              ? "border-risk-severe bg-risk-severe text-risk-severe-foreground"
              : meta.panel
          }
          onRed={light === "red"}
          climate={profile.climate || { place: profile.community, summary: profile.region?.climate_summary }}
          gap={
            profile.gap || {
              youAre: prep,
              youShouldBe: "READY — every current action done",
              howToGetBetter: profile.climaticImpact?.howToGetBetter || todo.map((i) => i.task),
            }
          }
          assets={
            profile.assets || [
              ...profile.cropTypes.map((name) => ({
                kind: "crop",
                name,
                howTheyAre: `Your ${name}.`,
              })),
              ...profile.livestockTypes.map((name) => ({
                kind: "animal",
                name,
                howTheyAre: `Your ${name}.`,
              })),
            ]
          }
          smsTip={smsTip}
          eligible={eligible}
          interestLogged={interestLogged}
          speaking={alma.speaking}
          almaBusy={alma.busy}
          onSpeak={(topic) => void alma.speak(topic)}
          onOpenAlma={openAlmaWithContext}
          onRecovery={() => void logRecoveryInterest()}
          onSignOut={() => {
            localStorage.removeItem(SESSION_KEY);
            setProfile(null);
            setPin("");
          }}
        />
      )}

      {tab === "do" && (
        <FarmerTaskPanel
          lang={lang}
          todo={todo}
          done={done}
          pendingId={pendingId}
          almaBusy={alma.busy}
          onToggle={(item, completed) => void toggleItem(item, completed)}
          onSpeakTask={(id) => void alma.speak("task", id)}
        />
      )}

      {tab === "alma" && (
        <FarmerAlmaChat
          seedPrompt={almaSeed}
          phone={profile.phoneNumber}
          lang={lang}
          onSpeaking={setChatSpeaking}
        />
      )}

      {tab === "dial" && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            Same tips on a feature phone — no internet. Alma still speaks on the helpline.
          </p>
          <div className="rounded-2xl bg-dust px-4 py-5 text-center">
            <p className="text-sm font-bold text-primary">USSD</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{ussdDialCode}</p>
            <p className="mt-1 text-sm">then press 7 After</p>
          </div>
          <div className="rounded-2xl bg-dust px-4 py-4">
            <p className="text-sm font-bold">Voice helpline</p>
            <p className="mt-1 text-sm leading-relaxed">Call ALMA, then press 6. Alma reads the after brief in your language — ElevenLabs voice.</p>
          </div>
          {smsTip ? (
            <div className="rounded-2xl bg-dust px-4 py-4">
              <p className="text-sm font-bold">Last SMS tip</p>
              <p className="mt-1 text-sm leading-relaxed">{smsTip}</p>
            </div>
          ) : null}
          <p className="text-sm capitalize leading-relaxed">
            {(profile.sectorRoles || []).join(" · ") || "farmer"} · Crops:{" "}
            {profile.cropTypes.join(", ") || "—"} · Livestock: {profile.livestockTypes.join(", ") || "none"}
            {profile.fisheryTypes?.length ? ` · Gear: ${profile.fisheryTypes.join(", ")}` : ""}
          </p>
        </div>
      )}
    </FarmerPhoneShell>
  );
}
