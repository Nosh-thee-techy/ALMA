"""USSD menus + short local-language action replies (Featherless with fast fallback)."""
from __future__ import annotations

import os
import re
from typing import Any

from services import featherless_ai
from services.playbook_loader import get_playbook_line

LANGS = {
    "1": "en",
    "2": "sw",
    "3": "trk",
    "4": "orm",
    "5": "am",
}

LANG_NAMES = {
    "en": "English",
    "sw": "Kiswahili",
    "trk": "Turkana",
    "orm": "Afaan Oromo",
    "am": "Amharic",
}

USSD_LOCALE_TIMEOUT_S = float(os.getenv("ALMA_USSD_LOCALE_TIMEOUT_S", "3.0"))
USSD_MAX_CHARS = 160


def lang_from_code(code: str | None) -> str:
    return LANGS.get((code or "").strip(), "en")


def language_menu() -> str:
    return (
        "CON ALMA — Chagua lugha / Choose language:\n"
        "1. English\n"
        "2. Kiswahili\n"
        "3. Turkana\n"
        "4. Afaan Oromo\n"
        "5. Amharic"
    )


def main_menu(lang: str) -> str:
    menus = {
        "en": (
            "CON ALMA Early Action\n"
            "1. Live flood risk\n"
            "2. Confirm herd evacuation\n"
            "3. Report river level\n"
            "4. Claim feed voucher\n"
            "5. Request emergency cash"
        ),
        "sw": (
            "CON ALMA Hatua ya Mapema\n"
            "1. Hatari ya mafuriko (moja kwa moja)\n"
            "2. Thibitisha kuhamisha mifugo\n"
            "3. Ripoti kiwango cha mto\n"
            "4. Dai vocha ya malisho\n"
            "5. Omba pesa za dharura"
        ),
        "trk": (
            "CON ALMA Early Action\n"
            "1. Live flood risk\n"
            "2. Confirm move herds\n"
            "3. Report river water\n"
            "4. Claim feed voucher\n"
            "5. Ask emergency cash"
        ),
        "orm": (
            "CON ALMA Early Action\n"
            "1. Balaa lolaa ammaa\n"
            "2. Mirkanessuu socho'insa horii\n"
            "3. Gabaasa sadarkaa laga\n"
            "4. Voucher nyaata gaafachuu\n"
            "5. Maallaqa hatattamaa"
        ),
        "am": (
            "CON ALMA early action\n"
            "1. Live flood risk\n"
            "2. Confirm herd move\n"
            "3. Report river level\n"
            "4. Claim feed voucher\n"
            "5. Emergency cash"
        ),
    }
    return menus.get(lang) or menus["en"]


def ward_menu(lang: str) -> str:
    titles = {
        "en": "CON Select ward:\n",
        "sw": "CON Chagua kata:\n",
        "trk": "CON Select ward:\n",
        "orm": "CON Aanaa filadhu:\n",
        "am": "CON Select ward:\n",
    }
    return (
        (titles.get(lang) or titles["en"])
        + "1. Kalokol\n2. Kangatotha\n3. Todonyang\n4. Nachukui\n5. Omorate"
    )


def confirm_evac_menu(lang: str, ward_name: str, corr: dict[str, Any]) -> str:
    km = corr.get("km", 8)
    bearing = corr.get("bearing", "EAST")
    name = corr.get("name", "Corridor B")
    lines = {
        "en": (
            f"CON Move herds now from {ward_name}?\n"
            f"{km}km {bearing} to {name}.\n"
            "1. YES — start evacuation\n"
            "2. Cancel"
        ),
        "sw": (
            f"CON Hamisha mifugo sasa kutoka {ward_name}?\n"
            f"km {km} {bearing} kwenda {name}.\n"
            "1. NDIO — anza kuhama\n"
            "2. Ghairi"
        ),
        "trk": (
            f"CON Move herds now {ward_name}?\n"
            f"{km}km {bearing} to {name}.\n"
            "1. YES\n2. Cancel"
        ),
        "orm": (
            f"CON Horii amma {ward_name} irraa sochoosi?\n"
            f"km {km} {bearing} gara {name}.\n"
            "1. EEYYEE\n2. Haquu"
        ),
        "am": (
            f"CON Move herds now from {ward_name}?\n"
            f"{km}km {bearing} to {name}.\n"
            "1. YES\n2. Cancel"
        ),
    }
    return lines.get(lang) or lines["en"]


