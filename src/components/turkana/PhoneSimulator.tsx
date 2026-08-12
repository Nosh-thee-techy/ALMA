import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Phone, RefreshCw, Send, Waves } from "lucide-react";
import { toast } from "sonner";
import { FeaturePhone } from "@/components/turkana/FeaturePhone";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { engineBaseUrl } from "@/lib/alma-engine";
import {
  previewSms,
  sendSimSms,
  simUssd,
  simVoice,
  type VoiceSimResult,
} from "@/lib/phone-simulator";
import { ussdDialCode } from "@/lib/ussd-dial";
import { cn } from "@/lib/utils";

type Mode = "ussd" | "sms" | "call";

const WARDS = [
  { id: "kalokol", label: "Kalokol" },
  { id: "kangatotha", label: "Kangatotha" },
  { id: "todonyang", label: "Todonyang" },
  { id: "nachukui", label: "Nachukui" },
  { id: "omorate", label: "Omorate" },
];

export function PhoneSimulator() {
  const [mode, setMode] = useState<Mode>("ussd");
  const [phone, setPhone] = useState("+254700000001");
  const [ward, setWard] = useState("kalokol");
  const [lang, setLang] = useState<"en" | "sw">("sw");
  const [engineUp, setEngineUp] = useState<boolean | null>(null);

  // USSD
  const [ussdSession, setUssdSession] = useState<string | undefined>();
  const [ussdPath, setUssdPath] = useState("");
  const [ussdScreen, setUssdScreen] = useState("Dial to start…");
  const [ussdEnded, setUssdEnded] = useState(false);

  // SMS
  const [smsPreview, setSmsPreview] = useState<string>("");
  const [smsTier, setSmsTier] = useState("—");
  const [smsLog, setSmsLog] = useState<Array<{ dir: "in" | "out"; text: string }>>([]);

  // Voice
  const [callActive, setCallActive] = useState(false);
  const [voiceSession, setVoiceSession] = useState<string | undefined>();
  const [voiceScreen, setVoiceScreen] = useState("Press green to call ALMA helpline.");
  const [voiceState, setVoiceState] = useState<VoiceSimResult["parsed"] | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [turnCount, setTurnCount] = useState(0);

  useEffect(() => {
    fetch(`${engineBaseUrl()}/health`)
      .then((r) => setEngineUp(r.ok))
      .catch(() => setEngineUp(false));
  }, []);

  const resetUssd = useCallback(async () => {
    setUssdPath("");
    setUssdEnded(false);
    try {
      const res = await simUssd({ phone, text: "", reset: true, sessionId: ussdSession });
      setUssdSession(res.session_id);
      setUssdScreen(res.text || "…");
      setUssdEnded(res.session_end);
    } catch (e) {
      setUssdScreen("Engine offline — start: npm run engine");
      toast.error("USSD sim failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }, [phone, ussdSession]);

  const resetCall = useCallback(async () => {
    setCallActive(false);
    setVoiceSession(undefined);
    setVoiceState(null);
    setQuestionDraft("");
    setTurnCount(0);
    setVoiceScreen("Press green to call ALMA helpline.");
  }, []);

  useEffect(() => {
    if (mode === "ussd" && engineUp) void resetUssd();
  }, [mode, engineUp]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ussdKey(key: string) {
    if (ussdEnded) return;
    let nextPath = ussdPath;
    if (key === "#") {
      // send accumulated path
    } else if (key === "*") {
      nextPath = ussdPath ? `${ussdPath}*` : "";
    } else {
      nextPath = ussdPath ? `${ussdPath}*${key}` : key;
    }
    setUssdPath(nextPath);
    try {
      const res = await simUssd({ sessionId: ussdSession, phone, text: nextPath });
      setUssdSession(res.session_id);
      setUssdScreen(res.text);
      setUssdEnded(res.session_end);
      if (res.session_end) setUssdPath("");
    } catch (e) {
      toast.error("USSD error", { description: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function loadSmsPreview() {
    try {
      const p = await previewSms({ lang, region_id: ward === "omorate" ? "omo" : "turkana" });
      setSmsPreview(p.message);
      setSmsTier(p.tier);
    } catch {
      setSmsPreview("Engine offline — cannot preview live SMS.");
      setSmsTier("—");
    }
  }

  useEffect(() => {
    if (mode === "sms" && engineUp) void loadSmsPreview();
  }, [mode, lang, ward, engineUp]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendSms() {
    try {
      const res = await sendSimSms({
        phone,
        lang,
        region_id: ward === "omorate" ? "omo" : "turkana",
      });
      setSmsLog((prev) => [
        ...prev,
        { dir: "out", text: res.preview.message },
        {
          dir: "in",
          text:
            res.sms?.mode === "live"
              ? "Delivered (live AT)"
              : res.sms?.mode === "demo"
                ? "Simulated — check engine logs"
                : "Dispatch attempted",
        },
      ]);
      toast.success(res.sms?.mode === "live" ? "SMS sent" : "SMS simulated");
    } catch (e) {
      toast.error("SMS failed", { description: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function voiceRequest(params: { digit?: string; questionText?: string; reset?: boolean }) {
    try {
      const res = await simVoice({
        sessionId: voiceSession,
        phone,
        ward,
        lang,
        digit: params.digit ?? "",
        questionText: params.questionText ?? "",
        reset: params.reset ?? false,
      });
      setVoiceSession(res.session_id);
      setVoiceState(res.parsed);
      setTurnCount(res.conversation?.turn_count ?? 0);
      setVoiceScreen(res.parsed.text || "…");
      if (res.parsed.end_call) setCallActive(false);
      return res;
    } catch (e) {
      toast.error("Voice sim failed", { description: e instanceof Error ? e.message : "Failed" });
      return null;
    }
  }

  async function startCall() {
    if (callActive) return;
    setCallActive(true);
    await voiceRequest({ reset: true });
  }

  async function endCall() {
    await resetCall();
  }

  async function voiceKey(key: string) {
    if (!callActive) return;
    if (voiceState?.needs_record) return;
    if (!voiceState?.needs_digit && key !== "#") {
      await voiceRequest({ digit: key });
      return;
    }
    if (voiceState?.needs_digit) {
      await voiceRequest({ digit: key });
    }
  }

  async function submitQuestion() {
    if (!questionDraft.trim()) return;
    await voiceRequest({ questionText: questionDraft.trim() });
    setQuestionDraft("");
  }

  const phoneTitle =
    mode === "ussd" ? ussdDialCode : mode === "sms" ? "SMS" : callActive ? "ALMA Call" : "Voice";

  const phoneSubtitle =
    mode === "ussd"
      ? ussdEnded
        ? "Session ended"
        : ussdPath
          ? `Input: ${ussdPath}`
          : "Press a key"
      : mode === "sms"
        ? `Tier: ${smsTier}`
        : callActive
          ? `Turn ${turnCount}/4 · server-side Gemma`
          : "Helpline";

  const screenContent =
    mode === "ussd" ? (
      ussdScreen
    ) : mode === "sms" ? (
      <div className="space-y-2">
        {smsLog.length === 0 ? (
          <p className="text-lime-200/80">{smsPreview || "Loading alert preview…"}</p>
        ) : (
          smsLog.map((m, i) => (
            <p
              key={i}
              className={cn(
                "rounded px-1 py-0.5",
                m.dir === "out" ? "bg-lime-900/40 text-lime-100" : "text-lime-300/70",
              )}
            >
              {m.dir === "out" ? "→ " : "← "}
              {m.text}
            </p>
          ))
        )}
      </div>
    ) : (
      voiceScreen
    );

  const phoneFooter =
    mode === "call" && callActive && voiceState?.needs_record ? (
      <div className="space-y-1">
        <p className="text-[9px] text-lime-300/70">Type your question (simulates STT):</p>
        <input
          className="w-full rounded border border-lime-800 bg-[#0f1f0f] px-2 py-1 text-[10px] text-lime-100"
          value={questionDraft}
          onChange={(e) => setQuestionDraft(e.target.value)}
          placeholder={lang === "sw" ? "Swali lako…" : "Your question…"}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitQuestion();
          }}
        />
        <button
          type="button"
          className="text-[9px] font-bold text-lime-400 underline"
          onClick={() => void submitQuestion()}
        >
          Send question
        </button>
      </div>
    ) : mode === "call" && callActive && voiceState?.needs_digit ? (
      <p className="text-[9px] text-lime-300/80">Press 1 = another question · 2 = done</p>
    ) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">Farmer channel rehearsal</p>
          <h1 className="text-2xl font-bold tracking-tight">Feature phone simulator</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Practice USSD ({ussdDialCode}), incoming SMS alerts, and the voice helpline — including
            bounded Q&A where <strong className="text-foreground">Gemma runs on the server</strong>,
            not on the phone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold",
              engineUp === true
                ? "bg-green-100 text-green-800"
                : engineUp === false
                  ? "bg-red-100 text-red-800"
                  : "bg-muted text-muted-foreground",
            )}
          >
            Engine {engineUp === true ? "online" : engineUp === false ? "offline" : "…"}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link to="/readiness">My Readiness web</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <FeaturePhone
          title={phoneTitle}
          subtitle={phoneSubtitle}
          screen={screenContent}
          footer={phoneFooter}
          callActive={callActive}
          onKey={(k) => {
            if (mode === "ussd") void ussdKey(k);
            else if (mode === "call") void voiceKey(k);
          }}
          onCall={() => {
            if (mode === "call") void startCall();
            else if (mode === "ussd") void resetUssd();
            else void sendSms();
          }}
          onEnd={() => {
            if (mode === "call") void endCall();
            else if (mode === "ussd") void resetUssd();
          }}
        />

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ussd" className="gap-1.5 text-xs sm:text-sm">
                <Waves className="h-4 w-4" aria-hidden />
                USSD
              </TabsTrigger>
              <TabsTrigger value="sms" className="gap-1.5 text-xs sm:text-sm">
                <MessageSquare className="h-4 w-4" aria-hidden />
                SMS
              </TabsTrigger>
              <TabsTrigger value="call" className="gap-1.5 text-xs sm:text-sm">
                <Phone className="h-4 w-4" aria-hidden />
                Call
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sim-phone">Sim phone (E.164)</Label>
                <Input
                  id="sim-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ward / cell tower</Label>
                <Select value={ward} onValueChange={setWard}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WARDS.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={lang} onValueChange={(v) => setLang(v as "en" | "sw")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sw">Swahili</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="ussd" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Keys append to the USSD path (like Africa&apos;s Talking). Fresh session loads the
                language menu. Try <code className="rounded bg-muted px-1">1</code> then menu
                options.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void resetUssd()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  New USSD session
                </Button>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>1 — Risk check · 2 — Evacuation · 3 — Report · 4 — Voucher</li>
                <li>5 — Cash · 6 — Readiness · 7 — Recovery interest · 9 — Emergency/SOS</li>
              </ul>
            </TabsContent>

            <TabsContent value="sms" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Preview uses live engine risk. Green call button sends a demo SMS via the engine
                (live AT when configured, otherwise demo mode).
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadSmsPreview()}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Refresh preview
              </Button>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                {smsPreview || "…"}
              </div>
              <Button type="button" size="sm" onClick={() => void sendSms()}>
                <Send className="mr-1.5 h-4 w-4" />
                Send SMS to sim number
              </Button>
            </TabsContent>

            <TabsContent value="call" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Simulates inbound helpline IVR. Press green to connect, then keypad digits:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>1 — Live risk · 2 — What to do · 3 — River report</li>
                <li>
                  <strong className="text-foreground">4 — Ask ALMA</strong> (bounded Q&A, max 4
                  turns)
                </li>
                <li>5 — Repeat menu</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void startCall()}>
                  Start call
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void endCall()}>
                  End call
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void voiceRequest({ digit: "4" })}
                  disabled={!callActive}
                >
                  Jump to Q&A (4)
                </Button>
              </div>
              {voiceState?.qa_meta ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <p>
                    <span className="font-bold">Q:</span> {voiceState.qa_meta.question}
                  </p>
                  <p className="mt-1">
                    <span className="font-bold">A:</span> {voiceState.qa_meta.answer}
                  </p>
                  <p className="mt-1 text-muted-foreground">via {voiceState.qa_meta.reason}</p>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
