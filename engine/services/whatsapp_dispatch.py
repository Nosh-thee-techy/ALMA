"""
WhatsApp dispatch — Meta / Africa's Talking / Twilio, then demo mode.
Priority in auto: Meta → Africa's Talking → Twilio → demo.
(Twilio is optional leftover — this project primary stack is Meta + AT.)
"""
from __future__ import annotations

import os
import re
from typing import Any

import httpx

from services import africastalking, twilio_dispatch


def _meta_config() -> tuple[str, str, str]:
    """Read Meta WhatsApp env at call time so token refreshes apply without stale imports."""
    return (
        (os.getenv("META_WA_TOKEN") or "").strip(),
        (os.getenv("META_WA_PHONE_NUMBER_ID") or "").strip(),
        (os.getenv("META_WA_API_VERSION") or "v21.0").strip(),
    )


def _normalize_msisdn(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits


def send_meta(phone: str, message: str) -> dict[str, Any]:
    token, phone_number_id, api_version = _meta_config()
    if not token or not phone_number_id:
        return {
            "mode": "demo",
            "channel": "whatsapp",
            "provider": "meta",
            "note": "Set META_WA_TOKEN + META_WA_PHONE_NUMBER_ID for Meta Cloud WhatsApp",
            "to": phone,
            "message": message,
        }

    to = _normalize_msisdn(phone)
    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }
    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if res.status_code >= 400:
        return {
            "mode": "error",
            "channel": "whatsapp",
            "provider": "meta",
            "status": res.status_code,
            "body": res.text[:500],
        }
    return {
        "mode": "live",
        "channel": "whatsapp",
        "provider": "meta",
        "status": res.status_code,
        "body": res.json() if res.content else {},
    }


def send_whatsapp(phone: str, message: str) -> dict[str, Any]:
    provider = (os.getenv("WHATSAPP_PROVIDER") or "auto").lower()
    token, phone_number_id, _ = _meta_config()
    if provider == "auto":
        if token and phone_number_id:
            provider = "meta"
        elif os.getenv("AT_WHATSAPP_NUMBER") and os.getenv("AT_API_KEY"):
            provider = "africastalking"
        elif twilio_dispatch.whatsapp_available():
            provider = "twilio"
        else:
            provider = "demo"

    if provider == "meta":
        return send_meta(phone, message)
    if provider == "africastalking":
        out = africastalking.send_whatsapp(phone, message)
        out["provider"] = "africastalking"
        return out
    if provider == "twilio":
        return twilio_dispatch.send_whatsapp(phone, message)
    return {
        "mode": "demo",
        "channel": "whatsapp",
        "provider": "demo",
        "to": phone,
        "message": message,
        "note": (
            "WhatsApp demo — set Meta Cloud API (META_WA_TOKEN + META_WA_PHONE_NUMBER_ID), "
            "or AT_WHATSAPP_NUMBER + AT_API_KEY. Twilio is optional only."
        ),
    }
