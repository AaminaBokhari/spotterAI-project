"""Labeled high-wind overlay so reviewers can see load/risk rules on a calm day."""

from __future__ import annotations

from .risk import classify_weather, summarize_route_risk

# Route 0 stays near Moderate, 1 hits the 35–44 + heavy-load Severe rule,
# 2 hits 45–54 + >30k No Travel.
DEMO_WIND_MPH = (28.0, 40.0, 50.0)


def apply_demo_high_wind(routes: list[dict], weight_lb: float) -> list[dict]:
    for i, route in enumerate(routes):
        wind = DEMO_WIND_MPH[min(i, len(DEMO_WIND_MPH) - 1)]
        painted = []
        for cp in route.get("checkpoints") or []:
            risk = classify_weather(wind, cp.get("rain_in_hr") or 0, cp.get("snow_in_hr") or 0, weight_lb)
            painted.append({**cp, "wind_mph": wind, **risk})
        route["checkpoints"] = painted
        route["summary"] = summarize_route_risk(painted)
    return routes