def confirm_cash_menu(lang: str, amount_kes: int = 2000) -> str:
    lines = {
        "en": (
            f"CON Request KES {amount_kes} early-action cash?\n"
            "STK Push will be prepared for this phone.\n"
            "1. YES — send STK\n"
            "2. Cancel"
        ),
        "sw": (
            f"CON Omba KES {amount_kes} za dharura?\n"
            "STK Push itaandaliwa kwa simu hii.\n"
            "1. NDIO — tuma STK\n"
            "2. Ghairi"
        ),
        "trk": (
            f"CON Ask KES {amount_kes} cash?\n"
            "1. YES STK\n2. Cancel"
        ),
        "orm": (
            f"CON KES {amount_kes} gaafadhu?\n"
            "1. EEYYEE STK\n2. Haquu"
        ),
        "am": (
            f"CON Request KES {amount_kes} cash?\n"
            "1. YES STK\n2. Cancel"
        ),
    }
    return lines.get(lang) or lines["en"]


def report_prompt(lang: str) -> str:
    lines = {
        "en": "CON Type river report in your language\n(e.g. Water high at Node 3, cattle stuck):",
        "sw": "CON Andika ripoti ya mto kwa lugha yako\n(mf. Maji juu Node 3, ng'ombe wamekwama):",
        "trk": "CON Type river report\n(e.g. Water high Node 3):",
        "orm": "CON Gabaasa laga barreessi\n(fkn. Bishaan ol Node 3):",
        "am": "CON Type river report\n(e.g. Water high Node 3):",
    }
    return lines.get(lang) or lines["en"]


def cancelled(lang: str) -> str:
    msg = {
        "en": "END Cancelled. Dial again if you need help.",
        "sw": "END Imeghairiwa. Piga tena ukihitaji msaada.",
        "trk": "END Cancelled. Dial again.",
        "orm": "END Haqameera. Irra deebi'ii bilbili.",
        "am": "END Cancelled. Dial again.",
    }
    return msg.get(lang) or msg["en"]


def invalid(lang: str, dial: str) -> str:
    msg = {
        "en": f"END Invalid choice. Dial {dial} again.",
        "sw": f"END Chaguo si sahihi. Piga {dial} tena.",
        "trk": f"END Bad choice. Dial {dial}.",
        "orm": f"END Filannoon dogoggora. {dial} bilbili.",
        "am": f"END Invalid choice. Dial {dial}.",
    }
    return msg.get(lang) or msg["en"]


