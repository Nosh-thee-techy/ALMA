"""
Farmer readiness profiles + checklist generation.

Checklist items are GENERATED from the same before-guidance content used on
Sector Guidance (ground_conditions.before_guidance) — filtered by crop/
livestock types and current climateState. No separate content set.

Lightweight demo auth for hackathon prototype — production version would
need OTP verification via existing AT SMS integration.
"""
from __future__ import annotations

import hashlib
import secrets
import time
from typing import Any

from services import ground_conditions as gc
from services import session_store


def _hash_pin(pin: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.sha256(f"{salt}:{pin}".encode("utf-8")).hexdigest()
    return digest, salt


def verify_pin(pin: str, pin_hash: str, salt: str) -> bool:
    digest, _ = _hash_pin(pin, salt)
    return secrets.compare_digest(digest, pin_hash)


def _normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit() or ch == "+")
    if digits.startswith("0") and len(digits) == 10:
        return "+254" + digits[1:]
    if digits.startswith("254") and not digits.startswith("+"):
        return "+" + digits
    return digits if digits.startswith("+") else ("+" + digits if digits else phone)


def generate_checklist(
    *,
    crop_types: list[str],
    livestock_types: list[str],
    climate_state: str,
    tier: str,
    compound_active: bool,
    rain_eta_h: float,
    existing: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Build checklist from before-guidance lines for agriculture/livestock.
    Keep already-completed historical items; add new ones when climate changes.
    """
    existing = list(existing or [])
    by_id = {i["id"]: i for i in existing if i.get("id")}

    items: list[dict[str, Any]] = []
    if crop_types:
        agri = gc.before_guidance("agriculture", climate_state, tier, compound_active, rain_eta_h)
        item_id = f"agri:{climate_state}:{tier}"
        prev = by_id.get(item_id)
        items.append(
            {
                "id": item_id,
                "task": agri,
                "linkedClimateState": climate_state,
                "sector": "agriculture",
                "completed": bool(prev and prev.get("completed")),
                "completedAt": (prev or {}).get("completedAt"),
            }
        )
        # Crop-specific nudge derived from same guidance family
        for crop in crop_types[:2]:
            cid = f"crop:{crop}:{climate_state}"
            prev_c = by_id.get(cid)
            task = f"{crop.capitalize()}: {agri}"
            if len(task) > 120:
                task = f"{crop.capitalize()} — follow current ag advice for {climate_state.replace('_', ' ')}"
            items.append(
                {
                    "id": cid,
                    "task": task,
                    "linkedClimateState": climate_state,
                    "sector": "agriculture",
                    "completed": bool(prev_c and prev_c.get("completed")),
                    "completedAt": (prev_c or {}).get("completedAt"),
                }
            )

    if livestock_types:
        live = gc.before_guidance("livestock", climate_state, tier, compound_active, rain_eta_h)
        item_id = f"live:{climate_state}:{tier}"
        prev = by_id.get(item_id)
        items.append(
            {
                "id": item_id,
                "task": live,
                "linkedClimateState": climate_state,
                "sector": "livestock",
                "completed": bool(prev and prev.get("completed")),
                "completedAt": (prev or {}).get("completedAt"),
            }
        )

    # Preserve completed items from other climate states (history)
    for old in existing:
        if old.get("completed") and old.get("id") not in {i["id"] for i in items}:
            items.append(old)

    return items


def register_farmer(
    phone: str,
    pin: str,
    community: str,
    crop_types: list[str] | None = None,
    livestock_types: list[str] | None = None,
) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    pin = (pin or "").strip()
    if len(pin) != 4 or not pin.isdigit():
        return {"ok": False, "error": "pin_must_be_4_digits"}
    crops = crop_types or ["maize"]
    livestock = livestock_types or []
    pin_hash, salt = _hash_pin(pin)

    snap = gc.snapshot_from_live()
    region_id = "omo" if community.lower() in ("omorate", "kalam") else "turkana"
    st = snap["regions"].get(region_id) or snap["regions"]["turkana"]

    from services.live_signals import get_live_signals

    live = get_live_signals()
    rain_eta = float((live.get("risk") or {}).get("t_rain_arrival_h") or 24)

    checklist = generate_checklist(
        crop_types=crops,
        livestock_types=livestock,
        climate_state=st["climate_state"],
        tier=st["tier"],
        compound_active=bool(st["compound_active"]),
        rain_eta_h=rain_eta,
    )

    profile = {
        "phoneNumber": phone_n,
        "pinHash": pin_hash,
        "pinSalt": salt,
        "community": community,
        "cropTypes": crops,
        "livestockTypes": livestock,
        "readinessChecklist": checklist,
        "createdAt": time.time(),
        "updatedAt": time.time(),
    }
    session_store.upsert_farmer(profile)
    return {"ok": True, "profile": public_profile(profile)}


def login_farmer(phone: str, pin: str) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    row = session_store.get_farmer(phone_n)
    if not row:
        return {"ok": False, "error": "not_found"}
    if not verify_pin(pin, row["pinHash"], row["pinSalt"]):
        return {"ok": False, "error": "bad_pin"}
    refreshed = refresh_checklist(row)
    return {"ok": True, "profile": public_profile(refreshed)}


def refresh_checklist(profile: dict[str, Any]) -> dict[str, Any]:
    snap = gc.snapshot_from_live()
    community = str(profile.get("community") or "Kalokol")
    region_id = "omo" if community.lower() in ("omorate", "kalam") else "turkana"
    st = snap["regions"].get(region_id) or snap["regions"]["turkana"]
    from services.live_signals import get_live_signals

    rain_eta = float((get_live_signals().get("risk") or {}).get("t_rain_arrival_h") or 24)
    checklist = generate_checklist(
        crop_types=list(profile.get("cropTypes") or []),
        livestock_types=list(profile.get("livestockTypes") or []),
        climate_state=st["climate_state"],
        tier=st["tier"],
        compound_active=bool(st["compound_active"]),
        rain_eta_h=rain_eta,
        existing=list(profile.get("readinessChecklist") or []),
    )
    profile = {**profile, "readinessChecklist": checklist, "updatedAt": time.time()}
    profile["_region"] = st
    session_store.upsert_farmer(profile)
    return profile


def public_profile(profile: dict[str, Any]) -> dict[str, Any]:
    checklist = list(profile.get("readinessChecklist") or [])
    done = sum(1 for i in checklist if i.get("completed"))
    region = profile.get("_region") or {}
    # Audience-tiered display — farmers get fused consequence (impact-based),
    # NGOs get full mechanism (technical). Same underlying data, different
    # presentation layer. Strip dam/rain attribution from farmer portal payload.
    farmer_region = None
    if region:
        farmer_region = {
            "climate_state": region.get("climate_state"),
            "climate_summary": region.get("climate_summary"),
            "agriculture_summary": region.get("agriculture_summary"),
            "livestock_summary": region.get("livestock_summary"),
            "event_phase": region.get("event_phase"),
            "farmer_flood_risk": region.get("farmer_flood_risk"),
            "drought_risk": region.get("drought_risk"),
            "recovery_eligible": bool(region.get("recovery_eligible")),
            "severe_or_compound_hours": region.get("severe_or_compound_hours"),
            # tier alias = fused flood risk for older UI
            "tier": region.get("farmer_flood_risk") or region.get("tier"),
        }
    out = {
        "phoneNumber": profile.get("phoneNumber"),
        "community": profile.get("community"),
        "cropTypes": profile.get("cropTypes") or [],
        "livestockTypes": profile.get("livestockTypes") or [],
        "readinessChecklist": checklist,
        "completedCount": done,
        "totalCount": len(checklist),
        "region": farmer_region,
        "recoveryEligible": bool((farmer_region or {}).get("recovery_eligible")),
    }
    return out


def log_recovery_interest(phone: str) -> dict[str, Any]:
    """
    This is an eligibility FLAG only, not a payment system. Real disbursement
    remains manual/off-platform. Mirrors the logic of parametric insurance
    (event-threshold-triggered) without building actual financial rails.
    """
    phone_n = _normalize_phone(phone)
    row = session_store.get_farmer(phone_n)
    if not row:
        return {"ok": False, "error": "not_found"}
    community = str(row.get("community") or "Kalokol")
    region_id = "omo" if community.lower() in ("omorate", "kalam") else "turkana"
    if not session_store.recovery_eligible(region_id):
        return {
            "ok": False,
            "error": "not_eligible",
            "recoveryEligible": False,
            "note": "Severe/Compound active_risk threshold (6h) not met in current window.",
        }
    session_store.log_recovery_interest(
        phone_n,
        community.lower().replace(" ", "_"),
        community=community,
        region_id=region_id,
    )
    refreshed = refresh_checklist(row)
    return {
        "ok": True,
        "logged": True,
        "profile": public_profile(refreshed),
        "note": (
            "This is an eligibility FLAG only, not a payment system. "
            "Real disbursement remains manual/off-platform."
        ),
    }


def complete_item(phone: str, item_id: str, completed: bool = True) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    row = session_store.get_farmer(phone_n)
    if not row:
        return {"ok": False, "error": "not_found"}
    checklist = list(row.get("readinessChecklist") or [])
    found = False
    for item in checklist:
        if item.get("id") == item_id:
            item["completed"] = completed
            item["completedAt"] = time.time() if completed else None
            found = True
            break
    if not found:
        return {"ok": False, "error": "item_not_found"}
    row["readinessChecklist"] = checklist
    row["updatedAt"] = time.time()
    session_store.upsert_farmer(row)
    refreshed = refresh_checklist(row)
    return {"ok": True, "profile": public_profile(refreshed)}


def readiness_rollup() -> dict[str, Any]:
    farmers = session_store.list_farmers()
    by_community: dict[str, dict[str, Any]] = {}
    for f in farmers:
        community = str(f.get("community") or "Unknown")
        bucket = by_community.setdefault(community, {"farmers": 0, "completed_all": 0, "items_done": 0, "items_total": 0})
        checklist = list(f.get("readinessChecklist") or [])
        bucket["farmers"] += 1
        done = sum(1 for i in checklist if i.get("completed"))
        total = len(checklist)
        bucket["items_done"] += done
        bucket["items_total"] += total
        if total > 0 and done >= total:
            bucket["completed_all"] += 1
    communities = []
    for name, b in by_community.items():
        pct = round(100 * b["items_done"] / b["items_total"]) if b["items_total"] else 0
        communities.append(
            {
                "community": name,
                "farmers": b["farmers"],
                "pctComplete": pct,
                "completedAll": b["completed_all"],
            }
        )
    return {"ok": True, "communities": communities, "farmerCount": len(farmers)}


def ussd_register_minimal(phone: str, crop_code: str) -> dict[str, Any]:
    crops = {"1": ["maize"], "2": ["sorghum"], "3": ["other"]}.get(crop_code, ["maize"])
    # Demo PIN 0000 hashed — USSD path skips PIN (SIM auth)
    return register_farmer(phone, "0000", "Kalokol", crops, [])


def get_public_by_phone(phone: str) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    row = session_store.get_farmer(phone_n)
    if not row:
        return {"ok": False, "error": "not_found"}
    refreshed = refresh_checklist(row)
    return {"ok": True, "profile": public_profile(refreshed)}


def top_unfinished(profile: dict[str, Any]) -> dict[str, Any] | None:
    for item in profile.get("readinessChecklist") or []:
        if not item.get("completed"):
            return item
    return None
