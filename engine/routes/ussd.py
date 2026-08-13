"""Africa's Talking USSD — action-first early action (*384*96428#).

State-machine flow so every menu option completes even when the network
sends only the latest keypress (not the full lang*action*ward path).
"""
from __future__ import annotations

import logging
import os
import time

from fastapi import APIRouter, Form, Request
from fastapi.responses import PlainTextResponse

from services import gemma_ai, session_store, ussd_locale
from services.live_signals import get_live_signals
from services.playbook_loader import cell_to_ward, corridor_for_ward, ward_props

router = APIRouter(tags=["ussd"])
log = logging.getLogger("alma.ussd")

USSD_DIAL = os.getenv("USSD_DIAL_CODE", "*384*96428#")
# Dedicated SOS shortcode — NOT nested in the main ALMA menu.
# Configure the same code on Africa's Talking as a separate USSD channel.
SOS_USSD_DIAL = os.getenv("SOS_USSD_DIAL_CODE", "*384*96429#")
SOS_USSD_SERVICE_CODES = {
    c.strip()
    for c in os.getenv(
        "SOS_USSD_SERVICE_CODES",
        f"{SOS_USSD_DIAL},{SOS_USSD_DIAL.rstrip('#')}",
    ).split(",")
    if c.strip()
}
CASH_AMOUNT_KES = int(os.getenv("ALMA_CASH_AMOUNT_KES", "2000"))

WARD_CODES = {
    "1": "kalokol",
    "2": "kangatotha",
    "3": "todonyang",
    "4": "nachukui",
    "5": "omorate",
}

# Session states that expect a single next keypress (not full AT path)
_STEP_STATES = {
    "risk_ward",
    "evac_ward",
    "evac_confirm",
    "voucher_ward",
    "cash_confirm",
    "report_text",
    "menu",
    "lang",
    "obs_org",
    "obs_type",
    "obs_value",
    "ready_menu",
    "ready_crop",
    "ready_sector",
}


def _parts(text: str) -> list[str]:
    return [p for p in text.split("*") if p != ""] if text else []


def _last_input(text: str) -> str:
    parts = _parts(text)
    return parts[-1] if parts else ""


def _ward_from_code(code: str | None) -> str | None:
    if not code:
        return None
    return WARD_CODES.get(code.strip())


def _warm_live_cache() -> None:
    try:
        get_live_signals()
    except Exception:
        pass


def _live_fast() -> dict:
    """Cache-only live risk — never block USSD on Open-Meteo."""
    try:
        from services import live_signals as ls
        import threading

        cached = ls._CACHE.get("data")  # noqa: SLF001 — intentional for USSD speed
        if not cached:
            # Warm for next dial; answer this request with defaults.
            threading.Thread(target=_warm_live_cache, daemon=True).start()
            return {
                "rain_mm": 0.0,
                "dam_m3s": 0.0,
                "tier": "watch",
                "data_quality": "estimated",
            }
        risk = cached.get("risk") or {}
        rain = cached.get("rain") or {}
        dam = cached.get("dam_alternative") or {}
        return {
            "rain_mm": round(float(rain.get("rain_24h_mm") or risk.get("rain_mm") or 0), 1),
            "dam_m3s": round(
                float(dam.get("estimated_release_m3s") or risk.get("dam_discharge_m3s") or 0), 1
            ),
            "tier": str(risk.get("tier") or "watch"),
            "data_quality": risk.get("data_quality") or "estimated",
        }
    except Exception as exc:
        log.warning("live snapshot failed: %s", exc)
        return {
            "rain_mm": 0.0,
            "dam_m3s": 0.0,
            "tier": "watch",
            "data_quality": "estimated",
        }


def _end(lang: str, kind: str, facts: dict) -> PlainTextResponse:
    body = ussd_locale.localize_action(lang, kind, facts)
    if not body.upper().startswith("END"):
        body = f"END {body}"
    return PlainTextResponse(body)


def _con(text: str) -> PlainTextResponse:
    return PlainTextResponse(text)


