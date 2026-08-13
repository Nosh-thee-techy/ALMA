"""Server-side helpers for the feature-phone simulator (USSD / voice / SMS)."""
from __future__ import annotations

import uuid
from typing import Any

from services import session_store, voice_conversation
from services.alert_copy import phase_alert, simple_alert
from services.live_signals import get_live_signals
from services.voice_xml import parse_voice_xml


def _test_client():
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app)


def _ussd_service_code(service_code: str | None = None) -> str:
    import os

    return (service_code or os.getenv("USSD_DIAL_CODE") or "*384*51567#").strip()


def simulate_ussd(
    *,
    session_id: str | None = None,
    phone: str,
    text: str,
    reset: bool = False,
    service_code: str | None = None,
) -> dict[str, Any]:
    """Proxy to POST /api/ussd — returns parsed CON/END screen text."""
    sid = (session_id or "").strip() or f"sim-ussd-{uuid.uuid4().hex[:10]}"
    if reset:
        session_store.clear_session(sid)

    client = _test_client()
    res = client.post(
        "/api/ussd",
        data={
            "sessionId": sid,
            "phoneNumber": phone,
            "text": text or "",
            "serviceCode": _ussd_service_code(service_code),
        },
    )
    raw = res.text or ""
    cont = raw.startswith("CON ")
    ended = raw.startswith("END ")
    display = raw[4:].strip() if (cont or ended) else raw.strip()

    return {
        "ok": True,
        "session_id": sid,
        "raw": raw,
        "text": display,
        "continue": cont,
        "session_end": ended,
        "status": res.status_code,
    }


def simulate_voice(
    *,
    session_id: str | None = None,
    phone: str,
    ward: str = "kalokol",
    digit: str = "",
    recording_url: str = "",
    question_text: str = "",
    lang: str = "sw",
    reset: bool = False,
) -> dict[str, Any]:
    """
    Proxy to POST /api/voice inbound helpline.
    When question_text is set during a Q&A recording step, runs text Q&A directly.
    """
    from routes.voice import _inbound_helpline

    sid = (session_id or "").strip() or f"sim-voice-{uuid.uuid4().hex[:10]}"

    if reset:
        session_store.clear_voice_conversation(sid)

    conv = session_store.get_voice_conversation(sid)
    if question_text and conv and conv.get("state") == "qa_recording":
        result = voice_conversation.process_question_text(conv, question_text)
        parsed = {
            "text": result.get("speak") or "",
            "needs_digit": bool(result.get("await_digit")),
            "needs_record": bool(result.get("record")),
            "end_call": bool(result.get("end_call")),
            "segments": [{"type": "say", "text": result.get("speak") or ""}],
            "record_max_seconds": voice_conversation.RECORD_SECONDS if result.get("record") else None,
            "dial_number": None,
            "raw_xml": None,
            "simulated_text_qa": True,
            "qa_meta": {
                "question": result.get("question"),
                "answer": result.get("answer"),
                "reason": result.get("reason"),
            },
        }
        return {
            "ok": True,
            "session_id": sid,
            "ward": ward,
            "parsed": parsed,
            "conversation": session_store.get_voice_conversation(sid),
        }

    response = _inbound_helpline(
        session_id=sid,
        caller_number=phone,
        ward=ward,
        digit=(digit or "").strip(),
        recording_url=(recording_url or "").strip(),
        lang=lang,
    )
    xml = response.body.decode() if response.body else ""
    parsed = parse_voice_xml(xml)

    return {
        "ok": True,
        "session_id": sid,
        "ward": ward,
        "parsed": parsed,
        "conversation": session_store.get_voice_conversation(sid),
    }


