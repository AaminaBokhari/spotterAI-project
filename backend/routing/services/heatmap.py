"""Build a weather-risk heatmap grid over the trip corridor."""

from __future__ import annotations

from .risk import RISK_SCORE, classify_weather
from .weather import fetch_hourly_for_points, weather_at_hour_offset


def _bounds_from_routes(routes: list[dict], pad: float = 0.35) -> tuple[float, float, float, float]:
    lngs, lats = [], []
    for route in routes:
        for lng, lat in route.get("coordinates") or []:
            lngs.append(lng)
            lats.append(lat)
    if not lngs:
        raise ValueError("No route geometry for heatmap")
    return (
        min(lats) - pad,
        max(lats) + pad,
        min(lngs) - pad,
        max(lngs) + pad,
    )


def _cell(pt: dict, wx: dict, weight_lb: float) -> dict:
    risk = classify_weather(wx["wind_mph"], wx["rain_in_hr"], wx["snow_in_hr"], weight_lb)
    # Mix band + wind so calm vs breezy hours still look different on the map.
    intensity = min(1.0, risk["risk_score"] / 4.0 + min(wx["wind_mph"], 40) / 80)
    return {
        "lat": round(pt["lat"], 4),
        "lng": round(pt["lng"], 4),
        "intensity": round(intensity, 3),
        "risk": risk["risk"],
        "wind_mph": wx["wind_mph"],
        "rain_in_hr": wx["rain_in_hr"],
        "snow_in_hr": wx["snow_in_hr"],
        "forecast_time": wx["forecast_time"],
    }


def build_heatmap(routes: list[dict], weight_lb: float, hour_offset: int = 0, grid: int = 12) -> dict:
    """Return corridor cells for every hour 0–48 from one weather pull."""
    hour_offset = max(0, min(48, int(hour_offset)))
    min_lat, max_lat, min_lng, max_lng = _bounds_from_routes(routes)

    grid = max(5, min(int(grid), 7))
    points = []
    for i in range(grid):
        lat = min_lat + (max_lat - min_lat) * (i / max(grid - 1, 1))
        for j in range(grid):
            lng = min_lng + (max_lng - min_lng) * (j / max(grid - 1, 1))
            points.append({"lat": lat, "lng": lng})

    payloads = fetch_hourly_for_points(points)
    hours: dict[str, list] = {}
    for h in range(0, 49):
        hours[str(h)] = [_cell(pt, weather_at_hour_offset(payload, h), weight_lb) for pt, payload in zip(points, payloads)]

    return {
        "hour_offset": hour_offset,
        "bounds": {
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lng": min_lng,
            "max_lng": max_lng,
        },
        "cells": hours[str(hour_offset)],
        "hours": hours,
        "legend": list(RISK_SCORE.keys()),
    }