def _finish_risk(phone: str, session_id: str, lang: str, ward_id: str) -> PlainTextResponse:
    live = _live_fast()
    props = ward_props(ward_id) or {"name": ward_id, "sector_default": "pastoralist"}
    # Optional short "why" from climatic cascade — keep USSD under length limits
    why = ""
    try:
        from services import climatic_impact as ci
        from services import live_signals as ls

        cached = ls._CACHE.get("data") or {}  # noqa: SLF001 — USSD must stay cache-only
        state = cached.get("climatic_state") or "flood_rain"
        why = ci.sms_why_clause(str(state), "crops")
    except Exception:
        why = ""
    session_store.log_action(
        phone, ward_id, "risk_check", {"live": live, "ward": props.get("name"), "why": why}
    )
    session_store.clear_session(session_id)
    return _end(
        lang,
        "risk",
        {
            "ward": props.get("name") or ward_id,
            "tier": live["tier"],
            "rain_mm": live["rain_mm"],
            "dam_m3s": live["dam_m3s"],
            "sector": props.get("sector_default", "pastoralist"),
            "data_quality": live["data_quality"],
            "why": why,
        },
    )


def _start_observer_flow(session_id: str, phone: str, lang: str, payload: dict) -> PlainTextResponse:
    from services import ground_observers as go

    existing = go.get_observer(phone)
    if existing:
        payload["observer_org"] = existing.get("organizationId") or "Other"
        session_store.save_session(session_id, phone, "obs_type", payload)
        return _con(ussd_locale.observer_type_menu(lang))
    session_store.save_session(session_id, phone, "obs_org", payload)
    return _con(ussd_locale.observer_org_menu(lang))


def _finish_observer_report(
    session_id: str, phone: str, lang: str, payload: dict, value_choice: str
) -> PlainTextResponse:
    from services import ground_observers as go

    rtype = payload.get("observer_type") or "rainfall"
    org = payload.get("observer_org") or "Other"
    # Auto-register if somehow missing
    if not go.get_observer(phone):
        go.register_observer(phone, org, registered_location=payload.get("ward_id"))
    result = go.log_report(
        phone,
        str(rtype),
        value_choice,
        organization_id=str(org),
        source="ussd",
    )
    session_store.clear_session(session_id)
    if not result.get("ok"):
        return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))
    ack = result.get("ack") or f"Report received. Thank you, {org}."
    return PlainTextResponse(f"END {ack}")


def _readiness_con(session_id: str, phone: str, lang: str, payload: dict) -> PlainTextResponse:
    from services import farmer_readiness as fr

    screen = fr.ussd_readiness(phone, lang)
    if screen.get("need_register"):
        session_store.save_session(session_id, phone, "ready_sector", payload)
        return _con(ussd_locale.readiness_sector_menu(lang))
    payload["readiness"] = True
    session_store.save_session(session_id, phone, "ready_menu", payload)
    return _con(
        ussd_locale.readiness_action_menu(
            lang,
            {
                "done": screen.get("done") or 0,
                "total": screen.get("total") or 0,
                "tip": screen.get("tip") or "",
                "eligible": screen.get("eligible"),
                "all_done": not screen.get("next"),
                "ussdHead": screen.get("ussdHead"),
                "preparednessState": screen.get("preparednessState"),
                "hazardLevel": screen.get("hazardLevel"),
            },
        )
    )


def _finish_evac(phone: str, session_id: str, lang: str, ward_id: str) -> PlainTextResponse:
    props = ward_props(ward_id) or {"name": ward_id}
    corr = corridor_for_ward(ward_id) or {}
    live = _live_fast()
    session_store.log_action(
        phone,
        ward_id,
        "evacuation_confirmed",
        {
            "corridor": corr,
            "live": live,
            "ward_name": props.get("name"),
            "status": "active",
        },
    )
    session_store.clear_session(session_id)
    return _end(
        lang,
        "evac",
        {
            "ward": props.get("name") or ward_id,
            "corridor": corr,
            "tier": live["tier"],
            "rain_mm": live["rain_mm"],
            "dam_m3s": live["dam_m3s"],
        },
    )


def _finish_voucher(phone: str, session_id: str, lang: str, ward_id: str) -> PlainTextResponse:
    voucher = session_store.issue_voucher(phone or "unknown", ward_id)
    props = ward_props(ward_id) or {"name": ward_id}
    session_store.clear_session(session_id)
    return _end(
        lang,
        "voucher",
        {"code": voucher["code"], "ward": props.get("name") or ward_id, "phone": phone},
    )


