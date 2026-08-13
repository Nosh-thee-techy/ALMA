"""
Zero-hallucination reasoning guardrail for My Readiness (Gemma / Alma).

Rules:
  - Hazard, sector, language, and score are PRE-CALCULATED inputs.
  - LLM may only translate those facts into the caller's language.
  - Low confidence, malformed JSON, or invented hazard → expert script.
"""
from __future__ import annotations

import json
import re
from typing import Any, Callable

CONFIDENCE_FLOOR = 0.55
SECTORS = ("farmer", "herder", "fisher")
LANGS = ("en", "sw", "trk", "orm", "am")
LANG_NAMES = {
    "en": "English",
    "sw": "Kiswahili",
    "trk": "Ng'aturkana",
    "orm": "Afaan Oromo",
    "am": "Amharic",
}

# Pre-approved expert scripts — never generated. SMS-safe length.
EXPERT_SCRIPTS: dict[tuple[str, str, str], str] = {
    ("farmer", "pre_risk", "en"): (
        "Farmer: clear drainage so roots do not drown. Move seed to elevated dry storage."
    ),
    ("farmer", "pre_risk", "sw"): (
        "Mkulima: safisha mifereji ili mizizi isioze. Hamisha mbegu sehemu kavu juu."
    ),
    ("farmer", "post_risk", "en"): (
        "Farmer: inspect crops before eating or selling. Test soil before replanting."
    ),
    ("farmer", "post_risk", "sw"): (
        "Mkulima: kagua mazao kabla ya kula au kuuza. Pima udongo kabla ya kupanda tena."
    ),
    ("herder", "pre_risk", "en"): (
        "Herder: confirm high-ground grazing route. Store fodder dry above the flood line."
    ),
    ("herder", "pre_risk", "sw"): (
        "Mfugaji: thibitisha njia ya malisho juu. Hifadhi malisho kavu juu ya mafuriko."
    ),
    ("herder", "post_risk", "en"): (
        "Herder: keep livestock off flooded pasture. Watch for waterborne disease."
    ),
    ("herder", "post_risk", "sw"): (
        "Mfugaji: usilishie malisho yaliyofurika. Angalia magonjwa ya maji."
    ),
    ("fisher", "pre_risk", "en"): (
        "Fisher: tether boats, lift nets and gear, stay off crumbling riverbanks."
    ),
    ("fisher", "pre_risk", "sw"): (
        "Mvuvi: funga boti, inua nyavu na vifaa, epuka kingo zinazoporomoka."
    ),
    ("fisher", "post_risk", "en"): (
        "Fisher: check boats and nets before launch. Avoid unstable banks after the surge."
    ),
    ("fisher", "post_risk", "sw"): (
        "Mvuvi: kagua boti na nyavu kabla ya kuingia majini. Epuka kingo dhaifu."
    ),
}

_SEVERE_WORDS = (
    "evacuate now",
    "severe flood",
    "compound flood",
    "dam has burst",
    "gibe collapsed",
    "water is already in your house",
)
_WATCH_FORBIDDEN = (
    "evacuate",
    "severe",
    "compound",
    "abandon",
    "all boats off",
)


def normalize_sector(raw: str | None) -> str:
    s = str(raw or "farmer").strip().lower()
    if s in ("pastoralist", "livestock", "herder"):
        return "herder"
    if s in ("fisher", "fisheries", "fishing"):
        return "fisher"
    if s in ("farmer", "agriculture", "crops"):
        return "farmer"
    return "farmer"


def normalize_lang(raw: str | None) -> str:
    code = str(raw or "en").lower().strip()
    if code in LANGS:
        return code
    if code.startswith("sw"):
        return "sw"
    return "en"


def normalize_phase(raw: str | None) -> str:
    return "post_risk" if str(raw or "") == "post_risk" else "pre_risk"


def expert_script(sector: str, event_phase: str, lang: str) -> str:
    key = (normalize_sector(sector), normalize_phase(event_phase), normalize_lang(lang))
    return EXPERT_SCRIPTS.get(key) or EXPERT_SCRIPTS[("farmer", "pre_risk", "en")]


