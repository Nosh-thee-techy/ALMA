"""USSD menus + short action replies. Keep under ~140 chars — phones drop long USSD."""
from __future__ import annotations

from typing import Any

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

USSD_MAX_CHARS = 140


def lang_from_code(code: str | None) -> str:
    return LANGS.get((code or "").strip(), "en")


def _clip(text: str, limit: int = USSD_MAX_CHARS) -> str:
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "."


def language_menu() -> str:
    return (
        "CON ALMA - Choose language:\n"
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
            "1. Flood risk now\n"
            "2. Confirm evacuation\n"
            "3. Report river level\n"
            "4. Claim feed voucher\n"
            "5. Emergency cash"
        ),
        "sw": (
            "CON ALMA Hatua ya Mapema\n"
            "1. Hatari ya mafuriko\n"
            "2. Thibitisha kuhama\n"
            "3. Ripoti ya mto\n"
            "4. Vocha ya malisho\n"
            "5. Pesa za dharura"
        ),
        "trk": (
            "CON ALMA Early Action\n"
            "1. Flood risk now\n"
            "2. Confirm move herds\n"
            "3. Report river\n"
            "4. Feed voucher\n"
            "5. Emergency cash"
        ),
        "orm": (
            "CON ALMA Early Action\n"
            "1. Balaa lolaa\n"
            "2. Mirkanessuu socho'insa\n"
            "3. Gabaasa laga\n"
            "4. Voucher nyaata\n"
            "5. Maallaqa hatattamaa"
        ),
        "am": (
            "CON ALMA early action\n"
            "1. Flood risk now\n"
            "2. Confirm herd move\n"
            "3. Report river\n"
            "4. Feed voucher\n"
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


def confirm_evac_menu(lang: str, ward_name: str, corr: dict[str, Any] | None) -> str:
    corr = corr or {}
    km = corr.get("km", 8)
    bearing = corr.get("bearing", "EAST")
    name = corr.get("name", "Corridor B")
    lines = {
        "en": (
            f"CON Move herds from {ward_name}?\n"
            f"{km}km {bearing} to {name}.\n"
            "1. YES\n"
            "2. Cancel"
        ),
        "sw": (
            f"CON Hamisha mifugo {ward_name}?\n"
            f"km {km} {bearing} {name}.\n"
            "1. NDIO\n"
            "2. Ghairi"
        ),
        "trk": (
            f"CON Move herds {ward_name}?\n"
            f"{km}km {bearing} {name}.\n"
            "1. YES\n2. Cancel"
        ),
        "orm": (
            f"CON Horii {ward_name} sochoosi?\n"
            f"km {km} {bearing} {name}.\n"
            "1. EEYYEE\n2. Haquu"
        ),
        "am": (
            f"CON Move herds {ward_name}?\n"
            f"{km}km {bearing} {name}.\n"
            "1. YES\n2. Cancel"
        ),
    }
    return lines.get(lang) or lines["en"]


def confirm_cash_menu(lang: str, amount_kes: int = 2000) -> str:
    lines = {
        "en": (
            f"CON Request KES {amount_kes} cash?\n"
            "1. YES - send STK\n"
            "2. Cancel"
        ),
        "sw": (
            f"CON Omba KES {amount_kes}?\n"
            "1. NDIO - tuma STK\n"
            "2. Ghairi"
        ),
        "trk": f"CON Ask KES {amount_kes}?\n1. YES\n2. Cancel",
        "orm": f"CON KES {amount_kes}?\n1. EEYYEE\n2. Haquu",
        "am": f"CON Request KES {amount_kes}?\n1. YES\n2. Cancel",
    }
    return lines.get(lang) or lines["en"]


def report_prompt(lang: str) -> str:
    lines = {
        "en": "CON Type short river report\n(e.g. Water high Node 3):",
        "sw": "CON Andika ripoti fupi\n(mf. Maji juu Node 3):",
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


def localize_action(lang: str, kind: str, facts: dict[str, Any]) -> str:
    """Fast static replies only — no LLM (USSD must answer in <5s)."""
    tier = str(facts.get("tier") or "watch").upper()
    ward = str(facts.get("ward") or "ward")

    if kind == "risk":
        templates = {
            "en": f"{ward}: flood {tier}. Move to high ground if water rises. *384*96428#",
            "sw": f"{ward}: mafuriko {tier}. Nenda mahali pa juu. *384*96428#",
            "trk": f"{ward}: flood {tier}. Go high ground. *384*96428#",
            "orm": f"{ward}: balaa {tier}. Gara olaanaatti. *384*96428#",
            "am": f"{ward}: flood {tier}. Go high ground. *384*96428#",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "evac":
        corr = facts.get("corridor") or {}
        km = corr.get("km", 8)
        bearing = corr.get("bearing", "EAST")
        name = corr.get("name", "Corridor B")
        templates = {
            "en": f"Evacuation logged {ward}. Move herds {km}km {bearing} to {name} now.",
            "sw": f"Kuhama kumeandikwa {ward}. Hamisha mifugo km {km} {bearing} {name}.",
            "trk": f"Evacuation saved {ward}. Move {km}km {bearing} {name}.",
            "orm": f"Socho'insi galmeeffame {ward}. km {km} {bearing} {name}.",
            "am": f"Evacuation logged {ward}. Move {km}km {bearing} {name}.",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "report":
        status = facts.get("status", "recorded")
        templates = {
            "en": f"Thanks. Report saved: {status}. Ops desk updated.",
            "sw": f"Asante. Ripoti imehifadhiwa: {status}.",
            "trk": f"Thanks. Report saved: {status}.",
            "orm": f"Galatoomi. Gabaasni olkaa'ame: {status}.",
            "am": f"Thanks. Report saved: {status}.",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "voucher":
        code = facts.get("code", "")
        templates = {
            "en": f"Voucher ready: {code}. Show at hub within 72h.",
            "sw": f"Vocha tayari: {code}. Onyesha kituo ndani ya saa 72.",
            "trk": f"Voucher {code}. Show hub in 72h.",
            "orm": f"Voucher {code}. Sa'aatii 72 keessatti agarsiisi.",
            "am": f"Voucher {code}. Show hub within 72h.",
        }
        return _clip(templates.get(lang) or templates["en"])

    if kind == "cash":
        amount = facts.get("amount_kes", 2000)
        ref = facts.get("ref", "")
        templates = {
            "en": f"Cash KES {amount} logged. Ref {ref}. STK demo queued.",
            "sw": f"Pesa KES {amount} imeandikwa. Ref {ref}. STK demo.",
            "trk": f"Cash KES {amount}. Ref {ref}.",
            "orm": f"Maallaqa KES {amount}. Ref {ref}.",
            "am": f"Cash KES {amount}. Ref {ref}.",
        }
        return _clip(templates.get(lang) or templates["en"])

    return _clip(f"ALMA OK.")