def _finish_cash(phone: str, session_id: str, lang: str, payload: dict) -> PlainTextResponse:
    live = _live_fast()
    cash = session_store.create_cash_request(
        phone or "unknown",
        CASH_AMOUNT_KES,
        {
            "ward_id": payload.get("ward_id"),
            "live_tier": live["tier"],
            "provider": "africastalking_mpesa_stk_demo",
        },
    )
    session_store.clear_session(session_id)
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


def _finish_report(
    phone: str, session_id: str, lang: str, ward_id: str | None, free: str
) -> PlainTextResponse:
    # Rule parser only — Gemma/Featherless are too slow for USSD.
    parsed = gemma_ai.parse_ground_truth_rule_based(free)
    session_store.add_ground_truth(phone, ward_id, parsed)
    session_store.clear_session(session_id)
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


def _handle_menu_action(
    session_id: str,
    phone: str,
    lang: str,
    payload: dict,
    action: str,
    lac: str | None,
    cid: str | None,
) -> PlainTextResponse:
    tower_ward = cell_to_ward(lac, cid)
    if tower_ward:
        payload["ward_id"] = tower_ward

    if action == "1":
        ward_id = payload.get("ward_id")
        if ward_id:
            return _finish_risk(phone, session_id, lang, ward_id)
        session_store.save_session(session_id, phone, "risk_ward", payload)
        return _con(ussd_locale.ward_menu(lang))

    if action == "2":
        ward_id = payload.get("ward_id")
        if not ward_id:
            session_store.save_session(session_id, phone, "evac_ward", payload)
            return _con(ussd_locale.ward_menu(lang))
        props = ward_props(ward_id) or {"name": ward_id}
        corr = corridor_for_ward(ward_id) or {}
        session_store.save_session(session_id, phone, "evac_confirm", payload)
        return _con(ussd_locale.confirm_evac_menu(lang, props.get("name") or ward_id, corr))

    if action == "3":
        session_store.save_session(session_id, phone, "report_text", payload)
        return _con(ussd_locale.report_prompt(lang))

    if action == "4":
        ward_id = payload.get("ward_id")
        if ward_id:
            return _finish_voucher(phone, session_id, lang, ward_id)
        session_store.save_session(session_id, phone, "voucher_ward", payload)
        return _con(ussd_locale.ward_menu(lang))

    if action == "5":
        session_store.save_session(session_id, phone, "cash_confirm", payload)
        return _con(ussd_locale.confirm_cash_menu(lang, CASH_AMOUNT_KES))

    if action == "6":
        return _start_observer_flow(session_id, phone, lang, payload)

    if action == "7":
        return _readiness_con(session_id, phone, lang, payload)

    return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))


