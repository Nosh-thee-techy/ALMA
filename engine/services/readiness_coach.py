"""
Deterministic coaching for My Readiness — how to do a task, what happens after,
how crops/animals are, and the gap between where you are and READY.

Alma may translate these facts. She must not invent flood conditions.
"""
from __future__ import annotations

from typing import Any

LANG_NAMES = {
    "en": "English",
    "sw": "Kiswahili",
    "trk": "Ng'aturkana",
    "orm": "Afaan Oromo",
    "am": "Amharic",
}

# how = how they should do it. after = what should be true when it is done.
TASK_COACH: dict[str, dict[str, str]] = {
    "farmer:drain": {
        "how": "Walk the plot edges with a hoe. Open blocked furrows so standing water can leave the roots.",
        "after": "Water runs off within a day. Soil smells clean, not sour. Roots stay pale, not black.",
    },
    "farmer:seed": {
        "how": "Bag seed and grain. Lift them onto a rack, roof beam, or high-ground store above splash height.",
        "after": "Seed stays dry to the touch. You can plant after the water moves.",
    },
    "farmer:inspect": {
        "how": "Open a few cobs or pods. Look for mould, rot, or flood silt before you eat or sell.",
        "after": "Only clean grain is kept. Spoiled grain is set aside — not sold as food.",
    },
    "farmer:soil": {
        "how": "Dig a small pit. If it stays wet and smells sour, wait. Plant a fast cover crop only on firmer ground.",
        "after": "You know which plots can take seed again and which still need rest.",
    },
    "herder:route": {
        "how": "Walk the high-ground path in daylight. Mark where herds can pass if the floodplain fills.",
        "after": "Every herder in your group can name the same high-ground corridor.",
    },
    "herder:fodder": {
        "how": "Stack dry fodder on a raised bed or in a hut above the flood line. Cover it from rain.",
        "after": "Fodder stays dry. Animals can eat it when the plain is under water.",
    },
    "herder:disease": {
        "how": "Keep animals off flooded grass. Watch for diarrhoea, weak legs, or sudden deaths. Tell a vet or Alma.",
        "after": "Herds graze only rest pasture. Sick animals are separated.",
    },
    "herder:water": {
        "how": "Use known boreholes or treated water. Do not let animals drink from stagnant flood pools.",
        "after": "Drinking water is from a clean point. Flood pools are fenced off if you can.",
    },
    "fisher:tether": {
        "how": "Pull boats above the surge line. Tie to a strong post or tree, not to a crumbling bank.",
        "after": "Boats sit on high ground. They will not float away in the night surge.",
    },
    "fisher:gear": {
        "how": "Lift nets, engines, and fuel onto racks or into a dry hut. Keep fuel sealed.",
        "after": "Gear is dry and above splash. You can fish again when the bank is stable.",
    },
    "fisher:bank": {
        "how": "Stay off undercut banks. Move camps inland. Do not sleep at the water’s edge.",
        "after": "People and boats are inland of the crumbly edge.",
    },
    "fisher:check": {
        "how": "Walk the hull and nets in daylight. Look for tears, missing boards, or fuel leaks before you launch.",
        "after": "Only sound boats go out. Damaged gear is repaired first.",
    },
    "fisher:bank2": {
        "how": "After the surge, wait. Banks that look dry can still collapse. Use known landings.",
        "after": "Landing is on a firm known bank, not a fresh cut.",
    },
}

SECTOR_DEFAULTS: dict[str, dict[str, dict[str, str]]] = {
    "agriculture": {
        "pre_risk": {
            "how": "Do the crop action in daylight. Keep seed and grain above water. Clear drainage first.",
            "after": "Plots can shed water. Seed is dry and ready for after the pulse.",
        },
        "post_risk": {
            "how": "Inspect before you eat or sell. Do not replant sour, drowned soil yet.",
            "after": "Only clean harvest is used. Tired plots rest.",
        },
    },
    "livestock": {
        "pre_risk": {
            "how": "Move animals toward the marked high-ground route. Keep fodder dry and raised.",
            "after": "Herds can leave the floodplain quickly. Dry fodder is waiting.",
        },
        "post_risk": {
            "how": "Keep livestock off flooded grass. Watch for waterborne disease.",
            "after": "Animals graze rest pasture. Sick ones are apart.",
        },
    },
    "fisheries": {
        "pre_risk": {
            "how": "Tether boats, lift gear, and leave the crumbling bank.",
            "after": "Boats and nets are high and dry. People sleep inland.",
        },
        "post_risk": {
            "how": "Check hulls and nets before launch. Use a firm known landing.",
            "after": "Only sound boats go out.",
        },
    },
    "farmer": {
        "pre_risk": {
            "how": "Clear water from roots. Lift seed above splash height.",
            "after": "Roots can breathe. Seed stays plantable.",
        },
        "post_risk": {
            "how": "Inspect harvest. Rest drowned plots.",
            "after": "Food that is kept is clean.",
        },
    },
    "herder": {
        "pre_risk": {
            "how": "Confirm the high-ground path. Raise dry fodder.",
            "after": "The corridor is known. Fodder is dry.",
        },
        "post_risk": {
            "how": "Rest flooded pasture. Watch the herd for illness.",
            "after": "Animals are on safe grass.",
        },
    },
    "fisher": {
        "pre_risk": {
            "how": "Tether boats. Lift nets. Leave the bank edge.",
            "after": "Gear will still be there after the surge.",
        },
        "post_risk": {
            "how": "Check boats in daylight. Avoid new cut banks.",
            "after": "Landing is firm. Hull is sound.",
        },
    },
}


