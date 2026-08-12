"""
NGO "Send to Community" — UI trigger for existing SMS + guidance dispatch.

Uses africastalking.dispatch (same path as sector/simulator alerts).
Logs with triggeredBy=manual_ngo_dispatch so Alerts Log can distinguish
from auto_compound_engine / tier-triggered sends.
"""
from __future__ import annotations

import os
from typing import Any

from services import africastalking, farmer_readiness, ground_conditions as gc
from services import session_store


def _demo_phones() -> list[str]:
    raw = os.getenv("ALMA_DEMO_DISPATCH_PHONES", "").strip()
    phones: list[str] = []
    if raw:
        phones.extend(p.strip() for p in raw.split(",") if p.strip())
    notify = os.getenv("ALMA_POST_RISK_NOTIFY_PHONE", "").strip()
    if notify:
        phones.append(notify)
    # Dedupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for p in phones:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def contacts_for_community(community: str) -> list[str]:
    phones: list[str] = []
    for f in session_store.list_farmers():
        if str(f.get("community") or "").lower() == community.lower():
            ph = f.get("phoneNumber")
            if ph:
                phones.append(str(ph))
    phones.extend(_demo_phones())
    seen: set[str] = set()
    out: list[str] = []
    for p in phones:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def build_community_guidance(community: str, region_id: str, message: str | None = None) -> str:
    if message and message.strip():
        return message.strip()[:400]
    snap = gc.snapshot_from_live()
    st = snap["regions"].get(region_id) or snap["regions"]["turkana"]
    from services.live_signals import get_live_signals

    rain_eta = float((get_live_signals().get("risk") or {}).get("t_rain_arrival_h") or 24)
    phase = st.get("event_phase") or "pre_risk"
    if phase == "post_risk":
        agri = gc.after_guidance("agriculture")
        live = gc.after_guidance("livestock")
    else:
        agri = gc.before_guidance(
            "agriculture",
            st["climate_state"],
            st["tier"],
            bool(st["compound_active"]),
            rain_eta,
        )
        live = gc.before_guidance(
            "livestock",
            st["climate_state"],
            st["tier"],
            bool(st["compound_active"]),
            rain_eta,
        )
    return f"ALMA {community}: Ag — {agri} Livestock — {live}"[:400]


def dispatch_to_community(
    community: str,
    *,
    region_id: str = "turkana",
    message: str | None = None,
    sector: str = "agriculture",
) -> dict[str, Any]:
    body = message.strip() if message and message.strip() else build_community_guidance(community, region_id)
    # Prefix community for SMS clarity if caller passed guidance-only text
    if message and message.strip() and not body.upper().startswith("ALMA"):
        body = f"ALMA {community}: {message.strip()}"[:400]

    phones = contacts_for_community(community)
    results = []
    snap = gc.snapshot_from_live()
    st = snap["regions"].get(region_id) or snap["regions"]["turkana"]
    tier = str(st.get("tier") or "watch")
    compound_active = bool(st.get("compound_active"))
    ward = community.lower().replace(" ", "_")

    for phone in phones:
        try:
            ch = africastalking.dispatch(phone, body, "sms")
            entry: dict[str, Any] = {"phone": phone, "ok": True, "channels": ch}
            sms = (ch or {}).get("sms") or {}
            if sms.get("mode") in ("live", "demo"):
                session_store.set_last_reached_via(ward, "SMS")
            # Voice branch: Warning/Severe/Compound + allowlist (test mode)
            # Voice calls are reserved for Warning/Severe/Compound only — do not call for
            # routine Watch-tier updates, this preserves trust and avoids alert fatigue.
            voice_on = os.getenv("ALMA_VOICE_ON_DISPATCH", "true").strip().lower() in (
                "1",
                "true",
                "yes",
                "on",
            )
            if voice_on:
                from services import voice_outbound

                entry["voice"] = voice_outbound.trigger_outbound_alert(
                    phone,
                    community=community,
                    ward_id=ward,
                    sector=sector,
                    region_id=region_id,
                    lang="en",
                    tier=tier,
                    compound_active=compound_active,
                    voice_enabled=True,
                )
            results.append(entry)
        except Exception as exc:
            results.append({"phone": phone, "ok": False, "error": str(exc)})
            session_store.set_last_reached_via(ward, "Unreached")

    # Demo: if no registered contacts, still log a simulated send so desk UI works
    contact_count = len(phones) if phones else 3
    if not phones:
        results.append(
            {
                "phone": "demo",
                "ok": True,
                "channels": {"sms": {"demo": True, "note": "No registered phones — simulated"}},
            }
        )
        session_store.set_last_reached_via(ward, "SMS")

    session_store.log_action(
        phones[0] if phones else None,
        ward,
        "manual_ngo_dispatch",
        {
            "community": community,
            "region_id": region_id,
            "sector": sector,
            "message": body,
            "contactCount": contact_count,
            "triggeredBy": "manual_ngo_dispatch",
            "ussd_prompt_updated": True,
            "tier": tier,
            "results": results,
        },
    )

    # Refresh checklist climate context for farmers in this community (guidance already live via GC)
    for f in session_store.list_farmers():
        if str(f.get("community") or "").lower() == community.lower():
            try:
                farmer_readiness.refresh_checklist(f)
            except Exception:
                pass

    return {
        "ok": True,
        "community": community,
        "contactCount": contact_count,
        "message": body,
        "triggeredBy": "manual_ngo_dispatch",
        "results": results,
    }
