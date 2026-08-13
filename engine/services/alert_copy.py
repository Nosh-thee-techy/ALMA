"""Short plain-language alerts for SMS / WhatsApp (no LLM polish)."""
from __future__ import annotations

USSD = "*384*96428#"

# Keep under ~280 chars; farmers read these on feature phones / WhatsApp.
_ALERTS: dict[str, dict[str, str]] = {
    "en": {
        "safe": f"ALMA: River normal. No action. Dial {USSD} if water rises.",
        "watch": f"ALMA: Water rising. Stay near high ground. Dial {USSD}.",
        "warning": f"ALMA: Flood likely soon. Move people & animals to high ground. Dial {USSD}.",
        "severe": f"ALMA ALERT: Flood now. Leave low areas. Go to high ground. Dial {USSD}.",
    },
    "sw": {
        "safe": f"ALMA: Maji ni kawaida. Hakuna hatari. Piga {USSD} maji yakiinuka.",
        "watch": f"ALMA: Maji yanaongezeka. Kaa karibu na mahali pa juu. Piga {USSD}.",
        "warning": f"ALMA: Mafuriko yanakuja. Hamisha watu na mifugo mahali pa juu. Piga {USSD}.",
        "severe": f"ALMA: Mafuriko SASA. Ondoka maeneo ya chini. Nenda juu. Piga {USSD}.",
    },
}


def simple_alert(tier: str, lang: str = "en") -> str:
    lang_key = lang if lang in _ALERTS else "en"
    tier_key = tier if tier in _ALERTS[lang_key] else "watch"
    return _ALERTS[lang_key][tier_key]


def risk_reply(tier: str) -> str:
    t = (tier or "watch").upper()
    return f"ALMA: Flood level {t}. Move to high ground if water rises. Dial {USSD}."


def help_reply() -> str:
    return (
        f"ALMA flood alerts. Reply RISK for level. "
        f"Observers: REPORT WRA WATER HIGH. Dial {USSD}."
    )


def report_ack() -> str:
    return f"Thanks. Report saved. Reply RISK for flood level. Dial {USSD}."


def observer_ack(org: str) -> str:
    return f"Report received. Thank you, {org}. Dial {USSD}."


def alert_with_why(tier: str, why: str | None = None, lang: str = "en") -> str:
    base = simple_alert(tier, lang)
    if not why:
        return base
    clause = why if why.lower().startswith("reason") else f"Reason: {why}"
    # Keep SMS under ~280 chars
    combined = f"{base} {clause}"
    return combined[:280]


def phase_alert(
    *,
    sector: str = "pastoralist",
    region_id: str = "turkana",
    lang: str = "en",
    fallback_tier: str = "watch",
) -> str:
    """SMS body that follows event phase — after-guidance when waters recede."""
    from services import climatic_impact as ci
    from services import ground_conditions as gc

    g = gc.channel_guidance(sector=sector, region_id=region_id, lang=lang)
    text = str(g.get("text") or "").strip() or simple_alert(fallback_tier, lang)
    phase = str(g.get("event_phase") or "pre_risk")
    prefix = "ALMA After:" if phase == "post_risk" else "ALMA:"
    body = f"{prefix} {text}"
    try:
        from services.live_signals import get_live_signals

        state = (get_live_signals().get("climatic_state") or "flood_rain")
        sec = "crops" if sector in ("agriculture", "farmer", "crops") else "livestock"
        why = ci.sms_why_clause(str(state), sec)
        if why and why not in body:
            body = f"{body} {why}"
    except Exception:
        pass
    recover = g.get("recovery_support_line")
    if recover:
        body = f"{body} {recover}"
    return body[:280]
