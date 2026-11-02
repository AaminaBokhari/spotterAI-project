"""Hourly weather for checkpoints and heatmap grids.

Primary: Open-Meteo (batch). Fallback: MET Norway Locationforecast (per point).
Kept intentionally fast so analyze never hangs for minutes.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Iterable

import requests

CM_TO_INCH = 1 / 2.54
MS_TO_MPH = 2.23694
MM_TO_INCH = 1 / 25.4
BATCH = 10
RETRIES = 2
UA = {"User-Agent": "CorridorTruckRouting/1.0 (assessment; local-dev)"}

# Process-local cache: rounded lat/lng -> hourly payload
_CACHE: dict[tuple[float, float], dict] = {}


def _parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _key(lat: float, lng: float) -> tuple[float, float]:
    return (round(lat, 2), round(lng, 2))


def _closest_hour_index(times: list[str], target: datetime) -> int:
    target = target.astimezone(timezone.utc)
    best_i, best_diff = 0, float("inf")
    for i, t in enumerate(times):
        suffix = ""
        if "T" in t and "+" not in t and not t.endswith("Z"):
            suffix = "Z"
        dt = _parse_iso(t + suffix)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        diff = abs((dt - target).total_seconds())
        if diff < best_diff:
            best_i, best_diff = i, diff
    return best_i


def _normalize_response(data: dict | list) -> list[dict]:
    if isinstance(data, list):
        return data
    return [data]


def _empty_hourly() -> dict:
    return {
        "hourly": {"time": [], "wind_speed_10m": [], "precipitation": [], "snowfall": []},
        "_units": "inch",
    }


def _normalize_open_meteo(payload: dict) -> dict:
    hourly = dict(payload.get("hourly") or {})
    snow_cm = hourly.get("snowfall") or []
    hourly["snowfall"] = [round(float(v or 0) * CM_TO_INCH, 3) for v in snow_cm]
    out = dict(payload)
    out["hourly"] = hourly
    out["_units"] = "inch"
    return out


def _fetch_open_meteo_batch(lats: list[float], lngs: list[float]) -> list[dict]:
    last_err: Exception | None = None
    for attempt in range(RETRIES):
        try:
            r = requests.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": ",".join(f"{x:.4f}" for x in lats),
                    "longitude": ",".join(f"{x:.4f}" for x in lngs),
                    "hourly": "wind_speed_10m,precipitation,snowfall",
                    "wind_speed_unit": "mph",
                    "precipitation_unit": "inch",
                    "forecast_days": 3,
                    "timezone": "UTC",
                },
                headers=UA,
                timeout=12,
            )
            if r.status_code in (429, 500, 502, 503, 504):
                last_err = requests.HTTPError(f"{r.status_code} {r.text[:160]}", response=r)
                time.sleep(0.4 * (attempt + 1))
                continue
            r.raise_for_status()
            return [_normalize_open_meteo(p) for p in _normalize_response(r.json())]
        except requests.RequestException as e:
            last_err = e
            time.sleep(0.4 * (attempt + 1))
    assert last_err is not None
    raise last_err


def _met_no_to_hourly(payload: dict) -> dict:
    series = ((payload.get("properties") or {}).get("timeseries")) or []
    times, wind, rain, snow = [], [], [], []
    for row in series[:72]:
        t = row.get("time")
        data = row.get("data") or {}
        instant = (data.get("instant") or {}).get("details") or {}
        nxt = (data.get("next_1_hours") or {}).get("details") or {}
        symbol = ((data.get("next_1_hours") or {}).get("summary") or {}).get("symbol_code") or ""
        wind_ms = float(instant.get("wind_speed") or 0)
        precip_mm = float(nxt.get("precipitation_amount") or 0)
        precip_in = precip_mm * MM_TO_INCH
        is_snow = "snow" in symbol or "sleet" in symbol
        times.append(t)
        wind.append(round(wind_ms * MS_TO_MPH, 2))
        rain.append(0.0 if is_snow else round(precip_in, 3))
        snow.append(round(precip_in, 3) if is_snow else 0.0)
    return {
        "hourly": {
            "time": times,
            "wind_speed_10m": wind,
            "precipitation": rain,
            "snowfall": snow,
        },
        "_units": "inch",
    }


def _fetch_met_no(lat: float, lng: float) -> dict:
    r = requests.get(
        "https://api.met.no/weatherapi/locationforecast/2.0/compact",
        params={"lat": f"{lat:.4f}", "lon": f"{lng:.4f}"},
        headers=UA,
        timeout=10,
    )
    r.raise_for_status()
    return _met_no_to_hourly(r.json())


def fetch_hourly_for_points(points: list[dict]) -> list[dict]:
    """Return hourly payloads aligned with input points (cached + resilient)."""
    if not points:
        return []

    unique_order: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for p in points:
        k = _key(p["lat"], p["lng"])
        if k not in seen:
            seen.add(k)
            unique_order.append(k)

    missing = [k for k in unique_order if k not in _CACHE]

    i = 0
    while i < len(missing):
        chunk = missing[i : i + BATCH]
        try:
            payloads = _fetch_open_meteo_batch(
                [c[0] for c in chunk],
                [c[1] for c in chunk],
            )
            for key, payload in zip(chunk, payloads):
                _CACHE[key] = payload
        except requests.RequestException:
            for key in chunk:
                if key in _CACHE:
                    continue
                try:
                    _CACHE[key] = _fetch_met_no(key[0], key[1])
                    time.sleep(0.15)
                except requests.RequestException:
                    _CACHE[key] = _empty_hourly()
        i += BATCH

    return [_CACHE.get(_key(p["lat"], p["lng"]), _empty_hourly()) for p in points]


def weather_at_eta(payload: dict, eta_iso: str) -> dict:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        return {
            "wind_mph": 0.0,
            "rain_in_hr": 0.0,
            "snow_in_hr": 0.0,
            "forecast_time": None,
        }

    idx = _closest_hour_index(times, _parse_iso(eta_iso))
    return {
        "wind_mph": round(float((hourly.get("wind_speed_10m") or [0])[idx] or 0), 2),
        "rain_in_hr": round(float((hourly.get("precipitation") or [0])[idx] or 0), 3),
        "snow_in_hr": round(float((hourly.get("snowfall") or [0])[idx] or 0), 3),
        "forecast_time": times[idx],
    }


def weather_at_hour_offset(payload: dict, hour_offset: int) -> dict:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        return {"wind_mph": 0.0, "rain_in_hr": 0.0, "snow_in_hr": 0.0, "forecast_time": None}

    now = datetime.now(timezone.utc)
    base = _closest_hour_index(times, now)
    idx = max(0, min(base + int(hour_offset), len(times) - 1))
    return {
        "wind_mph": round(float((hourly.get("wind_speed_10m") or [0])[idx] or 0), 2),
        "rain_in_hr": round(float((hourly.get("precipitation") or [0])[idx] or 0), 3),
        "snow_in_hr": round(float((hourly.get("snowfall") or [0])[idx] or 0), 3),
        "forecast_time": times[idx],
    }


def enrich_checkpoints(checkpoints: Iterable[dict], weight_lb: float) -> list[dict]:
    from .risk import classify_weather

    cps = list(checkpoints)
    payloads = fetch_hourly_for_points(cps)
    enriched = []
    for cp, payload in zip(cps, payloads):
        wx = weather_at_eta(payload, cp["eta"])
        risk = classify_weather(wx["wind_mph"], wx["rain_in_hr"], wx["snow_in_hr"], weight_lb)
        enriched.append({**cp, **wx, **risk})
    return enriched
