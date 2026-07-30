"""Simulator + pitch demo dispatcher (SMS / WhatsApp)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services import africastalking, gemma_ai
from services.playbook_loader import get_playbook_line
from services.risk_engine import compute_compound_risk

router = APIRouter(tags=["simulator"])


class SimulatorTriggerIn(BaseModel):
    rain_mm: float = Field(..., ge=0, le=500)
    dam_discharge_m3s: float = Field(..., ge=0, le=5000)
    target_phone_number: str = Field(..., min_length=8)
    sector: str = "pastoralist"
    lang: str = "en"
    data_quality: str = "simulated"
    channel: str = "sms"  # sms | whatsapp | both


@router.post("/api/simulator/trigger")
def simulator_trigger(body: SimulatorTriggerIn):
    risk = compute_compound_risk(
        body.rain_mm,
        body.dam_discharge_m3s,
        data_quality=body.data_quality if body.data_quality in ("simulated", "live_feed", "estimated") else "simulated",
    )
    guidance = gemma_ai.translate_playbook(body.sector, risk.tier, body.lang)
    static = get_playbook_line(body.sector, risk.tier, body.lang)
    message = guidance.get("text") or static
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
        "message_source": guidance.get("source"),
        "static_playbook": static,
        "sms": sms,
        "whatsapp": wa,
        "mode": mode,
        "telemetry_note": (
            "Dam discharge input is a simulator control or rain-proxy estimate. "
            "Do not label as live Gibe III SCADA unless DAM_TELEMETRY_URL is connected."
        ),
    }
