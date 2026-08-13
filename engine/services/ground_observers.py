"""
Ground Observer network — structured human observation for basin risk.

Where sensor networks are unavailable/expensive, ALMA formalizes human
observation as a structured input — the same principle as community-based
early warning systems used globally, applied here through existing SMS/USSD
infrastructure.

Verified observers weight more heavily in the dam/rain blend; unverified
reports stay visible as corroboration and are never silently merged into a
single unlabeled number.
"""
from __future__ import annotations

import re
import time
from typing import Any

from services import session_store

ORG_CODES = {
    "1": "WRA",
    "2": "KMD",
    "3": "TurkanaCountyDMU",
    "4": "Community",
    "5": "Other",
}

ORG_ALIASES = {
    "wra": "WRA",
    "kmd": "KMD",
    "county": "TurkanaCountyDMU",
    "turkanacountydmu": "TurkanaCountyDMU",
    "dmu": "TurkanaCountyDMU",
    "community": "Community",
    "communityobserver": "Community",
    "other": "Other",
}

REPORT_TYPES = {
    "1": "water_level",
    "2": "dam_activity",
    "3": "rainfall",
    "water": "water_level",
    "water_level": "water_level",
    "dam": "dam_activity",
    "dam_activity": "dam_activity",
    "rain": "rainfall",
    "rainfall": "rainfall",
}

WATER_VALUES = {"1": "low", "2": "normal", "3": "high", "4": "very_high", "overflowing": "very_high"}
DAM_VALUES = {
    "1": "none",
    "2": "release",
    "3": "unusual",
    "no": "none",
    "none": "none",
    "release": "release",
    "spillway": "release",
    "unusual": "unusual",
}
RAIN_VALUES = {
    "1": "none",
    "2": "light",
    "3": "moderate",
    "4": "heavy",
    "none": "none",
    "light": "light",
    "moderate": "moderate",
    "heavy": "heavy",
}

# Hours: recent reports only affect the live blend
OBSERVER_TTL_S = 48 * 3600
VERIFIED_WEIGHT = 0.38
UNVERIFIED_WEIGHT = 0.12


def _normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit() or ch == "+")
    if digits.startswith("0") and len(digits) == 10:
        return "+254" + digits[1:]
    if digits.startswith("254") and not digits.startswith("+"):
        return "+" + digits
    return digits if digits.startswith("+") else ("+" + digits if digits else phone)


def normalize_org(raw: str | None) -> str:
    if not raw:
        return "Other"
    s = str(raw).strip()
    if s in ORG_CODES.values():
        return s
    if s in ORG_CODES:
        return ORG_CODES[s]
    key = re.sub(r"[^a-z0-9]", "", s.lower())
    return ORG_ALIASES.get(key, s[:64] or "Other")


def register_observer(
    phone: str,
    organization_id: str,
    *,
    observer_name: str | None = None,
    registered_location: str | None = None,
    verified: bool = False,
) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    org = normalize_org(organization_id)
    row = session_store.upsert_ground_observer(
        {
            "phoneNumber": phone_n,
            "organizationId": org,
            "observerName": (observer_name or "").strip() or None,
            "registeredLocation": (registered_location or "").strip() or None,
            "verified": bool(verified),
        }
    )
    session_store.log_action(
        phone_n,
        row.get("registeredLocation"),
        "ground_observer_register",
        {"organizationId": org, "verified": bool(verified)},
    )
    return {"ok": True, "observer": public_observer(row)}


def public_observer(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "phoneNumber": row.get("phoneNumber"),
        "organizationId": row.get("organizationId"),
        "observerName": row.get("observerName"),
        "registeredLocation": row.get("registeredLocation"),
        "verified": bool(row.get("verified")),
        "createdAt": row.get("createdAt"),
        "updatedAt": row.get("updatedAt"),
    }


def get_observer(phone: str) -> dict[str, Any] | None:
    row = session_store.get_ground_observer(_normalize_phone(phone))
    return public_observer(row) if row else None


def set_verified(phone: str, verified: bool) -> dict[str, Any]:
    row = session_store.set_ground_observer_verified(_normalize_phone(phone), verified)
    if not row:
        return {"ok": False, "error": "not_found"}
    return {"ok": True, "observer": public_observer(row)}


def list_observers() -> dict[str, Any]:
    rows = [public_observer(r) for r in session_store.list_ground_observers()]
    return {"ok": True, "observers": rows, "count": len(rows)}


def _resolve_value(report_type: str, raw: str) -> str | None:
    key = (raw or "").strip().lower()
    if report_type == "water_level":
        return WATER_VALUES.get(key) or WATER_VALUES.get(key.replace(" ", "_"))
    if report_type == "dam_activity":
        return DAM_VALUES.get(key) or DAM_VALUES.get(key.replace(" ", "_"))
    if report_type == "rainfall":
        return RAIN_VALUES.get(key) or RAIN_VALUES.get(key.replace(" ", "_"))
    return None


