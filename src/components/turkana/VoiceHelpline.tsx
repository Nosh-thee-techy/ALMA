// Voice agent — quick spoken risk breakdown + farmer helpline controls.
import { useEffect, useState } from "react";
import { Headphones, Loader2, PhoneCall, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { engineBaseUrl } from "@/lib/alma-engine";
import { basinWards } from "@/lib/basin-geo";
import { cn } from "@/lib/utils";

type Brief = {
  ok: boolean;
  place?: string;
  tier?: string;
  text?: string;
  audio_url?: string | null;
  tts_mode?: string;
  tts_note?: string;
  rain_mm?: number;
};

type TtsHealth = {
  ok?: boolean;
  voice_ready?: boolean;
  elevenlabs?: { ok?: boolean; mode?: string; note?: string | null };
  featherless?: { configured?: boolean; model?: string };
};

export function VoiceHelpline({
  wardId = "kalokol",
  className,
}: {
  wardId?: string;
  className?: string;
}) {
  const [ward, setWard] = useState(wardId);
  const [lang, setLang] = useState<"en" | "sw">("en");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [ttsHealth, setTtsHealth] = useState<TtsHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${engineBaseUrl()}/api/dashboard/tts-health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setTtsHealth(json as TtsHealth);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function speakBreakdown() {
    setLoading(true);
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/voice-brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ward_id: ward, lang }),
      });
      if (!res.ok) throw new Error(`Engine ${res.status}`);
      const json = (await res.json()) as Brief;
      setBrief(json);
      if (json.audio_url) {
        audioEl?.pause();
        const a = new Audio(json.audio_url);
        setAudioEl(a);
        void a.play().catch(() => {
          toast.message("Audio ready — tap play if autoplay is blocked.");
        });
        toast.success("Voice agent briefing ready");
      } else {
        toast.message("Script ready", {
          description: json.tts_note || "ElevenLabs offline — reading text on desk.",
        });
      }
    } catch (e) {
      toast.error("Voice brief failed", {
        description: e instanceof Error ? e.message : "Engine unreachable",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Headphones className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold">Voice agent helpline</h2>
            <p className="text-xs text-muted-foreground">
              Breaks risk into a short spoken brief for officers — and the same script powers the
              farmer phone menu.
            </p>
            {ttsHealth && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    ttsHealth.elevenlabs?.ok
                      ? "bg-risk-safe-bg text-risk-safe-foreground"
                      : "bg-risk-watch-bg text-risk-watch-foreground",
                  )}
                  title={ttsHealth.elevenlabs?.note || undefined}
                >
                  ElevenLabs {ttsHealth.elevenlabs?.ok ? "live" : ttsHealth.elevenlabs?.mode || "off"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    ttsHealth.featherless?.configured
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  Featherless {ttsHealth.featherless?.configured ? "ready" : "off"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-3">
          <label className="block text-xs font-bold text-muted-foreground">
            Area
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium"
              value={ward}
              onChange={(e) => setWard(e.target.value)}
            >
              {basinWards.map((w) => (
                <option key={w.wardId} value={w.wardId}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            {(
              [
                ["en", "English"],
                ["sw", "Kiswahili"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={lang === id ? "default" : "outline"}
                onClick={() => setLang(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            className="w-full gap-2 bg-act font-bold text-act-foreground hover:bg-act/90"
            onClick={speakBreakdown}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
            {loading ? "Preparing brief…" : "Play quick breakdown"}
          </Button>
          {brief?.text && (
            <blockquote className="rounded-md border border-border bg-dust/60 p-3 text-sm leading-relaxed">
              “{brief.text}”
              <footer className="mt-2 text-xs text-muted-foreground">
                {brief.place} · {brief.tier} · TTS {brief.tts_mode || "—"}
              </footer>
            </blockquote>
          )}
          {brief?.audio_url && (
            <audio controls className="w-full" src={brief.audio_url} preload="none">
              <track kind="captions" />
            </audio>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <PhoneCall className="h-4 w-4 text-primary" aria-hidden />
            Farmer helpline
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Feature phones call the Africa&apos;s Talking voice number (callback{" "}
            <code className="text-foreground">/api/voice</code>). Same agent answers in plain
            language.
          </p>
          <ol className="mt-3 space-y-1.5 text-sm">
            <li>
              <strong className="tabular-nums">1</strong> — Live flood risk
            </li>
            <li>
              <strong className="tabular-nums">2</strong> — What to do now
            </li>
            <li>
              <strong className="tabular-nums">3</strong> — Leave a river report
            </li>
            <li>
              <strong className="tabular-nums">4</strong> — Repeat menu
            </li>
          </ol>
          <div className="mt-4 rounded-md bg-dust px-3 py-2">
            <p className="text-xs text-muted-foreground">No smartphone? USSD</p>
            <p className="text-lg font-bold tabular-nums">*384*96428#</p>
          </div>
        </div>
      </div>
    </div>
  );
}
