"""
WhatsApp dispatch — Meta / Twilio / Africa's Talking, then demo mode.
Priority in auto: Meta → Twilio → Africa's Talking → demo.
"""
from __future__ import annotations

import os
import re
from typing import Any

import httpx

from services import africastalking, twilio_dispatch

WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "auto").lower()  # auto | meta | twilio | africastalking | demo
META_WA_TOKEN = os.getenv("META_WA_TOKEN", "")
META_WA_PHONE_NUMBER_ID = os.getenv("META_WA_PHONE_NUMBER_ID", "")
META_WA_API_VERSION = os.getenv("META_WA_API_VERSION", "v21.0")


def _normalize_msisdn(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits


def send_meta(phone: str, message: str) -> dict[str, Any]:
    if not META_WA_TOKEN or not META_WA_PHONE_NUMBER_ID:
        return {
            "mode": "demo",
            "channel": "whatsapp",
            "provider": "meta",
            "note": "Set META_WA_TOKEN + META_WA_PHONE_NUMBER_ID for Meta Cloud WhatsApp",
            "to": phone,
            "message": message,
        }

    to = _normalize_msisdn(phone)
    url = (
        f"https://graph.facebook.com/{META_WA_API_VERSION}/"
        f"{META_WA_PHONE_NUMBER_ID}/messages"
    )
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
                "Authorization": f"Bearer {META_WA_TOKEN}",
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
    provider = WHATSAPP_PROVIDER
    if provider == "auto":
        if META_WA_TOKEN and META_WA_PHONE_NUMBER_ID:
            provider = "meta"
        elif twilio_dispatch.whatsapp_available():
            provider = "twilio"
        elif os.getenv("AT_WHATSAPP_NUMBER"):
            provider = "africastalking"
        else:
            provider = "demo"

    if provider == "meta":
        return send_meta(phone, message)
    if provider == "twilio":
        return twilio_dispatch.send_whatsapp(phone, message)
    if provider == "africastalking":
        out = africastalking.send_whatsapp(phone, message)
        out["provider"] = "africastalking"
        return out
    return {
        "mode": "demo",
        "channel": "whatsapp",
        "provider": "demo",
        "to": phone,
        "message": message,
        "note": (
            "WhatsApp demo — set Twilio (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + "
            "TWILIO_WHATSAPP_FROM), Meta Cloud API, or AT_WHATSAPP_NUMBER."
        ),
    }
