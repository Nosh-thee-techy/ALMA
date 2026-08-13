"""
ICPAC regional outlook — manually curated context layer.

This is NOT a live API pull. Operators update the field after reading ICPAC
Weekly / Monthly / Seasonal Forecast and GHACOF technical statements.
"""
from __future__ import annotations

import time
from typing import Any

from services import session_store

SETTING_KEY = "icpac_regional_outlook"

DEFAULT = {
    "summary": (
        "Check ICPAC Weekly/Seasonal Forecast and GHACOF statements for the "
        "current Greater Horn rainfall outlook. Update this field after each bulletin."
    ),
    "issuedDate": None,
    "source": "ICPAC (manual curation)",
    "updatedAt": None,
    "updatedBy": None,
}


def get_outlook() -> dict[str, Any]:
    row = session_store.get_app_setting(SETTING_KEY)
    if not row:
        return {
            "ok": True,
            "outlook": DEFAULT,
            "manual": True,
            "honesty": (
                "Manually curated from ICPAC published outlooks — not an automated feed."
            ),
        }
    return {
        "ok": True,
        "outlook": row,
        "manual": True,
        "honesty": (
            "Manually curated from ICPAC published outlooks — not an automated feed."
        ),
    }


def set_outlook(
    summary: str,
    *,
    issued_date: str | None = None,
    source: str | None = None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    summary = (summary or "").strip()
    if not summary:
        return {"ok": False, "error": "summary_required"}
    payload = {
        "summary": summary[:2000],
        "issuedDate": (issued_date or "").strip() or None,
        "source": (source or "ICPAC (manual curation)").strip()[:200],
        "updatedAt": time.time(),
        "updatedBy": (updated_by or "").strip() or None,
    }
    session_store.set_app_setting(SETTING_KEY, payload)
    return {
        "ok": True,
        "outlook": payload,
        "manual": True,
        "honesty": (
            "Manually curated from ICPAC published outlooks — not an automated feed."
        ),
    }
