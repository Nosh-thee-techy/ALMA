"""Dashboard / desk APIs — risk snapshot + local Gemma analyst."""
from __future__ import annotations

import time
from typing import Literal

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
    audience: str = "farmer"  # farmer | organizer
    include_audio: bool = True


class SosQueueStatusIn(BaseModel):
    status: Literal["being_handled", "resolved", "new"] = "being_handled"
    acknowledged_by: str | None = None


class SosIngestIn(BaseModel):
    phone: str
    channel: Literal["SMS", "USSD", "CALL"] = "SMS"
    message_body: str = "SOS"
    lang: str | None = None
    community: str | None = None
    ward_id: str | None = None


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


@router.get("/api/dashboard/tts-health")
def tts_health():
    """ElevenLabs + Featherless status for voice desk / helpline."""
    from services import elevenlabs_tts, featherless_ai

    el = elevenlabs_tts.health()
    fl = featherless_ai.health()
    return {
        "ok": True,
        "elevenlabs": el,
        "featherless": fl,
        "voice_ready": bool(el.get("ok")),
        "llm_fallback_ready": bool(fl.get("configured")),
    }


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


class CommunityDispatchIn(BaseModel):
    community: str = Field(..., min_length=2)
    region_id: str = "turkana"
    message: str | None = None
    sector: str = "agriculture"


@router.get("/api/dashboard/ground-conditions")
def ground_conditions():
    """
    Live ground-conditions + eventPhase for Sector Guidance / last-mile.
    Drives before/after guidance from the same risk scoring as live-signals.
    """
    from services import ground_conditions as gc

    return gc.snapshot_from_live()


@router.get("/api/dashboard/channel-guidance")
def channel_guidance(
    sector: str = "pastoralist", region_id: str = "turkana", lang: str = "en"
):
    """Farmer-facing before/after line from live risk scoring (SMS/USSD/Voice)."""
    from services import ground_conditions as gc

    return {
        "ok": True,
        **gc.channel_guidance(sector=sector, region_id=region_id, lang=lang),
    }


@router.post("/api/dashboard/dispatch-community")
def dispatch_community(body: CommunityDispatchIn):
    """NGO Sector Guidance — Send to Community (SMS path + alerts log)."""
    from services import community_dispatch

    return community_dispatch.dispatch_to_community(
        body.community,
        region_id=body.region_id if body.region_id in ("omo", "turkana") else "turkana",
        message=body.message,
        sector=body.sector,
    )


@router.get("/api/dashboard/sos")
def dashboard_sos(limit: int = 50, include_resolved: bool = False):
    from services import sos_lifecycle

    # Stage 3/5 timers run on desk poll so no separate cron is required for demo.
    tick = sos_lifecycle.tick_escalations()
    items = session_store.list_sos_queue(limit=limit, include_resolved=include_resolved)
    now = time.time()
    out = [sos_lifecycle.public_entry(it, now) for it in items]
    return {
        "ok": True,
        "items": out,
        "tick": tick,
        "honesty": (
            "ALMA is a routing and escalation system — it notifies responders and "
            "escalates if they do not act. It cannot guarantee a human arrives in time."
        ),
        "backup_emergency_number": sos_lifecycle.BACKUP_EMERGENCY_NUMBER,
    }


@router.post("/api/dashboard/sos/ingest")
def dashboard_sos_ingest(body: SosIngestIn):
    """Desk / demo trigger for the same Stage-1 path as SMS/USSD/Call."""
    from services import sos_lifecycle

    return sos_lifecycle.ingest_sos(
        body.phone,
        channel=body.channel,
        message_body=body.message_body or "SOS",
        lang=body.lang,
        community=body.community,
        ward_id=body.ward_id,
        send_confirm_sms=True,
    )


@router.post("/api/dashboard/sos/{sos_id}/status")
def dashboard_sos_status(sos_id: int, body: SosQueueStatusIn):
    from services import sos_lifecycle

    if body.status == "being_handled":
        updated = sos_lifecycle.mark_being_handled(
            sos_id, acknowledged_by=body.acknowledged_by
        )
    elif body.status == "resolved":
        updated = sos_lifecycle.mark_resolved(sos_id, resolved_by=body.acknowledged_by)
    else:
        updated = session_store.set_sos_status(sos_id, body.status)
    if not updated:
        return {"ok": False, "error": "not_found_or_invalid_status"}
    return {"ok": True, "item": sos_lifecycle.public_entry(updated)}


@router.post("/api/dashboard/voice-brief")
def voice_brief(body: VoiceBriefIn):
    """Desk + helpline: Alma speaks a short risk breakdown for a ward."""
    return voice_agent.brief_script(
        ward_id=body.ward_id,
        lang=body.lang or "en",
        sector=body.sector,
        audience=body.audience or "farmer",
        include_audio=body.include_audio,
    )


