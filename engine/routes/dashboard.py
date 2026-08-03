"""Dashboard / desk APIs — risk snapshot + local Gemma analyst."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services import gemma_ai, session_store, voice_agent
from services.live_signals import get_live_signals
from services.playbook_loader import load_wards, ward_props
from services.risk_engine import compute_compound_risk

router = APIRouter(tags=["dashboard"])


class AnalystIn(BaseModel):
    question: str
    rain_mm: float = Field(62, ge=0)
    dam_discharge_m3s: float = Field(420, ge=0)


class ParseIn(BaseModel):
    text: str
    phone: str | None = None
    ward_id: str | None = None


class VoiceBriefIn(BaseModel):
    ward_id: str | None = None
    lang: str = "en"
    sector: str | None = None


@router.get("/api/dashboard/risk")
def dashboard_risk(rain_mm: float = 62, dam_discharge_m3s: float = 420, data_quality: str = "simulated"):
    risk = compute_compound_risk(rain_mm, dam_discharge_m3s, data_quality=data_quality)
    return {"ok": True, "risk": risk.to_dict()}


@router.post("/api/dashboard/analyst")
def dashboard_analyst(body: AnalystIn):
    risk = compute_compound_risk(body.rain_mm, body.dam_discharge_m3s, data_quality="simulated")
    answer = gemma_ai.analyst_query(body.question, body.rain_mm, body.dam_discharge_m3s, risk.to_dict())
    return {"ok": True, "risk": risk.to_dict(), "analyst": answer}


@router.post("/api/dashboard/parse-ground-truth")
def parse_gt(body: ParseIn):
    parsed = gemma_ai.parse_ground_truth(body.text)
    if body.ward_id:
        session_store.add_ground_truth(body.phone, body.ward_id, parsed)
    return {"ok": True, "parsed": parsed}


@router.get("/api/dashboard/wards")
def wards():
    return load_wards()


@router.get("/api/dashboard/community-score/{ward_id}")
def community_score(ward_id: str):
    return {
        "ok": True,
        "ward": ward_props(ward_id),
        "score": session_store.community_score(ward_id),
    }


@router.get("/api/dashboard/live-signals")
def live_signals():
    """Live Open-Meteo rain + estimated dam pressure (+ optional partner dam URL)."""
    return get_live_signals()


@router.get("/api/dashboard/ai-health")
def ai_health():
    from services import twilio_dispatch

    h = gemma_ai.health()
    h["twilio"] = twilio_dispatch.health()
    return h


@router.get("/api/dashboard/actions")
def list_actions(limit: int = 50):
    """USSD write-actions: evacuations, vouchers, cash, ground-truth, risk checks."""
    return {"ok": True, "actions": session_store.list_actions(limit)}


@router.get("/api/dashboard/ground-truth")
def list_ground_truth(limit: int = 50):
    return {"ok": True, "reports": session_store.list_ground_truth(limit)}


@router.get("/api/dashboard/vouchers")
def list_vouchers(limit: int = 50):
    return {"ok": True, "vouchers": session_store.list_vouchers(limit)}


@router.get("/api/dashboard/vouchers/{code}")
def get_voucher(code: str):
    v = session_store.get_voucher(code)
    if not v:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "voucher": v}


@router.post("/api/dashboard/vouchers/{code}/redeem")
def redeem_voucher(code: str):
    """Hub agent marks physical feed handover against USSD voucher code."""
    return session_store.redeem_voucher(code)


@router.get("/api/dashboard/cash-requests")
def list_cash(limit: int = 50):
    return {"ok": True, "requests": session_store.list_cash_requests(limit)}


@router.post("/api/dashboard/voice-brief")
def voice_brief(body: VoiceBriefIn):
    """Desk + helpline: short spoken breakdown of live risk for a ward."""
    return voice_agent.brief_script(
        ward_id=body.ward_id,
        lang=body.lang or "en",
        sector=body.sector,
    )


@router.get("/api/dashboard/voice-helpline")
def voice_helpline_info():
    return {
        "ok": True,
        "ussd": "*384*96428#",
        "voice_callback": "/api/voice",
        "menu": {
            "1": "Live flood risk (plain language)",
            "2": "What to do now",
            "3": "Leave a river report",
            "4": "Repeat menu",
        },
        "scripts": {
            "sw": voice_agent.helpline_menu_script("sw"),
            "en": voice_agent.helpline_menu_script("en"),
        },
        "note": (
            "Point Africa's Talking Voice callback to PUBLIC_BASE_URL/api/voice. "
            "Farmers without data use USSD; voice is the spoken helpline."
        ),
    }