def _handle_step(
    session_id: str,
    phone: str,
    state: str,
    payload: dict,
    choice: str,
    text: str,
    lac: str | None,
    cid: str | None,
) -> PlainTextResponse:
    lang = payload.get("lang") or "en"

    if state == "lang":
        if choice not in ussd_locale.LANGS:
            return PlainTextResponse(ussd_locale.invalid("en", USSD_DIAL))
        lang = ussd_locale.lang_from_code(choice)
        payload["lang"] = lang
        session_store.save_session(session_id, phone, "menu", payload)
        return _con(ussd_locale.main_menu(lang))

    if state == "menu":
        return _handle_menu_action(session_id, phone, lang, payload, choice, lac, cid)

    if state == "risk_ward":
        ward_id = _ward_from_code(choice)
        if not ward_id:
            return _con(ussd_locale.ward_menu(lang))
        payload["ward_id"] = ward_id
        return _finish_risk(phone, session_id, lang, ward_id)

    if state == "evac_ward":
        ward_id = _ward_from_code(choice)
        if not ward_id:
            return _con(ussd_locale.ward_menu(lang))
        payload["ward_id"] = ward_id
        props = ward_props(ward_id) or {"name": ward_id}
        corr = corridor_for_ward(ward_id) or {}
        session_store.save_session(session_id, phone, "evac_confirm", payload)
        return _con(ussd_locale.confirm_evac_menu(lang, props.get("name") or ward_id, corr))

    if state == "evac_confirm":
        if choice == "2":
            session_store.clear_session(session_id)
            return PlainTextResponse(ussd_locale.cancelled(lang))
        if choice != "1":
            props = ward_props(payload.get("ward_id") or "") or {"name": payload.get("ward_id")}
            corr = corridor_for_ward(payload.get("ward_id") or "") or {}
            return _con(
                ussd_locale.confirm_evac_menu(
                    lang, props.get("name") or payload.get("ward_id") or "ward", corr
                )
            )
        ward_id = payload.get("ward_id")
        if not ward_id:
            session_store.save_session(session_id, phone, "evac_ward", payload)
            return _con(ussd_locale.ward_menu(lang))
        return _finish_evac(phone, session_id, lang, ward_id)

    if state == "voucher_ward":
        ward_id = _ward_from_code(choice)
        if not ward_id:
            return _con(ussd_locale.ward_menu(lang))
        payload["ward_id"] = ward_id
        return _finish_voucher(phone, session_id, lang, ward_id)

    if state == "cash_confirm":
        if choice == "2":
            session_store.clear_session(session_id)
            return PlainTextResponse(ussd_locale.cancelled(lang))
        if choice != "1":
            return _con(ussd_locale.confirm_cash_menu(lang, CASH_AMOUNT_KES))
        return _finish_cash(phone, session_id, lang, payload)

    if state == "report_text":
        free = text
        if "*" in text:
            # Prefer text after last menu hop when AT accumulates
            free = text.split("*")[-1]
        free = (free or "").strip() or choice
        return _finish_report(phone, session_id, lang, payload.get("ward_id"), free)

    if state == "obs_org":
        from services import ground_observers as go

        if choice not in go.ORG_CODES:
            return _con(ussd_locale.observer_org_menu(lang))
        org = go.ORG_CODES[choice]
        payload["observer_org"] = org
        go.register_observer(phone, org, registered_location=payload.get("ward_id"))
        session_store.save_session(session_id, phone, "obs_type", payload)
        return _con(ussd_locale.observer_type_menu(lang))

    if state == "obs_type":
        from services import ground_observers as go

        if choice not in ("1", "2", "3"):
            return _con(ussd_locale.observer_type_menu(lang))
        rtype = go.REPORT_TYPES[choice]
        payload["observer_type"] = rtype
        session_store.save_session(session_id, phone, "obs_value", payload)
        return _con(ussd_locale.observer_value_menu(lang, rtype))

    if state == "obs_value":
        rtype = payload.get("observer_type") or "rainfall"
        max_choice = "3" if rtype == "dam_activity" else "4"
        if choice not in {str(i) for i in range(1, int(max_choice) + 1)}:
            return _con(ussd_locale.observer_value_menu(lang, str(rtype)))
        return _finish_observer_report(session_id, phone, lang, payload, choice)

    if state == "ready_sector":
        from services import farmer_readiness as fr

        if choice not in ("1", "2", "3"):
            return _con(ussd_locale.readiness_sector_menu(lang))
        if choice == "1":
            session_store.save_session(session_id, phone, "ready_crop", payload)
            return _con(ussd_locale.readiness_crop_menu(lang))
        fr.ussd_register_sector(phone, choice)
        return _readiness_con(session_id, phone, lang, payload)

    if state == "ready_crop":
        from services import farmer_readiness as fr

        if choice not in ("1", "2", "3"):
            return _con(ussd_locale.readiness_crop_menu(lang))
        fr.ussd_register_minimal(phone, choice)
        return _readiness_con(session_id, phone, lang, payload)

    if state == "ready_menu":
        from services import farmer_readiness as fr

        if choice == "1":
            fr.complete_next(phone)
            return _readiness_con(session_id, phone, lang, payload)
        if choice == "2":
            return _readiness_con(session_id, phone, lang, payload)
        if choice == "3":
            result = fr.log_recovery_interest(phone)
            session_store.clear_session(session_id)
            if result.get("ok"):
                return _end(
                    lang,
                    "readiness",
                    {
                        "tip": "Recovery flag YES. County/NGO follow-up — not a payment.",
                        "done": 1,
                        "total": 1,
                    },
                )
            tip = str((result.get("note") or "Not eligible yet."))[:90]
            return _end(lang, "readiness", {"tip": tip, "done": 0, "total": 1})
        if choice == "0":
            session_store.save_session(session_id, phone, "menu", payload)
            return _con(ussd_locale.main_menu(lang))
        return _readiness_con(session_id, phone, lang, payload)

    session_store.clear_session(session_id)
    return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))