class AlmaChatIn(BaseModel):
    message: str = Field("", max_length=800)
    lang: str | None = None
    include_audio: bool = True
    mode: Literal["desk", "explain", "phone", "readiness"] = "desk"
    phone: str | None = None


@router.post("/api/dashboard/alma-chat")
def alma_chat(body: AlmaChatIn):
    """Alma conversational desk agent — Gemma/Featherless + ElevenLabs."""
    from services import alma_agent

    return alma_agent.chat(
        body.message,
        lang=body.lang,
        include_audio=body.include_audio,
        mode=body.mode,
        phone=body.phone,
    )


@router.post("/api/dashboard/alma-explain")
def alma_explain(lang: str = "en", include_audio: bool = True):
    """Alma explains current home-dashboard analytics out loud."""
    from services import alma_agent

    return alma_agent.explain_dashboard(lang=lang if lang in ("en", "sw") else "en", include_audio=include_audio)


@router.post("/api/dashboard/community-dispatch")
def community_dispatch_alias(body: CommunityDispatchIn):
    """Alias of /dispatch-community for older clients."""
    return dispatch_community(body)


@router.get("/api/dashboard/readiness-rollup")
def readiness_rollup():
    from services import farmer_readiness

    return farmer_readiness.readiness_rollup()


@router.get("/api/dashboard/community-reach")
def community_reach():
    return {"ok": True, "reach": session_store.list_community_reach()}


class MarkReachIn(BaseModel):
    via: Literal["SMS", "USSD", "Voice", "Manual"] = "Manual"
    note: str | None = Field(None, max_length=240)


@router.post("/api/dashboard/community-reach/{ward_id}")
def mark_community_reach(ward_id: str, body: MarkReachIn):
    """Operator marks a ward as reached after SMS, call, radio, or field follow-up."""
    wid = ward_id.strip().lower().replace(" ", "_")
    if not wid:
        return {"ok": False, "error": "ward_id required"}
    session_store.set_last_reached_via(wid, body.via)
    session_store.log_action(
        None,
        wid,
        "reach_follow_up",
        {
            "ward_id": wid,
            "via": body.via,
            "note": (body.note or "").strip() or None,
            "triggeredBy": "manual_reach_follow_up",
        },
    )
    return {"ok": True, "ward_id": wid, "last_reached_via": body.via}


class DamObservationIn(BaseModel):
    release_m3s: float | None = Field(None, ge=0, le=5000)
    fill_percent: float | None = Field(None, ge=0, le=100)
    spillway_status: Literal["closed", "partial", "open"] | None = None
    notes: str | None = Field(None, max_length=500)
    reporter: str | None = Field(None, max_length=120)


@router.post("/api/dashboard/dam-observations")
def post_dam_observation(body: DamObservationIn):
    from services import dam_observations

    if body.release_m3s is None and body.fill_percent is None and not (body.notes or "").strip():
        return {"ok": False, "error": "Provide release, fill level, or notes"}
    return dam_observations.add_observation(
        release_m3s=body.release_m3s,
        fill_percent=body.fill_percent,
        spillway_status=body.spillway_status,
        notes=body.notes,
        reporter=body.reporter,
    )


@router.get("/api/dashboard/dam-observations")
def get_dam_observations(limit: int = 15):
    from services import dam_observations

    return dam_observations.list_observations(limit=limit)


@router.get("/api/dashboard/voice-helpline")
def voice_helpline_info():
    import os

    return {
        "ok": True,
        "ussd": os.getenv("USSD_DIAL_CODE", "*384*51567#"),
        "sos_ussd": os.getenv("SOS_USSD_DIAL_CODE", "*384*51567#"),
        "sms_shortcode": os.getenv("AT_SMS_SHORTCODE")
        or os.getenv("USSD_CHANNEL")
        or "51567",
        "voice_callback": "/api/voice",
        "sos_voice_callback": "/api/voice/sos",
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
            "Point Africa's Talking Voice callback to PUBLIC_BASE_URL/api/voice for the helpline. "
            "Use a separate AT Voice number pointing to /api/voice/sos for emergencies — "
            "do not nest SOS inside the helpline menu. "
            "ALMA routes and escalates; humans respond."
        ),
        "registration_speed_dial": (
            "Save the SOS number as contact 9. In an emergency, hold down 9 to call/text instantly."
        ),
    }


# --- Ground observers + ICPAC + climatic cascade ---


class GroundObserverIn(BaseModel):
    phoneNumber: str
    organizationId: str = "Community"
    observerName: str | None = Field(None, max_length=120)
    registeredLocation: str | None = Field(None, max_length=120)
    verified: bool = False


