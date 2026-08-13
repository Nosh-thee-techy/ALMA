"""
Forecast-informed risk outlook — rules-based, not ML.

Uses Open-Meteo forecast rainfall + soil moisture from the same /v1/forecast
endpoint already in use. This is a lightweight forecast-informed trend model;
do NOT describe as AI-predicted flood forecasting or compare to LSTM inflow models.

riskOutlook is a forward-looking trend indicator based on forecast data. The
existing Safe/Watch/Warning/Severe/Compound tier remains based on current/
real-time conditions. Outlook informs, it does not override, the current tier.
"""
from __future__ import annotations

from typing import Any, Literal

RiskOutlook = Literal["Rising", "Stable", "Falling"]
SoilTrend = Literal["rising", "falling", "stable"]

# Typical Omo–Turkana seasonal rain — directional thresholds, not precise forecasts.
RAIN_3D_RISING_MM = 25.0
RAIN_3D_FALLING_MM = 8.0
SOIL_TREND_DELTA = 0.015  # m³/m³ change vs ~4 days prior


def _sum(values: list[float | None]) -> float:
    return round(sum(float(v or 0) for v in values), 1)


def parse_forecast_rainfall(daily_precip: list[float | None]) -> dict[str, float]:
    """
    daily_precip: Open-Meteo daily precipitation_sum with past_days + today + forecast.
    We treat the last 7 entries as forward-looking forecast days when available.
    """
    vals = [float(v or 0) for v in daily_precip]
    if len(vals) >= 8:
        # ...past..., today, f1, f2, ...
        forecast = vals[-7:] if len(vals) >= 7 else vals
    elif len(vals) >= 4:
        forecast = vals[-min(7, len(vals)) :]
    else:
        forecast = vals
    next3 = _sum(forecast[:3])
    next7 = _sum(forecast[:7])
    return {"next3_day": next3, "next7_day": next7}