def _clip(text: str, limit: int = USSD_MAX_CHARS) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _fallback_action(lang: str, kind: str, facts: dict[str, Any]) -> str:
    tier = str(facts.get("tier") or "watch")
    ward = str(facts.get("ward") or "ward")
    rain = facts.get("rain_mm", "?")
    dam = facts.get("dam_m3s", "?")
    sector = str(facts.get("sector") or "pastoralist")
    play = get_playbook_line(sector, tier, lang if lang in ("en", "sw", "trk", "orm", "am") else "en")

    if kind == "risk":
        templates = {
            "en": f"LIVE risk {tier.upper()} at {ward}. Rain {rain}mm, dam~{dam} m3/s. {play}",
            "sw": f"HATARI {tier.upper()} {ward}. Mvua {rain}mm, bwawa~{dam}. {play}",
            "trk": f"LIVE {tier.upper()} {ward}. Rain {rain}mm. {play}",
            "orm": f"BALAA {tier.upper()} {ward}. Rooba {rain}mm. {play}",
            "am": f"LIVE {tier.upper()} {ward}. Rain {rain}mm. {play}",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "evac":
        corr = facts.get("corridor") or {}
        templates = {
            "en": (
                f"EVACUATION LOGGED for {ward}. Move herds {corr.get('km')}km "
                f"{corr.get('bearing')} to {corr.get('name')} now. Forage ~{corr.get('forage_days')} days."
            ),
            "sw": (
                f"KUHAMA KUMEANDIKWA {ward}. Hamisha mifugo km {corr.get('km')} "
                f"{corr.get('bearing')} {corr.get('name')} sasa. Malisho siku ~{corr.get('forage_days')}."
            ),
            "trk": f"EVACUATION saved {ward}. Move {corr.get('km')}km {corr.get('bearing')} {corr.get('name')}.",
            "orm": f"SOCHO'INSI galmeeffame {ward}. km {corr.get('km')} {corr.get('bearing')} {corr.get('name')}.",
            "am": f"EVACUATION logged {ward}. Move {corr.get('km')}km {corr.get('bearing')} {corr.get('name')}.",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "report":
        status = facts.get("status", "recorded")
        entity = facts.get("entity", "community")
        templates = {
            "en": f"Thank you. ALMA saved your report: {status} ({entity}). Ops desk updated.",
            "sw": f"Asante. ALMA imehifadhi ripoti: {status} ({entity}). Ofisi imesasishwa.",
            "trk": f"Thanks. Report saved: {status} ({entity}).",
            "orm": f"Galatoomi. Gabaasni olkaa'ame: {status} ({entity}).",
            "am": f"Thank you. Report saved: {status} ({entity}).",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "voucher":
        code = facts.get("code", "")
        templates = {
            "en": f"VOUCHER READY. Code {code}. Show at agro-vet hub within 72h. Phone linked.",
            "sw": f"VOCHA TAYARI. Nambari {code}. Onyesha kituo cha agro-vet ndani ya saa 72.",
            "trk": f"VOUCHER {code}. Show hub in 72h.",
            "orm": f"VOUCHER {code}. Sa'aatii 72 keessatti agarsiisi.",
            "am": f"VOUCHER {code}. Show hub within 72h.",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "cash":
        amount = facts.get("amount_kes", 2000)
        ref = facts.get("ref", "")
        templates = {
            "en": (
                f"CASH REQUEST LOGGED KES {amount}. Ref {ref}. "
                "STK Push demo queued for this phone (confirm PIN when live)."
            ),
            "sw": (
                f"OMBI LA PESA KES {amount}. Ref {ref}. "
                "STK Push imeandaliwa (demo). Thibitisha PIN ikiwa hai."
            ),
            "trk": f"CASH KES {amount} logged. Ref {ref}. STK demo.",
            "orm": f"Maallaqa KES {amount} galmeeffame. Ref {ref}. STK demo.",
            "am": f"CASH KES {amount} logged. Ref {ref}. STK demo.",
        }
        return _clip(templates.get(lang) or templates["en"])

    return _clip(str(facts))


def localize_action(lang: str, kind: str, facts: dict[str, Any]) -> str:
    """Rewrite action result in simple local language via Featherless; fallback if slow."""
    fallback = _fallback_action(lang, kind, facts)
    if lang == "en" or not featherless_ai.available():
        return fallback

    lang_name = LANG_NAMES.get(lang, lang)
    system = (
        f"You rewrite flood early-action phone messages for rural users into simple {lang_name}. "
        "Use short everyday words. Max 2 short sentences. No markdown. Keep codes/numbers unchanged."
    )
    user = f"Kind: {kind}. Facts: {facts}. English draft: {fallback}"
    text = featherless_ai.chat_text(system, user, timeout=USSD_LOCALE_TIMEOUT_S)
    if not text:
        return fallback
    text = text.strip().strip('"')
    if text.upper().startswith("END "):
        text = text[4:]
    return _clip(text)
