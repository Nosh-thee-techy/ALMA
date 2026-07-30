"""Africa's Talking USSD — action-first early action (*384*96428#)."""
from __future__ import annotations

import os

from fastapi import APIRouter, Form, Request
from fastapi.responses import PlainTextResponse

from services import gemma_ai, session_store, ussd_locale
from services.live_signals import get_live_signals
from services.playbook_loader import cell_to_ward, corridor_for_ward, ward_props

router = APIRouter(tags=["ussd"])

USSD_DIAL = os.getenv("USSD_DIAL_CODE", "*384*96428#")
CASH_AMOUNT_KES = int(os.getenv("ALMA_CASH_AMOUNT_KES", "2000"))

WARD_CODES = {
    "1": "kalokol",
    "2": "kangatotha",
    "3": "todonyang",
    "4": "nachukui",
    "5": "omorate",
}


def _parts(text: str) -> list[str]:
    return [p for p in text.split("*") if p != ""] if text else []


def _resolve_ward(code: str | None, lac: str | None, cid: str | None, payload: dict) -> str | None:
    if payload.get("ward_id"):
        return payload["ward_id"]
    mapped = cell_to_ward(lac, cid)
    if mapped:
        return mapped
    if code and code.strip() in WARD_CODES:
        return WARD_CODES[code.strip()]
    return None


def _live_snapshot() -> dict:
    signals = get_live_signals()
    risk = signals.get("risk") or {}
    rain = signals.get("rain") or {}
    dam = signals.get("dam_alternative") or {}
    return {
        "rain_mm": round(float(rain.get("rain_24h_mm") or risk.get("rain_mm") or 0), 1),
        "dam_m3s": round(float(dam.get("estimated_release_m3s") or risk.get("dam_discharge_m3s") or 0), 1),
        "tier": risk.get("tier") or "watch",
        "severity": risk.get("compound_severity"),
        "data_quality": risk.get("data_quality") or "estimated",
        "compound_active": bool(risk.get("compound_active")),
    }


def _end(lang: str, kind: str, facts: dict) -> PlainTextResponse:
    body = ussd_locale.localize_action(lang, kind, facts)
    return PlainTextResponse(f"END {body}")


