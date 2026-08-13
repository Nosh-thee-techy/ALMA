/**
 * AlmaAgentDock — global floating Alma toggle + full-screen talk surface.
 * Left: Alma portrait with speak vibes. Right: text chat / speak.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Phone, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ALMA_EXPLAIN_EVENT,
  ALMA_OPEN_EVENT,
  askAlmaExplain,
  openAlmaAgent,
} from "@/lib/alma-agent-events";
import { engineBaseUrl } from "@/lib/alma-engine";
import { cn } from "@/lib/utils";

export { askAlmaExplain, openAlmaAgent };

type ChatMsg = {
  role: "user" | "alma";
  text: string;
  audio_url?: string | null;
};

type AlmaChatRes = {
  ok?: boolean;
  reply?: string;
  audio_url?: string | null;
  tts_note?: string | null;
  lang?: string;
  source?: string;
};

export function AlmaAgentDock() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"en" | "sw">("en");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "alma",
      text:
        "Hello — I'm Alma. Ask me about rain, the dam, or what to do next. Habari — sema Kiswahili nikujibu.",
    },
  ]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const detail = (e as CustomEvent).detail as { prompt?: string; mode?: string } | undefined;
      if (detail?.prompt) {
        void sendMessage(detail.prompt, detail.mode === "explain" ? "explain" : detail.mode === "readiness" ? "readiness" : "desk");
      }
    };
    const onExplain = (e: Event) => {
      setOpen(true);
      const langPref = ((e as CustomEvent).detail?.lang as "en" | "sw") || "en";
      setLang(langPref);
      void explainDashboard(langPref);
    };
    window.addEventListener(ALMA_OPEN_EVENT, onOpen);
    window.addEventListener(ALMA_EXPLAIN_EVENT, onExplain);
    return () => {
      window.removeEventListener(ALMA_OPEN_EVENT, onOpen);
      window.removeEventListener(ALMA_EXPLAIN_EVENT, onExplain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }

  function playAudio(url: string | null | undefined) {
    if (!url) return;
    stopAudio();
    const a = new Audio(url);
    audioRef.current = a;
    setSpeaking(true);
    a.onended = () => setSpeaking(false);
    a.onerror = () => setSpeaking(false);
    void a.play().catch(() => {
      setSpeaking(false);
      toast.message("Alma’s voice is ready — tap play if autoplay is blocked.");
    });
  }

  async function sendMessage(text: string, mode: "desk" | "explain" | "phone" | "readiness" = "desk") {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/alma-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          message: trimmed,
          lang,
          include_audio: true,
          mode,
        }),
      });
      if (!res.ok) throw new Error(`Engine ${res.status}`);
      const json = (await res.json()) as AlmaChatRes;
      const reply = json.reply || "I could not reach the live desk just now.";
      setMessages((m) => [...m, { role: "alma", text: reply, audio_url: json.audio_url }]);
      playAudio(json.audio_url);
    } catch (e) {
      toast.error("Alma could not reply", {
        description: e instanceof Error ? e.message : "Engine unreachable",
      });
      setMessages((m) => [
        ...m,
        {
          role: "alma",
          text: "I'm Alma — the engine is offline, so I cannot read live risk right now. Start npm run engine and try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function explainDashboard(langPref: "en" | "sw" = lang) {
    setBusy(true);
    const userLine =
      langPref === "sw"
        ? "Eleza dashibodi yangu kwa maneno rahisi."
        : "Explain my dashboard analytics in plain words.";
    setMessages((m) => [...m, { role: "user", text: userLine }]);
    try {
      const res = await fetch(
        `${engineBaseUrl()}/api/dashboard/alma-explain?lang=${langPref}&include_audio=true`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`Engine ${res.status}`);
      const json = (await res.json()) as AlmaChatRes;
      const reply = json.reply || "I could not explain the desk right now.";
      setMessages((m) => [...m, { role: "alma", text: reply, audio_url: json.audio_url }]);
      playAudio(json.audio_url);
    } catch (e) {
      toast.error("Alma explain failed", {
        description: e instanceof Error ? e.message : "Engine unreachable",
      });
    } finally {
      setBusy(false);
    }
  }

  function startVoiceInput() {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition })
        .webkitSpeechRecognition;
    if (!SR) {
      toast.message("Voice input needs Chrome/Edge speech recognition — type to Alma instead.");
      return;
    }
    const rec = new SR();
    rec.lang = lang === "sw" ? "sw-KE" : "en-KE";
    rec.interimResults = false;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const said = ev.results[0]?.[0]?.transcript || "";
      if (said) void sendMessage(said, "phone");
    };
    rec.onerror = () => toast.error("Could not hear you — try typing.");
    rec.start();
    toast.message(lang === "sw" ? "Sikiliza… sema sasa." : "Listening… speak to Alma.");
  }

  return (
    <>
      {/* Floating Alma orb — every page */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center overflow-hidden rounded-full",
          "border-2 border-primary/40 bg-card shadow-lg transition-transform hover:scale-105",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          speaking && "alma-speak-ring",
        )}
        aria-label="Open Alma voice agent"
        title="Talk to Alma"
      >
        <img
          src="/alma-agent-portrait.png"
          alt=""
          className="h-full w-full object-cover object-top"
        />
      </button>

      {/* Magical full surface */}
      <div
        className={cn(
          "fixed inset-0 z-[70] transition-[opacity,transform] duration-300 ease-out",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none translate-y-4 opacity-0",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Alma voice agent"
        hidden={!open}
      >
        <button
          type="button"
          className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
          aria-label="Close Alma"
          onClick={() => {
            stopAudio();
            setOpen(false);
          }}
        />

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 top-8 mx-auto flex max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:inset-y-6 sm:inset-x-6 sm:rounded-2xl",
            "md:flex-row",
            open && "animate-in fade-in slide-in-from-bottom-4 duration-300",
          )}
        >
          {/* Left — Alma fills */}
          <div className="relative flex min-h-[42vh] flex-col items-center justify-end bg-black md:min-h-0 md:w-[46%] md:justify-center">
            <img
              src="/alma-agent-portrait.png"
              alt="Alma, Early Action voice agent"
              className={cn(
                "h-full w-full object-cover object-top transition-transform duration-500",
                speaking && "scale-[1.02]",
              )}
            />
            {/* Speak vibes */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0",
                speaking ? "alma-vibe-overlay" : "opacity-0",
              )}
              aria-hidden
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-5 pb-5 pt-16">
              <p className="text-xs font-bold uppercase tracking-wide text-white/70">
                Voice agent
              </p>
              <h2 className="text-2xl font-bold text-white">Alma</h2>
              <p className="mt-1 max-w-sm text-sm text-white/85">
                ElevenLabs voice · Featherless + Gemma understand the live desk · EN & Kiswahili
              </p>
              {speaking ? (
                <div className="alma-bars mt-3" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>
          </div>

          {/* Right — talk */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-bold">Talk with Alma</p>
                <p className="text-xs text-muted-foreground">
                  Text or speak — she answers from live rain + dam risk.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as "en" | "sw")}
                  className="h-9 rounded-md border border-border bg-background px-2 text-xs font-bold"
                  aria-label="Language"
                >
                  <option value="en">English</option>
                  <option value="sw">Kiswahili</option>
                </select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    stopAudio();
                    setOpen(false);
                  }}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={cn(
                    "max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "alma"
                      ? "bg-dust text-foreground"
                      : "ml-auto bg-primary text-primary-foreground",
                  )}
                >
                  {m.role === "alma" ? (
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Alma
                    </p>
                  ) : null}
                  {m.text}
                  {m.role === "alma" && m.audio_url ? (
                    <button
                      type="button"
                      className="mt-2 block text-xs font-bold text-primary underline-offset-2 hover:underline"
                      onClick={() => playAudio(m.audio_url)}
                    >
                      Play voice again
                    </button>
                  ) : null}
                </div>
              ))}
              {busy ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Alma is thinking…
                </p>
              ) : null}
            </div>

            <div className="space-y-2 border-t border-border px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="font-bold"
                  disabled={busy}
                  onClick={() => void explainDashboard()}
                >
                  Explain dashboard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="font-bold"
                  disabled={busy}
                  onClick={() =>
                    void sendMessage(
                      lang === "sw" ? "Habari Alma" : "Hello Alma",
                      "phone",
                    )
                  }
                >
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Say hello
                </Button>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage(input);
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    lang === "sw" ? "Andika ujumbe kwa Alma…" : "Type to Alma…"
                  }
                  className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                  disabled={busy}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-11 w-11 shrink-0"
                  onClick={startVoiceInput}
                  disabled={busy}
                  aria-label="Speak to Alma"
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 shrink-0 bg-act text-act-foreground hover:bg-act/90"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
              <p className="text-[11px] text-muted-foreground">
                Phone calls via Africa&apos;s Talking still reach Alma on the voice line — say
                hello and she answers from the same brain.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Minimal Web Speech typings (browser-only)
type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};
type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
