"""Featherless (OpenAI-compatible) cloud LLM — fast fallback when local Ollama is slow."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY", "")
FEATHERLESS_BASE_URL = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1").rstrip("/")
FEATHERLESS_MODEL = os.getenv("FEATHERLESS_MODEL", "Qwen/Qwen2.5-7B-Instruct")


def available() -> bool:
    return bool(FEATHERLESS_API_KEY)


def _chat(system: str, user: str, *, timeout: float, temperature: float = 0.2) -> str | None:
    if not FEATHERLESS_API_KEY:
        return None
    try:
        with httpx.Client(timeout=timeout) as client:
            res = client.post(
                f"{FEATHERLESS_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {FEATHERLESS_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://alma-turkana.local",
                    "X-Title": "ALMA Early Action",
                },
                json={
                    "model": FEATHERLESS_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": temperature,
                },
            )
        if res.status_code >= 400:
            return None
        return (res.json()["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        return None


def chat_json(system: str, user: str, *, timeout: float = 25.0) -> dict[str, Any] | None:
    content = _chat(system, user, timeout=timeout, temperature=0.2)
    if content is None:
        return None
    try:
        return {"ok": True, "data": json.loads(content), "raw": content, "provider": "featherless"}
    except json.JSONDecodeError:
        return {"ok": True, "data": None, "raw": content, "provider": "featherless"}


def chat_text(system: str, user: str, *, timeout: float = 3.0) -> str | None:
    """Plain-text reply for USSD (keep timeout short — AT waits ~15–20s)."""
    return _chat(system, user, timeout=timeout, temperature=0.3)


def health() -> dict[str, Any]:
    return {
        "configured": available(),
        "base_url": FEATHERLESS_BASE_URL,
        "model": FEATHERLESS_MODEL,
    }