def simulate_voice_qa(
    *,
    session_id: str | None = None,
    phone: str,
    ward: str = "kalokol",
    question: str,
    lang: str = "sw",
    reset: bool = False,
) -> dict[str, Any]:
    """Exercise bounded Q&A without audio — Gemma runs server-side."""
    sid = (session_id or "").strip() or f"sim-qa-{uuid.uuid4().hex[:10]}"
    if reset:
        session_store.clear_voice_conversation(sid)

    conv = session_store.get_voice_conversation(sid)
    if not conv or conv.get("state") not in ("qa_recording", "qa_continue"):
        voice_conversation.start_qa_session(sid, phone, ward, lang=lang)
        conv = session_store.get_voice_conversation(sid) or {}

    if conv.get("state") == "qa_continue":
        voice_conversation.handle_continue_digit(conv, "1")
        conv = session_store.get_voice_conversation(sid) or {}

    result = voice_conversation.process_question_text(conv, question)
    return {
        "ok": True,
        "session_id": sid,
        "question": question,
        "answer": result.get("answer") or result.get("speak"),
        "speak": result.get("speak"),
        "end_call": result.get("end_call"),
        "await_digit": result.get("await_digit"),
        "reason": result.get("reason"),
        "conversation": session_store.get_voice_conversation(sid),
        "note": "Gemma reasoning runs on the ALMA server, not on the simulated phone.",
    }


def preview_sms(
    *,
    sector: str = "pastoralist",
    region_id: str = "turkana",
    lang: str = "en",
) -> dict[str, Any]:
    """Farmer SMS preview from live risk — no send."""
    signals = get_live_signals()
    risk = signals.get("risk") or {}
    tier = str(risk.get("tier") or "watch")
    message = phase_alert(sector=sector, region_id=region_id, lang=lang, fallback_tier=tier)
    if not message:
        message = simple_alert(tier, lang)
    return {
        "ok": True,
        "tier": tier,
        "compound_active": bool(risk.get("compound_active")),
        "message": message,
        "plain_summary": risk.get("plain_summary"),
        "lang": lang,
        "sector": sector,
        "region_id": region_id,
    }


def sms_shortcode() -> str:
    import os

    return (os.getenv("AT_SMS_SHORTCODE") or os.getenv("USSD_CHANNEL") or "51567").strip()


def simulate_sms_inbound(
    *,
    phone: str,
    text: str,
    to: str | None = None,
) -> dict[str, Any]:
    """
    Simulate a farmer texting the AT shortcode (default 51567).
    Uses the same SOS lifecycle as live Africa's Talking inbound SMS.
    """
    from services import sos_lifecycle

    shortcode = (to or sms_shortcode()).strip() or "51567"
    handled = sos_lifecycle.handle_inbound_sms_text(
        phone, text, channel="SMS", send_confirm_sms=True
    )
    if handled:
        session_store.log_action(
            phone,
            None,
            "sim_sms_sos",
            {"to": shortcode, "path": handled.get("path"), "text": (text or "")[:120]},
        )
        return {
            "ok": True,
            "status": 200,
            "shortcode": shortcode,
            "from": phone,
            "text": text,
            "result": {
                "ok": True,
                "handled": "sos",
                "path": handled.get("path"),
                "confirm_message": handled.get("confirm_message") or handled.get("reply"),
                "sms": handled.get("sms"),
                "notify": handled.get("notify"),
                "entry": handled.get("entry"),
            },
        }

    session_store.log_action(
        phone, None, "sim_sms_inbound", {"to": shortcode, "text": (text or "")[:500]}
    )
    return {
        "ok": True,
        "status": 200,
        "shortcode": shortcode,
        "from": phone,
        "text": text,
        "result": {"ok": True, "handled": "logged"},
    }


def send_alert_sms(
    *,
    phone: str,
    sector: str = "pastoralist",
    region_id: str = "turkana",
    lang: str = "en",
) -> dict[str, Any]:
    """Outbound alert SMS to a farmer (desk / demo send)."""
    from services import africastalking

    preview = preview_sms(sector=sector, region_id=region_id, lang=lang)
    sms = africastalking.send_sms(phone, str(preview.get("message") or ""))
    return {"ok": True, "preview": preview, "sms": sms, "shortcode": sms_shortcode()}