def log_report(
    phone: str,
    report_type: str,
    value: str,
    *,
    organization_id: str | None = None,
    source: str = "ussd",
    raw_text: str | None = None,
    needs_review: bool = False,
) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    observer = session_store.get_ground_observer(phone_n)
    rtype = REPORT_TYPES.get(report_type.strip().lower(), report_type.strip().lower())
    if rtype not in ("water_level", "dam_activity", "rainfall"):
        return {"ok": False, "error": "bad_type"}
    resolved = _resolve_value(rtype, value)
    if not resolved and not needs_review:
        # allow free-text value when flagged for review
        return {"ok": False, "error": "bad_value"}
    org = normalize_org(organization_id or (observer or {}).get("organizationId") or "Other")
    verified = bool((observer or {}).get("verified"))
    row = session_store.add_ground_observer_report(
        {
            "phoneNumber": phone_n,
            "organizationId": org,
            "reportType": rtype,
            "value": resolved or str(value).strip().lower()[:64],
            "verifiedObserver": verified,
            "source": source,
            "rawText": (raw_text or "")[:500] or None,
            "needsReview": bool(needs_review),
            "registeredLocation": (observer or {}).get("registeredLocation"),
        }
    )
    session_store.log_action(
        phone_n,
        (observer or {}).get("registeredLocation"),
        "ground_observer_report",
        {
            "organizationId": org,
            "reportType": rtype,
            "value": row.get("value"),
            "verifiedObserver": verified,
            "source": source,
            "needsReview": needs_review,
        },
    )
    return {
        "ok": True,
        "report": row,
        "ack": f"Report received. Thank you, {org}.",
    }


def parse_sms_report(body: str) -> dict[str, Any] | None:
    """
    Structured: REPORT [ORG] [TYPE] [VALUE]
    e.g. REPORT WRA WATER HIGH · REPORT KMD RAIN HEAVY
    """
    text = (body or "").strip()
    m = re.match(
        r"^report\s+(\S+)\s+(\S+)\s+(\S+)\s*$",
        text,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    org_raw, type_raw, value_raw = m.group(1), m.group(2), m.group(3)
    rtype = REPORT_TYPES.get(type_raw.lower())
    if not rtype:
        return {"ok": False, "error": "bad_type", "hint": "TYPE = WATER | DAM | RAIN"}
    value = _resolve_value(rtype, value_raw)
    if not value:
        return {"ok": False, "error": "bad_value", "hint": "Check VALUE for that TYPE"}
    return {
        "ok": True,
        "organizationId": normalize_org(org_raw),
        "reportType": rtype,
        "value": value,
    }


def list_reports(limit: int = 40) -> dict[str, Any]:
    rows = session_store.list_ground_observer_reports(limit=limit)
    return {
        "ok": True,
        "reports": rows,
        "honesty": (
            "Where sensor networks are unavailable/expensive, ALMA formalizes human "
            "observation as a structured input — the same principle as community-based "
            "early warning systems used globally, applied here through existing SMS/USSD "
            "infrastructure."
        ),
    }


def recent_signal_blend(now: float | None = None) -> dict[str, Any]:
    """
    Aggregate recent observer reports into explicit Ground-Verified vs Estimated nudges.

    Returns additive adjustments for rain_mm and dam release m³/s, plus a transparent layer
    for the dashboard — never silently replaces Open-Meteo / rain-proxy estimates.
    """
    now = now or time.time()
    rows = session_store.list_ground_observer_reports(limit=80)
    fresh = [r for r in rows if now - float(r.get("createdAt") or 0) <= OBSERVER_TTL_S]

    rain_nudge = 0.0
    dam_nudge = 0.0
    verified_count = 0
    unverified_count = 0
    details: list[dict[str, Any]] = []

    for r in fresh:
        verified = bool(r.get("verifiedObserver"))
        w = VERIFIED_WEIGHT if verified else UNVERIFIED_WEIGHT
        if verified:
            verified_count += 1
        else:
            unverified_count += 1
        rtype = r.get("reportType")
        value = str(r.get("value") or "")
        contrib_rain = 0.0
        contrib_dam = 0.0

        if rtype == "rainfall":
            mm = {"none": 0.0, "light": 8.0, "moderate": 25.0, "heavy": 55.0}.get(value, 0.0)
            contrib_rain = mm * w
            rain_nudge += contrib_rain
        elif rtype == "water_level":
            # High stage implies elevated corridor pressure (corroborates dam/rain)
            bump = {"low": -5.0, "normal": 0.0, "high": 35.0, "very_high": 70.0}.get(value, 0.0)
            contrib_dam = bump * w * 2.5  # map to m³/s-ish pressure
            dam_nudge += contrib_dam
        elif rtype == "dam_activity":
            # Best available non-SCADA dam signal — weight dam release hard when verified
            bump = {"none": 0.0, "release": 90.0, "unusual": 140.0}.get(value, 0.0)
            # Dam activity is the USP for observers; verified gets full weight path
            scale = 1.2 if verified else 1.0
            contrib_dam = bump * w * scale * 3.0
            dam_nudge += contrib_dam

        details.append(
            {
                "id": r.get("id"),
                "organizationId": r.get("organizationId"),
                "reportType": rtype,
                "value": value,
                "verifiedObserver": verified,
                "trust": "ground_verified" if verified else "unverified_corroboration",
                "ageHours": round((now - float(r.get("createdAt") or now)) / 3600, 1),
                "contribRainMm": round(contrib_rain, 2),
                "contribDamM3s": round(contrib_dam, 2),
            }
        )

    return {
        "rain_mm_nudge": round(rain_nudge, 2),
        "dam_m3s_nudge": round(dam_nudge, 1),
        "verified_report_count": verified_count,
        "unverified_report_count": unverified_count,
        "reports": details[:20],
        "ttl_hours": OBSERVER_TTL_S / 3600,
        "weights": {"verified": VERIFIED_WEIGHT, "unverified": UNVERIFIED_WEIGHT},
        "honesty": (
            "Ground-Verified = reports from admin-verified observers (high trust, especially "
            "dam activity). Unverified = logged corroboration only. Estimated = Open-Meteo / "
            "rain→release proxy. Layers stay labeled — not blended into one silent number."
        ),
    }
