"""Alma — conversational Early Action agent for desk + phone.

Uses live basin context + Gemma/Featherless for understanding, ElevenLabs for voice.
"""
from __future__ import annotations

import json
import re
from typing import Any

from services import elevenlabs_tts, featherless_ai, gemma_ai
from services.live_signals import get_live_signals


def _platform_snapshot() -> dict[str, Any]:
    signals: dict[str, Any] = {}
    try:
        from services import live_signals as ls

        cached = ls._CACHE.get("data")  # noqa: SLF001 — desk chat must stay snappy
        if cached:
            signals = cached
        else:
            signals = get_live_signals()
    except Exception:
        try:
            signals = get_live_signals()
        except Exception:
            signals = {}
    risk = signals.get("risk") or {}
    rain = signals.get("rain") or {}
    dam = signals.get("dam_alternative") or {}
    return {
        "tier": risk.get("tier") or "watch",
        "compound_active": bool(risk.get("compound_active")),
        "rain_24h_mm": round(float(rain.get("rain_24h_mm") or risk.get("rain_mm") or 0), 1),
        "rain_7d_mm": round(float(rain.get("rain_7d_mm") or 0), 1),
        "dam_release_m3s": round(
            float(dam.get("estimated_release_m3s") or risk.get("dam_discharge_m3s") or 0), 0
        ),
        "t_rain_arrival_h": risk.get("t_rain_arrival_h"),
        "t_dam_arrival_h": risk.get("t_dam_arrival_h"),
        "plain_summary": risk.get("plain_summary") or "",
        "pitch_line": signals.get("pitch_line") or "",
        "climatic_state": signals.get("climatic_state") or "",
        "honesty": "Dam figures are estimates — Gibe III has no public live SCADA.",
        "cycle": "Before is prediction. During is SOS. After is My Readiness — what to do and what is already done.",
    }


def _detect_lang(text: str, preferred: str | None) -> str:
    if preferred in ("en", "sw", "trk", "orm", "am"):
        return preferred
    lower = (text or "").lower()
    sw_markers = (
        "habari",
        "niaje",
        "asante",
        "tafadhali",
        "hatari",
        "mvua",
        "mafuriko",
        "nisaidie",
        "sema",
        "kiswahili",
    )
    if any(m in lower for m in sw_markers):
        return "sw"
    return "en"


def _rule_reply(message: str, snap: dict[str, Any], lang: str) -> str:
    """Deterministic Alma voice when LLMs are offline — still sounds like her."""
    tier = snap.get("tier") or "watch"
    rain = snap.get("rain_24h_mm")
    dam = snap.get("dam_release_m3s")
    rain_eta = snap.get("t_rain_arrival_h")
    dam_eta = snap.get("t_dam_arrival_h")
    lower = (message or "").lower()

    greeting = bool(re.search(r"\b(hello|hi|hey|habari|niaje|salaam)\b", lower)) or "alma" in lower
    after = any(
        w in lower
        for w in ("after", "readiness", "baada", "nini nifanye", "what should i do", "recovery")
    )

    if lang == "sw":
        if after:
            return (
                "Mimi ni Alma. Baada ya tukio: angalia mazao kabla ya kula au kuuza, "
                "pumzisha malisho yaliyofurika siku saba, safisha maji. "
                "Piga *384*96428# chaguo 7, au bonyeza 6 kwenye simu. "
                "SOS ni wakati wa dharura — After ni kile unachofanya maji yakiisha."
            )
        if greeting and len(lower.split()) <= 6:
            return (
                "Habari, mimi ni Alma — wakala wako wa Early Action kwa Omo–Turkana. "
                f"Sasa hatari ni {tier}. Mvua juu {rain} mm kwa saa 24, "
                f"shinikizo la bwawa karibu {dam:.0f} m³/s. "
                "Niulize kuhusu mvua, bwawa, au nini wafanye sasa."
            )
        return (
            f"Alma ansu. Hatari sasa: {tier}. "
            f"Mvua {rain} mm / 24h; bwawa ~{dam:.0f} m³/s. "
            f"ETA mvua ~{rain_eta}h, wimbi la bwawa ~{dam_eta}h. "
            f"{snap.get('plain_summary') or 'Angalia dashibodi kwa maelezo zaidi.'} "
            "Nakumbusha: ALMA inaelekeza — wanadamu hujibu dharura."
        )

    if after:
        return (
            "I'm Alma. After the event: inspect crops before eating or selling, "
            "rest flooded pasture for seven days, treat drinking water. "
            "Dial *384*96428# then 7, or press 6 on the helpline. "
            "SOS is during the flood — My Readiness is what you do when the water has moved."
        )

    if greeting and len(lower.split()) <= 6:
        return (
            "Hello — I'm Alma, your Early Action voice agent for the Omo–Turkana desk. "
            f"Right now flood level is {tier}. Upstream rain {rain} mm in 24 hours, "
            f"estimated dam pressure about {dam:.0f} cubic meters per second. "
            "Ask me about rain, the dam, sector actions, or to explain the dashboard."
        )
    return (
        f"Here's how I read the desk: tier {tier}"
        f"{' with compound rain+dam pressure' if snap.get('compound_active') else ''}. "
        f"Upstream rain {rain} mm / 24h; dam estimate ~{dam:.0f} m³/s. "
        f"Rain arrival ~{rain_eta}h, dam wave ~{dam_eta}h. "
        f"{snap.get('plain_summary') or snap.get('pitch_line') or ''} "
        "I route and explain — humans respond to emergencies."
    )


