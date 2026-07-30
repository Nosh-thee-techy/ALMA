"""
Live / near-live basin signals — honest about what is and isn't Gibe III SCADA.

Alternatives to fake dam telemetry:
1. Open-Meteo precipitation over Upper Omo → estimated release *pressure* (m³/s proxy).
2. Optional partner JSON at DAM_TELEMETRY_URL (EEP / basin authority).
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx

from services.risk_engine import compute_compound_risk, dam_score_from_discharge, rain_score_from_mm

_CACHE: dict[str, Any] = {"at": 0.0, "data": None}
_CACHE_TTL_S = float(os.getenv("ALMA_LIVE_CACHE_S", "45"))

# Upper Omo approx (south of Addis / above Gibe III)
OMO_LAT = float(os.getenv("ALMA_OMO_LAT", "7.05"))
OMO_LON = float(os.getenv("ALMA_OMO_LON", "37.55"))
DAM_TELEMETRY_URL = os.getenv("DAM_TELEMETRY_URL", "").strip()
DAM_TELEMETRY_TOKEN = os.getenv("DAM_TELEMETRY_TOKEN", "").strip()


def _open_meteo_rain_mm() -> dict[str, Any]:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={OMO_LAT}&longitude={OMO_LON}"
        "&daily=precipitation_sum&past_days=7&forecast_days=1&timezone=Africa%2FNairobi"
    )
    with httpx.Client(timeout=12.0) as client:
        res = client.get(url)
        res.raise_for_status()
        data = res.json()
    daily = data.get("daily") or {}
    precip = list(daily.get("precipitation_sum") or [])
    rain_24h = float(precip[-1]) if precip else 0.0
    rain_7d = float(sum(precip[-7:])) if precip else 0.0
    return {
        "ok": True,
        "source": "open-meteo",
        "lat": OMO_LAT,
        "lon": OMO_LON,
        "rain_24h_mm": round(rain_24h, 1),
        "rain_7d_mm": round(rain_7d, 1),
        "daily_mm": precip[-7:],
        "dates": (daily.get("time") or [])[-7:],
        "label": "Live Open-Meteo rain over Upper Omo (not CHIRPS, not gauge network)",
    }


def rain_to_release_pressure_m3s(rain_24h_mm: float, rain_7d_mm: float) -> dict[str, Any]:
    """
    Map upstream rain into an *estimated* Gibe-facing release pressure.
    This is NOT official dam discharge — labeled estimated_from_rain.
    Heuristic: sustained wet weeks + heavy day → higher spill pressure.
    """
    day = min(rain_24h_mm, 120.0)
    week = min(rain_7d_mm, 400.0)
    # Baseline turbine band ~200–400; surge toward 1500+ under extreme rain
    pressure = 180 + day * 8.5 + week * 1.2
    pressure = min(2200.0, max(80.0, pressure))
    return {
        "estimated_release_m3s": round(pressure, 1),
        "method": "open_meteo_rain_proxy",
        "honesty": (
            "Estimated release pressure from upstream rain only. "
            "Not live Gibe III SCADA / EEP telemetry."
        ),
        "dam_score": round(dam_score_from_discharge(pressure), 1),
        "rain_score": round(rain_score_from_mm(rain_24h_mm), 1),
    }


def fetch_partner_dam() -> dict[str, Any] | None:
    if not DAM_TELEMETRY_URL:
        return None
    headers = {"Accept": "application/json"}
    if DAM_TELEMETRY_TOKEN:
        headers["Authorization"] = f"Bearer {DAM_TELEMETRY_TOKEN}"
    try:
        with httpx.Client(timeout=12.0) as client:
            res = client.get(DAM_TELEMETRY_URL, headers=headers)
            res.raise_for_status()
            body = res.json()
    except Exception as exc:
        return {"ok": False, "error": str(exc), "url": DAM_TELEMETRY_URL}
    return {
        "ok": True,
        "source": "partner_feed",
        "url": DAM_TELEMETRY_URL,
        "payload": body,
        "label": "Partner dam feed (treat fields as live only if provider confirms)",
    }


def get_live_signals(*, force: bool = False) -> dict[str, Any]:
    now = time.time()
    if (
        not force
        and _CACHE["data"] is not None
        and (now - float(_CACHE["at"])) < _CACHE_TTL_S
    ):
        return _CACHE["data"]

    rain: dict[str, Any]
    try:
        rain = _open_meteo_rain_mm()
    except Exception as exc:
        rain = {
            "ok": False,
            "error": str(exc),
            "rain_24h_mm": 62.0,
            "rain_7d_mm": 240.0,
            "label": "Open-Meteo unavailable — fallback demo rain used",
        }

    pressure = rain_to_release_pressure_m3s(
        float(rain.get("rain_24h_mm") or 0),
        float(rain.get("rain_7d_mm") or 0),
    )
    partner = fetch_partner_dam()

    release = pressure["estimated_release_m3s"]
    data_quality = "estimated"
    if partner and partner.get("ok") and isinstance(partner.get("payload"), dict):
        payload = partner["payload"]
        if "release_m3s" in payload or "dam_discharge_m3s" in payload:
            release = float(payload.get("release_m3s") or payload.get("dam_discharge_m3s"))
            data_quality = "live_feed"
            pressure = {
                **pressure,
                "estimated_release_m3s": release,
                "method": "partner_DAM_TELEMETRY_URL",
                "honesty": "Using partner DAM_TELEMETRY_URL field release_m3s / dam_discharge_m3s.",
            }

    risk = compute_compound_risk(
        float(rain.get("rain_24h_mm") or 0),
        float(release),
        data_quality=data_quality,
    )

    out = {
        "ok": True,
        "rain": rain,
        "dam_alternative": pressure,
        "partner_dam": partner,
        "risk": risk.to_dict(),
        "pitch_line": (
            "Live piece today: upstream rain (Open-Meteo) + estimated dam pressure. "
            "Official Gibe III SCADA needs a partner URL."
        ),
    }
    _CACHE["at"] = now
    _CACHE["data"] = out
    return out
