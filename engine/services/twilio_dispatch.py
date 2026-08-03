"""Twilio SMS + WhatsApp (sandbox-friendly)."""
from __future__ import annotations

import os
import re
from typing import Any

import httpx

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
TWILIO_WA_CONTENT_SID = os.getenv("TWILIO_WA_CONTENT_SID", "").strip()
TWILIO_WA_USE_TEMPLATE = os.getenv("TWILIO_WA_USE_TEMPLATE", "").strip().lower() in (
    "1",
    "true",
    "yes",
)


def configured() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)


def sms_available() -> bool:
    return configured() and bool(TWILIO_PHONE_NUMBER)


def whatsapp_available() -> bool:
    return configured() and bool(TWILIO_WHATSAPP_FROM or TWILIO_PHONE_NUMBER)


def _e164(phone: str) -> str:
    raw = (phone or "").strip()
    if raw.startswith("+"):
        return "+" + re.sub(r"\D", "", raw)
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("0") and len(digits) == 10:
        # Kenya local → assume +254 for demo phones
        return "+254" + digits[1:]
    if digits.startswith("254"):
        return "+" + digits
    return "+" + digits if digits else raw


def _wa_addr(phone: str) -> str:
    p = _e164(phone)
    return p if p.startswith("whatsapp:") else f"whatsapp:{p}"


def _from_wa() -> str:
    src = TWILIO_WHATSAPP_FROM or TWILIO_PHONE_NUMBER
    if not src:
        return ""
    return src if src.startswith("whatsapp:") else f"whatsapp:{_e164(src)}"


def _messages_url() -> str:
    return f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"


def send_sms(phone: str, message: str) -> dict[str, Any]:
    if not sms_available():
        return {
            "mode": "demo",
            "channel": "sms",
            "provider": "twilio",
            "to": phone,
            "message": message,
            "note": "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER",
        }

    data = {
        "To": _e164(phone),
        "From": _e164(TWILIO_PHONE_NUMBER),
        "Body": message[:1600],
    }
    with httpx.Client(timeout=25.0) as client:
        res = client.post(
            _messages_url(),
            data=data,
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        )
    if res.status_code >= 400:
        return {
            "mode": "error",
            "channel": "sms",
            "provider": "twilio",
            "status": res.status_code,
            "body": res.text[:800],
        }
    body = res.json() if res.content else {}
    return {
        "mode": "live",
        "channel": "sms",
        "provider": "twilio",
        "status": res.status_code,
        "sid": body.get("sid"),
        "body": body,
    }


def send_whatsapp(phone: str, message: str) -> dict[str, Any]:
    if not whatsapp_available():
        return {
            "mode": "demo",
            "channel": "whatsapp",
            "provider": "twilio",
            "to": phone,
            "message": message,
            "note": "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (sandbox: whatsapp:+14155238886)",
        }

    data: dict[str, str] = {
        "To": _wa_addr(phone),
        "From": _from_wa(),
    }
    # Sandbox: freeform Body works after the user joins the sandbox.
    # Template ContentSid is optional for out-of-session sends.
    if TWILIO_WA_USE_TEMPLATE and TWILIO_WA_CONTENT_SID:
        data["ContentSid"] = TWILIO_WA_CONTENT_SID
        # Keep variables minimal — ALMA alert as slot 1 when template expects it
        data["ContentVariables"] = '{"1":"ALMA","2":"now"}'
    else:
        data["Body"] = message[:1600]

    with httpx.Client(timeout=25.0) as client:
        res = client.post(
            _messages_url(),
            data=data,
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        )
    if res.status_code >= 400:
        return {
            "mode": "error",
            "channel": "whatsapp",
            "provider": "twilio",
            "status": res.status_code,
            "body": res.text[:800],
            "hint": (
                "For Twilio WhatsApp sandbox: open WhatsApp, message the sandbox number, "
                "send the join code from console.twilio.com, then retry."
            ),
        }
    body = res.json() if res.content else {}
    return {
        "mode": "live",
        "channel": "whatsapp",
        "provider": "twilio",
        "status": res.status_code,
        "sid": body.get("sid"),
        "body": body,
    }


def health() -> dict[str, Any]:
    return {
        "configured": configured(),
        "sms_available": sms_available(),
        "whatsapp_available": whatsapp_available(),
        "from_sms": TWILIO_PHONE_NUMBER or None,
        "from_whatsapp": _from_wa() or None,
        "content_sid_set": bool(TWILIO_WA_CONTENT_SID),
    }
