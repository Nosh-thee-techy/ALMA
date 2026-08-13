"""
Farmer readiness profiles + checklist generation.

AFTER the climatic pulse: same last-mile tips as SMS / USSD / voice.
Checklist is GENERATED from after-guidance when event_phase is post_risk,
else before-guidance — clipped to SMS length. No separate content set.

Lightweight demo auth for hackathon prototype — production version would
need OTP verification via existing AT SMS integration.
"""
from __future__ import annotations

import hashlib
import secrets
import time
from typing import Any

from services import ground_conditions as gc
from services import readiness_coach
from services import recovery_eligibility as recovery_elig
from services import readiness_score
from services import session_store

SECTOR_ROLES = ("farmer", "herder", "fisher")
SECTOR_EXTRAS: dict[str, dict[str, list[tuple[str, str]]]] = {
    "farmer": {
        "before": [
            ("farmer:drain", "Clear drainage so crop roots do not drown."),
            ("farmer:seed", "Move seed stock to elevated dry storage."),
        ],
        "after": [
            ("farmer:inspect", "Inspect crops before eating or selling."),
            ("farmer:soil", "Test soil before replanting waterlogged plots."),
        ],
    },
    "herder": {
        "before": [
            ("herder:route", "Confirm high-ground grazing route before water rises."),
            ("herder:fodder", "Store fodder dry above the flood line."),
        ],
        "after": [
            ("herder:disease", "Keep livestock off flooded pasture; watch for disease."),
            ("herder:water", "Use clean water points; avoid stagnant flood pools."),
        ],
    },
    "fisher": {
        "before": [
            ("fisher:tether", "Tether boats above the surge line."),
            ("fisher:gear", "Lift nets and gear onto elevated ground."),
            ("fisher:bank", "Stay off crumbling riverbanks."),
        ],
        "after": [
            ("fisher:check", "Check boats and nets before launching."),
            ("fisher:bank2", "Avoid unstable banks after the surge."),
        ],
    },
}


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


def _sms_clip(text: str, limit: int = 90) -> str:
    """First sentence, SMS length — same family as Africa's Talking alerts."""
    text = " ".join((text or "").split())
    for sep in (". ", "; "):
        if sep in text:
            first = text.split(sep)[0].strip()
            if len(first) >= 20:
                text = first.rstrip(".;") + "."
                break
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "."
    return text


def _phase_line(
    sector: str,
    *,
    climate_state: str,
    tier: str,
    compound_active: bool,
    rain_eta_h: float,
    event_phase: str,
) -> str:
    if event_phase == "post_risk":
        return gc.after_guidance(sector)
    return gc.before_guidance(sector, climate_state, tier, compound_active, rain_eta_h)


def resolve_sector_roles(
    crop_types: list[str] | None = None,
    livestock_types: list[str] | None = None,
    fishery_types: list[str] | None = None,
    sector_roles: list[str] | None = None,
) -> list[str]:
    if sector_roles:
        roles = [r for r in sector_roles if r in SECTOR_ROLES]
        if roles:
            return roles
    roles: list[str] = []
    if crop_types:
        roles.append("farmer")
    if livestock_types:
        roles.append("herder")
    if fishery_types:
        roles.append("fisher")
    return roles or ["farmer"]


def _append_item(
    items: list[dict[str, Any]],
    by_id: dict[str, dict[str, Any]],
    *,
    item_id: str,
    task: str,
    climate_state: str,
    phase: str,
    sector: str,
    legacy_ids: list[str] | None = None,
) -> None:
    prev = by_id.get(item_id)
    for lid in legacy_ids or []:
        if prev:
            break
        prev = by_id.get(lid)
    coach = readiness_coach.coach_for(item_id, sector, phase, task)
    items.append(
        {
            "id": item_id,
            "task": task,
            "how": coach.get("how"),
            "afterEffect": coach.get("afterEffect"),
            "linkedClimateState": climate_state,
            "eventPhase": phase,
            "sector": sector,
            "completed": bool(prev and prev.get("completed")),
            "completedAt": (prev or {}).get("completedAt"),
        }
    )


