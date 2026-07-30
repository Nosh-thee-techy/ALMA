"""
Offline-capable Gemma integration via Ollama HTTP API.

- FunctionGemma / small model: parse USSD/SMS ground-truth → JSON
- Gemma 2: analyst Q&A + multilingual playbook polish

Graceful degradation: if inference > GEMMA_TIMEOUT_S (default 2s),
fall back to deterministic rule playbooks so USSD sessions never stall.
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any

import httpx

from services.playbook_loader import get_playbook_line, load_playbooks

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
FUNCTION_MODEL = os.getenv("ALMA_FUNCTION_MODEL", "gemma2:2b")
ANALYST_MODEL = os.getenv("ALMA_ANALYST_MODEL", "gemma2:9b")
# USSD must stay fast — hard budget before rule fallback
GEMMA_TIMEOUT_S = float(os.getenv("ALMA_GEMMA_TIMEOUT_S", "2.0"))
# Desk analyst / translator can take longer (local 9B)
ANALYST_TIMEOUT_S = float(os.getenv("ALMA_ANALYST_TIMEOUT_S", "45.0"))


def _ollama_generate(model: str, prompt: str, timeout: float) -> str | None:
    try:
        with httpx.Client(timeout=timeout) as client:
            res = client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
            )
            if res.status_code != 200:
                return None
            data = res.json()
            return data.get("response")
    except Exception:
        return None


def parse_ground_truth_rule_based(text: str) -> dict[str, Any]:
    """Zero-latency edge parser fallback (no model)."""
    t = text.lower()
    node = "Node_Unknown"
    m = re.search(r"node\s*([0-9]+)", t)
    if m:
        node = f"Node_{m.group(1)}"
    elif "kalokol" in t:
        node = "Node_Kalokol"
    elif "omorate" in t:
        node = "Node_Omorate"

    if any(w in t for w in ("juu sana", "severe", "flood", "mafuriko", "evacuate", "kwama", "wamekwama")):
        status = "Severe_Rise"
        action = "Evacuation_Assistance"
        conf = 0.8
    elif any(w in t for w in ("rising", "ongezeka", "watch", "warning", "juu", "high water", "maji")):
        status = "Moderate_Rise"
        action = "Monitor_And_Prepare"
        conf = 0.7
    else:
        status = "Stable"
        action = "Continue_Monitoring"
        conf = 0.6

    # "juu" alone with livestock distress → escalate
    if "juu" in t and any(w in t for w in ("ng'ombe", "ngombe", "livestock", "herd", "cattle", "kwama")):
        status = "Severe_Rise"
        action = "Evacuation_Assistance"
        conf = max(conf, 0.85)

    entity = "Community"
    if any(w in t for w in ("ng'ombe", "ngombe", "livestock", "herd", "cattle")):
        entity = "Livestock"
    elif any(w in t for w in ("mazao", "crop", "shamba", "farm")):
        entity = "Crops"
    elif any(w in t for w in ("boti", "boat", "fish", "ziwa")):
        entity = "Fisheries"

    return {
        "node_id": node,
        "water_level_status": status,
        "affected_entity": entity,
        "action_required": action,
        "confidence_weight": conf,
        "parser": "rule_based",
        "raw_excerpt": text[:180],
    }


def parse_ground_truth(text: str) -> dict[str, Any]:
    """Local Gemma (≤2s) → Featherless cloud → rule playbook."""
    from services import featherless_ai

    prompt = (
        "Extract flood ground-truth JSON with keys: node_id, water_level_status "
        "(Severe_Rise|Moderate_Rise|Stable), affected_entity, action_required, "
        f"confidence_weight (0-1). Message: {text}"
    )
    started = time.perf_counter()
    raw = _ollama_generate(FUNCTION_MODEL, prompt, timeout=GEMMA_TIMEOUT_S)
    elapsed = time.perf_counter() - started
    if raw and elapsed <= GEMMA_TIMEOUT_S:
        try:
            data = json.loads(raw)
            data["parser"] = "gemma_local"
            data["elapsed_s"] = round(elapsed, 3)
            return data
        except json.JSONDecodeError:
            pass

    # Cloud assist when local Ollama is cold/slow (still keep USSD from hanging too long)
    cloud = featherless_ai.chat_json(
        "Return ONLY valid JSON for flood ground-truth extraction.",
        prompt,
        timeout=float(os.getenv("ALMA_USSD_PARSE_TIMEOUT_S", "3.0")),
    )
    if cloud and cloud.get("data") and isinstance(cloud["data"], dict):
        data = cloud["data"]
        data["parser"] = "featherless"
        data["elapsed_s"] = round(time.perf_counter() - started, 3)
        return data

    out = parse_ground_truth_rule_based(text)
    out["fallback_reason"] = "timeout_or_unavailable"
    out["elapsed_s"] = round(time.perf_counter() - started, 3)
    return out


def translate_playbook(sector: str, tier: str, lang: str = "en") -> dict[str, Any]:
    """Local Gemma → Featherless → static playbook."""
    from services import featherless_ai

    base = get_playbook_line(sector, tier, lang)
    prompt = (
        f"Rewrite this flood early-action SMS for {sector} at tier {tier} in language {lang}. "
        f"Keep under 160 chars. Fact text: {base}. Reply JSON {{\"text\": \"...\"}}"
    )
    started = time.perf_counter()
    raw = _ollama_generate(ANALYST_MODEL, prompt, timeout=ANALYST_TIMEOUT_S)
    elapsed = time.perf_counter() - started
    if raw and elapsed <= ANALYST_TIMEOUT_S:
        try:
            data = json.loads(raw)
            text = data.get("text") or data.get("message") or base
        except json.JSONDecodeError:
            text = raw.strip().strip('"')[:200] or base
        return {
            "text": text,
            "lang": lang,
            "sector": sector,
            "tier": tier,
            "source": "gemma_local",
            "elapsed_s": round(elapsed, 3),
        }

    cloud = featherless_ai.chat_json(
        "You rewrite flood SMS. Reply ONLY JSON with key text.",
        prompt,
        timeout=20.0,
    )
    if cloud and cloud.get("data") and isinstance(cloud["data"], dict) and cloud["data"].get("text"):
        return {
            "text": str(cloud["data"]["text"])[:200],
            "lang": lang,
            "sector": sector,
            "tier": tier,
            "source": "featherless",
            "elapsed_s": round(time.perf_counter() - started, 3),
        }
    if cloud and cloud.get("raw"):
        return {
            "text": str(cloud["raw"]).strip().strip('"')[:200] or base,
            "lang": lang,
            "sector": sector,
            "tier": tier,
            "source": "featherless_text",
            "elapsed_s": round(time.perf_counter() - started, 3),
        }

    return {
        "text": base,
        "lang": lang,
        "sector": sector,
        "tier": tier,
        "source": "playbook_cache",
        "elapsed_s": round(time.perf_counter() - started, 3),
    }


def analyst_query(question: str, rain_mm: float, dam_m3s: float, risk: dict[str, Any]) -> dict[str, Any]:
    """Local Gemma desk assistant → Featherless → risk engine summary."""
    from services import featherless_ai

    prompt = (
        "You are ALMA offline analyst at a Turkana county desk. Answer briefly for operators. "
        f"Current rain_mm={rain_mm}, dam_m3s={dam_m3s}, risk={json.dumps(risk)}. "
        f"Question: {question}. Reply JSON {{\"answer\": \"...\", \"recommended_tier\": \"safe|watch|warning|severe\"}}"
    )
    started = time.perf_counter()
    raw = _ollama_generate(ANALYST_MODEL, prompt, timeout=ANALYST_TIMEOUT_S)
    elapsed = time.perf_counter() - started
    if raw:
        try:
            data = json.loads(raw)
            data["source"] = "gemma_local"
            data["elapsed_s"] = round(elapsed, 3)
            return data
        except json.JSONDecodeError:
            return {
                "answer": raw[:500],
                "recommended_tier": risk.get("tier", "watch"),
                "source": "gemma_local_text",
                "elapsed_s": round(elapsed, 3),
            }

    cloud = featherless_ai.chat_json(
        "You are ALMA flood desk analyst. Reply ONLY JSON with answer and recommended_tier.",
        prompt,
        timeout=25.0,
    )
    if cloud and cloud.get("data") and isinstance(cloud["data"], dict):
        data = cloud["data"]
        data["source"] = "featherless"
        data["elapsed_s"] = round(time.perf_counter() - started, 3)
        return data
    if cloud and cloud.get("raw"):
        return {
            "answer": str(cloud["raw"])[:500],
            "recommended_tier": risk.get("tier", "watch"),
            "source": "featherless_text",
            "elapsed_s": round(time.perf_counter() - started, 3),
        }

    return {
        "answer": risk.get("plain_summary", "Risk engine unavailable."),
        "recommended_tier": risk.get("tier", "watch"),
        "source": "risk_engine_fallback",
        "elapsed_s": round(time.perf_counter() - started, 3),
    }


def health() -> dict[str, Any]:
    from services import featherless_ai

    try:
        with httpx.Client(timeout=1.0) as client:
            r = client.get(f"{OLLAMA_HOST}/api/tags")
            ok = r.status_code == 200
            models = [m.get("name") for m in r.json().get("models", [])] if ok else []
    except Exception:
        ok = False
        models = []
    return {
        "ollama_reachable": ok,
        "models": models,
        "function_model": FUNCTION_MODEL,
        "analyst_model": ANALYST_MODEL,
        "ussd_timeout_s": GEMMA_TIMEOUT_S,
        "analyst_timeout_s": ANALYST_TIMEOUT_S,
        "playbooks_loaded": bool(load_playbooks()),
        "featherless": featherless_ai.health(),
    }
