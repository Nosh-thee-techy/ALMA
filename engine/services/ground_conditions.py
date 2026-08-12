"""
Ground-conditions translation for Sector Guidance + last-mile channels.

eventPhase drives which guidance set (before/after) is shown on Sector Guidance —
derived from risk tier history, not a separate model.

All other fields pull from rain data already used by the rain trigger
(Open-Meteo) — no new external sources.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from services import session_store
from services.live_signals import get_live_signals

RegionId = Literal["omo", "turkana"]
EventPhase = Literal["pre_risk", "active_risk", "post_risk"]
POST_RISK_WINDOW_S = 72 * 3600

TIER_RANK = {"safe": 0, "watch": 1, "warning": 2, "severe": 3}

SECTOR_MAP = {
    "agriculture": "farmer",
    "livestock": "pastoralist",
    "fisheries": "fisher",
    "health": "health",
    "farmer": "farmer",
    "pastoralist": "pastoralist",
    "fisher": "fisher",
}


def _elevated(tier: str, compound_active: bool) -> bool:
    return bool(compound_active) or TIER_RANK.get(tier, 0) >= TIER_RANK["warning"]


def farmer_flood_risk(tier: str, compound_active: bool) -> str:
    """
    Audience-tiered display — farmers get fused consequence (impact-based),
    NGOs get full mechanism (technical). Same underlying data, different
    presentation layer.

    farmerFloodRisk is the EXISTING compound engine tier (Safe/Watch/Warning/
    Severe/Compound), relabeled for farmer channels — no new risk calculation.
    """
    if compound_active:
        return "compound"
    return tier if tier in TIER_RANK or tier == "compound" else "watch"


def drought_risk(climate_state: str, dry_days: int = 0) -> str:
    """
    Parallel drought tier (Safe/Watch/Warning/Severe) from existing climateState /
    rainfall trend used for dry_spell detection — not a new data pipeline.
    """
    if climate_state == "dry_spell":
        if dry_days >= 14:
            return "severe"
        if dry_days >= 10:
            return "warning"
        return "watch"
    if climate_state == "wet_trend":
        return "safe"
    if dry_days >= 5:
        return "watch"
    return "safe"


def derive_event_phase(region_id: str, tier: str, compound_active: bool) -> EventPhase:
    """eventPhase from risk tier history — not a separate hazard model."""
    if _elevated(tier, compound_active):
        return "active_risk"
    if session_store.had_severe_or_compound(region_id, within_s=POST_RISK_WINDOW_S):
        return "post_risk"
    return "pre_risk"


def crop_stage_for_month(month: int) -> str:
    # Why: long rains planting ~Mar–May; mid-year growing; late year harvest.
    if 3 <= month <= 5:
        return "planting"
    if 6 <= month <= 9:
        return "growing"
    return "harvest"


def derive_soil_moisture(rain_7d_mm: float) -> str:
    # Why: 7d Open-Meteo sum is the same accumulation the rain trigger already uses.
    if rain_7d_mm < 25:
        return "low"
    if rain_7d_mm < 80:
        return "moderate"
    return "high"


def derive_grazing(daily_mm: list[float]) -> str:
    # Why: dry trend over the recent half of daily rain → stressed forage.
    if len(daily_mm) < 4:
        return "stressed" if sum(daily_mm) < 20 else "adequate"
    mid = len(daily_mm) // 2
    earlier = sum(daily_mm[:mid]) / mid
    later = sum(daily_mm[mid:]) / (len(daily_mm) - mid)
    if later + 2 < earlier * 0.75 or later < 2:
        return "stressed"
    return "adequate"


def derive_climate(daily_mm: list[float]) -> dict[str, Any]:
    # dry_spell = no rainfall >5mm in past 7 days, using existing Open-Meteo data
    last7 = daily_mm[-7:] if daily_mm else []
    dry_days = 0
    for mm in reversed(last7):
        if mm > 5:
            break
        dry_days += 1
    wet_streak = 0
    for mm in reversed(last7):
        if mm < 2:
            break
        wet_streak += 1
    if len(last7) >= 5 and all(mm <= 5 for mm in last7):
        return {
            "climate_state": "dry_spell",
            "dry_days": max(dry_days, len(last7)),
            "wet_streak_days": wet_streak,
        }
    if wet_streak >= 3:
        return {
            "climate_state": "wet_trend",
            "dry_days": dry_days,
            "wet_streak_days": wet_streak,
        }
    return {"climate_state": "stable", "dry_days": dry_days, "wet_streak_days": wet_streak}


def climate_summary(state: str, dry_days: int, wet_streak: int) -> str:
    if state == "dry_spell":
        return f"Dry spell — {dry_days} days with no significant rainfall"
    if state == "wet_trend":
        return f"Wet trend — {wet_streak} consecutive day(s) of rainfall"
    return "Conditions stable"


REGION_FACTOR = {"omo": 1.12, "turkana": 0.88}
REGION_LABEL = {"omo": "Omo side (Ethiopia)", "turkana": "Turkana side (Kenya)"}


def build_region_status(
    region_id: RegionId,
    *,
    rain_24h_mm: float,
    rain_7d_mm: float,
    daily_mm: list[float],
    tier: str,
    compound_active: bool,
) -> dict[str, Any]:
    factor = REGION_FACTOR.get(region_id, 1.0)
    rain24 = round(rain_24h_mm * factor, 1)
    rain7 = round(rain_7d_mm * factor, 1)
    daily = [round(mm * factor, 1) for mm in daily_mm]

    session_store.record_risk_tier(region_id, tier, compound_active)
    event_phase = derive_event_phase(region_id, tier, compound_active)

    # Detect transition into post_risk for follow-up channel content
    transitioned = session_store.mark_post_risk_transition(region_id, event_phase)

    month = datetime.utcnow().month
    crop = crop_stage_for_month(month)
    soil = derive_soil_moisture(rain7)
    grazing = derive_grazing(daily)
    climate = derive_climate(daily)
    state = climate["climate_state"]
    dry_days = int(climate["dry_days"])
    wet_streak = int(climate["wet_streak_days"])

    agri = f"{crop.capitalize()} season, {soil} soil moisture"
    livestock = (
        f"Grazing stressed — {max(dry_days, 1)} days below average rainfall"
        if grazing == "stressed"
        else "Grazing adequate for current forage window"
    )

    # Audience-tiered display — farmers get fused consequence (impact-based),
    # NGOs get full mechanism (technical). Same underlying data, different
    # presentation layer.
    flood = farmer_flood_risk(tier, compound_active)
    drought = drought_risk(state, dry_days)
    # This is an eligibility FLAG only, not a payment system. Real disbursement
    # remains manual/off-platform. Mirrors the logic of parametric insurance
    # (event-threshold-triggered) without building actual financial rails.
    eligible = session_store.recovery_eligible(region_id)
    severe_hours = session_store.severe_or_compound_hours(region_id)

    return {
        "region_id": region_id,
        "label": REGION_LABEL.get(region_id, region_id),
        "crop_stage": crop,
        "soil_moisture": soil,
        "grazing_condition": grazing,
        "climate_state": state,
        "event_phase": event_phase,
        "agriculture_summary": agri,
        "livestock_summary": livestock,
        "climate_summary": climate_summary(state, dry_days, wet_streak),
        "dry_days": dry_days,
        "wet_streak_days": wet_streak,
        "rain_24h_mm": rain24,
        "rain_7d_mm": rain7,
        "tier": tier,
        "compound_active": compound_active,
        "farmer_flood_risk": flood,
        "drought_risk": drought,
        "recovery_eligible": eligible,
        "severe_or_compound_hours": severe_hours,
        "post_risk_transition": transitioned,
    }


def snapshot_from_live() -> dict[str, Any]:
    signals = get_live_signals()
    risk = signals.get("risk") or {}
    rain = signals.get("rain") or {}
    daily = list(rain.get("daily_mm") or [])
    tier = str(risk.get("tier") or "watch")
    compound = bool(risk.get("compound_active"))
    rain24 = float(rain.get("rain_24h_mm") or risk.get("rain_mm") or 0)
    rain7 = float(rain.get("rain_7d_mm") or 0)

    regions = {
        rid: build_region_status(
            rid,  # type: ignore[arg-type]
            rain_24h_mm=rain24,
            rain_7d_mm=rain7,
            daily_mm=daily,
            tier=tier,
            compound_active=compound,
        )
        for rid in ("omo", "turkana")
    }

    # Task 7: when eventPhase newly becomes post_risk, queue a recovery SMS if configured.
    for rid, st in regions.items():
        if st.get("post_risk_transition"):
            _notify_post_risk(rid, st)

    any_eligible = any(st.get("recovery_eligible") for st in regions.values())
    # This is an eligibility FLAG only, not a payment system. Real disbursement
    # remains manual/off-platform. Mirrors the logic of parametric insurance
    # (event-threshold-triggered) without building actual financial rails.
    recovery_line = (
        "This flood event qualifies you for recovery support. "
        "Reply/press 1 to log your interest."
        if any_eligible
        else None
    )

    return {
        "ok": True,
        "regions": regions,
        "recovery_support_line": recovery_line,
        "recovery_eligible_any": any_eligible,
        "note": (
            "eventPhase drives which guidance set (before/after) is shown — "
            "derived from risk tier history, not a separate model. "
            "Audience-tiered display — farmers get fused consequence (impact-based), "
            "NGOs get full mechanism (technical)."
        ),
    }


def _notify_post_risk(region_id: str, status: dict[str, Any]) -> None:
    import os

    phone = os.getenv("ALMA_POST_RISK_NOTIFY_PHONE", "").strip()
    text = after_guidance("livestock")
    # Audience-tiered display — farmers get fused consequence (impact-based),
    # NGOs get full mechanism (technical). Same underlying data, different
    # presentation layer.
    from services.alert_copy import sms_farmer_template

    body = sms_farmer_template(
        farmer_flood_risk=str(status.get("farmer_flood_risk") or status.get("tier") or "watch"),
        drought_risk=str(status.get("drought_risk") or "safe"),
        guidance=text,
        recovery_eligible=bool(status.get("recovery_eligible")),
        event_phase="post_risk",
        lang="en",
    )
    session_store.log_action(
        phone or None,
        region_id,
        "post_risk_sms",
        {
            "message": body,
            "queued": bool(phone),
            "recovery_eligible": bool(status.get("recovery_eligible")),
        },
    )
    if not phone:
        return
    try:
        from services import africastalking

        africastalking.dispatch(phone, body[:400], "sms")
    except Exception:
        pass


def before_guidance(sector: str, climate_state: str, tier: str, compound_active: bool, rain_eta_h: float) -> str:
    sec = sector if sector in ("agriculture", "livestock", "fisheries", "health") else _sector_ui(sector)
    hours = max(6, int(round(rain_eta_h or 24)))
    if compound_active or tier == "severe":
        return {
            "agriculture": "Secure feed stores and seed stock now. Evacuate floodplain plots.",
            "livestock": "Move livestock to higher ground immediately.",
            "fisheries": "Pull boats now. No night fishing. High-ground camps only.",
            "health": "Activate outbreak readiness; secure clean-water supply at posts.",
        }[sec]
    if climate_state == "dry_spell":
        return {
            "agriculture": "Consider drought-resistant varieties. Delay water-intensive planting.",
            "livestock": "Move herds toward known water points early.",
            "fisheries": "Expect lower lake edge; secure nets above the dry-season line.",
            "health": "Stock ORS early — dry-spell heat and water stress raise AWD risk.",
        }[sec]
    if climate_state == "wet_trend" and tier in ("watch", "warning"):
        return {
            "agriculture": (
                f"Harvest maturing crops within {hours}h if in flood path. "
                "Move seed stock to elevated storage."
            ),
            "livestock": "Begin moving herds toward higher ground.",
            "fisheries": f"Anchor boats above the waterline; surge window ~{hours}h.",
            "health": "Pre-position ORS and aquatabs; brief community volunteers.",
        }[sec]
    defaults = {
        "safe": {
            "agriculture": "Normal operations. Routine drainage maintenance.",
            "livestock": "Normal grazing rotation on floodplain pasture.",
            "fisheries": "Normal fishing activity across the lake.",
            "health": "Routine surveillance. No additional stock needed.",
        },
        "watch": {
            "agriculture": "Inspect drainage; plan an early harvest of mature plots.",
            "livestock": "Identify high-ground corridors and confirm forage.",
            "fisheries": "Check moorings; log boats going out on the delta.",
            "health": "Verify purification supplies at riverside posts.",
        },
        "warning": {
            "agriculture": "Harvest mature crops now; move stored grain up.",
            "livestock": "Begin herd movement to the high-ground corridor.",
            "fisheries": "Anchor boats above the waterline; suspend night fishing.",
            "health": "Pre-position ORS and aquatabs; brief volunteers.",
        },
        "severe": {
            "agriculture": "Abandon field work. Secure inputs and evacuate plots.",
            "livestock": "Complete evacuation of all herds to the corridor.",
            "fisheries": "All boats off the water; move gear to high ground.",
            "health": "Activate outbreak readiness; secure clean-water supply.",
        },
    }
    return defaults.get(tier, defaults["watch"])[sec]


def after_guidance(sector: str, avoid_days: int = 7) -> str:
    sec = sector if sector in ("agriculture", "livestock", "fisheries", "health") else _sector_ui(sector)
    return {
        "agriculture": (
            "Inspect crops for waterlogging or contamination before consuming or selling. "
            "Test soil before replanting in affected plots. "
            "Floodwater silt is nutrient-rich — consider fast-growing cover crops "
            "to recover seasonal revenue and stabilize topsoil."
        ),
        "livestock": (
            f"Check herds for signs of waterborne illness. "
            f"Avoid grazing on recently flooded land for {avoid_days} days."
        ),
        "fisheries": (
            "Check nets and gear for damage. Water quality may be affected — "
            "inspect before resuming normal fishing."
        ),
        "health": (
            "Elevated waterborne disease risk — prioritize water purification "
            "and monitor for symptoms in the community."
        ),
    }[sec]


def _sector_ui(sector: str) -> str:
    rev = {"farmer": "agriculture", "pastoralist": "livestock", "fisher": "fisheries", "health": "health"}
    return rev.get(sector, "livestock")


def channel_guidance(
    *,
    sector: str = "pastoralist",
    region_id: str = "turkana",
    lang: str = "en",
) -> dict[str, Any]:
    """
    Plain last-mile line branching on eventPhase (SMS / USSD / Voice).

    Audience-tiered display — farmers get fused consequence (impact-based),
    NGOs get full mechanism (technical). Same underlying data, different
    presentation layer. Farmer channels ONLY ever see farmer_flood_risk,
    drought_risk, and before/after guidance — never dam %, rain mm, or
    trigger attribution.
    """
    snap = snapshot_from_live()
    region = snap["regions"].get(region_id) or snap["regions"]["turkana"]
    phase = region["event_phase"]
    tier = region["tier"]
    climate = region["climate_state"]
    compound = region["compound_active"]
    flood = region.get("farmer_flood_risk") or farmer_flood_risk(tier, compound)
    drought = region.get("drought_risk") or drought_risk(climate, int(region.get("dry_days") or 0))
    eligible = bool(region.get("recovery_eligible"))
    signals = get_live_signals()
    risk = signals.get("risk") or {}
    rain_eta = float(risk.get("t_rain_arrival_h") or 24)
    ui_sector = _sector_ui(sector)

    if phase == "post_risk":
        text = after_guidance(ui_sector)
        kind = "recovery"
    else:
        text = before_guidance(ui_sector, climate, tier, compound, rain_eta)
        kind = "before"

    if lang == "sw" and phase == "post_risk":
        text = f"Baada ya mafuriko: {text}"
    elif lang == "sw":
        text = f"Hatua sasa: {text}"

    recovery_line = None
    if phase == "post_risk" and eligible:
        recovery_line = (
            "This flood event qualifies you for recovery support. "
            "Reply/press 1 to log your interest."
            if lang != "sw"
            else (
                "Tukio hili la mafuriko linakustahili msaada wa kurejesha. "
                "Jibu/bonyeza 1 kusajili nia."
            )
        )

    # Optional early farmer heads-up when forecast outlook is Rising but tier still Safe/Watch.
    # Consequence-level only — no forecast mm, soil values, or rain vs dam attribution.
    early_heads_up = signals.get("farmer_early_heads_up")
    if early_heads_up and kind == "before" and tier in ("safe", "watch") and not compound:
        prefix = (
            "Angalizo: hatari ya mafuriko inaongezeka siku zijazo — fuatilia na jiandae. "
            if lang == "sw"
            else early_heads_up + " "
        )
        text = f"{prefix}{text}"[:280]

    return {
        "text": text[:280],
        "event_phase": phase,
        "kind": kind,
        "region_id": region_id,
        # Farmer-facing fields only (no dam/rain attribution here)
        "farmer_flood_risk": flood,
        "drought_risk": drought,
        "recovery_eligible": eligible,
        "tier": flood,  # alias for older callers — fused flood tier, not mechanism
        "climate_state": climate,
        "recovery_support_line": recovery_line,
        "early_heads_up": early_heads_up if kind == "before" else None,
        "post_risk_transition": region.get("post_risk_transition"),
    }