def generate_checklist(
    *,
    crop_types: list[str],
    livestock_types: list[str],
    climate_state: str,
    tier: str,
    compound_active: bool,
    rain_eta_h: float,
    event_phase: str = "pre_risk",
    existing: list[dict[str, Any]] | None = None,
    fishery_types: list[str] | None = None,
    sector_roles: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    SMS-length after/before tips, branched by farmer / herder / fisher.
    Keep already-completed historical items; add new ones when climate changes.
    """
    existing = list(existing or [])
    by_id = {i["id"]: i for i in existing if i.get("id")}
    phase = event_phase or "pre_risk"
    phase_tag = "after" if phase == "post_risk" else "before"
    roles = resolve_sector_roles(crop_types, livestock_types, fishery_types, sector_roles)

    items: list[dict[str, Any]] = []
    if crop_types or "farmer" in roles:
        agri = _sms_clip(
            _phase_line(
                "agriculture",
                climate_state=climate_state,
                tier=tier,
                compound_active=compound_active,
                rain_eta_h=rain_eta_h,
                event_phase=phase,
            )
        )
        item_id = f"agri:{phase_tag}:{climate_state}:{tier}"
        _append_item(
            items,
            by_id,
            item_id=item_id,
            task=agri,
            climate_state=climate_state,
            phase=phase,
            sector="agriculture",
            legacy_ids=[f"agri:{climate_state}:{tier}"],
        )
        for crop in (crop_types or [])[:2]:
            cid = f"crop:{crop}:{phase_tag}:{climate_state}"
            _append_item(
                items,
                by_id,
                item_id=cid,
                task=_sms_clip(f"{crop.capitalize()}: {agri}"),
                climate_state=climate_state,
                phase=phase,
                sector="agriculture",
                legacy_ids=[f"crop:{crop}:{climate_state}"],
            )

    if livestock_types or "herder" in roles:
        live = _sms_clip(
            _phase_line(
                "livestock",
                climate_state=climate_state,
                tier=tier,
                compound_active=compound_active,
                rain_eta_h=rain_eta_h,
                event_phase=phase,
            )
        )
        item_id = f"live:{phase_tag}:{climate_state}:{tier}"
        _append_item(
            items,
            by_id,
            item_id=item_id,
            task=live,
            climate_state=climate_state,
            phase=phase,
            sector="livestock",
            legacy_ids=[f"live:{climate_state}:{tier}"],
        )

    if fishery_types or "fisher" in roles:
        fish = _sms_clip(
            _phase_line(
                "fisheries",
                climate_state=climate_state,
                tier=tier,
                compound_active=compound_active,
                rain_eta_h=rain_eta_h,
                event_phase=phase,
            )
        )
        item_id = f"fish:{phase_tag}:{climate_state}:{tier}"
        _append_item(
            items,
            by_id,
            item_id=item_id,
            task=fish,
            climate_state=climate_state,
            phase=phase,
            sector="fisheries",
        )

    extra_key = "after" if phase == "post_risk" else "before"
    for role in roles:
        for extra_id, extra_task in SECTOR_EXTRAS.get(role, {}).get(extra_key, []):
            eid = f"{extra_id}:{phase_tag}:{climate_state}"
            _append_item(
                items,
                by_id,
                item_id=eid,
                task=_sms_clip(extra_task),
                climate_state=climate_state,
                phase=phase,
                sector=role,
                legacy_ids=[extra_id],
            )

    for old in existing:
        if old.get("completed") and old.get("id") not in {i["id"] for i in items}:
            items.append(old)

    return items


def _region_id_for(community: str) -> str:
    return "omo" if community.lower() in ("omorate", "kalam") else "turkana"


def register_farmer(
    phone: str,
    pin: str,
    community: str,
    crop_types: list[str] | None = None,
    livestock_types: list[str] | None = None,
    fishery_types: list[str] | None = None,
    sector_roles: list[str] | None = None,
) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    pin = (pin or "").strip()
    if len(pin) != 4 or not pin.isdigit():
        return {"ok": False, "error": "pin_must_be_4_digits"}
    roles = resolve_sector_roles(crop_types, livestock_types, fishery_types, sector_roles)
    crops = list(crop_types or [])
    livestock = list(livestock_types or [])
    fishery = list(fishery_types or [])
    if "farmer" in roles and not crops:
        crops = ["maize"]
    if "herder" in roles and not livestock:
        livestock = ["cattle"]
    if "fisher" in roles and not fishery:
        fishery = ["boats"]
    pin_hash, salt = _hash_pin(pin)

    snap = gc.snapshot_from_live()
    region_id = _region_id_for(community)
    st = snap["regions"].get(region_id) or snap["regions"]["turkana"]

    from services.live_signals import get_live_signals

    live = get_live_signals()
    rain_eta = float((live.get("risk") or {}).get("t_rain_arrival_h") or 24)

    checklist = generate_checklist(
        crop_types=crops,
        livestock_types=livestock,
        fishery_types=fishery,
        sector_roles=roles,
        climate_state=st["climate_state"],
        tier=st["tier"],
        compound_active=bool(st["compound_active"]),
        rain_eta_h=rain_eta,
        event_phase=str(st.get("event_phase") or "pre_risk"),
    )

    profile = {
        "phoneNumber": phone_n,
        "pinHash": pin_hash,
        "pinSalt": salt,
        "community": community,
        "cropTypes": crops,
        "livestockTypes": livestock,
        "fisheryTypes": fishery,
        "sectorRoles": roles,
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
    roles = resolve_sector_roles(
        list(profile.get("cropTypes") or []),
        list(profile.get("livestockTypes") or []),
        list(profile.get("fisheryTypes") or []),
        list(profile.get("sectorRoles") or []) or None,
    )
    checklist = generate_checklist(
        crop_types=list(profile.get("cropTypes") or []),
        livestock_types=list(profile.get("livestockTypes") or []),
        fishery_types=list(profile.get("fisheryTypes") or []),
        sector_roles=roles,
        climate_state=st["climate_state"],
        tier=st["tier"],
        compound_active=bool(st["compound_active"]),
        rain_eta_h=rain_eta,
        event_phase=str(st.get("event_phase") or "pre_risk"),
        existing=list(profile.get("readinessChecklist") or []),
    )
    profile = {
        **profile,
        "readinessChecklist": checklist,
        "sectorRoles": roles,
        "updatedAt": time.time(),
    }
    profile["_region"] = st
    session_store.upsert_farmer(profile)
    return profile


def _channel_sector(profile: dict[str, Any]) -> str:
    roles = resolve_sector_roles(
        list(profile.get("cropTypes") or []),
        list(profile.get("livestockTypes") or []),
        list(profile.get("fisheryTypes") or []),
        list(profile.get("sectorRoles") or []) or None,
    )
    if "fisher" in roles and "farmer" not in roles:
        return "fisheries"
    if "herder" in roles and "farmer" not in roles:
        return "pastoralist"
    return "agriculture"


def score_for_profile(profile: dict[str, Any], region: dict[str, Any] | None = None) -> dict[str, Any]:
    phone = str(profile.get("phoneNumber") or "")
    region = region or profile.get("_region") or {}
    stats = session_store.verification_stats(phone) if phone else {
        "checks_sent": 0,
        "timely_responses": 0,
    }
    reports = session_store.count_ground_truth_for_phone(phone) if phone else 0
    return readiness_score.compute_readiness_score(
        checklist=list(profile.get("readinessChecklist") or []),
        checks_sent=stats.get("checks_sent") or 0,
        timely_responses=stats.get("timely_responses") or 0,
        ground_truth_reports=reports,
        event_phase=str(region.get("event_phase") or "pre_risk"),
        compound_active=bool(region.get("compound_active")),
        farmer_flood_risk=str(region.get("farmer_flood_risk") or "") or None,
        tier=str(region.get("tier") or "watch"),
    )


def eligibility_for_profile(profile: dict[str, Any], region: dict[str, Any] | None = None) -> dict[str, Any]:
    community = str(profile.get("community") or "Kalokol")
    region_id = _region_id_for(community)
    region = region or profile.get("_region") or {}
    hours = float(
        region.get("severe_or_compound_hours")
        if region.get("severe_or_compound_hours") is not None
        else session_store.severe_or_compound_hours(region_id)
    )
    hazard = readiness_score.normalize_hazard_level(
        str(region.get("tier") or "watch"),
        compound_active=bool(region.get("compound_active")),
        farmer_flood_risk=str(region.get("farmer_flood_risk") or "") or None,
    )
    audit = recovery_elig.resolve_parametric_flag(
        presence_verified=bool(profile.get("phoneNumber") and community),
        region_hazard_hours=hours,
        pre_event_log_active=recovery_elig.pre_event_log_active(
            list(profile.get("readinessChecklist") or [])
        ),
        region_id=region_id,
        community=community,
        phone=str(profile.get("phoneNumber") or "") or None,
        hazard_level=hazard,
        event_phase=str(region.get("event_phase") or "pre_risk"),
    )
    return audit


def public_profile(profile: dict[str, Any]) -> dict[str, Any]:
    checklist = []
    for item in list(profile.get("readinessChecklist") or []):
        if item.get("how") and item.get("afterEffect"):
            checklist.append(item)
            continue
        coach = readiness_coach.coach_for(
            str(item.get("id") or ""),
            str(item.get("sector") or "farmer"),
            str(item.get("eventPhase") or "pre_risk"),
            str(item.get("task") or ""),
        )
        checklist.append({**item, "how": coach.get("how"), "afterEffect": coach.get("afterEffect")})
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

    sms_tip = ""
    try:
        from services.alert_copy import phase_alert

        community = str(profile.get("community") or "Kalokol")
        region_id = _region_id_for(community)
        sector = _channel_sector(profile)
        sms_tip = phase_alert(sector=sector, region_id=region_id, lang="en")
    except Exception:
        sms_tip = ""

    # Climatic impact cascade — farmer tier only (no full mechanism)
    impact = None
    try:
        from services import climatic_impact as ci
        from services.live_signals import get_live_signals

        live = get_live_signals()
        state = live.get("climatic_state")
        if not state and region:
            risk = live.get("risk") or {}
            state = ci.resolve_climatic_state(
                tier=str(region.get("tier") or risk.get("tier") or "safe"),
                compound_active=bool(region.get("compound_active") or risk.get("compound_active")),
                climate_state=str(region.get("climate_state") or "stable"),
                rain_score=float(risk.get("rain_score") or 0),
                dam_score=float(risk.get("dam_score") or 0),
                drought_risk=str(region.get("drought_risk") or "safe"),
            )
        unfinished = [
            str(i.get("task") or "")
            for i in checklist
            if not i.get("completed") and i.get("task")
        ]
        impact = ci.farmer_briefing(
            str(state or "flood_rain"),
            crop_types=list(profile.get("cropTypes") or []),
            livestock_types=list(profile.get("livestockTypes") or []),
            fishery_types=list(profile.get("fisheryTypes") or []),
            checklist_tasks=unfinished,
        )
    except Exception:
        impact = None

    score = score_for_profile(profile, region)
    audit = eligibility_for_profile(profile, region)
    nxt = next((i for i in checklist if not i.get("completed")), None)
    sms_status = readiness_score.sms_status_line(
        score, str((nxt or {}).get("task") or sms_tip or "")
    )
    community = str(profile.get("community") or "Kalokol")
    crop_why = ""
    live_why = ""
    water_why = ""
    if impact:
        secs = impact.get("sectors") or {}
        crop_why = str((secs.get("crops") or {}).get("whatIsHappening") or "")
        live_why = str((secs.get("livestock") or {}).get("whatIsHappening") or "")
        water_why = str((secs.get("water") or {}).get("whatIsHappening") or "")
    assets = readiness_coach.asset_cards(
        crop_types=list(profile.get("cropTypes") or []),
        livestock_types=list(profile.get("livestockTypes") or []),
        fishery_types=list(profile.get("fisheryTypes") or []),
        climate_state=str((farmer_region or {}).get("climate_state") or region.get("climate_state") or "stable"),
        hazard=str(score.get("hazardLevel") or "WATCH"),
        phase=str((farmer_region or {}).get("event_phase") or "pre_risk"),
        crop_why=crop_why,
        livestock_why=live_why,
        water_why=water_why,
    )
    next_tips = list((impact or {}).get("howToGetBetter") or [])
    if not next_tips:
        next_tips = [str(i.get("task") or "") for i in checklist if not i.get("completed") and i.get("task")][:4]
    gap = readiness_coach.gap_brief(
        preparedness_state=str(score.get("preparednessState") or "UNPREPARED"),
        score_percent=int(score.get("scorePercent") or 0),
        done=done,
        total=len(checklist),
        next_tips=next_tips,
    )
    prediction = str((impact or {}).get("intro") or (farmer_region or {}).get("climate_summary") or "")
    climate = readiness_coach.climate_brief(
        place=community,
        summary=str((farmer_region or {}).get("climate_summary") or prediction),
        hazard=str(score.get("hazardLevel") or "WATCH"),
        phase=str((farmer_region or {}).get("event_phase") or "pre_risk"),
        climate_state=str((farmer_region or {}).get("climate_state") or "stable"),
        prediction=prediction,
    )

    out = {
        "phoneNumber": profile.get("phoneNumber"),
        "community": profile.get("community"),
        "cropTypes": profile.get("cropTypes") or [],
        "livestockTypes": profile.get("livestockTypes") or [],
        "fisheryTypes": profile.get("fisheryTypes") or [],
        "sectorRoles": resolve_sector_roles(
            list(profile.get("cropTypes") or []),
            list(profile.get("livestockTypes") or []),
            list(profile.get("fisheryTypes") or []),
            list(profile.get("sectorRoles") or []) or None,
        ),
        "readinessChecklist": checklist,
        "completedCount": done,
        "totalCount": len(checklist),
        "region": farmer_region,
        "readiness": score,
        "preparednessState": score["preparednessState"],
        "hazardLevel": score["hazardLevel"],
        "recoveryEligible": bool(audit.get("recovery_eligibility_flag")),
        "recoveryEligibility": audit,
        "climaticImpact": impact,
        "smsTip": sms_status if sms_status else sms_tip,
        "channels": {
            "ussd": "*384*96428# then 7 After",
            "voice": "Helpline — press 6 for after-event tips (Alma)",
            "sms": sms_status or sms_tip,
        },
        "todoCount": sum(1 for i in checklist if not i.get("completed")),
        "doneCount": done,
        "assets": assets,
        "gap": gap,
        "climate": climate,
    }
    return out


def log_recovery_interest(phone: str) -> dict[str, Any]:
    """
    Parametric eligibility FLAG only — not a payment or credit score.
    Requires verified presence + region trigger hours + pre-event readiness log.
    """
    phone_n = _normalize_phone(phone)
    row = session_store.get_farmer(phone_n)
    if not row:
        return {"ok": False, "error": "not_found"}
    refreshed = refresh_checklist(row)
    audit = eligibility_for_profile(refreshed)
    session_store.save_eligibility_audit(phone_n, audit)
    if not audit.get("recovery_eligibility_flag"):
        return {
            "ok": False,
            "error": "not_eligible",
            "recoveryEligible": False,
            "recoveryEligibility": audit,
            "profile": public_profile(refreshed),
            "note": recovery_elig.sms_eligibility_line(audit),
        }
    community = str(refreshed.get("community") or "Kalokol")
    region_id = _region_id_for(community)
    session_store.log_recovery_interest(
        phone_n,
        community.lower().replace(" ", "_"),
        community=community,
        region_id=region_id,
    )
    return {
        "ok": True,
        "logged": True,
        "recoveryEligible": True,
        "recoveryEligibility": audit,
        "profile": public_profile(refreshed),
        "note": (
            "Eligibility FLAG for county/NGO dispatch only. "
            "Not a payment, voucher, or credit score."
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
    if completed:
        session_store.record_ground_check_response(phone_n, "web")
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
    return register_farmer(phone, "0000", "Kalokol", crops, [], [], ["farmer"])


def ussd_register_sector(phone: str, sector_code: str, community: str = "Kalokol") -> dict[str, Any]:
    """USSD After role pick: 1 farmer (then crops), 2 herder, 3 fisher."""
    if sector_code == "2":
        return register_farmer(phone, "0000", community, [], ["cattle"], [], ["herder"])
    if sector_code == "3":
        return register_farmer(phone, "0000", community, [], [], ["boats"], ["fisher"])
    return {"ok": False, "need_crop": True, "sector": "farmer"}


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


def complete_next(phone: str) -> dict[str, Any]:
    phone_n = _normalize_phone(phone)
    row = session_store.get_farmer(phone_n)
    if not row:
        return {"ok": False, "error": "not_found"}
    item = top_unfinished(row)
    if not item:
        refreshed = refresh_checklist(row)
        return {
            "ok": True,
            "all_done": True,
            "profile": public_profile(refreshed),
        }
    return complete_item(phone_n, str(item.get("id") or ""), True)


def ussd_readiness(phone: str, lang: str = "en") -> dict[str, Any]:
    """USSD option 7 — SIM-identified after-event tips, no PIN."""
    phone_n = _normalize_phone(phone)
    row = session_store.get_farmer(phone_n)
    if not row:
        return {"ok": False, "error": "not_found", "need_register": True}
    refreshed = refresh_checklist(row)
    pub = public_profile(refreshed)
    nxt = top_unfinished(refreshed)
    score = score_for_profile(refreshed)
    audit = eligibility_for_profile(refreshed)
    session_store.record_ground_check_response(phone_n, "ussd")
    tip = _sms_clip(str((nxt or {}).get("task") or pub.get("smsTip") or "All after-actions done."))
    return {
        "ok": True,
        "need_register": False,
        "profile": pub,
        "next": nxt,
        "tip": tip,
        "done": pub.get("doneCount") or 0,
        "total": pub.get("totalCount") or 0,
        "eligible": bool(audit.get("recovery_eligibility_flag")),
        "preparednessState": score.get("preparednessState"),
        "hazardLevel": score.get("hazardLevel"),
        "scorePercent": score.get("scorePercent"),
        "ussdHead": readiness_score.ussd_status_head(
            score, int(pub.get("doneCount") or 0), int(pub.get("totalCount") or 0)
        ),
        "smsLine": readiness_score.sms_status_line(score, tip),
        "phase": (pub.get("region") or {}).get("event_phase") or "pre_risk",
        "lang": lang,
    }


def voice_readiness_script(
    phone: str | None = None,
    *,
    ward: str = "kalokol",
    lang: str = "en",
) -> str:
    """Spoken after-cycle brief — same SMS tip Alma would send."""
    from services.alert_copy import phase_alert

    region_id = "omo" if (ward or "").lower() in ("omorate", "kalam") else "turkana"
    phone_n = _normalize_phone(phone or "")
    row = session_store.get_farmer(phone_n) if phone_n else None
    if row:
        refreshed = refresh_checklist(row)
        pub = public_profile(refreshed)
        nxt = top_unfinished(refreshed)
        done = pub.get("doneCount") or 0
        total = pub.get("totalCount") or 0
        tip = str((nxt or {}).get("task") or pub.get("smsTip") or "")
        community = pub.get("community") or ward
        state = pub.get("preparednessState") or "UNPREPARED"
        hazard = pub.get("hazardLevel") or "WATCH"
        readiness = pub.get("readiness") if isinstance(pub.get("readiness"), dict) else {}
        pct = int((readiness or {}).get("scorePercent") or 0)
        session_store.record_ground_check_response(phone_n, "voice")
        if lang == "sw":
            if nxt:
                return (
                    f"Habari, mimi ni Alma. Baada ya tukio huko {community}. "
                    f"Hatari {hazard}. Wewe {state} {pct}. Hii si alama ya mkopo. "
                    f"Umekamilisha {done} kati ya {total}. Hatua: {tip} "
                    "Piga nyota tatu nane nne nyota tisa sita nne mbili nane hash, chaguo saba."
                )
            return (
                f"Habari, mimi ni Alma. {community}: hatari {hazard}, wewe {state}. "
                "Umemaliza hatua za baada ya tukio. Asante."
            )
        if nxt:
            return (
                f"Hello, I'm Alma. After the event in {community}. "
                f"Hazard {hazard}. You are {state} {pct}. This is preparedness, not credit. "
                f"You have done {done} of {total}. Next: {tip} "
                "Dial star 3 8 4 star 9 6 4 2 8 hash, then 7, to mark it done."
            )
        return (
            f"Hello, I'm Alma. {community}: hazard {hazard}, you are {state}. "
            "All after-event actions are done. Thank you."
        )

    sms = phase_alert(sector="pastoralist", region_id=region_id, lang="en" if lang != "sw" else "sw")
    if lang == "sw":
        return f"Habari, mimi ni Alma. Baada ya tukio. {sms}"
    return f"Hello, I'm Alma. After the event. {sms}"


def _facts_speech(pub: dict[str, Any], topic: str, task_id: str | None = None) -> str:
    """English fact script Alma may translate — never invents hazard."""
    climate = pub.get("climate") or {}
    gap = pub.get("gap") or {}
    assets = list(pub.get("assets") or [])
    place = climate.get("place") or pub.get("community") or "your ward"
    hazard = pub.get("hazardLevel") or climate.get("hazard") or "WATCH"
    if topic == "assets":
        if not assets:
            return f"In {place}, no crops, animals, or gear are registered yet. Hazard is {hazard}."
        bits = [a.get("howTheyAre") for a in assets if a.get("howTheyAre")]
        return f"In {place}. Hazard {hazard}. " + " ".join(bits[:4])
    if topic == "climate":
        return (
            f"You are in {place}. Hazard {hazard}. "
            f"{climate.get('phasePlain') or ''} {climate.get('prediction') or climate.get('summary') or ''}"
        )
    if topic == "gap":
        tips = "; ".join(gap.get("howToGetBetter") or [])
        return (
            f"You are {gap.get('youAre')}. You should be {gap.get('youShouldBe')}. "
            f"Next: {tips or 'all current actions are done.'} This is operational readiness, not credit."
        )
    if topic == "task":
        item = next((i for i in pub.get("readinessChecklist") or [] if i.get("id") == task_id), None)
        if not item:
            item = next((i for i in pub.get("readinessChecklist") or [] if not i.get("completed")), None)
        if not item:
            return f"All current actions in {place} are done. Hazard remains {hazard}."
        return (
            f"{item.get('task')} How: {item.get('how') or 'Do this in daylight.'} "
            f"When it is done: {item.get('afterEffect') or 'The next action unlocks.'}"
        )
    # home — full orientation
    asset_line = assets[0].get("howTheyAre") if assets else "Register your crops or animals."
    tips = "; ".join((gap.get("howToGetBetter") or [])[:2])
    return (
        f"Hello, I'm Alma. You are in {place}. Hazard {hazard}. {asset_line} "
        f"You are {gap.get('youAre')}. You should be READY. {tips}"
    )


def alma_speak(
    phone: str,
    *,
    topic: str = "home",
    task_id: str | None = None,
    lang: str = "en",
    include_audio: bool = True,
) -> dict[str, Any]:
    """
    Voice-first After helper. Facts are pre-calculated; Gemma/Featherless only translate.
    Audio is ElevenLabs multilingual.
    """
    from services import elevenlabs_tts
    from services import readiness_guardrail as rg

    got = get_public_by_phone(phone)
    if not got.get("ok"):
        return {**got, "reply": "I could not find your After profile. Register on USSD option 7."}
    pub = got["profile"]
    facts = _facts_speech(pub, topic, task_id)
    lang_use = lang if lang in readiness_coach.LANG_NAMES else "en"
    ctx = rg.structured_context(
        hazard_level=str(pub.get("hazardLevel") or "WATCH"),
        sector=(pub.get("sectorRoles") or ["farmer"])[0],
        lang=lang_use,
        event_phase=str((pub.get("climate") or {}).get("phase") or "pre_risk"),
        preparedness_state=pub.get("preparednessState"),
        score_percent=(pub.get("readiness") or {}).get("scorePercent")
        if isinstance(pub.get("readiness"), dict)
        else None,
        community=pub.get("community"),
        next_tip=facts[:160],
        compound_active=str(pub.get("hazardLevel") or "") == "COMPOUND",
    )
    question = (
        f"Speak these facts to a community member in {readiness_coach.LANG_NAMES.get(lang_use, 'English')}. "
        "Do not add flood conditions. Do not change hazard. "
        f"Facts: {facts}"
    )
    if lang_use == "en":
        bounded = {
            "text": facts,
            "source": "script_en",
            "confidence": 1.0,
            "fallback_reason": None,
        }
    else:
        bounded = rg.bounded_advice(question, ctx, llm_fn=rg._try_gemma_translate)
        # If fallback is English expert script, prefer the fact script in SW templates
        if bounded.get("source", "").startswith("script") and lang_use == "sw":
            bounded = {**bounded, "text": facts}
    reply = str(bounded.get("text") or facts).strip()
    audio: dict[str, Any] = {"ok": False, "mode": "text_only"}
    if include_audio:
        audio = elevenlabs_tts.synthesize(reply)
    return {
        "ok": True,
        "topic": topic,
        "lang": lang_use,
        "reply": reply,
        "source": bounded.get("source"),
        "fallback_reason": bounded.get("fallback_reason"),
        "audio_url": elevenlabs_tts.desk_audio_url(audio),
        "tts_mode": audio.get("mode") or "demo",
        "facts": facts,
        "voice": "elevenlabs",
    }
