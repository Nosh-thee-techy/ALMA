import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { engineBaseUrl } from "@/lib/alma-engine";
import type { FarmerLang } from "@/lib/farmer-locale";

export function useAlmaVoice(phone: string | undefined, lang: FarmerLang) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastReply, setLastReply] = useState("");

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  const play = useCallback(
    (url: string | null | undefined, text: string) => {
      setLastReply(text);
      if (!url) {
        toast.message("Alma’s voice is offline — read her words on screen.");
        return;
      }
      stop();
      const a = new Audio(url);
      audioRef.current = a;
      setSpeaking(true);
      a.onended = () => setSpeaking(false);
      a.onerror = () => setSpeaking(false);
      void a.play().catch(() => {
        setSpeaking(false);
        toast.message("Tap Play Alma if the browser blocked sound.");
      });
    },
    [stop],
  );

  const speak = useCallback(
    async (topic: string, taskId?: string) => {
      if (!phone || busy) return;
      setBusy(true);
      try {
        const res = await fetch(`${engineBaseUrl()}/api/farmer/alma-speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            topic,
            task_id: taskId,
            lang,
            include_audio: true,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          reply?: string;
          audio_url?: string | null;
        };
        const reply = json.reply || "Alma could not reach the engine.";
        play(json.audio_url, reply);
        return reply;
      } catch {
        toast.error("Engine offline — start npm run engine.");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [phone, lang, busy, play],
  );

  return { speak, play, stop, speaking, busy, lastReply };
}