class GroundObserverVerifyIn(BaseModel):
    phoneNumber: str
    verified: bool = True


class GroundObserverReportIn(BaseModel):
    phoneNumber: str
    reportType: str
    value: str
    organizationId: str | None = None


class IcpacOutlookIn(BaseModel):
    summary: str = Field(..., min_length=8, max_length=2000)
    issuedDate: str | None = Field(None, max_length=40)
    source: str | None = Field(None, max_length=200)
    updatedBy: str | None = Field(None, max_length=120)


@router.get("/api/dashboard/ground-observers")
def list_ground_observers():
    from services import ground_observers as go

    return go.list_observers()


@router.post("/api/dashboard/ground-observers")
def create_ground_observer(body: GroundObserverIn):
    from services import ground_observers as go

    return go.register_observer(
        body.phoneNumber,
        body.organizationId,
        observer_name=body.observerName,
        registered_location=body.registeredLocation,
        verified=body.verified,
    )


@router.post("/api/dashboard/ground-observers/verify")
def verify_ground_observer(body: GroundObserverVerifyIn):
    from services import ground_observers as go

    return go.set_verified(body.phoneNumber, body.verified)


@router.get("/api/dashboard/ground-observer-reports")
def list_ground_observer_reports(limit: int = 40):
    from services import ground_observers as go

    return go.list_reports(limit=limit)


@router.post("/api/dashboard/ground-observer-reports")
def post_ground_observer_report(body: GroundObserverReportIn):
    from services import ground_observers as go

    return go.log_report(
        body.phoneNumber,
        body.reportType,
        body.value,
        organization_id=body.organizationId,
        source="dashboard",
    )


@router.get("/api/dashboard/icpac-outlook")
def get_icpac_outlook():
    from services import icpac_outlook

    return icpac_outlook.get_outlook()


@router.post("/api/dashboard/icpac-outlook")
def set_icpac_outlook(body: IcpacOutlookIn):
    from services import icpac_outlook

    return icpac_outlook.set_outlook(
        body.summary,
        issued_date=body.issuedDate,
        source=body.source,
        updated_by=body.updatedBy,
    )


@router.get("/api/dashboard/climatic-impact")
def climatic_impact(state: str | None = None):
    from services import climatic_impact as ci
    from services.live_signals import get_live_signals

    live = get_live_signals()
    resolved = state or live.get("climatic_state") or "flood_rain"
    return {
        "ok": True,
        "state": resolved,
        "ngo": ci.ngo_briefing(str(resolved)),
        "farmer": ci.farmer_briefing(str(resolved)),
        "live_state": live.get("climatic_state"),
    }


@router.get("/api/dashboard/reach-blind-spots")
def reach_blind_spots():
    """Unreached / unconfirmed wards during an active elevated event."""
    live = get_live_signals()
    risk = live.get("risk") or {}
    tier = str(risk.get("tier") or "safe")
    compound = bool(risk.get("compound_active"))
    active = compound or tier in ("warning", "severe")
    reach = {str(r["ward_id"]).lower(): r for r in session_store.list_community_reach()}
    wards = load_wards().get("features") or load_wards().get("wards") or []
    # wards may be geojson features or a flat list depending on loader
    ward_ids: list[str] = []
    if isinstance(wards, list):
        for w in wards:
            if isinstance(w, dict):
                props = w.get("properties") or w
                wid = props.get("id") or props.get("ward_id") or w.get("id")
                if wid:
                    ward_ids.append(str(wid).lower().replace(" ", "_"))
    if not ward_ids:
        ward_ids = [
            "omorate",
            "kalam",
            "todonyang",
            "nachukui",
            "lowarengak",
            "kalokol",
            "kangatotha",
        ]
    # Deduplicate preserve order
    seen: set[str] = set()
    ordered: list[str] = []
    for wid in ward_ids:
        if wid not in seen:
            seen.add(wid)
            ordered.append(wid)

    def _label(wid: str) -> str:
        return wid.replace("_", " ").title()

    unreached = []
    for wid in ordered:
        row = reach.get(wid)
        via = str((row or {}).get("last_reached_via") or "Unreached")
        if via.lower() in ("unreached", "unconfirmed", ""):
            unreached.append(
                {
                    "ward_id": wid,
                    "community": _label(wid),
                    "last_reached_via": via if via else "Unreached",
                }
            )
    return {
        "ok": True,
        "active_event": active,
        "unreached_or_unconfirmed_count": len(unreached) if active else 0,
        "wards": unreached if active else [],
        "unreached": [u["community"] for u in unreached] if active else [],
        "unconfirmed": [],
        "tier": tier,
        "compound_active": compound,
        "honesty_note": (
            "Do not claim full basin reach. Follow up on each unreached community "
            "(SMS, call, radio, or field), then mark it reached."
        ),
    }