def parse_soil_moisture(hourly: dict[str, list[float | None]]) -> dict[str, Any]:
    """
    Soil moisture is an inflow / runoff indicator — not dam structural integrity.

    Upstream (Gibe III catchment): wetter soil → more rainfall becomes runoff INTO
    the reservoir (fill-rate / release-pressure driver). Downstream: wetter soil →
    faster overland flow and higher flood-impact severity on land once water arrives.
    Gibe III is an RCC gravity dam; soil data does not monitor dam structure.
    """
    # Surface + shallow profile average (0–9 cm)
    series: list[float] = []
    for key in ("soil_moisture_0_to_1cm", "soil_moisture_3_to_9cm"):
        row = hourly.get(key) or []
        for v in row:
            if v is not None:
                series.append(float(v))
    if not series:
        return {"current": 0.0, "trend": "stable", "unit": "m3/m3"}

    current = round(series[-1], 4)
    # Compare recent 24h mean vs ~4 days prior window
    n = len(series)
    recent = series[-24:] if n >= 24 else series[-max(1, n // 4) :]
    prior_end = max(0, n - 96)
    prior_start = max(0, prior_end - 24)
    prior = series[prior_start:prior_end] if prior_end > prior_start else series[: max(1, n // 4)]

    recent_mean = sum(recent) / len(recent)
    prior_mean = sum(prior) / len(prior) if prior else recent_mean
    delta = recent_mean - prior_mean

    if delta >= SOIL_TREND_DELTA:
        trend: SoilTrend = "rising"
    elif delta <= -SOIL_TREND_DELTA:
        trend = "falling"
    else:
        trend = "stable"

    return {
        "current": current,
        "trend": trend,
        "unit": "m3/m3",
        "delta_vs_prior": round(delta, 4),
    }


def derive_risk_outlook(
    forecast_rainfall: dict[str, float],
    soil_moisture: dict[str, Any],
    *,
    rain_3d_rising: float = RAIN_3D_RISING_MM,
    rain_3d_falling: float = RAIN_3D_FALLING_MM,
) -> RiskOutlook:
    """
    Simple rules-based outlook — directional indicator, not a precise forecast.

    riskOutlook is a forward-looking trend indicator based on forecast data. The
    existing Safe/Watch/Warning/Severe/Compound tier remains based on current/
    real-time conditions. Outlook informs, it does not override, the current tier.
    """
    next3 = float(forecast_rainfall.get("next3_day") or 0)
    trend = str(soil_moisture.get("trend") or "stable")

    if next3 >= rain_3d_rising and trend == "rising":
        return "Rising"
    if next3 >= rain_3d_rising + 15 and trend != "falling":
        # Heavy forecast rain even without saturated soil yet
        return "Rising"
    if next3 <= rain_3d_falling and trend == "falling":
        return "Falling"
    if next3 <= rain_3d_falling / 2 and trend != "rising":
        return "Falling"
    return "Stable"


def build_catchment_snapshot(
    *,
    catchment_id: str,
    label: str,
    lat: float,
    lon: float,
    api_payload: dict[str, Any],
) -> dict[str, Any]:
    """Merge live rain history + forecast + soil into one catchment record."""
    daily = api_payload.get("daily") or {}
    hourly = api_payload.get("hourly") or {}
    precip = [float(v or 0) for v in (daily.get("precipitation_sum") or [])]
    dates = list(daily.get("time") or [])
    forecast_days = 7

    if len(precip) > forecast_days:
        today_idx = len(precip) - forecast_days - 1
        rain_24h = precip[today_idx]
        hist = precip[: today_idx + 1]
        forecast_slice = precip[today_idx + 1 :]
    else:
        rain_24h = precip[-1] if precip else 0.0
        hist = precip
        forecast_slice = []

    rain_7d = _sum(hist[-7:])

    forecast_rainfall = parse_forecast_rainfall(forecast_slice or precip)
    soil_moisture = parse_soil_moisture(hourly)
    risk_outlook = derive_risk_outlook(forecast_rainfall, soil_moisture)

    return {
        "id": catchment_id,
        "label": label,
        "lat": lat,
        "lon": lon,
        "source": "open-meteo",
        "rain_24h_mm": round(rain_24h, 1),
        "rain_7d_mm": round(rain_7d, 1),
        "daily_mm": [round(x, 1) for x in hist[-7:]],
        "dates": dates[-7:] if dates else [],
        "forecast_rainfall": forecast_rainfall,
        "soil_moisture": soil_moisture,
        "risk_outlook": risk_outlook,
        "honesty": (
            "Forecast-informed risk outlook — rules-based trend from Open-Meteo "
            "forecast rain and soil moisture. Not an ML/LSTM inflow model."
        ),
    }


def outlook_summary(
    downstream: dict[str, Any],
    dam_upstream: dict[str, Any],
) -> dict[str, Any]:
    dam_release = dam_upstream.get("risk_outlook") or "Stable"
    return {
        "downstream_flood": downstream.get("risk_outlook") or "Stable",
        # Operational release risk (unexpected/elevated discharge), not spillway "overflow".
        "dam_release_outlook": dam_release,
        # Legacy key — prefer dam_release_outlook in new UI.
        "dam_overflow": dam_release,
        "downstream_forecast_3d_mm": (downstream.get("forecast_rainfall") or {}).get("next3_day"),
        "dam_forecast_3d_mm": (dam_upstream.get("forecast_rainfall") or {}).get("next3_day"),
        "note": (
            "Forecast-informed risk outlook — forward-looking Open-Meteo trend, "
            "not AI-predicted flood forecasting. Dam side is operational release risk "
            "(not overflow). Does not replace current tier logic."
        ),
    }


def farmer_early_heads_up(
    *,
    tier: str,
    compound_active: bool,
    downstream_outlook: str,
    dam_outlook: str,
) -> str | None:
    """
    Optional early farmer message when outlook is Rising but tier still Safe/Watch.
    Audience-tiered: consequence only — no forecast numbers or trigger attribution.
    """
    rank = {"safe": 0, "watch": 1, "warning": 2, "severe": 3}
    if compound_active or rank.get(tier, 0) >= rank["warning"]:
        return None
    rising = downstream_outlook == "Rising" or dam_outlook == "Rising"
    if not rising:
        return None
    return (
        "Conditions trending toward higher flood risk over the next few days — "
        "monitor and prepare."
    )
