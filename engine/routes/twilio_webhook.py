"""Twilio WhatsApp/SMS sandbox webhooks — inbound messages + status callbacks."""
from __future__ import annotations

from xml.sax.saxutils import escape

from fastapi import APIRouter, Form, Request
from fastapi.responses import PlainTextResponse, Response

from services import gemma_ai, session_store
from services.alert_copy import help_reply, report_ack, risk_reply
from services.live_signals import get_live_signals

router = APIRouter(tags=["twilio"])


def _twiml_message(text: str) -> Response:
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f"<Response><Message>{escape(text)}</Message></Response>"
    )
    return Response(content=body, media_type="application/xml")


def _clean_phone(raw: str) -> str:
    return (raw or "").replace("whatsapp:", "").strip()


@router.get("/api/twilio/webhook")
def twilio_webhook_ping():
    """Handy check that ngrok + engine reach this path."""
    return {
        "ok": True,
        "service": "alma-twilio-webhook",
        "hint": "Configure Twilio Sandbox 'When a message comes in' + Status callback to POST here.",
    }


@router.post("/api/twilio/webhook")
async def twilio_webhook(
    request: Request,
    From: str = Form(""),
    To: str = Form(""),
    Body: str = Form(""),
    MessageSid: str = Form(""),
    SmsSid: str = Form(""),
    MessageStatus: str = Form(""),
    SmsStatus: str = Form(""),
    AccountSid: str = Form(""),
):
    """
    Twilio posts application/x-www-form-urlencoded.

    - Inbound WhatsApp/SMS: has Body → parse, log, reply TwiML
    - Status callback: has MessageStatus/SmsStatus → ack empty 204
    """
    status = (MessageStatus or SmsStatus or "").strip().lower()
    body = (Body or "").strip()
    phone = _clean_phone(From)
    sid = MessageSid or SmsSid or ""

    # Delivery / status callback (no user text)
    if status and not body:
        session_store.log_action(
            phone or None,
            None,
            "twilio_status",
            {"sid": sid, "status": status, "to": To, "account": AccountSid},
        )
        return Response(status_code=204)

    if not body:
        return _twiml_message(help_reply())

    lower = body.lower().strip()

    # Quick commands
    if lower in ("risk", "hatari", "status", "1"):
        live = get_live_signals()
        risk = live.get("risk") or {}
        msg = risk_reply(str(risk.get("tier") or "watch"))
        session_store.log_action(phone, None, "twilio_risk_check", {"sid": sid, "reply": msg})
        return _twiml_message(msg)

    if lower in ("help", "menu", "hi", "hello", "start", "join"):
        return _twiml_message(help_reply())

    # Treat free text as ground-truth report
    parsed = gemma_ai.parse_ground_truth(body)
    session_store.add_ground_truth(phone, None, parsed)
    session_store.log_action(
        phone,
        None,
        "twilio_inbound",
        {"sid": sid, "from": From, "to": To, "body": body[:500], "parsed": parsed},
    )
    return _twiml_message(report_ack())