def _is_sos_service(service_code: str) -> bool:
    raw = (service_code or "").strip()
    if not raw:
        return False
    candidates = {raw, raw.rstrip("#"), f"{raw}#" if not raw.endswith("#") else raw}
    return bool(candidates & SOS_USSD_SERVICE_CODES) or "96429" in raw


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

    Prefer session state + last keypress. Also accept classic full paths
    like 1*1*2 (lang * action * ward) for simulators / some networks.
    """
    started = time.perf_counter()
    try:
        # Dedicated SOS shortcode — immediate Stage 1, no menu.
        if _is_sos_service(serviceCode):
            from services import sos_lifecycle

            result = sos_lifecycle.ingest_sos(
                phoneNumber,
                channel="USSD",
                message_body="SOS (USSD shortcode)",
                send_confirm_sms=True,
            )
            session_store.clear_session(sessionId)
            confirm = str(result.get("confirm_message") or sos_lifecycle.confirm_message())
            return PlainTextResponse(f"END {confirm}")

        lac = request.headers.get("lac") or request.query_params.get("lac")
        cid = request.headers.get("cid") or request.query_params.get("cid")
        parts = _parts(text)
        session = session_store.get_session(sessionId)
        payload = dict((session or {}).get("payload") or {})
        state = (session or {}).get("state") or ""
        tower_ward = cell_to_ward(lac, cid)
        if tower_ward and not payload.get("ward_id"):
            payload["ward_id"] = tower_ward

        # Fresh dial
        if not parts:
            session_store.save_session(sessionId, phoneNumber, "lang", {"ward_id": tower_ward})
            return _con(ussd_locale.language_menu())

        # Mid-flow: trust saved state + latest keypress (fixes ward crash on AT)
        if state in _STEP_STATES and state != "lang":
            choice = _last_input(text)
            # report_text needs free text; pass full text through
            return _handle_step(
                sessionId, phoneNumber, state, payload, choice, text, lac, cid
            )

        if state == "lang" or not state:
            # First selection after dial, or full-path style
            if len(parts) == 1:
                return _handle_step(
                    sessionId, phoneNumber, "lang", payload, parts[0], text, lac, cid
                )

            # Full path: lang * action * ...
            lang_code = parts[0]
            if lang_code not in ussd_locale.LANGS:
                session_store.clear_session(sessionId)
                return PlainTextResponse(ussd_locale.invalid("en", USSD_DIAL))
            lang = ussd_locale.lang_from_code(lang_code)
            payload["lang"] = lang
            action = parts[1]
            rest = parts[2:]

            if action == "1":
                if rest:
                    ward_id = _ward_from_code(rest[0]) or payload.get("ward_id")
                    if ward_id:
                        payload["ward_id"] = ward_id
                        return _finish_risk(phoneNumber, sessionId, lang, ward_id)
                return _handle_menu_action(
                    sessionId, phoneNumber, lang, payload, "1", lac, cid
                )

            if action == "2":
                if rest:
                    ward_id = _ward_from_code(rest[0])
                    if ward_id:
                        payload["ward_id"] = ward_id
                        rest = rest[1:]
                    if rest and rest[0] == "1" and payload.get("ward_id"):
                        return _finish_evac(phoneNumber, sessionId, lang, payload["ward_id"])
                    if rest and rest[0] == "2":
                        session_store.clear_session(sessionId)
                        return PlainTextResponse(ussd_locale.cancelled(lang))
                    if payload.get("ward_id"):
                        props = ward_props(payload["ward_id"]) or {"name": payload["ward_id"]}
                        corr = corridor_for_ward(payload["ward_id"]) or {}
                        session_store.save_session(
                            sessionId, phoneNumber, "evac_confirm", payload
                        )
                        return _con(
                            ussd_locale.confirm_evac_menu(
                                lang, props.get("name") or payload["ward_id"], corr
                            )
                        )
                return _handle_menu_action(
                    sessionId, phoneNumber, lang, payload, "2", lac, cid
                )

            if action == "3":
                if rest:
                    free = text.split("*", 2)[2] if text.count("*") >= 2 else "*".join(rest)
                    return _finish_report(
                        phoneNumber, sessionId, lang, payload.get("ward_id"), free
                    )
                return _handle_menu_action(
                    sessionId, phoneNumber, lang, payload, "3", lac, cid
                )

            if action == "4":
                if rest:
                    ward_id = _ward_from_code(rest[0]) or payload.get("ward_id")
                    if ward_id:
                        return _finish_voucher(phoneNumber, sessionId, lang, ward_id)
                return _handle_menu_action(
                    sessionId, phoneNumber, lang, payload, "4", lac, cid
                )

            if action == "5":
                if rest:
                    if rest[0] == "1":
                        return _finish_cash(phoneNumber, sessionId, lang, payload)
                    if rest[0] == "2":
                        session_store.clear_session(sessionId)
                        return PlainTextResponse(ussd_locale.cancelled(lang))
                return _handle_menu_action(
                    sessionId, phoneNumber, lang, payload, "5", lac, cid
                )

            if action == "6":
                # Full path: lang*6[*org][*type][*value]
                from services import ground_observers as go

                if not rest:
                    return _handle_menu_action(
                        sessionId, phoneNumber, lang, payload, "6", lac, cid
                    )
                # org
                if rest[0] in go.ORG_CODES:
                    org = go.ORG_CODES[rest[0]]
                    payload["observer_org"] = org
                    go.register_observer(
                        phoneNumber, org, registered_location=payload.get("ward_id")
                    )
                    rest = rest[1:]
                elif go.get_observer(phoneNumber):
                    payload["observer_org"] = (
                        go.get_observer(phoneNumber) or {}
                    ).get("organizationId") or "Other"
                if not rest:
                    session_store.save_session(sessionId, phoneNumber, "obs_type", payload)
                    return _con(ussd_locale.observer_type_menu(lang))
                if rest[0] in ("1", "2", "3"):
                    payload["observer_type"] = go.REPORT_TYPES[rest[0]]
                    rest = rest[1:]
                if not rest:
                    session_store.save_session(sessionId, phoneNumber, "obs_value", payload)
                    return _con(
                        ussd_locale.observer_value_menu(
                            lang, payload.get("observer_type") or "rainfall"
                        )
                    )
                return _finish_observer_report(
                    sessionId, phoneNumber, lang, payload, rest[0]
                )

            if action == "7":
                from services import farmer_readiness as fr

                if rest and rest[0] in ("1", "2", "3"):
                    if fr.ussd_readiness(phoneNumber, lang).get("need_register"):
                        if rest[0] == "1":
                            rest = rest[1:]
                            if rest and rest[0] in ("1", "2", "3"):
                                fr.ussd_register_minimal(phoneNumber, rest[0])
                                rest = rest[1:]
                            else:
                                session_store.save_session(
                                    sessionId, phoneNumber, "ready_crop", payload
                                )
                                return _con(ussd_locale.readiness_crop_menu(lang))
                        else:
                            fr.ussd_register_sector(phoneNumber, rest[0])
                            rest = rest[1:]
                    elif rest[0] == "1":
                        fr.complete_next(phoneNumber)
                    elif rest[0] == "3":
                        fr.log_recovery_interest(phoneNumber)
                return _readiness_con(sessionId, phoneNumber, lang, payload)

            session_store.clear_session(sessionId)
            return PlainTextResponse(ussd_locale.invalid(lang, USSD_DIAL))

        # Unknown state — restart cleanly
        session_store.save_session(sessionId, phoneNumber, "lang", {"ward_id": tower_ward})
        return _con(ussd_locale.language_menu())

    except Exception as exc:
        log.exception("ussd crash: %s", exc)
        try:
            session_store.clear_session(sessionId)
        except Exception:
            pass
        return PlainTextResponse(
            f"END ALMA busy. Please dial {USSD_DIAL} again."
        )
    finally:
        elapsed = time.perf_counter() - started
        if elapsed > 4.0:
            log.warning("ussd slow %.2fs text=%r", elapsed, text[:80])
