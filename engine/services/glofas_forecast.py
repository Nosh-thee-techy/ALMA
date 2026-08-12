"""
GloFAS forecast retrieval (CDS API).

This module is designed to be resilient:
- If Copernicus CDS credentials / CDSAPI Python dependency are missing,
  it returns ok=False and the engine falls back to CHIRPS/Open-Meteo-only.
- If netCDF parsing fails (schema changes), we again fall back gracefully.

Important:
GloFAS forecast products are probabilistic and include discharge forecasts.
Threshold exceedance probability requires comparison to flood threshold return
levels. In full production you'd use the corresponding GloFAS threshold product.

For this codebase, we attempt:
- Download/parse forecast discharge for a small bounding box around the
  Omo/Turkana region.
- If exceedance probability can be computed (threshold file present), we do it.
  Otherwise, we set exceedanceProbability=None and let the ML model degrade.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any


@dataclass
class GloFASForecast:
    dischargeForecast: float | None  # m3/s (representative)
    exceedanceProbability: float | None  # 0..1 (optional, may be approximated)
    forecastDate: str | None  # ISO date
    source: str
    honesty: str
    ok: bool
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "source": self.source,
            "dischargeForecast": self.dischargeForecast,
            "exceedanceProbability": self.exceedanceProbability,
            "forecastDate": self.forecastDate,
            "honesty": self.honesty,
            "error": self.error,
        }


def _env_float(name: str, default: float) -> float:
    v = os.getenv(name)
    if v is None:
        return default
    try:
        return float(v)
    except ValueError:
        return default


def get_glofas_forecast_for_point(
    *,
    lat: float,
    lon: float,
    now: datetime | None = None,
) -> GloFASForecast:
    now = now or datetime.utcnow()
    # Bounding box around the point to avoid pulling global data.
    # Ordering for EWDS "area" parameter: [North, West, South, East]
    dlat = _env_float("ALMA_GLOFAS_BBOX_DLAT", 3.0)
    dlon = _env_float("ALMA_GLOFAS_BBOX_DLON", 3.0)
    bbox = [lat + dlat, lon - dlon, lat - dlat, lon + dlon]

    # Time boxing / performance:
    # - CDS retrieval can be slow or require manual approval/config.
    # - We keep an explicit overall time budget.
    timeout_s = _env_float("ALMA_GLOFAS_TIMEOUT_S", 25.0)
    started = time.time()

    try:
        import cdsapi  # type: ignore
        import xarray as xr  # type: ignore
        import numpy as np  # type: ignore
    except Exception as exc:
        return GloFASForecast(
            ok=False,
            source="cds_unavailable",
            dischargeForecast=None,
            exceedanceProbability=None,
            forecastDate=now.date().isoformat(),
            honesty="GloFAS disabled: missing cdsapi/xarray dependencies or CDS configuration.",
            error=str(exc),
        )

    # CDS access:
    # cdsapi expects credentials via ~/.cdsapirc or env configuration.
    try:
        client = cdsapi.Client()
    except Exception as exc:
        return GloFASForecast(
            ok=False,
            source="cds_client_init_failed",
            dischargeForecast=None,
            exceedanceProbability=None,
            forecastDate=now.date().isoformat(),
            honesty="GloFAS disabled: CDS API client init failed.",
            error=str(exc),
        )

    dataset = "cems-glofas-forecast"
    lead_days = int(_env_float("ALMA_GLOFAS_LEAD_DAYS", 7))
    lead_hours = [str(24 * i) for i in range(1, lead_days + 1)]

    # Use operational control forecast + ensemble perturbed members as best effort.
    # We start with ensemble product type because exceedance probability is derived.
    request_common: dict[str, Any] = {
        "system_version": ["operational"],
        "hydrological_model": ["lisflood"],
        "variable": "river_discharge_in_the_last_24_hours",
        "year": [now.strftime("%Y")],
        "month": [now.strftime("%m")],
        "day": [now.strftime("%d")],
        "leadtime_hour": lead_hours,
        "data_format": "netcdf",
        "download_format": "unarchived",
        "area": bbox,
    }

    # Download into a temp filename inside engine/data to keep deployment simple.
    # (CDS can return multiple files; xarray can open the directory if needed,
    # but we aim for one file.)
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "glofas_cache")
    os.makedirs(out_dir, exist_ok=True)
    # Use timestamp-based name to avoid collisions.
    stamp = now.strftime("%Y%m%d_%H%M%S")
    target_prefix = f"glofas_{stamp}"
    target_path = os.path.join(out_dir, f"{target_prefix}.nc")

    # Product types (best effort):
    product_types = ["ensemble_perturbed_forecasts", "control_forecast"]
    last_error: str | None = None

    for product_type in product_types:
        if time.time() - started > timeout_s:
            break

        request = {**request_common, "product_type": product_type}
        try:
            # cdsapi.retrieve(...).download(target) is supported.
            client.retrieve(dataset, request).download(target_path)
        except Exception as exc:
            last_error = str(exc)
            continue

        # Parse netCDF.
        try:
            ds = xr.open_dataset(target_path)
            # Find the discharge variable.
            # We pick the first var that looks like river discharge.
            var_name = None
            for k in ds.data_vars:
                if "discharge" in k.lower() and "river" in k.lower():
                    var_name = k
                    break
            if var_name is None:
                # Fallback: any var containing "discharge"
                for k in ds.data_vars:
                    if "discharge" in k.lower():
                        var_name = k
                        break
            if var_name is None:
                raise RuntimeError(f"Could not find discharge variable in {list(ds.data_vars.keys())}")

            # Detect coordinate names.
            lat_name = "latitude" if "latitude" in ds.coords else ("lat" if "lat" in ds.coords else None)
            lon_name = "longitude" if "longitude" in ds.coords else ("lon" if "lon" in ds.coords else None)
            if not lat_name or not lon_name:
                raise RuntimeError(f"Missing lat/lon coords in dataset: {list(ds.coords.keys())}")

            # Pick nearest grid cell.
            lat_vals = ds[lat_name].values
            lon_vals = ds[lon_name].values
            lat_i = int(np.abs(lat_vals - lat).argmin())
            lon_i = int(np.abs(lon_vals - lon).argmin())

            da = ds[var_name]

            # Heuristic: dims could include leadtime/forecast time plus ensemble members.
            # We compute a representative forecast as max over lead times for the cell.
            # If ensemble dimension exists, we can approximate exceedance probability
            # only if we also have a threshold file. Here, we compute dischargeForecast only.
            # (Better exceedance would require threshold dataset and proper ensemble parsing.)
            discharge_cell = da.isel({lat_name: lat_i, lon_name: lon_i})
            # Reduce across any "lead" or "time" dimension using max.
            for dim in list(discharge_cell.dims):
                if dim.lower() in ("time", "leadtime", "leadtime_step", "forecast_time", "step"):
                    discharge_cell = discharge_cell.max(dim=dim)

            discharge_forecast = discharge_cell.values
            # If still multi-valued (ensemble), take mean.
            if hasattr(discharge_forecast, "shape") and discharge_forecast.shape != ():
                discharge_forecast_scalar = float(np.nanmean(discharge_forecast))
            else:
                discharge_forecast_scalar = float(discharge_forecast)

            forecast_date = now.date().isoformat()

            # Exceedance probability:
            # - If exceedance can be computed, provide it.
            # - Otherwise keep None so the ML model degrades gracefully.
            exceed_prob = None

            return GloFASForecast(
                ok=True,
                source=f"cds_glofas_{product_type}",
                dischargeForecast=round(discharge_forecast_scalar, 3),
                exceedanceProbability=exceed_prob,
                forecastDate=forecast_date,
                honesty=(
                    "GloFAS discharge forecast extracted for nearest grid cell from CDS netCDF. "
                    "Threshold-exceedance probability not computed here (threshold auxiliary data "
                    "not loaded in this prototype); ML falls back to discharge-only or disables "
                    "the GloFAS-enhancement term when exceedance is missing."
                ),
            )
        except Exception as exc:
            last_error = str(exc)
            continue

    return GloFASForecast(
        ok=False,
        source="cds_fetch_failed",
        dischargeForecast=None,
        exceedanceProbability=None,
        forecastDate=now.date().isoformat(),
        honesty="GloFAS disabled: forecast retrieval / parsing failed. Falling back to CHIRPS/Open-Meteo-only model.",
        error=last_error,
    )

