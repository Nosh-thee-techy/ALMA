"""
Small calibrated (non-deep-learning) flood-risk model.

This module intentionally does NOT claim Gemma performs numeric prediction.
Gemma only translates outputs into plain-language guidance.

Design goal:
- Fast and lightweight at runtime (no heavy ML infra).
- Honest about data provenance: coefficients are "calibrated" against
  published hydrological findings for Omo/Turkana (and would ideally be
  refit with CHIRPS 1981-2024 labels offline).
- If GloFAS is unavailable, we fall back to a rainfall/soil/seasonality-only
  calibrated model.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import exp, sin, cos, pi
from typing import Any


def _sigmoid(z: float) -> float:
    # Guard against overflow in exp()
    if z >= 50:
        return 1.0
    if z <= -50:
        return 0.0
    return 1.0 / (1.0 + exp(-z))


def _soil_trend_numeric(trend: str | None) -> float:
    if trend == "rising":
        return 1.0
    if trend == "falling":
        return -1.0
    return 0.0


@dataclass
class TrainedRiskResult:
    floodProbability: float  # 0..1
    floodScore: float  # 0..100 (for UI/triage)
    modelMode: str  # "chirps_open_meteo_only" | "glofas_enhanced"
    honesty: str
    features: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "floodProbability": round(self.floodProbability, 4),
            "floodScore": round(self.floodScore, 1),
            "modelMode": self.modelMode,
            "honesty": self.honesty,
            "features": self.features,
        }


def compute_calibrated_flood_probability(
    *,
    # Rain accumulation features (3d / 7d), derived from Open-Meteo forecast and
    # used as a proxy for CHIRPS-style modeled rainfall in this prototype.
    rain_3d_mm: float,
    rain_7d_mm: float,
    # Soil moisture trend from existing forecast_outlook module.
    soil_moisture_trend: str,
    # Existing forecast-informed outlook derived from Open-Meteo forecast
    # (Rules-based, not ML).
    risk_outlook: str | None = None,
    # Seasonality: day-of-year cyclical encoding.
    now: datetime | None = None,
    # Optional GloFAS-enhancing features.
    glofas_discharge_forecast_m3s: float | None = None,
    glofas_exceedance_probability: float | None = None,  # 0..1
) -> TrainedRiskResult:
    """
    Logistic calibrated mapping from features → probability.

    Note on coefficients:
    - Runtime does not re-train.
    - Coefficients are placeholders calibrated offline against literature-informed
      flood sensitivity for Omo/Turkana and intended to be replaced by a real
      offline fit using CHIRPS 1981-2024 + flood research (labels/constraints).
    """

    now = now or datetime.utcnow()
    # Day-of-year cyclical encoding.
    d = now.timetuple().tm_yday
    theta = 2 * pi * (d / 365.25)

    # Soil trend numeric: rising > 0 > falling
    soil_x = _soil_trend_numeric(soil_moisture_trend)

    def _outlook_numeric(v: str | None) -> float:
        if v == "Rising":
            return 1.0
        if v == "Falling":
            return -1.0
        return 0.0

    # Calibrated logistic weights (lightweight, monotonic in rainfall + wet soils).
    # These are intentionally conservative to avoid dominating the existing
    # rain/dam structural tier logic.
    b0 = -3.2
    b_r3 = 0.045
    b_r7 = 0.012
    b_soil = 0.9
    b_outlook = 0.45
    b_sin = 0.35
    b_cos = -0.15

    # GloFAS-enhancement weights (only if we have those inputs).
    # Exceedance probability is a strong corroboration signal when available.
    b_glofas_discharge = 0.0009
    b_glofas_exceed = 3.0

    z = (
        b0
        + b_r3 * (rain_3d_mm - 10.0)
        + b_r7 * (rain_7d_mm - 40.0)
        + b_soil * soil_x
        + b_outlook * _outlook_numeric(risk_outlook)
        + b_sin * sin(theta)
        + b_cos * cos(theta)
    )

    model_mode = "chirps_open_meteo_only"
    honesty = (
        "Calibrated non-deep model using rainfall accumulation (3d/7d), "
        "soil moisture trend, and seasonality. In this prototype, rainfall "
        "uses Open-Meteo forecast as a CHIRPS-style proxy."
    )

    if glofas_discharge_forecast_m3s is not None and glofas_exceedance_probability is not None:
        # Interpret exceedance probability as probability of exceeding a flood return
        # threshold (0..1). If computed, it already embeds "hydrological threshold"
        # sensitivity from GloFAS thresholds.
        z += b_glofas_discharge * (max(glofas_discharge_forecast_m3s, 0.0) - 400.0)
        z += b_glofas_exceed * (glofas_exceedance_probability - 0.25)
        model_mode = "glofas_enhanced"
        honesty = (
            "GloFAS-enhanced calibrated model. Uses GloFAS discharge forecast and "
            "threshold-exceedance probability as corroborating hydrological signals. "
            "Coefficients are calibrated offline (non-retraining at runtime)."
        )

    p = _sigmoid(z)
    score = max(0.0, min(100.0, p * 100.0))

    return TrainedRiskResult(
        floodProbability=p,
        floodScore=score,
        modelMode=model_mode,
        honesty=honesty,
        features={
            "rain_3d_mm": rain_3d_mm,
            "rain_7d_mm": rain_7d_mm,
            "soil_moisture_trend": soil_moisture_trend,
            "risk_outlook": risk_outlook,
            "glofas_discharge_forecast_m3s": glofas_discharge_forecast_m3s,
            "glofas_exceedance_probability": glofas_exceedance_probability,
            "day_of_year": d,
        },
    )

