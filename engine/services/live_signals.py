"""
Live / near-live basin signals — honest about what is and isn't Gibe III SCADA.

Alternatives to fake dam telemetry:
1. Open-Meteo precipitation over Upper Omo → estimated release *pressure* (m³/s proxy).
2. Optional partner JSON at DAM_TELEMETRY_URL (EEP / basin authority).
"""
from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from services.forecast_outlook import (
    build_catchment_snapshot,
    farmer_early_heads_up,
    outlook_summary,
)
from services.risk_engine import compute_compound_risk, dam_score_from_discharge, rain_score_from_mm
from services.trained_risk_model import compute_calibrated_flood_probability
from services.glofas_forecast import get_glofas_forecast_for_point

_CACHE: dict[str, Any] = {"at": 0.0, "data": None}
_CACHE_TTL_S = float(os.getenv("ALMA_LIVE_CACHE_S", "45"))
# Keep Open-Meteo short — desk first paint must not wait on a slow upstream.
_OPEN_METEO_TIMEOUT_S = float(os.getenv("ALMA_OPEN_METEO_TIMEOUT_S", "5.0"))
# GloFAS/CDS is optional and often slow; default off for the hot live-signals path.
_GLOFAS_ON_LIVE = os.getenv("ALMA_GLOFAS_ON_LIVE", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# Gibe III upstream basin (Ethiopia ΓÇö dam catchment)
DAM_UPSTREAM_LAT = float(os.getenv("ALMA_OMO_LAT", "7.05"))
DAM_UPSTREAM_LON = float(os.getenv("ALMA_OMO_LON", "37.55"))
# Downstream community catchment (Omo delta / Turkana lake edge ΓÇö rain trigger outlook)
DOWNSTREAM_LAT = float(os.getenv("ALMA_DOWNSTREAM_LAT", "4.05"))
DOWNSTREAM_LON = float(os.getenv("ALMA_DOWNSTREAM_LON", "36.05"))

# Backward-compatible aliases
OMO_LAT = DAM_UPSTREAM_LAT
OMO_LON = DAM_UPSTREAM_LON

DAM_TELEMETRY_URL = os.getenv("DAM_TELEMETRY_URL", "").strip()
DAM_TELEMETRY_TOKEN = os.getenv("DAM_TELEMETRY_TOKEN", "").strip()

_FORECAST_PARAMS = (
    "daily=precipitation_sum"
    "&hourly=soil_moisture_0_to_1cm,soil_moisture_3_to_9cm"
    "&past_days=7"
    "&forecast_days=7"
    "&timezone=Africa%2FNairobi"
)


def _open_meteo_catchment(lat: float, lon: float) -> dict[str, Any]:
    """Single Open-Meteo forecast call ΓÇö history + 7-day forward + soil moisture."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&{_FORECAST_PARAMS}"
    )
    with httpx.Client(timeout=_OPEN_METEO_TIMEOUT_S) as client:
        res = client.get(url)
        res.raise_for_status()
        return res.json()


def _fetch_catchment(catchment_id: str, label: str, lat: float, lon: float) -> dict[str, Any]:
    try:
        payload = _open_meteo_catchment(lat, lon)
        return build_catchment_snapshot(
            catchment_id=catchment_id,
            label=label,
            lat=lat,
            lon=lon,
            api_payload=payload,
        )
    except Exception as exc:
        return {
            "id": catchment_id,
            "label": label,
            "lat": lat,
            "lon": lon,
            "ok": False,
            "error": str(exc),
            "rain_24h_mm": 0.0,
            "rain_7d_mm": 0.0,
            "forecast_rainfall": {"next3_day": 0.0, "next7_day": 0.0},
            "soil_moisture": {"current": 0.0, "trend": "stable"},
            "risk_outlook": "Stable",
        }


def _rain_from_upstream(upstream: dict[str, Any]) -> dict[str, Any]:
    """Build the rain block from the dam-upstream catchment (no second HTTP call)."""
    return {
        "ok": upstream.get("ok", True) is not False,
        "source": "open-meteo",
        "lat": DAM_UPSTREAM_LAT,
        "lon": DAM_UPSTREAM_LON,
        "rain_24h_mm": upstream.get("rain_24h_mm", 0.0),
        "rain_7d_mm": upstream.get("rain_7d_mm", 0.0),
        "daily_mm": upstream.get("daily_mm") or [],
        "dates": upstream.get("dates") or [],
        "label": upstream.get("label")
        or "Live Open-Meteo rain over Upper Omo (Gibe III upstream — not gauge network)",
        "forecast_rainfall": upstream.get("forecast_rainfall"),
        "soil_moisture": upstream.get("soil_moisture"),
        "risk_outlook": upstream.get("risk_outlook"),
        "error": upstream.get("error"),
    }


def _open_meteo_rain_mm() -> dict[str, Any]:
    """Backward-compatible helper — prefer get_live_signals parallel path."""
    upstream = _fetch_catchment(
        "dam_upstream",
        "Live Open-Meteo rain over Upper Omo (Gibe III upstream — not gauge network)",
        DAM_UPSTREAM_LAT,
        DAM_UPSTREAM_LON,
    )
    return _rain_from_upstream(upstream)


def rain_to_release_pressure_m3s(rain_24h_mm: float, rain_7d_mm: float) -> dict[str, Any]:
    """
    Map upstream rain into an *estimated* Gibe-facing release pressure.
    This is NOT official dam discharge — labeled estimated_from_rain.

    Quiet periods stay near baseline turbine band so risk scoring (and therefore
    before-guidance) only escalates when rain accumulation actually rises.
    """
    day = min(max(0.0, rain_24h_mm), 120.0)
    week = min(max(0.0, rain_7d_mm), 400.0)
    # Baseline ~100 m³/s (routine generation). Surge toward 1500+ under extreme rain.
    # Previous 180 baseline kept dam_score elevated even on dry days and made
    # before-guidance look stuck on "evacuate" when live rain was light.
    pressure = 100.0 + day * 9.0 + week * 1.35
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
        with httpx.Client(timeout=min(5.0, _OPEN_METEO_TIMEOUT_S + 1.0)) as client:
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

    # Parallel Open-Meteo (was sequential + a duplicate upstream fetch — multi-second stall).
    with ThreadPoolExecutor(max_workers=3) as pool:
        fut_up = pool.submit(
            _fetch_catchment,
            "dam_upstream",
            "Gibe III upstream basin (Ethiopia)",
            DAM_UPSTREAM_LAT,
            DAM_UPSTREAM_LON,
        )
        fut_down = pool.submit(
            _fetch_catchment,
            "downstream",
            "Downstream Omo–Turkana community catchment",
            DOWNSTREAM_LAT,
            DOWNSTREAM_LON,
        )
        fut_partner = pool.submit(fetch_partner_dam)
        dam_upstream = fut_up.result()
        downstream = fut_down.result()
        partner = fut_partner.result()

    rain = _rain_from_upstream(dam_upstream)
    if rain.get("ok") is False and not rain.get("rain_24h_mm"):
        rain = {
            **rain,
            "rain_24h_mm": 62.0,
            "rain_7d_mm": 240.0,
            "label": "Open-Meteo unavailable — fallback demo rain used",
        }

    pressure = rain_to_release_pressure_m3s(
        float(rain.get("rain_24h_mm") or 0),
        float(rain.get("rain_7d_mm") or 0),
    )

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
        ml_flood_probability=None,
        ml_model_mode=None,
        ml_honesty=None,
    )

    # ---------------------------------------------------------------------
    # Task 3: Small calibrated risk model (rainfall accumulation + soil trend)
    # ---------------------------------------------------------------------
    from datetime import datetime as dt

    forecast_rain = (downstream.get("forecast_rainfall") or {}) if isinstance(downstream, dict) else {}
    soil = (downstream.get("soil_moisture") or {}) if isinstance(downstream, dict) else {}
    risk_outlook_str = str(downstream.get("risk_outlook") or "Stable")

    rain_3d_mm = float(forecast_rain.get("next3_day") or 0.0)
    rain_7d_mm = float(forecast_rain.get("next7_day") or 0.0)
    soil_trend = str(soil.get("trend") or "stable")

    calibrated = compute_calibrated_flood_probability(
        rain_3d_mm=rain_3d_mm,
        rain_7d_mm=rain_7d_mm,
        soil_moisture_trend=soil_trend,
        risk_outlook=risk_outlook_str,
        now=dt.utcnow(),
    )

    # ---------------------------------------------------------------------
    # Task 2: GloFAS enhancement (optional — off by default on live path)
    # ---------------------------------------------------------------------
    if _GLOFAS_ON_LIVE:
        glofas = get_glofas_forecast_for_point(
            lat=float(downstream.get("lat") or DOWNSTREAM_LAT),
            lon=float(downstream.get("lon") or DOWNSTREAM_LON),
            now=dt.utcnow(),
        )
    else:
        from services.glofas_forecast import GloFASForecast

        glofas = GloFASForecast(
            ok=False,
            source="skipped_on_live",
            dischargeForecast=None,
            exceedanceProbability=None,
            forecastDate=dt.utcnow().date().isoformat(),
            honesty="GloFAS skipped on live-signals for speed. Set ALMA_GLOFAS_ON_LIVE=1 to enable.",
            error=None,
        )

    # Only switch to glofas_enhanced if both discharge forecast and exceedance
    # probability are available.
    enhanced = calibrated
    if glofas.ok and glofas.dischargeForecast is not None and glofas.exceedanceProbability is not None:
        enhanced = compute_calibrated_flood_probability(
            rain_3d_mm=rain_3d_mm,
            rain_7d_mm=rain_7d_mm,
            soil_moisture_trend=soil_trend,
            risk_outlook=risk_outlook_str,
            now=dt.utcnow(),
            glofas_discharge_forecast_m3s=float(glofas.dischargeForecast),
            glofas_exceedance_probability=float(glofas.exceedanceProbability),
        )

    # Re-run compound risk with ML corroboration applied.
    risk = compute_compound_risk(
        float(rain.get("rain_24h_mm") or 0),
        float(release),
        data_quality=data_quality,
        ml_flood_probability=enhanced.floodProbability,
        ml_model_mode=enhanced.modelMode,
        ml_honesty=enhanced.honesty,
    )

    outlook = outlook_summary(downstream, dam_upstream)
    early_farmer = farmer_early_heads_up(
        tier=str(risk.tier),
        compound_active=bool(risk.compound_active),
        downstream_outlook=str(outlook.get("downstream_flood") or "Stable"),
        dam_outlook=str(
            outlook.get("dam_release_outlook") or outlook.get("dam_overflow") or "Stable"
        ),
    )

    from services.dam_observations import build_dam_prediction

    dam_prediction = build_dam_prediction(
        rain_proxy=pressure,
        rain=rain,
        dam_upstream=dam_upstream if isinstance(dam_upstream, dict) else None,
        risk_outlook=outlook if isinstance(outlook, dict) else None,
        glofas=glofas.to_dict() if glofas else None,
        partner=partner,
        release_m3s=float(release),
        data_quality=data_quality,
    )
    release = float(dam_prediction["release_m3s"])
    pressure = {**pressure, "estimated_release_m3s": round(release, 1)}

    # ---------------------------------------------------------------------
    # Ground Observer layer — structured human inputs (CBEWS principle via SMS/USSD)
    # Verified reports weight higher; unverified stay labeled corroboration.
    # Estimated (Open-Meteo / rain-proxy) remains a separate labeled layer.
    # ---------------------------------------------------------------------
    from services import ground_observers as go
    from services import climatic_impact as ci
    from services import icpac_outlook
    from services import ground_conditions as gc_mod

    observer_blend = go.recent_signal_blend()
    rain_estimated = float(rain.get("rain_24h_mm") or 0)
    rain_with_observers = max(0.0, rain_estimated + float(observer_blend.get("rain_mm_nudge") or 0))
    release_estimated = float(release)
    release_with_observers = max(
        80.0, release_estimated + float(observer_blend.get("dam_m3s_nudge") or 0)
    )

    # Re-run compound risk with observer-weighted inputs (still transparent layers below).
    risk = compute_compound_risk(
        rain_with_observers,
        release_with_observers,
        data_quality=data_quality,
        ml_flood_probability=enhanced.floodProbability,
        ml_model_mode=enhanced.modelMode,
        ml_honesty=enhanced.honesty,
    )

    # Climatic impact cascade state for desk + readiness
    daily_mm = list(rain.get("daily_mm") or [])
    climate = gc_mod.derive_climate(daily_mm)
    drought = gc_mod.drought_risk(climate["climate_state"], int(climate.get("dry_days") or 0))
    cascade_state = ci.resolve_climatic_state(
        tier=str(risk.tier),
        compound_active=bool(risk.compound_active),
        climate_state=str(climate.get("climate_state") or "stable"),
        rain_score=float(risk.rain_score),
        dam_score=float(risk.dam_score),
        drought_risk=drought,
    )
    cascade_ngo = ci.ngo_briefing(cascade_state)

    out = {
        "ok": True,
        "rain": rain,
        "catchments": {
            "dam_upstream": dam_upstream,
            "downstream": downstream,
        },
        "risk_outlook": outlook,
        "farmer_early_heads_up": early_farmer,
        "dam_alternative": pressure,
        "dam_prediction": dam_prediction,
        "partner_dam": partner,
        "risk": risk.to_dict(),
        "glofasForecast": glofas.to_dict(),
        "trainedRisk": enhanced.to_dict(),
        "ground_observers": {
            "layer": {
                "estimated": {
                    "rain_24h_mm": round(rain_estimated, 1),
                    "dam_release_m3s": round(release_estimated, 1),
                    "label": "Estimated",
                },
                "ground_verified": {
                    "rain_mm_nudge": observer_blend.get("rain_mm_nudge"),
                    "dam_m3s_nudge": observer_blend.get("dam_m3s_nudge"),
                    "verified_report_count": observer_blend.get("verified_report_count"),
                    "unverified_report_count": observer_blend.get("unverified_report_count"),
                    "label": "Ground-Verified / corroboration",
                },
                "blended_for_risk": {
                    "rain_24h_mm": round(rain_with_observers, 1),
                    "dam_release_m3s": round(release_with_observers, 1),
                },
            },
            "recent": observer_blend.get("reports") or [],
            "honesty": observer_blend.get("honesty"),
        },
        "climatic_impact": cascade_ngo,
        "climatic_state": cascade_state,
        "icpac_regional_outlook": icpac_outlook.get_outlook(),
        "pitch_line": (
            "Live: upstream rain + predicted dam pressure (rain + forecast pointers, "
            "optional operator + ground-observer reports) + forecast-informed outlook. "
            "Ground-Verified vs Estimated stay labeled. ICPAC outlook is manually curated. "
            "Gemma only converts outputs to guidance."
        ),
    }
    _CACHE["at"] = now
    _CACHE["data"] = out
    return out