@router.post("/api/ussd")
async def ussd_webhook(
    request: Request,
    sessionId: str = Form(""),
    phoneNumber: str = Form(""),
    text: str = Form(""),
    serviceCode: str = Form(""),
):
    """
    Africa's Talking posts application/x-www-form-urlencoded.
    Path shape: language * action * ...details
    """
    lac = request.headers.get("lac") or request.query_params.get("lac")
    cid = request.headers.get("cid") or request.query_params.get("cid")
    parts = _parts(text)
    session = session_store.get_session(sessionId)
    payload = dict((session or {}).get("payload") or {})
    tower_ward = cell_to_ward(lac, cid)
    if tower_ward:
        payload["ward_id"] = tower_ward

    # Timed-out mid-flow resume
    if session and not parts and session.get("state") not in (None, "root", "done", "lang"):
        age = __import__("time").time() - float(session.get("updated_at") or 0)
        if age < 1800 and payload.get("lang"):
            session_store.save_session(sessionId, phoneNumber, "resume_wait", payload)
            return PlainTextResponse(
                "CON ALMA session resumed.\n"
                "1. Continue\n"
                "2. Start over"
            )

    # Fresh dial → language
    if not parts:
        session_store.save_session(sessionId, phoneNumber, "lang", {"ward_id": tower_ward})
        return PlainTextResponse(ussd_locale.language_menu())

    # Resume answers (AT may send only "1"/"2")
    if session and session.get("state") == "resume_wait" and len(parts) == 1 and parts[0] in ("1", "2"):
        if parts[0] == "2":
            session_store.clear_session(sessionId)
            session_store.save_session(sessionId, phoneNumber, "lang", {"ward_id": tower_ward})
            return PlainTextResponse(ussd_locale.language_menu())
        lang = payload.get("lang") or "en"
        session_store.save_session(sessionId, phoneNumber, "root", payload)
        return PlainTextResponse(ussd_locale.main_menu(lang))

    # Standard path: parts[0] = language
    lang_code = parts[0]
    if lang_code not in ussd_locale.LANGS:
        session_store.clear_session(sessionId)
        return PlainTextResponse(ussd_locale.invalid("en", USSD_DIAL))

    lang = ussd_locale.lang_from_code(lang_code)
    payload["lang"] = lang

    # Only language chosen → main menu
    if len(parts) == 1:
        session_store.save_session(sessionId, phoneNumber, "root", payload)
        return PlainTextResponse(ussd_locale.main_menu(lang))

    action = parts[1]
    rest = parts[2:]

    # --- 1 Live flood risk ---
    if action == "1":
        ward_id = payload.get("ward_id")
        if not ward_id:
            if not rest:
                session_store.save_session(sessionId, phoneNumber, "risk_ward", payload)
                return PlainTextResponse(ussd_locale.ward_menu(lang))
            ward_id = _resolve_ward(rest[0], lac, cid, payload)
            if not ward_id:
                return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))
            payload["ward_id"] = ward_id

        live = _live_snapshot()
        props = ward_props(ward_id) or {"name": ward_id, "sector_default": "pastoralist"}
        session_store.log_action(
            phoneNumber,
            ward_id,
            "risk_check",
            {"live": live, "ward": props.get("name")},
        )
        session_store.clear_session(sessionId)
        return _end(
            lang,
            "risk",
            {
                "ward": props.get("name"),
                "tier": live["tier"],
                "rain_mm": live["rain_mm"],
                "dam_m3s": live["dam_m3s"],
                "sector": props.get("sector_default", "pastoralist"),
                "data_quality": live["data_quality"],
            },
        )

    # --- 2 Confirm herd evacuation (WRITE) ---
    if action == "2":
        ward_id = payload.get("ward_id")
        if not ward_id:
            if not rest:
                session_store.save_session(sessionId, phoneNumber, "evac_ward", payload)
                return PlainTextResponse(ussd_locale.ward_menu(lang))
            ward_id = _resolve_ward(rest[0], lac, cid, payload)
            if not ward_id:
                return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))
            payload["ward_id"] = ward_id
            rest = rest[1:]

        props = ward_props(ward_id) or {"name": ward_id}
        corr = corridor_for_ward(ward_id)
        live = _live_snapshot()

        if not rest:
            session_store.save_session(sessionId, phoneNumber, "evac_confirm", payload)
            return PlainTextResponse(
                ussd_locale.confirm_evac_menu(lang, props.get("name") or ward_id, corr)
            )

        if rest[0] == "2":
            session_store.clear_session(sessionId)
            return PlainTextResponse(ussd_locale.cancelled(lang))

        if rest[0] != "1":
            return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))

        session_store.log_action(
            phoneNumber,
            ward_id,
            "evacuation_confirmed",
            {
                "corridor": corr,
                "live": live,
                "ward_name": props.get("name"),
                "status": "active",
            },
        )
        session_store.clear_session(sessionId)
        return _end(
            lang,
            "evac",
            {
                "ward": props.get("name"),
                "corridor": corr,
                "tier": live["tier"],
                "rain_mm": live["rain_mm"],
                "dam_m3s": live["dam_m3s"],
            },
        )

    # --- 3 Ground-truth report (WRITE) ---
    if action == "3":
        if not rest:
            session_store.save_session(sessionId, phoneNumber, "report_text", payload)
            return PlainTextResponse(ussd_locale.report_prompt(lang))

        free = "*".join(rest).replace("*", " ")
        # Prefer original segment after lang*3*
        if text.count("*") >= 2:
            free = text.split("*", 2)[2].replace("*", " ")

        parsed = gemma_ai.parse_ground_truth(free)
        ward_id = payload.get("ward_id") or tower_ward
        session_store.add_ground_truth(phoneNumber, ward_id, parsed)
        session_store.clear_session(sessionId)
        return _end(
            lang,
            "report",
            {
                "status": parsed.get("water_level_status"),
                "entity": parsed.get("affected_entity"),
                "node": parsed.get("node_id"),
                "parser": parsed.get("parser"),
                "ward": ward_id,
            },
        )

    # --- 4 Claim feed voucher (WRITE) ---
    if action == "4":
        ward_id = payload.get("ward_id")
        if not ward_id:
            if not rest:
                session_store.save_session(sessionId, phoneNumber, "voucher_ward", payload)
                return PlainTextResponse(ussd_locale.ward_menu(lang))
            ward_id = _resolve_ward(rest[0], lac, cid, payload)
            if not ward_id:
                return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))

        voucher = session_store.issue_voucher(phoneNumber or "unknown", ward_id)
        props = ward_props(ward_id) or {"name": ward_id}
        session_store.clear_session(sessionId)
        return _end(
            lang,
            "voucher",
            {
                "code": voucher["code"],
                "ward": props.get("name"),
                "phone": phoneNumber,
            },
        )

    # --- 5 Emergency cash STK (WRITE / demo rail) ---
    if action == "5":
        if not rest:
            session_store.save_session(sessionId, phoneNumber, "cash_confirm", payload)
            return PlainTextResponse(ussd_locale.confirm_cash_menu(lang, CASH_AMOUNT_KES))

        if rest[0] == "2":
            session_store.clear_session(sessionId)
            return PlainTextResponse(ussd_locale.cancelled(lang))

        if rest[0] != "1":
            return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))

        live = _live_snapshot()
        cash = session_store.create_cash_request(
            phoneNumber or "unknown",
            CASH_AMOUNT_KES,
            {
                "ward_id": payload.get("ward_id") or tower_ward,
                "live_tier": live["tier"],
                "provider": "africastalking_mpesa_stk_demo",
            },
        )
        session_store.clear_session(sessionId)
        return _end(
            lang,
            "cash",
            {
                "amount_kes": cash["amount_kes"],
                "ref": cash["ref"],
                "status": cash["status"],
                "tier": live["tier"],
            },
        )

    session_store.clear_session(sessionId)
    return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))
