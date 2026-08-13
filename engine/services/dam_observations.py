"""
Manual dam observations + rain-proxy blending for Gibe III desk view.

We do NOT have live EEP SCADA in the prototype. Release and reservoir level are
*predicted* from upstream rain, forecast outlook, soil wetness, optional GloFAS,
and operator ground truth. Fresh manual reports nudge the blend until sensors land.
"""
from __future__ import annotations

import time
from typing import Any, Literal

from services import session_store

SpillwayStatus = Literal["closed", "partial", "open"]
DataSource = Literal["estimated", "manual", "partner", "blended"]

MANUAL_TTL_S = 48 * 3600
MANUAL_BLEND_WEIGHT = 0.55


def add_observation(
    *,
    release_m3s: float | None = None,
    fill_percent: float | None = None,
    spillway_status: str | None = None,
    notes: str | None = None,
    reporter: str | None = None,
) -> dict[str, Any]:
    row = session_store.add_dam_observation(
        reporter=reporter,
        release_m3s=release_m3s,
        fill_percent=fill_percent,
        spillway_status=spillway_status,
        notes=notes,
    )
    session_store.log_action(
        None,
        "gibe_iii",
        "dam_observation",
        {
            "release_m3s": release_m3s,
            "fill_percent": fill_percent,
            "spillway_status": spillway_status,
            "notes": notes,
            "reporter": reporter,
        },
    )
    return {"ok": True, "observation": row}


def list_observations(limit: int = 20) -> dict[str, Any]:
    rows = session_store.list_dam_observations(limit=limit)
    return {"ok": True, "observations": rows}


def _latest_fresh() -> dict[str, Any] | None:
    row = session_store.latest_dam_observation()
    if not row:
        return None
    age = time.time() - float(row.get("created_at") or 0)
    if age > MANUAL_TTL_S:
        return None
    return {**row, "age_hours": round(age / 3600, 1)}


def _spillway_from_release(m3s: float) -> SpillwayStatus:
    if m3s >= 800:
        return "open"
    if m3s >= 350:
        return "partial"
    return "closed"


def _fill_from_release(m3s: float) -> float:
    return round(min(98.0, max(55.0, 70 + m3s / 40)), 1)


