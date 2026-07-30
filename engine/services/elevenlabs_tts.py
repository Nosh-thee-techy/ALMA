"""ElevenLabs TTS — mother-tongue / Swahili audio for AT Voice <Play>."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any

import httpx

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
ELEVENLABS_BASE_URL = os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1").rstrip("/")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8787").rstrip("/")

AUDIO_DIR = Path(__file__).resolve().parent.parent / "data" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def synthesize(text: str, *, voice_id: str | None = None) -> dict[str, Any]:
    """
    Generate MP3 via ElevenLabs; return a public URL for Africa's Talking <Play>.
    Falls back to demo (no URL) if key missing.
    """
    text = (text or "").strip()
    if not text:
        return {"ok": False, "error": "empty_text"}

    if not ELEVENLABS_API_KEY:
        return {
            "ok": False,
            "mode": "demo",
            "note": "ELEVENLABS_API_KEY missing — Voice will use <Say> TTS instead of <Play>",
        }

    vid = voice_id or ELEVENLABS_VOICE_ID
    digest = hashlib.sha256(f"{vid}:{text}".encode("utf-8")).hexdigest()[:20]
    filename = f"alma_{digest}.mp3"
    path = AUDIO_DIR / filename

    if not path.exists():
        url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{vid}"
        try:
            with httpx.Client(timeout=60.0) as client:
                res = client.post(
                    url,
                    headers={
                        "xi-api-key": ELEVENLABS_API_KEY,
                        "Accept": "audio/mpeg",
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
                    },
                )
            if res.status_code >= 400:
                return {
                    "ok": False,
                    "mode": "error",
                    "status": res.status_code,
                    "body": res.text[:300],
                }
            path.write_bytes(res.content)
        except Exception as exc:
            return {"ok": False, "mode": "error", "error": str(exc)}

    public_url = f"{PUBLIC_BASE_URL}/media/audio/{filename}"
    return {
        "ok": True,
        "mode": "live",
        "path": str(path),
        "url": public_url,
        "voice_id": vid,
    }
