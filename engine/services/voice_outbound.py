"""
Outbound alert calls via Africa's Talking Voice API.

Voice calls are reserved for Warning/Severe/Compound only — do not call for
routine Watch-tier updates, this preserves trust and avoids alert fatigue.
"""
from __future__ import annotations

import os
import secrets
import time
from typing import Any

from services import africastalking, session_store
from services.alert_copy import alert_with_why, simple_alert

# Tier gate: Watch/Safe never dial — only actionable flood urgency.
_VOICE_TIERS = frozenset({"warning", "severe"})


def voice_test_mode() -> bool:
    """Default ON so sandbox limits are not burned during development."""
    raw = os.getenv("ALMA_VOICE_TEST_MODE", "true").strip().lower()
    return raw in ("1", "true", "yes", "on")


def voice_allowlist() -> list[str]:
    raw = os.getenv("ALMA_VOICE_ALLOWLIST", "").strip()
    if not raw:
        # Fall back to single notify phone if set
        notify = os.getenv("ALMA_POST_RISK_NOTIFY_PHONE", "").strip()
        return [notify] if notify else []
    return [p.strip() for p in raw.split(",") if p.strip()]


def normalize_phone(phone: str) -> str:
    p = (phone or "").strip().replace(" ", "")
    if p.startswith("0") and len(p) >= 9:
        p = "+254" + p[1:]
    if p and not p.startswith("+"):
        p = "+" + p
    return p


def phone_allowed(phone: str) -> bool:
    if not voice_test_mode():
        return True
    allowed = {normalize_phone(p) for p in voice_allowlist()}
    return normalize_phone(phone) in allowed


def tier_allows_voice(tier: str, *, compound_active: bool = False) -> bool:
    """
    Voice calls are reserved for Warning/Severe/Compound only — do not call for
    routine Watch-tier updates, this preserves trust and avoids alert fatigue.
    """
    if compound_active:
        return True
    return (tier or "").lower() in _VOICE_TIERS


def alert_script(
    *,
    community: str,
    sector: str = "pastoralist",
    region_id: str = "turkana",
    lang: str = "en",
    tier: str = "warning",
) -> str:
    """Same sector guidance text as SMS — spoken, not a second copy source."""
    action = simple_alert(tier, lang)
    try:
        from services import climatic_impact as ci

        why = ci.sms_why_clause("flood_rise", sector if sector != "pastoralist" else "livestock")
        action = alert_with_why(tier, why=why, lang=lang) or action
    except Exception:
        pass
    body = (
        f"This is ALMA. Water levels near {community} are rising fast. {action}"
    )
    return body[:480]


def trigger_outbound_alert(
    phone: str,
    *,
    community: str,
    ward_id: str | None = None,
    sector: str = "pastoralist",
    region_id: str = "turkana",
    lang: str = "en",
    tier: str = "warning",
    compound_active: bool = False,
    voice_enabled: bool = True,
    custom_script: str | None = None,
) -> dict[str, Any]:
    """
    Place an outbound AT voice call when severity + contact + allowlist allow it.
    Returns a result dict suitable for simulator / community_dispatch responses.
    """
    if not voice_enabled:
        return {"ok": False, "skipped": True, "reason": "voice_disabled_for_contact"}

    # SOS reopen scripts bypass the risk-tier gate (life-safety re-escalation).
    if not custom_script and not tier_allows_voice(tier, compound_active=compound_active):
        return {
            "ok": False,
            "skipped": True,
            "reason": "tier_gate",
            "note": (
                "Voice calls are reserved for Warning/Severe/Compound only — "
                "do not call for routine Watch-tier updates, this preserves trust "
                "and avoids alert fatigue"
            ),
            "tier": tier,
            "compound_active": compound_active,
        }

    phone_n = normalize_phone(phone)
    if not phone_allowed(phone_n):
        return {
            "ok": False,
            "skipped": True,
            "reason": "test_mode_allowlist",
            "note": (
                "ALMA_VOICE_TEST_MODE is on — only ALMA_VOICE_ALLOWLIST numbers "
                "receive calls (protects AT sandbox limits)."
            ),
            "phone": phone_n,
        }

    ward = ward_id or community.lower().replace(" ", "_")
    script = (custom_script or "").strip() or alert_script(
        community=community,
        sector=sector,
        region_id=region_id,
        lang=lang,
        tier=tier,
    )
    client_request_id = f"alma-voice-{secrets.token_hex(6)}"

    pending = session_store.create_voice_outbound(
        phone=phone_n,
        ward_id=ward,
        community=community,
        message=script,
        sector=sector,
        lang=lang,
        tier=tier,
        client_request_id=client_request_id,
    )

    call = africastalking.make_call(phone_n, client_request_id=client_request_id)

    # Attach AT sessionId when present so IVR can resolve context reliably
    entries = []
    if isinstance(call.get("body"), dict):
        entries = call["body"].get("entries") or []
    if entries and isinstance(entries[0], dict) and entries[0].get("sessionId"):
        session_store.bind_voice_session(pending["id"], str(entries[0]["sessionId"]))

    if call.get("mode") == "live":
        session_store.log_action(
            phone_n,
            ward,
            "voice_outbound",
            {
                "community": community,
                "tier": tier,
                "compound_active": compound_active,
                "clientRequestId": client_request_id,
                "call": call,
                "verification": "Unreached (voice)",
            },
        )
        # Until the callee confirms, treat as not yet reached
        session_store.set_last_reached_via(ward, "Unreached")
    elif call.get("mode") == "demo":
        session_store.log_action(
            phone_n,
            ward,
            "voice_outbound",
            {
                "community": community,
                "tier": tier,
                "mode": "demo",
                "clientRequestId": client_request_id,
                "note": call.get("note"),
                "verification": "Unreached (voice)",
            },
        )
        session_store.set_last_reached_via(ward, "Unreached")

    return {
        "ok": call.get("mode") in ("live", "demo"),
        "mode": call.get("mode"),
        "phone": phone_n,
        "clientRequestId": client_request_id,
        "outboundId": pending["id"],
        "scriptPreview": script[:160],
        "call": call,
        "queued_at": time.time(),
    }
