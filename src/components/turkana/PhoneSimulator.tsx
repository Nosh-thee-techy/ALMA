import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Phone, RefreshCw, Send, Siren, Waves } from "lucide-react";
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
  sendInboundSms,
  sendSimSms,
  simUssd,
  simVoice,
  type VoiceSimResult,
} from "@/lib/phone-simulator";
import { smsShortcode } from "@/lib/sms-shortcode";
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
  const [mode, setMode] = useState<Mode>("sms");
  const [phone, setPhone] = useState("+254700000001");
  const [ward, setWard] = useState("kalokol");
  const [lang, setLang] = useState<"en" | "sw">("sw");
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const shortcode = smsShortcode;

  // USSD
  const [ussdSession, setUssdSession] = useState<string | undefined>();
  const [ussdPath, setUssdPath] = useState("");
  const [ussdScreen, setUssdScreen] = useState(`Dial ${ussdDialCode}`);
  const [ussdEnded, setUssdEnded] = useState(false);

  // SMS
  const [smsDraft, setSmsDraft] = useState("SOS");
  const [smsPreview, setSmsPreview] = useState("");
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
      const res = await simUssd({
        phone,
        text: "",
        reset: true,
        sessionId: ussdSession,
        serviceCode: ussdDialCode,
      });
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
      const res = await simUssd({
        sessionId: ussdSession,
        phone,
        text: nextPath,
        serviceCode: ussdDialCode,
      });
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

  async function textShortcode(text: string) {
    const body = text.trim();
    if (!body) return;
    setSmsLog((prev) => [...prev, { dir: "out", text: `To ${shortcode}: ${body}` }]);
    try {
      const res = await sendInboundSms({ phone, text: body, to: shortcode });
      const handled = res.result;
      const confirm =
        handled?.confirm_message ||
        (handled?.handled === "sos"
          ? "ALMA: Help request received. Responders notified."
          : handled?.handled === "logged"
            ? "Received (logged)"
            : JSON.stringify(handled).slice(0, 160));
      setSmsLog((prev) => [...prev, { dir: "in", text: `From ${shortcode}: ${confirm}` }]);
      const wa = handled?.notify?.[0]?.wa;
      if (handled?.handled === "sos") {
        toast.success(`SOS → shortcode ${shortcode}`, {
          description:
            wa?.mode === "live"
              ? "WhatsApp responder notified"
              : wa
                ? `WhatsApp ${wa.mode}/${wa.status ?? ""}`
                : "Queued on desk",
        });
      } else {
        toast.message(`SMS to ${shortcode}`, { description: String(confirm).slice(0, 80) });
      }
      setSmsDraft("");
    } catch (e) {
      toast.error("Inbound SMS failed", { description: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function sendOutboundAlert() {
    try {
      const res = await sendSimSms({
        phone,
        lang,
        region_id: ward === "omorate" ? "omo" : "turkana",
      });
      setSmsLog((prev) => [
        ...prev,
        { dir: "in", text: `From ${res.shortcode || shortcode}: ${res.preview.message}` },
        {
          dir: "out",
          text:
            res.sms?.mode === "live"
              ? "Delivered (live AT)"
              : res.sms?.mode === "demo"
                ? "Simulated — check engine logs"
                : "Dispatch attempted",
        },
      ]);
      toast.success(res.sms?.mode === "live" ? "Alert SMS sent" : "Alert SMS simulated");
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
    mode === "ussd"
      ? ussdDialCode
      : mode === "sms"
        ? `SMS ${shortcode}`
        : callActive
          ? "ALMA Call"
          : "Voice";

  const phoneSubtitle =
    mode === "ussd"
      ? ussdEnded
        ? "Session ended"
        : ussdPath
          ? `Input: ${ussdPath}`
          : "Press a key"
      : mode === "sms"
        ? `Shortcode ${shortcode} · tier ${smsTier}`
        : callActive
          ? `Turn ${turnCount}/4 · server-side Gemma`
          : "Helpline";

  const screenContent =
    mode === "ussd" ? (
      ussdScreen
    ) : mode === "sms" ? (
      <div className="space-y-2">
        {smsLog.length === 0 ? (
          <p className="text-lime-200/80">
            {smsPreview || `Text SOS to ${shortcode}…`}
          </p>
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
    ) : mode === "sms" ? (
      <p className="text-[9px] text-lime-300/80">Green = send draft to {shortcode}</p>
    ) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">One-screen demo</p>
          <h1 className="text-2xl font-bold tracking-tight">Feature phone</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Africa&apos;s Talking shortcode <strong className="text-foreground">{shortcode}</strong>{" "}
            for SMS · USSD <strong className="text-foreground">{ussdDialCode}</strong>. Stay on this
            page for the whole last-mile demo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs font-bold">
            SMS {shortcode}
          </span>
          <span className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs font-bold">
            {ussdDialCode}
          </span>
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
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
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
            else void textShortcode(smsDraft || "SOS");
          }}
          onEnd={() => {
            if (mode === "call") void endCall();
            else if (mode === "ussd") void resetUssd();
            else setSmsLog([]);
          }}
        />

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sms" className="gap-1.5 text-xs sm:text-sm">
                <MessageSquare className="h-4 w-4" aria-hidden />
                SMS {shortcode}
              </TabsTrigger>
              <TabsTrigger value="ussd" className="gap-1.5 text-xs sm:text-sm">
                <Waves className="h-4 w-4" aria-hidden />
                USSD
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

            <TabsContent value="sms" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Farmer texts Africa&apos;s Talking shortcode{" "}
                <strong className="text-foreground">{shortcode}</strong>. SOS notifies WhatsApp
                responders and confirms by SMS.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void textShortcode("SOS")}>
                  <Siren className="mr-1.5 h-4 w-4" />
                  Text SOS → {shortcode}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void textShortcode("HELP")}
                >
                  Text HELP
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void textShortcode("MSAADA")}
                >
                  Text MSAADA
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={smsDraft}
                  onChange={(e) => setSmsDraft(e.target.value)}
                  placeholder={`Message to ${shortcode}`}
                  className="font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void textShortcode(smsDraft);
                  }}
                />
                <Button type="button" size="sm" onClick={() => void textShortcode(smsDraft)}>
                  <Send className="mr-1.5 h-4 w-4" />
                  Send to {shortcode}
                </Button>
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-bold text-muted-foreground">Desk → farmer alert</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadSmsPreview()}
                  >
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    Refresh preview
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void sendOutboundAlert()}>
                    Send alert from {shortcode}
                  </Button>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  {smsPreview || "…"}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ussd" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Dial <code className="rounded bg-muted px-1">{ussdDialCode}</code> (channel{" "}
                {shortcode}). Keys append like a real AT session.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void resetUssd()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  New USSD session
                </Button>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>1 — Risk check · 2 — Evacuation · 3 — Report · 4 — Voucher</li>
                <li>5 — Cash · 6 — Readiness · 7 — Recovery interest · 9 — Emergency/SOS</li>
              </ul>
            </TabsContent>

            <TabsContent value="call" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Simulates inbound helpline IVR. Press green to connect, then keypad digits.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
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
              </div>
              {voiceState?.qa_meta ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <p>
                    <span className="font-bold">Q:</span> {voiceState.qa_meta.question}
                  </p>
                  <p className="mt-1">
                    <span className="font-bold">A:</span> {voiceState.qa_meta.answer}
                  </p>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