def validate_context(ctx: dict[str, Any] | None) -> tuple[bool, str]:
    if not isinstance(ctx, dict) or not ctx:
        return False, "malformed_context"
    hazard = str(ctx.get("hazard_level") or "").upper()
    if hazard not in ("WATCH", "WARNING", "SEVERE", "COMPOUND"):
        return False, "missing_hazard_level"
    if not ctx.get("sector"):
        return False, "missing_sector"
    if not ctx.get("lang"):
        return False, "missing_lang"
    return True, "ok"


def _invents_hazard(text: str, hazard: str) -> bool:
    """Reject LLM text that upgrades the flood beyond pre-calculated hazard."""
    t = (text or "").lower()
    if any(w in t for w in _SEVERE_WORDS) and hazard in ("WATCH", "WARNING"):
        return True
    if hazard == "WATCH" and any(w in t for w in _WATCH_FORBIDDEN):
        return True
    return False


def _clip(text: str, limit: int = 160) -> str:
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "."


def structured_context(
    *,
    hazard_level: str,
    sector: str,
    lang: str,
    event_phase: str = "pre_risk",
    preparedness_state: str | None = None,
    score_percent: int | None = None,
    community: str | None = None,
    next_tip: str | None = None,
    compound_active: bool = False,
    rain_24h_mm: float | None = None,
    dam_release_m3s: float | None = None,
) -> dict[str, Any]:
    return {
        "hazard_level": str(hazard_level or "WATCH").upper(),
        "sector": normalize_sector(sector),
        "lang": normalize_lang(lang),
        "event_phase": normalize_phase(event_phase),
        "preparedness_state": preparedness_state,
        "score_percent": score_percent,
        "community": community,
        "next_tip": next_tip,
        "compound_active": bool(compound_active),
        "rain_24h_mm": rain_24h_mm,
        "dam_release_m3s": dam_release_m3s,
        "not_credit": True,
        "instruction": (
            "Translate these facts only. Do not invent flood conditions "
            "or change hazard_level."
        ),
    }


def bounded_advice(
    question: str,
    ctx: dict[str, Any],
    *,
    llm_fn: Callable[[str, dict[str, Any]], dict[str, Any] | None] | None = None,
) -> dict[str, Any]:
    """
    Returns {text, source, confidence, used_llm, fallback_reason}.
    llm_fn must return {text, confidence} or None — it must not set hazard.
    """
    ok, reason = validate_context(ctx)
    sector = normalize_sector((ctx or {}).get("sector") if ctx else "farmer")
    phase = normalize_phase((ctx or {}).get("event_phase") if ctx else "pre_risk")
    lang = normalize_lang((ctx or {}).get("lang") if ctx else "en")
    script = expert_script(sector, phase, lang)
    if (ctx or {}).get("next_tip"):
        script = _clip(f"{script} {ctx['next_tip']}", 160)

    if not ok:
        return {
            "text": script,
            "source": "script_malformed_input",
            "confidence": 1.0,
            "used_llm": False,
            "fallback_reason": reason,
        }

    q = (question or "").strip()
    if not q:
        return {
            "text": script,
            "source": "script_empty_question",
            "confidence": 1.0,
            "used_llm": False,
            "fallback_reason": "empty_question",
        }

    if llm_fn is None:
        return {
            "text": script,
            "source": "script_no_llm",
            "confidence": 1.0,
            "used_llm": False,
            "fallback_reason": None,
        }

    try:
        raw = llm_fn(q, ctx)
    except Exception:
        raw = None

    if not isinstance(raw, dict):
        return {
            "text": script,
            "source": "script_llm_unavailable",
            "confidence": 1.0,
            "used_llm": False,
            "fallback_reason": "llm_unavailable",
        }

    text = str(raw.get("text") or "").strip()
    try:
        conf = float(raw.get("confidence") if raw.get("confidence") is not None else 0)
    except (TypeError, ValueError):
        conf = 0.0

    hazard = str(ctx.get("hazard_level") or "WATCH").upper()
    if not text or conf < CONFIDENCE_FLOOR:
        return {
            "text": script,
            "source": "script_low_confidence",
            "confidence": conf,
            "used_llm": True,
            "fallback_reason": "low_confidence_or_empty",
        }
    if _invents_hazard(text, hazard):
        return {
            "text": script,
            "source": "script_invented_hazard",
            "confidence": conf,
            "used_llm": True,
            "fallback_reason": "invented_hazard",
        }

    return {
        "text": _clip(text, 420),
        "source": "llm_bounded",
        "confidence": conf,
        "used_llm": True,
        "fallback_reason": None,
    }


