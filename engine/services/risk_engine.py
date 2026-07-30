"""
ALMA dual-trigger compound risk engine.

Rainfall propagation: ~48–72h Upper Omo → Turkana.
Dam surge propagation: ~12–24h Gibe III → downstream banks.
Compound window: |T_rain - T_dam| ≤ 24h → non-linear amplification (×1.4).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

Tier = Literal["safe", "watch", "warning", "severe"]

RAIN_DELAY_HOURS = (48.0, 72.0)  # min, max travel
DAM_DELAY_HOURS = (12.0, 24.0)
COMPOUND_WINDOW_HOURS = 24.0
AMPLIFICATION = 1.4


@dataclass
class RiskResult:
    rain_mm: float
    dam_discharge_m3s: float
    rain_score: float
    dam_score: float
    t_rain_arrival_h: float
    t_dam_arrival_h: float
    overlap_hours: float
    compound_active: bool
    compound_severity: float
    tier: Tier
    data_quality: str  # "simulated" | "live_feed"
    plain_summary: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def rain_score_from_mm(rain_mm: float) -> float:
    """Map 24h upstream rainfall (mm) to 0–100 risk score."""
    # 0–20mm ~safe, 40 watch, 60 warning, 80+ severe
    return _clamp(rain_mm * 1.15)


def dam_score_from_discharge(m3s: float) -> float:
    """Map Gibe III discharge (m³/s) to 0–100. Controlled ~200–600; surge >1500."""
    if m3s <= 200:
        return _clamp(m3s / 4)
    if m3s <= 800:
        return _clamp(50 + (m3s - 200) / 12)
    return _clamp(75 + (m3s - 800) / 40)


def score_to_tier(score: float) -> Tier:
    if score >= 75:
        return "severe"
    if score >= 55:
        return "warning"
    if score >= 30:
        return "watch"
    return "safe"


def estimate_arrivals(rain_mm: float, dam_discharge_m3s: float) -> tuple[float, float]:
    """
    Hours until each wave reaches the Turkana banks from "now".

    Dam: release starting now → 12–24h travel.
    Rain: upstream accumulation already in transit — higher mm means the pulse
    is closer (remaining time shrinks toward ~18h), so dual-trigger scenarios
    can collide within the 24h compound window. Absolute 48–72h from storm
    onset still holds physically; this is remaining time for ops planning.
    """
    # Remaining rain arrival ~18–60h (subset of 48–72h basin travel once pulse is mid-route)
    rain_t = 60.0 - min(rain_mm, 120.0) / 120.0 * 42.0
    dam_t = DAM_DELAY_HOURS[1] - min(dam_discharge_m3s, 2500.0) / 2500.0 * (
        DAM_DELAY_HOURS[1] - DAM_DELAY_HOURS[0]
    )
    return rain_t, dam_t


def compute_compound_risk(
    rain_mm: float,
    dam_discharge_m3s: float,
    *,
    data_quality: str = "simulated",
) -> RiskResult:
    rain_score = rain_score_from_mm(rain_mm)
    dam_score = dam_score_from_discharge(dam_discharge_m3s)
    t_rain, t_dam = estimate_arrivals(rain_mm, dam_discharge_m3s)
    overlap = abs(t_rain - t_dam)
    compound_active = overlap <= COMPOUND_WINDOW_HOURS

    base = (rain_score * 0.45) + (dam_score * 0.55)
    if compound_active:
        severity = min(100.0, base * AMPLIFICATION)
    else:
        severity = min(100.0, max(rain_score, dam_score))

    tier = score_to_tier(severity)

    if compound_active:
        plain = (
            f"Compound window OPEN: rain wave ~{t_rain:.0f}h and dam surge ~{t_dam:.0f}h "
            f"overlap within {COMPOUND_WINDOW_HOURS:.0f}h (delta={overlap:.1f}h). "
            f"Severity {severity:.0f}/100 ({tier}). Data: {data_quality}."
        )
    else:
        plain = (
            f"No compound collision: rain ~{t_rain:.0f}h vs dam ~{t_dam:.0f}h "
            f"(delta={overlap:.1f}h > {COMPOUND_WINDOW_HOURS:.0f}h). "
            f"Peak single-signal severity {severity:.0f}/100 ({tier}). Data: {data_quality}."
        )

    return RiskResult(
        rain_mm=rain_mm,
        dam_discharge_m3s=dam_discharge_m3s,
        rain_score=round(rain_score, 2),
        dam_score=round(dam_score, 2),
        t_rain_arrival_h=round(t_rain, 2),
        t_dam_arrival_h=round(t_dam, 2),
        overlap_hours=round(overlap, 2),
        compound_active=compound_active,
        compound_severity=round(severity, 2),
        tier=tier,
        data_quality=data_quality,
        plain_summary=plain,
    )
