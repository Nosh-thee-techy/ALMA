"""Load ward / playbook / cell-tower static data."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA = Path(__file__).resolve().parent.parent / "data"


@lru_cache(maxsize=1)
def load_playbooks() -> dict[str, Any]:
    path = DATA / "sector_playbooks.json"
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_wards() -> dict[str, Any]:
    path = DATA / "wards_geojson.json"
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def cell_to_ward(lac: str | None, cid: str | None) -> str | None:
    if not lac or not cid:
        return None
    key = f"{lac}:{cid}"
    return load_playbooks().get("cell_towers", {}).get(key)


def ward_props(ward_id: str) -> dict[str, Any] | None:
    for feat in load_wards().get("features", []):
        props = feat.get("properties") or {}
        if props.get("ward_id") == ward_id:
            return props
    return None


def get_playbook_line(sector: str, tier: str, lang: str = "en") -> str:
    books = load_playbooks().get("playbooks", {})
    sector_book = books.get(sector) or books.get("pastoralist", {})
    tier_book = sector_book.get(tier) or sector_book.get("watch", {})
    return tier_book.get(lang) or tier_book.get("en") or "Stay alert. Dial *384*96428# for updates."


def corridor_for_ward(ward_id: str) -> dict[str, Any]:
    corridors = load_playbooks().get("ndvi_corridors", {})
    return corridors.get(ward_id) or {
        "bearing": "EAST",
        "km": 8,
        "name": "Corridor B",
        "forage_days": 8,
        "ndvi": 0.4,
    }