def _try_gemma_translate(question: str, ctx: dict[str, Any]) -> dict[str, Any] | None:
    """Gemma first, then Featherless. Translate facts only. Fail closed."""
    lang = normalize_lang(ctx.get("lang"))
    lang_name = LANG_NAMES.get(lang, "English")
    prompt = (
        "You are Alma, Early Action voice for ALMA on Omo–Turkana. "
        f"Translate PRE-CALCULATED facts into {lang_name} spoken prose. "
        "NEVER invent flood conditions. NEVER change hazard_level. "
        "If you cannot translate faithfully, return confidence 0. "
        f"Facts: {json.dumps(ctx, default=str)}. "
        f"Request: {question[:500]}. "
        'Reply JSON {"text":"...","confidence":0.0}'
    )
    raw = None
    try:
        from services import gemma_ai

        raw = gemma_ai._ollama_generate(  # noqa: SLF001
            gemma_ai.ANALYST_MODEL, prompt, timeout=min(8.0, gemma_ai.ANALYST_TIMEOUT_S)
        )
    except Exception:
        raw = None

    def _parse(blob: str | None) -> dict[str, Any] | None:
        if not blob:
            return None
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", blob, re.S)
            if not m:
                return {"text": blob.strip().strip('"'), "confidence": 0.6}
            try:
                data = json.loads(m.group(0))
            except json.JSONDecodeError:
                return {"text": blob.strip()[:420], "confidence": 0.55}
        if not isinstance(data, dict):
            return None
        return {
            "text": data.get("text") or data.get("answer"),
            "confidence": data.get("confidence", 0.7),
        }

    parsed = _parse(raw)
    if parsed and parsed.get("text"):
        return parsed

    try:
        from services import featherless_ai

        cloud = featherless_ai.chat_json(
            "You are Alma. Translate facts only. Reply JSON with keys text and confidence.",
            prompt,
            timeout=10.0,
        )
        if cloud and cloud.get("data") and isinstance(cloud["data"], dict):
            return {
                "text": cloud["data"].get("text") or cloud["data"].get("answer"),
                "confidence": cloud["data"].get("confidence", 0.7),
            }
        if cloud and cloud.get("raw"):
            return _parse(str(cloud["raw"]))
    except Exception:
        return None
    return None


def voice_qa_answer(
    question: str,
    *,
    community: str | None = None,
    risk_context: dict[str, Any] | None = None,
    conversation_context: list | None = None,
    lang: str = "sw",
) -> dict[str, Any]:
    """Drop-in for voice_conversation — structured facts + hard script fallback."""
    _ = conversation_context
    risk = risk_context or {}
    compound = bool(risk.get("compound_active"))
    from services.readiness_score import normalize_hazard_level

    hazard = normalize_hazard_level(
        str(risk.get("tier") or "watch"),
        compound_active=compound,
        farmer_flood_risk=str(risk.get("farmer_flood_risk") or "") or None,
    )
    ctx = structured_context(
        hazard_level=hazard,
        sector=str(risk.get("sector") or "farmer"),
        lang=lang,
        event_phase=str(risk.get("event_phase") or "pre_risk"),
        community=community or str(risk.get("community") or ""),
        next_tip=str(risk.get("guidance_text") or risk.get("text") or "")[:90] or None,
        compound_active=compound,
    )
    result = bounded_advice(question, ctx, llm_fn=_try_gemma_translate)
    understood = result.get("fallback_reason") not in (
        "malformed_context",
        "empty_question",
        "low_confidence_or_empty",
    )
    return {
        "answer": result["text"],
        "understood": bool(understood and result.get("source") != "script_malformed_input"),
        "source": result["source"],
        "confidence": result["confidence"],
        "fallback_reason": result.get("fallback_reason"),
        "hazard_level": ctx["hazard_level"],
        "sector": ctx["sector"],
    }
