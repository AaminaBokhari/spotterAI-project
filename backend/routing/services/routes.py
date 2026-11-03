"""OSRM driving options. Always try to return 3 corridors."""

from __future__ import annotations

import math

import requests

METERS_PER_MILE = 1609.344
UA = {"User-Agent": "CorridorTruckRouting/1.0 (spotter-assessment)"}


def _osrm_routes(coord_str: str, alternatives: str = "true") -> list[dict]:
    r = requests.get(
        f"https://router.project-osrm.org/route/v1/driving/{coord_str}",
        params={
            "alternatives": alternatives,
            "overview": "full",
            "geometries": "geojson",
            "continue_straight": "false",
        },
        headers=UA,
        timeout=25,
    )
    r.raise_for_status()
    data = r.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        return []
    out = []
    for i, rt in enumerate(data["routes"]):
        out.append(
            {
                "id": i,
                "distance_miles": round(rt["distance"] / METERS_PER_MILE, 1),
                "duration_hours": round(rt["duration"] / 3600, 2),
                "coordinates": rt["geometry"]["coordinates"],
            }
        )
    return out


def via_point(origin: dict, dest: dict, sign: int = 1, offset_miles: float = 45.0) -> tuple[float, float]:
    """Lat/lng offset perpendicular to the origin→dest line (for a 3rd corridor)."""
    dlat = dest["lat"] - origin["lat"]
    dlng = dest["lng"] - origin["lng"]
    length = math.hypot(dlat, dlng) or 1.0
    deg = offset_miles / 69.0
    mid_lat = (origin["lat"] + dest["lat"]) / 2
    mid_lng = (origin["lng"] + dest["lng"]) / 2
    lat = mid_lat + sign * (-dlng / length) * deg
    lng = mid_lng + sign * (dlat / length) * deg
    return lat, lng


def _too_similar(a: dict, b: dict) -> bool:
    return (
        abs(a["distance_miles"] - b["distance_miles"]) < 8
        and abs(a["duration_hours"] - b["duration_hours"]) < 0.25
    )


def get_routes(origin: dict, dest: dict) -> list[dict]:
    coords = f"{origin['lng']},{origin['lat']};{dest['lng']},{dest['lat']}"
    routes = _osrm_routes(coords, alternatives="3")
    if not routes:
        raise ValueError("No route found between these locations")

    for sign, miles in ((1, 40), (-1, 40), (1, 70), (-1, 70)):
        if len(routes) >= 3:
            break
        lat, lng = via_point(origin, dest, sign=sign, offset_miles=miles)
        via = f"{origin['lng']},{origin['lat']};{lng},{lat};{dest['lng']},{dest['lat']}"
        try:
            extra = _osrm_routes(via, alternatives="false")
        except requests.RequestException:
            continue
        for cand in extra:
            if any(_too_similar(cand, existing) for existing in routes):
                continue
            cand["id"] = len(routes)
            routes.append(cand)
            break

    return routes[:3]
