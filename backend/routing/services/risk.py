"""Weather + load risk classification for truck routing."""

from __future__ import annotations

RISK_ORDER = ["Low", "Moderate", "High", "Severe", "No Travel"]
RISK_SCORE = {name: i for i, name in enumerate(RISK_ORDER)}


def _band(value: float, thresholds: list[float], labels: list[str]) -> str:
    for limit, label in zip(thresholds, labels):
        if value < limit:
            return label
    return labels[-1]


def wind_risk(mph: float) -> str:
    return _band(mph, [25, 35, 45, 55], RISK_ORDER)


def rain_risk(in_per_hr: float) -> str:
    return _band(in_per_hr, [0.10, 0.25, 0.50, 1.00], RISK_ORDER)


def snow_risk(in_per_hr: float) -> str:
    return _band(in_per_hr, [0.5, 1.0, 2.0, 3.0], RISK_ORDER)


def apply_load_rules(base: str, wind_mph: float, weight_lb: float) -> str:
    """Override weather-only risk using load-sensitive wind rules."""
    if wind_mph >= 55:
        return "No Travel"
    if 45 <= wind_mph < 55 and weight_lb > 30_000:
        return "No Travel"
    if 35 <= wind_mph < 45 and weight_lb > 40_000:
        # Elevate to at least Severe
        if RISK_SCORE[base] < RISK_SCORE["Severe"]:
            return "Severe"
    return base


def classify_weather(wind_mph: float, rain_in_hr: float, snow_in_hr: float, weight_lb: float) -> dict:
    w = wind_risk(wind_mph)
    r = rain_risk(rain_in_hr)
    s = snow_risk(snow_in_hr)
    base = max((w, r, s), key=lambda x: RISK_SCORE[x])
    final = apply_load_rules(base, wind_mph, weight_lb)
    return {
        "wind_risk": w,
        "rain_risk": r,
        "snow_risk": s,
        "risk": final,
        "risk_score": RISK_SCORE[final],
    }


def summarize_route_risk(checkpoints: list[dict]) -> dict:
    miles = {level: 0.0 for level in RISK_ORDER}
    score_sum = 0.0
    weight_sum = 0.0

    for cp in checkpoints:
        seg = float(cp.get("segment_miles") or 0)
        # Last checkpoint has 0 segment miles — still include for average via tiny weight
        w = seg if seg > 0 else 0.0
        level = cp.get("risk", "Low")
        miles[level] = miles.get(level, 0.0) + w
        score_sum += RISK_SCORE.get(level, 0) * (w if w > 0 else 1.0)
        weight_sum += w if w > 0 else 1.0

    avg = score_sum / weight_sum if weight_sum else 0.0
    return {
        "miles_by_risk": {k: round(v, 2) for k, v in miles.items()},
        "severe_miles": round(miles["Severe"] + miles["No Travel"], 2),
        "high_miles": round(miles["High"], 2),
        "no_travel_miles": round(miles["No Travel"], 2),
        "avg_risk": round(avg, 3),
        "max_risk": max((cp.get("risk", "Low") for cp in checkpoints), key=lambda x: RISK_SCORE[x], default="Low"),
    }
