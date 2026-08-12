"""
Speech-to-text for AT Voice recordings.

Provider: OpenAI Whisper API (whisper-1) — strong English + Swahili support.
Set OPENAI_API_KEY in .env. Use ALMA_STT_PROVIDER=demo for offline dev without a key.

Transcription confidence matters — if the provider returns a low-confidence score,
callers should get the scripted fallback (voice_conversation.safe_guidance_reply),
not an uncertain Gemma answer on a live call.
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any

import httpx

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
STT_PROVIDER = os.getenv("ALMA_STT_PROVIDER", "openai").strip().lower()
WHISPER_MODEL = os.getenv("ALMA_WHISPER_MODEL", "whisper-1")
# avg_logprob below this → treat as low confidence (Whisper verbose_json segments)
LOGPROB_CONFIDENCE_FLOOR = float(os.getenv("ALMA_STT_LOGPROB_FLOOR", "-0.85"))
MIN_TEXT_LEN = 2


def _logprob_to_confidence(avg_logprob: float | None) -> float:
    """Map Whisper segment avg_logprob (~[-1, 0]) to 0–1 confidence."""
    if avg_logprob is None:
        return 0.0
    # exp(logprob) is a rough token-level probability; clamp for IVR decisions
    return max(0.0, min(1.0, math.exp(float(avg_logprob))))


def _aggregate_confidence(segments: list[dict[str, Any]] | None) -> float:
    if not segments:
        return 0.0
    logprobs = [s.get("avg_logprob") for s in segments if s.get("avg_logprob") is not None]
    if not logprobs:
        return 0.0
    mean_lp = sum(float(x) for x in logprobs) / len(logprobs)
    return _logprob_to_confidence(mean_lp)


def is_low_confidence(result: dict[str, Any]) -> bool:
    """
    Low-confidence transcriptions must NOT be passed to Gemma as if certain.
    Triggers Task 5 fallback (replay known-good scripted guidance).
    """
    if not result.get("ok"):
        return True
    text = (result.get("text") or "").strip()
    if len(text) < MIN_TEXT_LEN:
        return True
    conf = float(result.get("confidence") or 0.0)
    avg_lp = result.get("avg_logprob")
    if avg_lp is not None and float(avg_lp) < LOGPROB_CONFIDENCE_FLOOR:
        return True
    return conf < 0.35


def _download_audio(url: str, *, timeout: float = 30.0) -> bytes | None:
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            res = client.get(url)
            if res.status_code >= 400:
                return None
            return res.content
    except Exception:
        return None


def transcribe_bytes(
    audio: bytes,
    *,
    lang_hint: str = "en",
    filename: str = "recording.wav",
) -> dict[str, Any]:
    """Transcribe raw audio bytes. Returns text + confidence metadata."""
    if STT_PROVIDER == "demo":
        demo_text = os.getenv(
            "ALMA_STT_DEMO_TEXT",
            "Je, nifanye nini kuhusu mafuriko?",
        )
        return {
            "ok": True,
            "text": demo_text,
            "confidence": 0.95,
            "avg_logprob": -0.2,
            "provider": "demo",
            "low_confidence": False,
        }

    if not OPENAI_API_KEY:
        return {
            "ok": False,
            "text": "",
            "confidence": 0.0,
            "provider": "openai",
            "error": "OPENAI_API_KEY not set",
            "low_confidence": True,
        }

    lang = (lang_hint or "en")[:2]
    if lang not in ("en", "sw"):
        lang = "en"

    try:
        with httpx.Client(timeout=45.0) as client:
            res = client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                files={"file": (filename, audio, "application/octet-stream")},
                data={
                    "model": WHISPER_MODEL,
                    "response_format": "verbose_json",
                    "language": lang,
                },
            )
        if res.status_code >= 400:
            return {
                "ok": False,
                "text": "",
                "confidence": 0.0,
                "provider": "openai",
                "error": res.text[:300],
                "low_confidence": True,
            }
        data = res.json()
        text = (data.get("text") or "").strip()
        segments = data.get("segments") or []
        avg_lp = None
        if segments:
            lps = [s.get("avg_logprob") for s in segments if s.get("avg_logprob") is not None]
            if lps:
                avg_lp = sum(float(x) for x in lps) / len(lps)
        confidence = _aggregate_confidence(segments)
        out = {
            "ok": bool(text),
            "text": text,
            "confidence": round(confidence, 3),
            "avg_logprob": avg_lp,
            "provider": "openai",
            "language": data.get("language") or lang,
            "segments": len(segments),
        }
        out["low_confidence"] = is_low_confidence(out)
        return out
    except Exception as exc:
        return {
            "ok": False,
            "text": "",
            "confidence": 0.0,
            "provider": "openai",
            "error": str(exc)[:300],
            "low_confidence": True,
        }


def transcribe_url(url: str, *, lang_hint: str = "en") -> dict[str, Any]:
    """Download an AT Voice recording URL and transcribe it."""
    audio = _download_audio(url)
    if not audio:
        return {
            "ok": False,
            "text": "",
            "confidence": 0.0,
            "provider": STT_PROVIDER,
            "error": "failed_to_download_recording",
            "low_confidence": True,
        }
    ext = ".wav"
    lower = url.lower()
    if ".mp3" in lower:
        ext = ".mp3"
    elif ".ogg" in lower:
        ext = ".ogg"
    return transcribe_bytes(audio, lang_hint=lang_hint, filename=f"recording{ext}")


def transcribe_file(path: str | Path, *, lang_hint: str = "en") -> dict[str, Any]:
    """Local file helper for pre-live STT quality checks (English + Swahili samples)."""
    p = Path(path)
    if not p.is_file():
        return {
            "ok": False,
            "text": "",
            "confidence": 0.0,
            "provider": STT_PROVIDER,
            "error": "file_not_found",
            "low_confidence": True,
        }
    return transcribe_bytes(p.read_bytes(), lang_hint=lang_hint, filename=p.name)


def health() -> dict[str, Any]:
    return {
        "provider": STT_PROVIDER,
        "openai_configured": bool(OPENAI_API_KEY),
        "model": WHISPER_MODEL,
        "logprob_floor": LOGPROB_CONFIDENCE_FLOOR,
    }
