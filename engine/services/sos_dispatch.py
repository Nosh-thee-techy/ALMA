"""SOS responder notifications (WhatsApp) — keep deterministic + minimal.

This is intentionally separate from risk/guidance flows so SOS stays reachable
even during degraded network conditions.
"""

from __future__ import annotations

import os
import time
from typing import Any

from services import whatsapp_dispatch


def _split_phones(raw: str) -> list[str]:
    return [p.strip() for p in (raw or "").split(",") if p.strip()]


def responder_phones() -> list[str]:
    """
    Registered responder numbers to notify immediately.

    Priority:
    1) ALMA_SOS_RESPONDER_PHONES (comma-separated)
    2) AT_WHATSAPP_NUMBER (single responder WA number)
    """

    phones = _split_phones(os.getenv("ALMA_SOS_RESPONDER_PHONES", "").strip())
    if phones:
        return phones
    at = os.getenv("AT_WHATSAPP_NUMBER", "").strip()
    return [at] if at else []


def build_sos_whatsapp_message(*, entry: dict[str, Any], channel: str, message_body: str) -> str:
    now = time.time()
    received_s = int(max(0, now - float(entry.get("last_received_at") or now)))
    resent = int(entry.get("resent_count") or 0)
    community = str(entry.get("community") or "Unknown")
    phone = str(entry.get("phone") or "Unknown")

    resent_bit = f" (resent {resent}x in window)" if resent > 0 else ""
    return (
        "ALMA SOS - Emergency help request\n"
        f"From: {phone}\n"
        f"Community: {community}\n"
        f"Channel: {channel}\n"
        f"Waiting: {received_s}s{resent_bit}\n"
        f"Details: {str(message_body or '').strip()[:120] or '(none)'}\n"
        "Respond ASAP. One-way fire-and-forget SOS."
    )[:900]


def notify_sos_responders(*, entry: dict[str, Any], channel: str, message_body: str) -> list[dict[str, Any]]:
    phones = responder_phones()
    if not phones:
        return [
            {
                "ok": False,
                "note": "No SOS responder phone(s) configured (ALMA_SOS_RESPONDER_PHONES or AT_WHATSAPP_NUMBER).",
            }
        ]

    msg = build_sos_whatsapp_message(entry=entry, channel=channel, message_body=message_body)
    out: list[dict[str, Any]] = []
    for phone in phones:
        try:
            wa = whatsapp_dispatch.send_whatsapp(phone, msg)
            out.append({"to": phone, "ok": True, "wa": wa})
        except Exception as exc:  # pragma: no cover - best effort only
            out.append({"to": phone, "ok": False, "error": str(exc)})
    return out

