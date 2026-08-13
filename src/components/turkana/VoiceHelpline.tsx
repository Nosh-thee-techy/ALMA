// Alma — female Early Action voice agent for desk officers + farmer phone.
import { useEffect, useState } from "react";
import { Loader2, PhoneCall, Volume2 } from "lucide-react";
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
  agent?: string;
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
  autoBrief = true,
}: {
  wardId?: string;
  className?: string;
  /** When true, Alma greets organizers with a live brief as soon as the desk loads. */
  autoBrief?: boolean;
}) {
  const [ward, setWard] = useState(wardId);
  const [lang, setLang] = useState<"en" | "sw">("en");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [ttsHealth, setTtsHealth] = useState<TtsHealth | null>(null);
  const [speaking, setSpeaking] = useState(false);

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

  async function speakBreakdown(opts?: { silentToast?: boolean; includeAudio?: boolean }) {
    setLoading(true);
    try {
      const res = await fetch(`${engineBaseUrl()}/api/dashboard/voice-brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          ward_id: ward,
          lang,
          audience: "organizer",
          // Auto-load text only — ElevenLabs synthesis was blocking page feel.
          include_audio: opts?.includeAudio ?? true,
        }),
      });
      if (!res.ok) throw new Error(`Engine ${res.status}`);
      const json = (await res.json()) as Brief;
      setBrief(json);
      if (json.audio_url && (opts?.includeAudio ?? true)) {
        audioEl?.pause();
        const a = new Audio(json.audio_url);
        setAudioEl(a);
        setSpeaking(true);
        a.onended = () => setSpeaking(false);
        a.onpause = () => setSpeaking(false);
        void a.play().catch(() => {
          setSpeaking(false);
          if (!opts?.silentToast) {
            toast.message("Alma’s audio is ready — tap play if autoplay is blocked.");
          }
        });
        if (!opts?.silentToast) toast.success("Alma is briefing you");
      } else if (!opts?.silentToast) {
        toast.message("Alma’s script is ready", {
          description: json.tts_note || "Tap Ask Alma again with voice when you want audio.",
        });
      }
    } catch (e) {
      if (!opts?.silentToast) {
        toast.error("Alma could not brief you", {
          description: e instanceof Error ? e.message : "Engine unreachable",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  // Fast text brief on desk open — no TTS wait.
  useEffect(() => {
    if (!autoBrief) return;
    void speakBreakdown({ silentToast: true, includeAudio: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional first-load brief only
  }, [autoBrief]);

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <img
              src="/alma-agent-portrait.png"
              alt="Alma, ALMA Early Action voice agent"
              className={cn(
                "h-14 w-14 rounded-full object-cover shadow-sm ring-2 ring-primary/30",
                speaking && "ring-act ring-offset-2 ring-offset-card",
              )}
            />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card",
                speaking ? "bg-act animate-pulse" : "bg-risk-safe",
              )}
              aria-hidden
            />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
              Voice agent · Alma
            </p>
            <h2 className="text-sm font-bold">Meet Alma</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              Alma is your Early Action voice agent. She turns dam + rain risk into a short plain
              brief for organizers on this desk, and answers farmers on the phone helpline in the
              same calm voice.
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
                  Alma voice{" "}
                  {ttsHealth.elevenlabs?.ok ? "live" : ttsHealth.elevenlabs?.mode || "text-only"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    ttsHealth.featherless?.configured
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  Language assist {ttsHealth.featherless?.configured ? "ready" : "off"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alma’s outlook — who she helps */}
      <div className="grid gap-3 border-b border-border bg-dust/40 px-4 py-3 sm:grid-cols-2 sm:px-5">
        <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
            For organizers
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            On desk open, Alma briefs the selected ward: flood tier, upstream rain, dam pressure,
            and the next sector action — so you act before scrolling charts.
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">For farmers</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Same Alma answers feature phones via Africa&apos;s Talking voice and USSD{" "}
            <strong className="text-foreground">*384*96428#</strong> — live risk, what to do, river
            report.
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-3">
          <label className="block text-xs font-bold text-muted-foreground">
            Alma briefs this area
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
            onClick={() => void speakBreakdown({ includeAudio: true })}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
            {loading ? "Alma is preparing…" : "Ask Alma for a quick breakdown"}
          </Button>
          {brief?.text && (
            <blockquote className="rounded-md border border-border bg-dust/60 p-3 text-sm leading-relaxed">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                Alma says
              </p>
              “{brief.text}”
              <footer className="mt-2 text-xs text-muted-foreground">
                {brief.place} · {brief.tier} · {brief.tts_mode || "text"}
              </footer>
            </blockquote>
          )}
          {brief?.audio_url && (
            <audio
              controls
              className="w-full"
              src={brief.audio_url}
              preload="none"
              onPlay={() => setSpeaking(true)}
              onPause={() => setSpeaking(false)}
              onEnded={() => setSpeaking(false)}
            >
              <track kind="captions" />
            </audio>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <PhoneCall className="h-4 w-4 text-primary" aria-hidden />
            Alma on farmer helpline
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Feature phones call the Africa&apos;s Talking voice number (callback{" "}
            <code className="text-foreground">/api/voice</code>). Alma answers in plain language —
            the same agent as this desk brief.
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
            <p className="text-xs text-muted-foreground">No smartphone? Ask Alma on USSD</p>
            <p className="text-lg font-bold tabular-nums">*384*96428#</p>
          </div>
        </div>
      </div>
    </div>
  );
}
