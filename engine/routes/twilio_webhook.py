"""Twilio WhatsApp/SMS sandbox webhooks — inbound messages + status callbacks."""
from __future__ import annotations

from xml.sax.saxutils import escape

from fastapi import APIRouter, Form, Request
from fastapi.responses import PlainTextResponse, Response

from services import gemma_ai, session_store
from services.alert_copy import help_reply, report_ack, risk_reply
from services.live_signals import get_live_signals
from services import sos_lifecycle

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
        "sos": "Text SOS or HELP to trigger emergency routing (not the helpline menu).",
    }


@router.post("/api/sms/inbound")
async def at_sms_inbound(request: Request):
    """
    Africa's Talking SMS inbound callback.
    SOS/HELP (and check-in YES/NO) are handled before any other parsing.
    """
    form = await request.form()
    phone = str(form.get("from") or form.get("From") or "").strip()
    body = str(form.get("text") or form.get("Text") or form.get("message") or "").strip()
    msg_id = str(form.get("id") or form.get("Id") or "")
    to = str(form.get("to") or form.get("To") or "")
    date = str(form.get("date") or "")
    handled = sos_lifecycle.handle_inbound_sms_text(
        phone, body, channel="SMS", send_confirm_sms=True
    )
    if handled:
        session_store.log_action(
            phone,
            None,
            "at_sms_sos",
            {"id": msg_id, "to": to, "date": date, "path": handled.get("path")},
        )
        return {
            "ok": True,
            "handled": "sos",
            "path": handled.get("path"),
            "confirm_message": handled.get("confirm_message") or handled.get("reply"),
            "sms": handled.get("sms"),
            "notify": handled.get("notify"),
            "entry": handled.get("entry"),
        }
    session_store.log_action(
        phone, None, "at_sms_inbound", {"id": msg_id, "to": to, "text": body[:500]}
    )
    return {"ok": True, "handled": "logged"}


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

    # SOS first — never bury emergency under menu/help flows.
    # "HELP" is an SOS synonym per product spec (menu = MENU).
    sos_handled = sos_lifecycle.handle_inbound_sms_text(
        phone, body, channel="SMS", send_confirm_sms=False
    )
    if sos_handled:
        reply = (
            sos_handled.get("reply")
            or sos_handled.get("confirm_message")
            or sos_lifecycle.confirm_message()
        )
        session_store.log_action(
            phone,
            None,
            "twilio_sos",
            {"sid": sid, "path": sos_handled.get("path"), "ok": sos_handled.get("ok")},
        )
        return _twiml_message(str(reply))

    lower = body.lower().strip()

    # Quick commands
    if lower in ("risk", "hatari", "status", "1"):
        live = get_live_signals()
        risk = live.get("risk") or {}
        msg = risk_reply(str(risk.get("tier") or "watch"))
        session_store.log_action(phone, None, "twilio_risk_check", {"sid": sid, "reply": msg})
        return _twiml_message(msg)

    if lower in ("menu", "hi", "hello", "start", "join"):
        return _twiml_message(help_reply())

    # Ground Observer structured SMS: REPORT [ORG] [TYPE] [VALUE]
    from services import ground_observers as go
    from services.alert_copy import observer_ack

    structured = go.parse_sms_report(body)
    if structured is not None:
        if not structured.get("ok"):
            return _twiml_message(
                "ALMA observer format: REPORT WRA WATER HIGH (or DAM RELEASE / RAIN HEAVY)."
            )
        # Ensure observer exists (org from SMS)
        if not go.get_observer(phone):
            go.register_observer(phone, structured["organizationId"])
        result = go.log_report(
            phone,
            structured["reportType"],
            structured["value"],
            organization_id=structured["organizationId"],
            source="sms",
            raw_text=body,
        )
        org = structured["organizationId"]
        return _twiml_message(result.get("ack") or observer_ack(org))

    # Free-text from registered observers → Gemma parse + review flag when unclear
    observer = go.get_observer(phone)
    if observer:
        parsed = gemma_ai.parse_ground_truth(body)
        confidence = float(parsed.get("confidence_weight") or parsed.get("confidence") or 0.5)
        needs_review = confidence < 0.45 or not parsed.get("water_level_status")
        # Map common parse fields into observer report when possible
        status = str(parsed.get("water_level_status") or "").lower()
        value = None
        rtype = "water_level"
        if "high" in status or "overflow" in status:
            value = "high" if "overflow" not in status else "very_high"
        elif "low" in status:
            value = "low"
        elif "normal" in status:
            value = "normal"
        if value:
            go.log_report(
                phone,
                rtype,
                value,
                organization_id=observer.get("organizationId"),
                source="sms_freetext",
                raw_text=body,
                needs_review=needs_review,
            )
        else:
            go.log_report(
                phone,
                "water_level",
                "normal",
                organization_id=observer.get("organizationId"),
                source="sms_freetext",
                raw_text=body,
                needs_review=True,
            )
        session_store.add_ground_truth(phone, observer.get("registeredLocation"), parsed)
        msg = observer_ack(str(observer.get("organizationId") or "Observer"))
        if needs_review:
            msg += " Flagged for human review."
        return _twiml_message(msg)

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
