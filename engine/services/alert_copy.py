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
    return f"ALMA flood alerts. Reply RISK for level. Dial {USSD} for menu."


def report_ack() -> str:
    return f"Thanks. Report saved. Reply RISK for flood level. Dial {USSD}."
