"""Africa's Talking SMS + WhatsApp. Never claims live dam telemetry."""
from __future__ import annotations

import os
from typing import Any

import httpx

AT_API_KEY = os.getenv("AT_API_KEY", "")
AT_USERNAME = os.getenv("AT_USERNAME", "sandbox")
AT_SMS_URL = os.getenv(
    "AT_SMS_URL",
    "https://api.sandbox.africastalking.com/version1/messaging",
)
# WhatsApp has no sandbox — production AT WhatsApp sender number required.
AT_WHATSAPP_NUMBER = os.getenv("AT_WHATSAPP_NUMBER", "")
AT_WHATSAPP_URL = os.getenv(
    "AT_WHATSAPP_URL",
    "https://chat.africastalking.com/whatsapp/message/send",
)


def send_sms(phone: str, message: str) -> dict[str, Any]:
    sms_provider = os.getenv("SMS_PROVIDER", "auto").lower()
    if sms_provider in ("auto", "twilio"):
        from services import twilio_dispatch

        if twilio_dispatch.sms_available():
            return twilio_dispatch.send_sms(phone, message)
        if sms_provider == "twilio":
            return {
                "mode": "demo",
                "channel": "sms",
                "provider": "twilio",
                "to": phone,
                "message": message,
                "note": "SMS_PROVIDER=twilio but Twilio env incomplete",
            }

    if not AT_API_KEY or not AT_USERNAME:
        return {
            "mode": "demo",
            "channel": "sms",
            "to": phone,
            "message": message,
            "note": "AT_API_KEY/AT_USERNAME missing — SMS simulated only",
        }

    body = {
        "username": AT_USERNAME,
        "to": phone,
        "message": message,
    }
    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            AT_SMS_URL,
            data=body,
            headers={
                "apiKey": AT_API_KEY,
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
    if res.status_code >= 400:
        return {"mode": "error", "channel": "sms", "status": res.status_code, "body": res.text}
    return {
        "mode": "live",
        "channel": "sms",
        "status": res.status_code,
        "body": res.json() if res.content else {},
    }


def send_whatsapp(phone: str, message: str) -> dict[str, Any]:
    """
    Africa's Talking WhatsApp (no sandbox).
    Docs: send body.message to phoneNumber from waNumber.
    """
    if not AT_API_KEY or not AT_USERNAME or not AT_WHATSAPP_NUMBER:
        return {
            "mode": "demo",
            "channel": "whatsapp",
            "to": phone,
            "message": message,
            "note": (
                "WhatsApp demo only — set AT_API_KEY, AT_USERNAME, and AT_WHATSAPP_NUMBER "
                "(registered WhatsApp Business number on Africa's Talking)."
            ),
        }

    payload = {
        "username": AT_USERNAME,
        "waNumber": AT_WHATSAPP_NUMBER,
        "phoneNumber": phone,
        "body": {"message": message},
    }
    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            AT_WHATSAPP_URL,
            json=payload,
            headers={
                "apiKey": AT_API_KEY,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
    if res.status_code >= 400:
        return {
            "mode": "error",
            "channel": "whatsapp",
            "status": res.status_code,
            "body": res.text,
        }
    return {
        "mode": "live",
        "channel": "whatsapp",
        "status": res.status_code,
        "body": res.json() if res.content else {},
    }


def dispatch(phone: str, message: str, channel: str = "sms") -> dict[str, Any]:
    from services.whatsapp_dispatch import send_whatsapp as send_wa

    channel = (channel or "sms").lower()
    if channel == "whatsapp":
        return {"sms": None, "whatsapp": send_wa(phone, message)}
    if channel == "both":
        return {"sms": send_sms(phone, message), "whatsapp": send_wa(phone, message)}
    return {"sms": send_sms(phone, message), "whatsapp": None}
