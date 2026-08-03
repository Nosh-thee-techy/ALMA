"""ALMA voice agent — short spoken briefings for desk + farmer helpline IVR."""
from __future__ import annotations

from typing import Any

from services import elevenlabs_tts
from services.live_signals import get_live_signals
from services.playbook_loader import get_playbook_line, ward_props


def _live() -> dict[str, Any]:
    try:
        return get_live_signals()
    except Exception:
        return {}


def brief_script(
    *,
    ward_id: str | None = None,
    lang: str = "en",
    sector: str | None = None,
) -> dict[str, Any]:
    signals = _live()
    risk = signals.get("risk") or {}
    rain = signals.get("rain") or {}
    dam = signals.get("dam_alternative") or {}
    tier = str(risk.get("tier") or "watch")
    rain_mm = round(float(rain.get("rain_24h_mm") or risk.get("rain_mm") or 0), 1)
    release = round(float(dam.get("estimated_release_m3s") or risk.get("dam_discharge_m3s") or 0), 0)
    props = ward_props(ward_id) if ward_id else None
    place = (props or {}).get("name") or ward_id or "the basin"
    sec = sector or (props or {}).get("sector_default") or "pastoralist"
    play = get_playbook_line(sec, tier, lang if lang in ("en", "sw", "trk", "orm", "am") else "en")

    if lang == "sw":
        text = (
            f"ALMA helpline. {place}. Hali ya mafuriko {tier}. "
            f"Mvua juu {rain_mm} millimita. "
            f"Hatua: {play}"
        )
    else:
        text = (
            f"ALMA voice agent. {place}. Flood level {tier}. "
            f"Upstream rain {rain_mm} millimeters in 24 hours. "
            f"Estimated dam pressure {release:.0f} cubic meters per second. "
            f"What to do now: {play}"
        )

    # Keep phone TTS short
    text = " ".join(text.split())
    if len(text) > 320:
        text = text[:317].rstrip() + "."

    audio = elevenlabs_tts.synthesize(text)
    return {
        "ok": True,
        "ward_id": ward_id,
        "place": place,
        "tier": tier,
        "lang": lang,
        "sector": sec,
        "text": text,
        "rain_mm": rain_mm,
        "release_m3s": release,
        "audio_url": audio.get("url") if audio.get("ok") else None,
        "tts_mode": audio.get("mode") or ("demo" if not audio.get("ok") else "live"),
        "tts_note": audio.get("note") or audio.get("error"),
    }


def helpline_menu_script(lang: str = "sw") -> str:
    if lang == "en":
        return (
            "Welcome to ALMA farmer helpline. "
            "Press 1 for live flood risk. "
            "Press 2 for what to do now. "
            "Press 3 to leave a river report. "
            "Press 4 to hear this menu again."
        )
    return (
        "Karibu ALMA helpline ya wakulima. "
        "Bonyeza 1 kwa hatari ya mafuriko. "
        "Bonyeza 2 kwa hatua za sasa. "
        "Bonyeza 3 kuripoti kiwango cha maji. "
        "Bonyeza 4 kusikia menyu tena."
    )