def coach_for(item_id: str, sector: str, phase: str, task: str) -> dict[str, str]:
    tag = "post_risk" if phase == "post_risk" or ":after:" in item_id else "pre_risk"
    for key, val in TASK_COACH.items():
        if item_id.startswith(key):
            return {"how": val["how"], "afterEffect": val["after"]}
    sec = sector if sector in SECTOR_DEFAULTS else "farmer"
    block = (SECTOR_DEFAULTS.get(sec) or SECTOR_DEFAULTS["farmer"]).get(tag) or SECTOR_DEFAULTS["farmer"]["pre_risk"]
    return {"how": block["how"], "afterEffect": block["after"], "task": task}


def describe_crop(name: str, *, climate_state: str, hazard: str, phase: str, why: str) -> str:
    n = (name or "crop").capitalize()
    if phase == "post_risk":
        return f"Your {n}: inspect before eating or selling. {why}".strip()
    if hazard in ("SEVERE", "COMPOUND"):
        return f"Your {n}: roots can drown on the floodplain. Drain and lift seed now. {why}".strip()
    if climate_state == "dry_spell":
        return f"Your {n}: dry spell — keep seed safe; delay thirsty planting. {why}".strip()
    return f"Your {n}: keep drainage open so roots breathe. {why}".strip()


def describe_animal(name: str, *, climate_state: str, hazard: str, phase: str, why: str) -> str:
    n = (name or "animals").capitalize()
    if phase == "post_risk":
        return f"Your {n}: keep off flooded pasture; watch for disease. {why}".strip()
    if hazard in ("SEVERE", "COMPOUND"):
        return f"Your {n}: move toward high-ground grazing now. {why}".strip()
    if climate_state == "dry_spell":
        return f"Your {n}: water points matter early — do not wait for the plain to empty. {why}".strip()
    return f"Your {n}: know the high-ground route and keep fodder dry. {why}".strip()


def describe_gear(name: str, *, hazard: str, phase: str, why: str) -> str:
    n = (name or "gear").capitalize()
    if phase == "post_risk":
        return f"Your {n}: check in daylight before you launch. {why}".strip()
    if hazard in ("SEVERE", "COMPOUND", "WARNING"):
        return f"Your {n}: tether and lift above the surge line. Stay off crumbling banks. {why}".strip()
    return f"Your {n}: check moorings; keep nets ready to lift. {why}".strip()


def asset_cards(
    *,
    crop_types: list[str],
    livestock_types: list[str],
    fishery_types: list[str],
    climate_state: str,
    hazard: str,
    phase: str,
    crop_why: str = "",
    livestock_why: str = "",
    water_why: str = "",
) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    for name in crop_types:
        cards.append(
            {
                "kind": "crop",
                "name": name,
                "howTheyAre": describe_crop(
                    name, climate_state=climate_state, hazard=hazard, phase=phase, why=crop_why
                )[:220],
            }
        )
    for name in livestock_types:
        cards.append(
            {
                "kind": "animal",
                "name": name,
                "howTheyAre": describe_animal(
                    name, climate_state=climate_state, hazard=hazard, phase=phase, why=livestock_why
                )[:220],
            }
        )
    for name in fishery_types:
        cards.append(
            {
                "kind": "gear",
                "name": name,
                "howTheyAre": describe_gear(name, hazard=hazard, phase=phase, why=water_why)[:220],
            }
        )
    return cards


def gap_brief(
    *,
    preparedness_state: str,
    score_percent: int,
    done: int,
    total: int,
    next_tips: list[str],
) -> dict[str, Any]:
    should = "READY — every current action done before the next pulse"
    you = f"{preparedness_state}"
    if total:
        you = f"{preparedness_state} — {done} of {total} actions done"
    if isinstance(score_percent, int):
        you = f"{you} (operational {score_percent}, not credit)"
    return {
        "youAre": you,
        "youShouldBe": should,
        "done": done,
        "total": total,
        "remaining": max(0, total - done),
        "howToGetBetter": next_tips[:4],
    }


def climate_brief(
    *,
    place: str,
    summary: str,
    hazard: str,
    phase: str,
    climate_state: str,
    prediction: str,
) -> dict[str, str]:
    phase_plain = {
        "pre_risk": "Before the water — prepare now.",
        "active_risk": "Water is in the window — act, do not wait.",
        "post_risk": "After the pulse — recover and log what you did.",
    }.get(phase, "Watch the next pulse.")
    return {
        "place": place,
        "summary": summary or phase_plain,
        "hazard": hazard,
        "phase": phase,
        "phasePlain": phase_plain,
        "climateState": climate_state,
        "prediction": prediction or summary or phase_plain,
    }
