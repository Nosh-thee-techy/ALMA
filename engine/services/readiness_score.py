"""
Operational disaster-preparedness scoring for ALMA My Readiness.

NOT a financial or credit score. Weights are fixed:

  Pre-event preparedness          40%
  Verification adherence          35%  (timely IVR/SMS ground-check replies)
  Post-event recovery logging     25%

Hazard (WATCH / WARNING / SEVERE / COMPOUND) is an input from the
compound risk engine — never derived from this score.

Preparedness state (UNPREPARED / MODERATE / READY) is derived only from
the operational score.
"""
from __future__ import annotations

from typing import Any, Iterable

WEIGHT_PRE_EVENT = 0.40
WEIGHT_VERIFICATION = 0.35
WEIGHT_POST_EVENT = 0.25

PREPAREDNESS_READY = 0.70
PREPAREDNESS_MODERATE = 0.40

HAZARD_LEVELS = ("WATCH", "WARNING", "SEVERE", "COMPOUND")
PREPAREDNESS_STATES = ("UNPREPARED", "MODERATE", "READY")

# If no ground checks were sent, do not punish the member (neutral).
NEUTRAL_VERIFICATION = 0.50
# If the event has not closed, post-event logging is not yet due (neutral).
NEUTRAL_POST_EVENT = 0.50


def normalize_hazard_level(
    tier: str | None = None,
    *,
    compound_active: bool = False,
    farmer_flood_risk: str | None = None,
) -> str:
    """Map engine tier → product hazard labels. Safe folds into WATCH."""
    if compound_active or str(farmer_flood_risk or "").lower() == "compound":
        return "COMPOUND"
    raw = str(farmer_flood_risk or tier or "watch").strip().upper()
    if raw == "SAFE":
        return "WATCH"
    if raw in HAZARD_LEVELS:
        return raw
    return "WATCH"


def preparedness_state(score: float) -> str:
    if score >= PREPAREDNESS_READY:
        return "READY"
    if score >= PREPAREDNESS_MODERATE:
        return "MODERATE"
    return "UNPREPARED"


def _is_pre_event_item(item: dict[str, Any]) -> bool:
    phase = str(item.get("eventPhase") or "")
    item_id = str(item.get("id") or "")
    if phase == "post_risk" or ":after:" in item_id:
        return False
    if phase in ("pre_risk", "active_risk") or ":before:" in item_id:
        return True
    # Untagged historical items count as pre-event preparedness work.
    return phase != "post_risk"


def _is_post_event_item(item: dict[str, Any]) -> bool:
    phase = str(item.get("eventPhase") or "")
    item_id = str(item.get("id") or "")
    return phase == "post_risk" or ":after:" in item_id


def _ratio(completed: int, total: int) -> float | None:
    if total <= 0:
        return None
    return max(0.0, min(1.0, completed / total))


def checklist_ratios(checklist: Iterable[dict[str, Any]]) -> dict[str, float | None]:
    items = list(checklist or [])
    pre = [i for i in items if _is_pre_event_item(i)]
    post = [i for i in items if _is_post_event_item(i)]
    pre_done = sum(1 for i in pre if i.get("completed"))
    post_done = sum(1 for i in post if i.get("completed"))
    return {
        "pre_event": _ratio(pre_done, len(pre)),
        "post_event": _ratio(post_done, len(post)),
        "pre_done": float(pre_done),
        "pre_total": float(len(pre)),
        "post_done": float(post_done),
        "post_total": float(len(post)),
    }


def verification_ratio(*, checks_sent: int, timely_responses: int) -> float:
    """Timely replies / checks sent. Neutral when nothing was sent."""
    sent = max(0, int(checks_sent))
    timely = max(0, int(timely_responses))
    if sent <= 0:
        return NEUTRAL_VERIFICATION
    return max(0.0, min(1.0, timely / sent))