def chat(
    message: str,
    *,
    lang: str | None = None,
    include_audio: bool = True,
    mode: str = "desk",  # desk | explain | phone | readiness
    phone: str | None = None,
) -> dict[str, Any]:
    message = (message or "").strip()
    if not message:
        message = "Hello Alma, explain the current situation."
    snap = _platform_snapshot()
    lang_use = _detect_lang(message, lang)

    if mode == "readiness":
        from services import farmer_readiness as fr
        from services import readiness_guardrail as rg
        from services.readiness_score import normalize_hazard_level

        farmer = None
        if phone:
            try:
                got = fr.get_public_by_phone(phone)
                if got.get("ok"):
                    farmer = got.get("profile")
            except Exception:
                farmer = None
        roles = (farmer or {}).get("sectorRoles") or ["farmer"]
        sector = roles[0] if roles else "farmer"
        hazard = normalize_hazard_level(
            str(snap.get("tier") or "watch"),
            compound_active=bool(snap.get("compound_active")),
        )
        if farmer:
            hazard = str(farmer.get("hazardLevel") or hazard)
        nxt = ""
        if farmer:
            for item in farmer.get("readinessChecklist") or []:
                if not item.get("completed"):
                    nxt = str(item.get("task") or "")
                    break
        ctx = rg.structured_context(
            hazard_level=hazard,
            sector=sector,
            lang=lang_use,
            event_phase=str(((farmer or {}).get("region") or {}).get("event_phase") or "pre_risk"),
            preparedness_state=(farmer or {}).get("preparednessState"),
            score_percent=((farmer or {}).get("readiness") or {}).get("scorePercent")
            if isinstance((farmer or {}).get("readiness"), dict)
            else None,
            community=(farmer or {}).get("community"),
            next_tip=nxt or None,
            compound_active=bool(snap.get("compound_active")),
            rain_24h_mm=snap.get("rain_24h_mm"),
            dam_release_m3s=snap.get("dam_release_m3s"),
        )
        bounded = rg.bounded_advice(message, ctx, llm_fn=rg._try_gemma_translate)
        answer = bounded["text"]
        source = bounded["source"]
        answer = " ".join(answer.split())
        if len(answer) > 700:
            answer = answer[:697].rstrip() + "."
        audio: dict[str, Any]
        if include_audio:
            audio = elevenlabs_tts.synthesize(answer)
        else:
            audio = {"ok": False, "mode": "text_only", "note": "Audio skipped"}
        return {
            "ok": True,
            "agent": "Alma",
            "lang": lang_use,
            "mode": mode,
            "message": message,
            "reply": answer,
            "source": source,
            "snapshot": snap,
            "guardrail": {
                "confidence": bounded.get("confidence"),
                "fallback_reason": bounded.get("fallback_reason"),
                "hazard_level": ctx.get("hazard_level"),
                "sector": ctx.get("sector"),
                "preparedness_state": ctx.get("preparedness_state"),
            },
            "audio_url": elevenlabs_tts.desk_audio_url(audio),
            "tts_mode": audio.get("mode") or ("demo" if not audio.get("ok") else "live"),
            "tts_note": audio.get("note") or audio.get("error"),
        }

    spoken_lang = {
        "en": "English",
        "sw": "Kiswahili",
        "trk": "Turkana",
        "orm": "Afaan Oromo",
        "am": "Amharic",
    }.get(lang_use, "English")
    system = (
        "You are Alma, the female Early Action voice agent for ALMA (Automated Land & Moisture Action) "
        "on the Omo–Turkana flood desk. You speak warmly and clearly, like a skilled call-center "
        "colleague who understands hydrology. "
        "You use live platform context (rain, dam estimate, tier, ETAs). "
        "Be honest: dam numbers are estimates, not Gibe III SCADA. "
        "ALMA routes and escalates — humans respond to SOS. "
        f"Reply in {spoken_lang} only. "
        "Keep answers under 120 words, spoken prose (no bullet lists, no JSON)."
    )
    if mode == "explain":
        system += " The officer asked you to explain the home dashboard analytics in plain words."
    if mode == "phone":
        system += " This is a phone call — greet briefly if they say hello, then answer."
    if mode == "readiness":
        system += (
            " This is My Readiness — the AFTER of the flood cycle. "
            "Before is prediction; during is SOS; after is what they must do and what they have done. "
            "Speak like the SMS they already received: short tips, no dam percentages. "
            "Tell them the next action, then mention USSD *384*96428# option 7 and voice press 6."
        )

    user = (
        f"Platform snapshot: {json.dumps(snap)}\n"
        f"Officer/caller said: {message}"
    )

    answer = None
    source = "rule"
    lower_msg = message.lower()
    is_greeting = bool(re.search(r"\b(hello|hi|hey|habari|niaje|salaam)\b", lower_msg)) or (
        "alma" in lower_msg and len(lower_msg.split()) <= 5
    )

    # Greetings stay in Alma's voice (fast, no LLM wait)
    if is_greeting and mode in ("desk", "phone"):
        answer = _rule_reply(message, snap, lang_use)
        source = "rule_greeting"
    else:
        # Featherless first for desk chat (faster cloud), Gemma as local analyst
        fl = featherless_ai.chat_text(system, user, timeout=8.0)
        if fl and len(fl.strip()) > 20:
            answer = fl.strip()
            source = "featherless"

        if not answer:
            try:
                aq = gemma_ai.analyst_query(
                    message,
                    float(snap.get("rain_24h_mm") or 0),
                    float(snap.get("dam_release_m3s") or 0),
                    {
                        "tier": snap.get("tier"),
                        "compound_active": snap.get("compound_active"),
                        "plain_summary": snap.get("plain_summary"),
                        "t_rain_arrival_h": snap.get("t_rain_arrival_h"),
                        "t_dam_arrival_h": snap.get("t_dam_arrival_h"),
                    },
                )
                ans = str(aq.get("answer") or "").strip()
                if ans and aq.get("source") != "risk_engine_fallback":
                    if not ans.lower().startswith("hello") and "alma" not in ans.lower()[:40]:
                        if lang_use == "sw":
                            ans = f"Mimi ni Alma. {ans}"
                        else:
                            ans = f"I'm Alma. {ans}"
                    answer = ans
                    source = str(aq.get("source") or "gemma")
            except Exception:
                pass

    if not answer:
        answer = _rule_reply(message, snap, lang_use)
        source = "rule"

    # Spoken length
    answer = " ".join(answer.split())
    if len(answer) > 700:
        answer = answer[:697].rstrip() + "."

    audio: dict[str, Any]
    if include_audio:
        audio = elevenlabs_tts.synthesize(answer)
    else:
        audio = {"ok": False, "mode": "text_only", "note": "Audio skipped"}

    return {
        "ok": True,
        "agent": "Alma",
        "lang": lang_use,
        "mode": mode,
        "message": message,
        "reply": answer,
        "source": source,
        "snapshot": snap,
        "audio_url": elevenlabs_tts.desk_audio_url(audio),
        "tts_mode": audio.get("mode") or ("demo" if not audio.get("ok") else "live"),
        "tts_note": audio.get("note") or audio.get("error"),
    }


def explain_dashboard(*, lang: str = "en", include_audio: bool = True) -> dict[str, Any]:
    prompt = (
        "Eleza dashibodi yangu kwa maneno rahisi: hatari, mvua, bwawa, na nini nifanye."
        if lang == "sw"
        else "Explain my home dashboard analytics in plain words: current risk, rain, dam, and what I should do next."
    )
    return chat(prompt, lang=lang, include_audio=include_audio, mode="explain")
