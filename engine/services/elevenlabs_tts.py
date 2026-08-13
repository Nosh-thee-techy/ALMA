"""ElevenLabs TTS — Alma desk playback + Africa's Talking Voice <Play>."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

# Root .env holds the secret; engine/.env is Gemma/coords. Safe to load here so
# Alma still speaks if this module is imported before main.py.
_ENGINE_DIR = Path(__file__).resolve().parent.parent
_ROOT_DIR = _ENGINE_DIR.parent
load_dotenv(_ENGINE_DIR / ".env")
load_dotenv(_ROOT_DIR / ".env", override=True)

AUDIO_DIR = _ENGINE_DIR / "data" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def _api_key() -> str:
    return (os.getenv("ELEVENLABS_API_KEY") or "").strip().strip('"').strip("'")


def _voice_id() -> str:
    return (os.getenv("ELEVENLABS_VOICE_ID") or "EXAVITQu4vr4xnSDxMaL").strip()


def _api_base() -> str:
    return (os.getenv("ELEVENLABS_BASE_URL") or "https://api.elevenlabs.io/v1").rstrip("/")


def _model_id() -> str:
    return (os.getenv("ELEVENLABS_MODEL_ID") or "eleven_multilingual_v2").strip()


def _engine_base() -> str:
    return (os.getenv("ALMA_ENGINE_URL") or "http://127.0.0.1:8787").rstrip("/")


def _public_base() -> str:
    return (os.getenv("PUBLIC_BASE_URL") or _engine_base()).rstrip("/")


def desk_audio_url(audio: dict[str, Any]) -> str | None:
    """Browser Alma should play from the local engine, not a stale ngrok host."""
    if not audio.get("ok"):
        return None
    return audio.get("desk_url") or audio.get("url")


def health() -> dict[str, Any]:
    """Quick auth probe — avoids a full TTS synthesis round-trip."""
    key = _api_key()
    out: dict[str, Any] = {
        "configured": bool(key),
        "ok": False,
        "mode": "demo",
        "voice_id": _voice_id(),
        "model_id": _model_id(),
        "public_base_url": _public_base(),
        "engine_base_url": _engine_base(),
        "note": None,
    }
    if not key:
        out["note"] = "ELEVENLABS_API_KEY missing — Voice uses <Say> instead of <Play>"
        return out
    if not key.startswith("sk_") and len(key) < 40:
        out["note"] = (
            "ElevenLabs key looks like a key ID — paste the sk_... secret from the dashboard"
        )
    try:
        with httpx.Client(timeout=8.0) as client:
            res = client.get(
                f"{_api_base()}/user",
                headers={"xi-api-key": key},
            )
        if res.status_code == 200:
            out["ok"] = True
            out["mode"] = "live"
            out["note"] = "ElevenLabs ready — Alma and farmer voice use <Play> MP3"
            return out
        body = res.text[:400]
        out["mode"] = "error"
        out["status"] = res.status_code
        if "api_key_id_used_as_api_key" in body or "invalid_api_key" in body:
            out["note"] = (
                "Invalid ElevenLabs key — paste the sk_... secret from the dashboard, not the key ID"
            )
        else:
            out["note"] = body or f"ElevenLabs HTTP {res.status_code}"
        return out
    except Exception as exc:
        out["mode"] = "error"
        out["note"] = str(exc)
        return out


def synthesize(text: str, *, voice_id: str | None = None) -> dict[str, Any]:
    """
    Generate MP3 via ElevenLabs.
    `url` is the public host for Africa's Talking <Play>.
    `desk_url` is the local engine host for Alma in the browser.
    """
    text = (text or "").strip()
    if not text:
        return {"ok": False, "error": "empty_text"}

    key = _api_key()
    if not key:
        return {
            "ok": False,
            "mode": "demo",
            "note": "ELEVENLABS_API_KEY missing — Voice will use <Say> TTS instead of <Play>",
        }

    vid = voice_id or _voice_id()
    digest = hashlib.sha256(f"{vid}:{text}".encode("utf-8")).hexdigest()[:20]
    filename = f"alma_{digest}.mp3"
    path = AUDIO_DIR / filename

    if not path.exists():
        url = f"{_api_base()}/text-to-speech/{vid}"
        try:
            with httpx.Client(timeout=18.0) as client:
                res = client.post(
                    url,
                    headers={
                        "xi-api-key": key,
                        "Accept": "audio/mpeg",
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": _model_id(),
                    },
                )
            if res.status_code >= 400:
                body = res.text[:300]
                note = body
                if "api_key_id_used_as_api_key" in body or "invalid_api_key" in body:
                    note = (
                        "Invalid ElevenLabs key — paste the sk_... secret from the dashboard, not the key ID"
                    )
                return {
                    "ok": False,
                    "mode": "error",
                    "status": res.status_code,
                    "body": body,
                    "note": note,
                }
            path.write_bytes(res.content)
        except Exception as exc:
            return {"ok": False, "mode": "error", "error": str(exc)}

    public_url = f"{_public_base()}/media/audio/{filename}"
    local_url = f"{_engine_base()}/media/audio/{filename}"
    return {
        "ok": True,
        "mode": "live",
        "path": str(path),
        "url": public_url,
        "desk_url": local_url,
        "voice_id": vid,
    }
