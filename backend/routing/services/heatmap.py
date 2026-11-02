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


def build_heatmap(routes: list[dict], weight_lb: float, hour_offset: int = 0, grid: int = 12) -> dict:
    """Return GeoJSON-ish points with risk intensity for the forecast hour."""
    hour_offset = max(0, min(48, int(hour_offset)))
    min_lat, max_lat, min_lng, max_lng = _bounds_from_routes(routes)

    # Cap density for performance / free weather rate limits
    grid = max(5, min(int(grid), 8))
    points = []
    for i in range(grid):
        lat = min_lat + (max_lat - min_lat) * (i / max(grid - 1, 1))
        for j in range(grid):
            lng = min_lng + (max_lng - min_lng) * (j / max(grid - 1, 1))
            points.append({"lat": lat, "lng": lng})

    payloads = fetch_hourly_for_points(points)
    cells = []
    for pt, payload in zip(points, payloads):
        wx = weather_at_hour_offset(payload, hour_offset)
        risk = classify_weather(wx["wind_mph"], wx["rain_in_hr"], wx["snow_in_hr"], weight_lb)
        cells.append(
            {
                "lat": round(pt["lat"], 4),
                "lng": round(pt["lng"], 4),
                "intensity": risk["risk_score"] / 4.0,
                "risk": risk["risk"],
                "wind_mph": wx["wind_mph"],
                "rain_in_hr": wx["rain_in_hr"],
                "snow_in_hr": wx["snow_in_hr"],
                "forecast_time": wx["forecast_time"],
            }
        )

    return {
        "hour_offset": hour_offset,
        "bounds": {
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lng": min_lng,
            "max_lng": max_lng,
        },
        "cells": cells,
        "legend": list(RISK_SCORE.keys()),
    }
