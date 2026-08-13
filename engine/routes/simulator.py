"""Simulator + pitch demo dispatcher (SMS / WhatsApp) + feature-phone sim."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services import africastalking, phone_simulator
from services.alert_copy import simple_alert
from services.risk_engine import compute_compound_risk

router = APIRouter(tags=["simulator"])


class SimulatorTriggerIn(BaseModel):
    rain_mm: float = Field(..., ge=0, le=500)
    dam_discharge_m3s: float = Field(..., ge=0, le=5000)
    target_phone_number: str = Field(..., min_length=8)
    sector: str = "pastoralist"
    lang: str = "en"
    data_quality: str = "simulated"
    channel: str = "whatsapp"  # sms | whatsapp | both


class PhoneUssdIn(BaseModel):
    session_id: str | None = None
    phone: str = Field(..., min_length=8)
    text: str = ""
    reset: bool = False
    service_code: str | None = None


class PhoneVoiceIn(BaseModel):
    session_id: str | None = None
    phone: str = Field(..., min_length=8)
    ward: str = "kalokol"
    digit: str = ""
    question_text: str = ""
    lang: str = "sw"
    reset: bool = False


class PhoneVoiceQaIn(BaseModel):
    session_id: str | None = None
    phone: str = Field(..., min_length=8)
    ward: str = "kalokol"
    question: str = Field(..., min_length=1)
    lang: str = "sw"
    reset: bool = False


class PhoneSmsPreviewIn(BaseModel):
    lang: str = "en"
    sector: str = "pastoralist"
    region_id: str = "turkana"


class PhoneSmsSendIn(BaseModel):
    phone: str = Field(..., min_length=8)
    lang: str = "en"
    sector: str = "pastoralist"
    region_id: str = "turkana"


class PhoneSmsInboundIn(BaseModel):
    phone: str = Field(..., min_length=8)
    text: str = Field(..., min_length=1, max_length=480)
    to: str | None = None  # AT shortcode, default 51567


@router.post("/api/simulator/trigger")
def simulator_trigger(body: SimulatorTriggerIn):
    risk = compute_compound_risk(
        body.rain_mm,
        body.dam_discharge_m3s,
        data_quality=body.data_quality if body.data_quality in ("simulated", "live_feed", "estimated") else "simulated",
    )
    # Short static copy only — no LLM rewrite (kept WhatsApp/SMS plain).
    message = simple_alert(risk.tier, body.lang)
    channels = africastalking.dispatch(body.target_phone_number, message, body.channel)

    sms = channels.get("sms")
    wa = channels.get("whatsapp")
    modes = [c.get("mode") for c in (sms, wa) if c]
    if "live" in modes:
        mode = "live"
    elif "error" in modes:
        mode = "error"
    else:
        mode = "demo"

    return {
        "ok": True,
        "risk": risk.to_dict(),
        "sector": body.sector,
        "lang": body.lang,
        "channel": body.channel,
        "message": message,
        "message_source": "simple_alert",
        "sms": sms,
        "whatsapp": wa,
        "mode": mode,
        "telemetry_note": (
            "Dam discharge input is a simulator control or rain-proxy estimate. "
            "Do not label as live Gibe III SCADA unless DAM_TELEMETRY_URL is connected."
        ),
    }


@router.post("/api/simulator/phone/ussd")
def phone_ussd(body: PhoneUssdIn):
    return phone_simulator.simulate_ussd(
        session_id=body.session_id,
        phone=body.phone,
        text=body.text,
        reset=body.reset,
        service_code=body.service_code,
    )


@router.post("/api/simulator/phone/voice")
def phone_voice(body: PhoneVoiceIn):
    return phone_simulator.simulate_voice(
        session_id=body.session_id,
        phone=body.phone,
        ward=body.ward,
        digit=body.digit,
        question_text=body.question_text,
        lang=body.lang,
        reset=body.reset,
    )


@router.post("/api/simulator/phone/voice-qa")
def phone_voice_qa(body: PhoneVoiceQaIn):
    return phone_simulator.simulate_voice_qa(
        session_id=body.session_id,
        phone=body.phone,
        ward=body.ward,
        question=body.question,
        lang=body.lang,
        reset=body.reset,
    )


@router.post("/api/simulator/phone/sms-preview")
def phone_sms_preview(body: PhoneSmsPreviewIn):
    return phone_simulator.preview_sms(
        lang=body.lang, sector=body.sector, region_id=body.region_id
    )


@router.post("/api/simulator/phone/sms-send")
def phone_sms_send(body: PhoneSmsSendIn):
    return phone_simulator.send_alert_sms(
        phone=body.phone,
        lang=body.lang,
        sector=body.sector,
        region_id=body.region_id,
    )


@router.post("/api/simulator/phone/sms-inbound")
def phone_sms_inbound(body: PhoneSmsInboundIn):
    """Farmer → shortcode 51567 (or configured AT_SMS_SHORTCODE)."""
    return phone_simulator.simulate_sms_inbound(
        phone=body.phone, text=body.text, to=body.to
    )


@router.get("/api/simulator/phone/codes")
def phone_codes():
    import os

    shortcode = phone_simulator.sms_shortcode()
    ussd = (os.getenv("USSD_DIAL_CODE") or f"*384*{shortcode}#").strip()
    sos_ussd = (os.getenv("SOS_USSD_DIAL_CODE") or ussd).strip()
    return {
        "ok": True,
        "sms_shortcode": shortcode,
        "ussd_dial": ussd,
        "sos_ussd_dial": sos_ussd,
        "hint": f"SMS to {shortcode} · USSD dial {ussd}",
    }
