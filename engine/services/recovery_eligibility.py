"""
Parametric recovery eligibility — Boolean flag + audit trail.

Mirrors African Risk Capacity trigger logic, not insurance payouts:

  verified presence in the hazard zone
  + region parametric window (severe/compound hours ≥ threshold)
  + active pre-event readiness log

Never a credit, debt, or payment score. County/NGO dispatch uses the flag.
"""
from __future__ import annotations

from typing import Any, Iterable

MIN_HAZARD_HOURS = 6.0
MODEL_NAME = "parametric_arc_style"


def pre_event_log_active(checklist: Iterable[dict[str, Any]] | None) -> bool:
    """At least one completed pre-event (or active-risk) checklist item."""
    for item in checklist or []:
        if not item.get("completed"):
            continue
        phase = str(item.get("eventPhase") or "")
        item_id = str(item.get("id") or "")
        if phase == "post_risk" or ":after:" in item_id:
            continue
        return True
    return False


def resolve_parametric_flag(
    *,
    presence_verified: bool,
    region_hazard_hours: float,
    pre_event_log_active: bool,
    min_hours: float = MIN_HAZARD_HOURS,
    region_id: str | None = None,
    community: str | None = None,
    phone: str | None = None,
    hazard_level: str | None = None,
    event_phase: str | None = None,
) -> dict[str, Any]:
    """Deterministic Boolean + machine-readable audit. No I/O."""
    hours = max(0.0, float(region_hazard_hours or 0))
    threshold = float(min_hours)
    region_trigger_met = hours >= threshold
    deny: list[str] = []
    if not presence_verified:
        deny.append("presence_not_verified")
    if not region_trigger_met:
        deny.append("parametric_hours_below_threshold")
    if not pre_event_log_active:
        deny.append("no_pre_event_readiness_log")

    flag = bool(presence_verified and region_trigger_met and pre_event_log_active)
    return {
        "recovery_eligibility_flag": flag,
        "model": MODEL_NAME,
        "not_credit": True,
        "not_payment": True,
        "phone": phone,
        "community": community,
        "region_id": region_id,
        "hazard_level": hazard_level,
        "event_phase": event_phase,
        "criteria": {
            "verified_presence_in_hazard_zone": bool(presence_verified),
            "region_trigger_hours": round(hours, 2),
            "min_hours": threshold,
            "region_trigger_met": region_trigger_met,
            "active_pre_event_readiness_log": bool(pre_event_log_active),
        },
        "deny_reasons": deny,
        "note": (
            "Eligibility flag for county/NGO relief dispatch only. "
            "Not a payment, voucher, or credit score."
        ),
    }


def sms_eligibility_line(audit: dict[str, Any]) -> str:
    """≤160 chars. Safe for Africa's Talking."""
    if audit.get("recovery_eligibility_flag"):
        line = "ALMA After: recovery flag YES. County/NGO follow-up — not a payment."
    else:
        reasons = ",".join(audit.get("deny_reasons") or ["not_eligible"])
        line = f"ALMA After: recovery flag NO ({reasons}). Not a credit score."
    return line[:160]