def build_dam_prediction(
    *,
    rain_proxy: dict[str, Any],
    rain: dict[str, Any],
    dam_upstream: dict[str, Any] | None,
    risk_outlook: dict[str, Any] | None,
    glofas: dict[str, Any] | None,
    partner: dict[str, Any] | None,
    release_m3s: float,
    data_quality: str,
) -> dict[str, Any]:
    """Assemble transparent pointer list + blended operating picture."""
    rain_24 = float(rain.get("rain_24h_mm") or 0)
    rain_7 = float(rain.get("rain_7d_mm") or 0)
    upstream = dam_upstream or {}
    forecast = upstream.get("forecast_rainfall") or {}
    soil = upstream.get("soil_moisture") or {}
    outlook = risk_outlook or {}

    proxy_release = float(rain_proxy.get("estimated_release_m3s") or release_m3s)
    manual = _latest_fresh()

    pointers: list[dict[str, Any]] = [
        {
            "id": "rain_24h",
            "label": "Upstream rain (24h)",
            "value": f"{rain_24:.1f} mm",
            "source": "estimated",
            "role": "Primary inflow driver for release pressure",
        },
        {
            "id": "rain_7d",
            "label": "Upstream rain (7d)",
            "value": f"{rain_7:.1f} mm",
            "source": "estimated",
            "role": "Sustained wet week → higher spill risk",
        },
        {
            "id": "forecast_3d",
            "label": "Forecast rain (3d, upstream)",
            "value": f"{float(forecast.get('next3_day') or 0):.1f} mm",
            "source": "forecast",
            "role": "Forward inflow — operational release pressure outlook",
        },
        {
            "id": "forecast_7d",
            "label": "Forecast rain (7d, upstream)",
            "value": f"{float(forecast.get('next7_day') or 0):.1f} mm",
            "source": "forecast",
            "role": "Weekly reservoir fill-rate / pressure trend",
        },
        {
            "id": "soil_trend",
            "label": "Catchment soil moisture (inflow / fill-rate)",
            "value": str(soil.get("trend") or "stable"),
            "source": "forecast",
            "role": (
                "Reservoir inflow indicator — wet catchment soil means more rain "
                "becomes runoff into the reservoir (not dam structural monitoring; "
                "Gibe III is RCC gravity)"
            ),
        },
        {
            "id": "dam_outlook",
            "label": "Operational release risk outlook",
            "value": str(
                outlook.get("dam_release_outlook") or outlook.get("dam_overflow") or "Stable"
            ),
            "source": "forecast",
            "role": "Rules-based forward trend for unexpected/elevated release (not SCADA)",
        },
        {
            "id": "rain_proxy_release",
            "label": "Rain → release model",
            "value": f"{proxy_release:.0f} m³/s",
            "source": "estimated",
            "role": "Heuristic: 24h + 7d rain → estimated discharge",
        },
    ]

    if glofas and glofas.get("ok") and glofas.get("dischargeForecast") is not None:
        pointers.append(
            {
                "id": "glofas",
                "label": "GloFAS discharge (downstream proxy)",
                "value": f"{float(glofas['dischargeForecast']):.0f} m³/s",
                "source": "estimated",
                "role": "River model corroboration (best-effort)",
            }
        )

    if partner and partner.get("ok"):
        pointers.append(
            {
                "id": "partner_feed",
                "label": "Partner telemetry URL",
                "value": "Connected",
                "source": "partner",
                "role": "DAM_TELEMETRY_URL when configured",
            }
        )

    method: DataSource = "estimated"
    blended_release = release_m3s
    fill_percent = _fill_from_release(blended_release)
    spillway: SpillwayStatus = _spillway_from_release(blended_release)

    if manual:
        m_release = manual.get("release_m3s")
        m_fill = manual.get("fill_percent")
        m_spill = manual.get("spillway_status")
        pointers.append(
            {
                "id": "manual_latest",
                "label": f"Operator report ({manual.get('age_hours', '?')}h ago)",
                "value": (
                    f"{m_release:.0f} m³/s"
                    if m_release is not None
                    else f"{m_fill:.0f}% full"
                    if m_fill is not None
                    else "Field note"
                ),
                "source": "manual",
                "role": "NGO / operator ground truth — nudges prediction",
            }
        )
        if m_release is not None:
            blended_release = MANUAL_BLEND_WEIGHT * float(m_release) + (1 - MANUAL_BLEND_WEIGHT) * proxy_release
            method = "blended"
        if m_fill is not None:
            fill_percent = MANUAL_BLEND_WEIGHT * float(m_fill) + (1 - MANUAL_BLEND_WEIGHT) * _fill_from_release(
                blended_release
            )
            method = "blended" if method != "partner" else method
        if m_spill in ("closed", "partial", "open"):
            spillway = m_spill  # type: ignore[assignment]
        elif m_release is not None:
            spillway = _spillway_from_release(blended_release)

    if data_quality == "live_feed":
        method = "partner"

    honesty = (
        "Predicted operating picture from rain + forecast pointers"
        + (" blended with a fresh operator report." if manual else ".")
        + " Not official Gibe III SCADA - sensors will replace estimates."
    )

    return {
        "release_m3s": round(blended_release, 1),
        "fill_percent": round(fill_percent, 1),
        "spillway_status": spillway,
        "method": method,
        "data_quality": data_quality,
        "honesty": honesty,
        "pointers": pointers,
        "manual_observation": manual,
        "sensor_slot": {
            "status": "planned",
            "label": "Future reservoir sensors",
            "note": (
                "Reserve slots for live level, spillway gates, and turbine discharge. "
                "Set DAM_TELEMETRY_URL for partner feeds until hardware is installed."
            ),
        },
    }