def post_event_ratio(
    *,
    checklist_post: float | None,
    ground_truth_reports: int,
    event_phase: str = "pre_risk",
) -> float:
    """
    Post-event recovery logging: checklist after-items plus ground-truth reports.
    Neutral while the event is still open and nothing has been logged yet.
    """
    reports = max(0, int(ground_truth_reports))
    if checklist_post is None:
        if reports > 0:
            return 1.0
        if event_phase != "post_risk":
            return NEUTRAL_POST_EVENT
        return 0.0
    report_boost = 0.25 if reports > 0 else 0.0
    return max(0.0, min(1.0, checklist_post + report_boost))


def compute_readiness_score(
    *,
    checklist: Iterable[dict[str, Any]] | None = None,
    checks_sent: int = 0,
    timely_responses: int = 0,
    ground_truth_reports: int = 0,
    event_phase: str = "pre_risk",
    hazard_level: str = "WATCH",
    compound_active: bool = False,
    farmer_flood_risk: str | None = None,
    tier: str | None = None,
) -> dict[str, Any]:
    """Pure scoring. Callers persist nothing here."""
    ratios = checklist_ratios(checklist or [])
    pre = ratios["pre_event"]
    pre_component = 0.0 if pre is None else pre
    verify_component = verification_ratio(
        checks_sent=checks_sent, timely_responses=timely_responses
    )
    post_component = post_event_ratio(
        checklist_post=ratios["post_event"],
        ground_truth_reports=ground_truth_reports,
        event_phase=event_phase,
    )
    score = (
        WEIGHT_PRE_EVENT * pre_component
        + WEIGHT_VERIFICATION * verify_component
        + WEIGHT_POST_EVENT * post_component
    )
    score = round(max(0.0, min(1.0, score)), 4)
    percent = int(round(score * 100))
    hazard = normalize_hazard_level(
        tier,
        compound_active=compound_active,
        farmer_flood_risk=farmer_flood_risk or hazard_level,
    )
    state = preparedness_state(score)
    return {
        "score": score,
        "scorePercent": percent,
        "preparednessState": state,
        "hazardLevel": hazard,
        "notCreditScore": True,
        "weights": {
            "preEvent": WEIGHT_PRE_EVENT,
            "verification": WEIGHT_VERIFICATION,
            "postEvent": WEIGHT_POST_EVENT,
        },
        "components": {
            "preEvent": round(pre_component, 4),
            "verification": round(verify_component, 4),
            "postEvent": round(post_component, 4),
        },
        "counts": {
            "preDone": int(ratios["pre_done"] or 0),
            "preTotal": int(ratios["pre_total"] or 0),
            "postDone": int(ratios["post_done"] or 0),
            "postTotal": int(ratios["post_total"] or 0),
            "checksSent": int(checks_sent),
            "timelyResponses": int(timely_responses),
            "groundTruthReports": int(ground_truth_reports),
        },
        "eventPhase": event_phase,
    }


def sms_status_line(result: dict[str, Any], next_tip: str = "") -> str:
    """Single SMS (≤160 chars). Hazard and preparedness kept distinct."""
    state = result.get("preparednessState") or "UNPREPARED"
    pct = int(result.get("scorePercent") or 0)
    hazard = result.get("hazardLevel") or "WATCH"
    tip = " ".join((next_tip or "").split())
    head = f"ALMA After: {state} {pct}. Hazard {hazard}."
    remain = 160 - len(head) - 1
    if tip and remain > 12:
        clip = tip if len(tip) <= remain else tip[: remain - 1].rstrip() + "."
        line = f"{head} {clip}"
    else:
        line = head
    return line[:160]


def ussd_status_head(result: dict[str, Any], done: int, total: int) -> str:
    """Compact USSD header — hazard vs preparedness on one line."""
    state = result.get("preparednessState") or "UNPREPARED"
    pct = int(result.get("scorePercent") or 0)
    hazard = result.get("hazardLevel") or "WATCH"
    return f"{state} {pct} · {hazard} {done}/{total}"
