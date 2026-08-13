"""
Climatic Impact Cascade — physical/economic chain per climatic state.

Audience split (same rule as elsewhere in ALMA):
- Farmer tier: simplified whatIsHappening / farmerWhy — no full mechanism
- NGO tier: whatIsHappening + mechanism (briefing detail)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

CascadeState = Literal["flood_rain", "flood_dam", "compound", "drought"]
SECTORS = ("livestock", "crops", "soil", "water", "marketEconomic", "health")

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "climatic_impact_cascade.json"
_CACHE: dict[str, Any] | None = None


def _load() -> dict[str, Any]:
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    with _DATA_PATH.open(encoding="utf-8") as f:
        _CACHE = json.load(f)
    return _CACHE


def resolve_climatic_state(
    *,
    tier: str,
    compound_active: bool,
    climate_state: str,
    rain_score: float,
    dam_score: float,
    drought_risk: str = "safe",
) -> CascadeState:
    """
    Map live dual-trigger + climate signals onto cascade keys.

    Priority: compound window → drought when dry-spell dominates → dam vs rain flood.
    """
    tier_l = (tier or "safe").lower()
    drought_l = (drought_risk or "safe").lower()
    climate = (climate_state or "stable").lower()
    elevated = tier_l in ("watch", "warning", "severe") or compound_active

    if compound_active and elevated:
        return "compound"

    drought_elevated = drought_l in ("watch", "warning", "severe") or climate == "dry_spell"
    flood_elevated = elevated and tier_l != "safe"

    if drought_elevated and not flood_elevated:
        return "drought"
    if drought_elevated and climate == "dry_spell" and tier_l in ("safe", "watch") and dam_score < 40:
        return "drought"

    if flood_elevated or climate == "wet_trend":
        if float(dam_score) > float(rain_score) + 8:
            return "flood_dam"
        return "flood_rain"

    if climate == "dry_spell":
        return "drought"
    return "flood_rain" if float(rain_score) >= float(dam_score) else "flood_dam"


def get_cascade(state: CascadeState | str) -> dict[str, Any]:
    data = _load()
    key = state if state in data and not str(state).startswith("_") else "flood_rain"
    block = data.get(key) or data["flood_rain"]
    return {"state": key, **block}


def ngo_sector_view(state: CascadeState | str, sector: str) -> dict[str, str]:
    """Full mechanism for NGO / county desk."""
    cascade = get_cascade(state)
    # Map Sector Guidance ids → cascade keys
    key = {
        "agriculture": "crops",
        "livestock": "livestock",
        "fisheries": "water",
        "health": "health",
        "crops": "crops",
        "soil": "soil",
        "water": "water",
        "marketEconomic": "marketEconomic",
        "market": "marketEconomic",
    }.get(sector, sector)
    entry = cascade.get(key) or {}
    return {
        "sector": key,
        "whatIsHappening": str(entry.get("whatIsHappening") or ""),
        "mechanism": str(entry.get("mechanism") or ""),
        "state": str(cascade.get("state") or state),
        "label": str(cascade.get("label") or ""),
    }


def farmer_briefing(
    state: CascadeState | str,
    *,
    crop_types: list[str] | None = None,
    livestock_types: list[str] | None = None,
    fishery_types: list[str] | None = None,
    checklist_tasks: list[str] | None = None,
) -> dict[str, Any]:
    """
    Farmer-tier: Here's what's happening → why it matters → how to get better.
    Mechanism is intentionally omitted.
    """
    cascade = get_cascade(state)
    crops = crop_types or []
    livestock = livestock_types or []
    fishery = fishery_types or []

    means: list[str] = []
    if crops and cascade.get("crops"):
        means.append(str(cascade["crops"].get("farmerWhy") or cascade["crops"].get("whatIsHappening")))
    if livestock and cascade.get("livestock"):
        means.append(
            str(cascade["livestock"].get("farmerWhy") or cascade["livestock"].get("whatIsHappening"))
        )
    if fishery and cascade.get("water"):
        means.append(str(cascade["water"].get("farmerWhy") or cascade["water"].get("whatIsHappening")))
    if not means:
        # Generic when no registration detail
        for key in ("crops", "livestock", "water"):
            entry = cascade.get(key) or {}
            if entry.get("farmerWhy"):
                means.append(str(entry["farmerWhy"]))
            if len(means) >= 2:
                break

    market = cascade.get("marketEconomic") or {}
    market_line = str(market.get("farmerWhy") or market.get("whatIsHappening") or "")

    how: list[str] = []
    for task in checklist_tasks or []:
        t = str(task).strip()
        if t and t not in how:
            how.append(t)
        if len(how) >= 4:
            break

    return {
        "state": cascade.get("state") or state,
        "label": cascade.get("label"),
        "intro": cascade.get("farmerIntro"),
        "whatThisMeans": means,
        "marketAwareness": market_line,
        "howToGetBetter": how,
        "sectors": {
            k: {
                "whatIsHappening": (cascade.get(k) or {}).get("farmerWhy")
                or (cascade.get(k) or {}).get("whatIsHappening"),
            }
            for k in SECTORS
            if cascade.get(k)
        },
    }


def ngo_briefing(state: CascadeState | str) -> dict[str, Any]:
    cascade = get_cascade(state)
    sectors = {}
    for key in SECTORS:
        entry = cascade.get(key)
        if not entry:
            continue
        sectors[key] = {
            "whatIsHappening": entry.get("whatIsHappening"),
            "mechanism": entry.get("mechanism"),
        }
    return {
        "state": cascade.get("state") or state,
        "label": cascade.get("label"),
        "sectors": sectors,
        "marketEconomic": sectors.get("marketEconomic"),
    }


def sms_why_clause(state: CascadeState | str, sector: str = "crops") -> str:
    """One short 'why' line for SMS/USSD/voice — channel length constrained."""
    view = ngo_sector_view(state, sector)
    text = view.get("whatIsHappening") or ""
    # Prefer farmerWhy if present on cascade entry
    cascade = get_cascade(state)
    key = "crops" if sector in ("agriculture", "crops") else (
        "livestock" if sector == "livestock" else sector
    )
    entry = cascade.get(key) or {}
    text = str(entry.get("farmerWhy") or text)
    text = " ".join(text.split())
    if len(text) > 90:
        text = text[:87].rstrip() + "…"
    return f"Reason: {text}" if text else ""


def all_states() -> list[str]:
    data = _load()
    return [k for k in data.keys() if not k.startswith("_")]
