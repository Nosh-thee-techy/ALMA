import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { engineBaseUrl } from "@/lib/alma-engine";
import { farmerCopy, type FarmerLang } from "@/lib/farmer-locale";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "alma"; text: string; audio_url?: string | null };

const STT_LANG: Record<FarmerLang, string> = {
  en: "en-KE",
  sw: "sw-KE",
  trk: "sw-KE",
  orm: "om-ET",
  am: "am-ET",
};

export function FarmerAlmaChat({
  seedPrompt,
  phone,
  lang,
  onSpeaking,
}: {
  seedPrompt?: string;
  phone?: string;
  lang: FarmerLang;
  onSpeaking?: (v: boolean) => void;
}) {
  const copy = farmerCopy(lang);
  const [input, setInput] = useState("");
  const [showType, setShowType] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (seedPrompt) void sendChat(seedPrompt);
    else if (phone) void speakTopic("home");
    else {
      setMessages([
        {
          role: "alma",
          text: copy.speakHint,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt, phone]);

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    onSpeaking?.(false);
  }

  function playAudio(url: string | null | undefined) {
    if (!url) return;
    stopAudio();
    const a = new Audio(url);
    audioRef.current = a;
    onSpeaking?.(true);
    a.onended = () => onSpeaking?.(false);
    a.onerror = () => onSpeaking?.(false);
    void a.play().catch(() => {
      onSpeaking?.(false);
      toast.message("Tap play if Alma’s voice is blocked.");
    });
  }

  async function speakTopic(topic: string, taskId?: string) {
    if (!phone || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${engineBaseUrl()}/api/farmer/alma-speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, topic, task_id: taskId, lang, include_audio: true }),
      });
      const json = (await res.json()) as { reply?: string; audio_url?: string | null };
      const reply = json.reply || "Alma could not reach the basin just now.";
      setMessages((m) => [...m, { role: "alma", text: reply, audio_url: json.audio_url }]);
      playAudio(json.audio_url);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "alma", text: "Engine is offline. Dial *384*96428# then 7." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(text: string) {
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
          mode: "readiness",
          phone: phone || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Engine ${res.status}`);
      const json = (await res.json()) as { reply?: string; audio_url?: string | null };
      const reply = json.reply || "I could not reach the live basin just now.";
      setMessages((m) => [...m, { role: "alma", text: reply, audio_url: json.audio_url }]);
      playAudio(json.audio_url);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "alma", text: "Engine is offline. Dial *384*96428# then 7." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition })
        .webkitSpeechRecognition;
    if (!SR) {
      toast.message(copy.speakHint);
      setShowType(true);
      return;
    }
    const rec = new SR();
    rec.lang = STT_LANG[lang] || "en-KE";
    rec.interimResults = false;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const said = ev.results[0]?.[0]?.transcript || "";
      if (said) void sendChat(said);
    };
    rec.onerror = () => {
      toast.message(copy.speakHint);
      setShowType(true);
    };
    rec.start();
  }

  const chips = [
    { topic: "assets", label: copy.myCrops },
    { topic: "climate", label: copy.climateHere },
    { topic: "gap", label: copy.youShould },
    { topic: "task", label: copy.stillTodo },
  ];

  return (
    <div className="-mx-4 -mb-4 flex min-h-[calc(100%-0.5rem)] flex-col">
      <p className="px-4 pb-2 text-sm leading-relaxed text-foreground/80">{copy.speakHint}</p>
      <div className="flex flex-wrap gap-1 px-4 pb-2">
        {chips.map((chip) => (
          <button
            key={chip.topic}
            type="button"
            disabled={busy}
            onClick={() => void speakTopic(chip.topic)}
            className="min-h-9 rounded-md bg-dust px-3 text-xs font-bold"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={cn(
              "max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed",
              m.role === "alma" ? "bg-dust" : "ml-auto bg-primary text-primary-foreground",
            )}
          >
            {m.text}
            {m.role === "alma" && m.audio_url ? (
              <button
                type="button"
                className="mt-1 block text-xs font-bold text-primary"
                onClick={() => playAudio(m.audio_url)}
              >
                {copy.playVoice}
              </button>
            ) : null}
          </div>
        ))}
        {busy ? (
          <p className="flex items-center gap-2 text-xs font-bold text-act">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {copy.almaListening}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border px-3 py-3">
        <button
          type="button"
          onClick={startVoice}
          disabled={busy}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-act font-bold text-act-foreground disabled:opacity-60"
        >
          <Mic className="h-7 w-7" aria-hidden />
          {copy.talkAlma}
        </button>
        <button
          type="button"
          className="mt-2 w-full text-center text-sm font-bold text-primary"
          onClick={() => setShowType((v) => !v)}
        >
          {copy.typeInstead}
        </button>
        {showType ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={copy.typeInstead}
              className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
              disabled={busy}
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 bg-act text-act-foreground hover:bg-act/90"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

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
