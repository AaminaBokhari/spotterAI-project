"""Geocode place names with cache, known cities, and multiple providers.

Nominatim rate-limits public demo traffic (HTTP 429). Open-Meteo is used first.
"""

from __future__ import annotations

import re
import time

import requests

UA = {"User-Agent": "CorridorTruckRouting/1.0 (spotter-assessment)"}
_CACHE: dict[str, dict] = {}

# Default demo cities so scoring still works if every geocoder is throttled.
_KNOWN: dict[str, dict] = {
    "chicago": {"name": "Chicago, Illinois, USA", "lat": 41.8781, "lng": -87.6298},
    "chicago il": {"name": "Chicago, Illinois, USA", "lat": 41.8781, "lng": -87.6298},
    "chicago illinois": {"name": "Chicago, Illinois, USA", "lat": 41.8781, "lng": -87.6298},
    "detroit": {"name": "Detroit, Michigan, USA", "lat": 42.3314, "lng": -83.0458},
    "detroit mi": {"name": "Detroit, Michigan, USA", "lat": 42.3314, "lng": -83.0458},
    "detroit michigan": {"name": "Detroit, Michigan, USA", "lat": 42.3314, "lng": -83.0458},
    "new york": {"name": "New York, New York, USA", "lat": 40.7128, "lng": -74.0060},
    "new york ny": {"name": "New York, New York, USA", "lat": 40.7128, "lng": -74.0060},
    "nyc": {"name": "New York, New York, USA", "lat": 40.7128, "lng": -74.0060},
    "boston": {"name": "Boston, Massachusetts, USA", "lat": 42.3601, "lng": -71.0589},
    "boston ma": {"name": "Boston, Massachusetts, USA", "lat": 42.3601, "lng": -71.0589},
    "dallas": {"name": "Dallas, Texas, USA", "lat": 32.7767, "lng": -96.7970},
    "dallas tx": {"name": "Dallas, Texas, USA", "lat": 32.7767, "lng": -96.7970},
    "houston": {"name": "Houston, Texas, USA", "lat": 29.7604, "lng": -95.3698},
    "houston tx": {"name": "Houston, Texas, USA", "lat": 29.7604, "lng": -95.3698},
    "los angeles": {"name": "Los Angeles, California, USA", "lat": 34.0522, "lng": -118.2437},
    "los angeles ca": {"name": "Los Angeles, California, USA", "lat": 34.0522, "lng": -118.2437},
    "atlanta": {"name": "Atlanta, Georgia, USA", "lat": 33.7490, "lng": -84.3880},
    "atlanta ga": {"name": "Atlanta, Georgia, USA", "lat": 33.7490, "lng": -84.3880},
    "indianapolis": {"name": "Indianapolis, Indiana, USA", "lat": 39.7684, "lng": -86.1581},
    "indianapolis in": {"name": "Indianapolis, Indiana, USA", "lat": 39.7684, "lng": -86.1581},
    "cleveland": {"name": "Cleveland, Ohio, USA", "lat": 41.4993, "lng": -81.6944},
    "cleveland oh": {"name": "Cleveland, Ohio, USA", "lat": 41.4993, "lng": -81.6944},
    "columbus": {"name": "Columbus, Ohio, USA", "lat": 39.9612, "lng": -82.9988},
    "columbus oh": {"name": "Columbus, Ohio, USA", "lat": 39.9612, "lng": -82.9988},
    "st louis": {"name": "St. Louis, Missouri, USA", "lat": 38.6270, "lng": -90.1994},
    "st louis mo": {"name": "St. Louis, Missouri, USA", "lat": 38.6270, "lng": -90.1994},
    "milwaukee": {"name": "Milwaukee, Wisconsin, USA", "lat": 43.0389, "lng": -87.9065},
    "milwaukee wi": {"name": "Milwaukee, Wisconsin, USA", "lat": 43.0389, "lng": -87.9065},
}


def _norm(place: str) -> str:
    text = place.lower().strip()
    text = text.replace(".", "")
    text = re.sub(r"[,/]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _coords(place: str) -> dict | None:
    m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*", place)
    if not m:
        return None
    lat, lng = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return {"name": f"{lat:.4f}, {lng:.4f}", "lat": lat, "lng": lng}


def _open_meteo(place: str) -> dict | None:
    r = requests.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": place.split(",")[0].strip(), "count": 5, "language": "en", "format": "json"},
        headers=UA,
        timeout=12,
    )
    if r.status_code == 429:
        return None
    r.raise_for_status()
    results = (r.json() or {}).get("results") or []
    if not results:
        return None
    needle = _norm(place)
    tokens = needle.split()
    pick = results[0]
    for row in results:
        blob = _norm(
            " ".join(
                str(row.get(k) or "")
                for k in ("name", "admin1", "admin2", "country_code", "country")
            )
        )
        if tokens and tokens[0] in blob and all(t in blob for t in tokens[1:]):
            pick = row
            break
    name = ", ".join(
        p for p in (pick.get("name"), pick.get("admin1"), pick.get("country")) if p
    )
    return {"name": name, "lat": float(pick["latitude"]), "lng": float(pick["longitude"])}


def _nominatim(place: str) -> dict | None:
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": place, "format": "json", "limit": 1},
        headers=UA,
        timeout=12,
    )
    if r.status_code == 429:
        return None
    r.raise_for_status()
    results = r.json()
    if not results:
        return None
    x = results[0]
    return {"name": x["display_name"], "lat": float(x["lat"]), "lng": float(x["lon"])}


def _photon(place: str) -> dict | None:
    r = requests.get(
        "https://photon.komoot.io/api/",
        params={"q": place, "limit": 1},
        headers=UA,
        timeout=12,
    )
    if r.status_code == 429:
        return None
    r.raise_for_status()
    feats = (r.json() or {}).get("features") or []
    if not feats:
        return None
    geom = feats[0].get("geometry") or {}
    props = feats[0].get("properties") or {}
    coords = geom.get("coordinates") or [None, None]
    if coords[0] is None:
        return None
    name = ", ".join(
        str(props[k]) for k in ("name", "state", "country") if props.get(k)
    ) or place
    return {"name": name, "lat": float(coords[1]), "lng": float(coords[0])}


def geocode(place: str) -> dict:
    if not place or not str(place).strip():
        raise ValueError("Location is required")

    raw = str(place).strip()
    key = _norm(raw)
    if key in _CACHE:
        return _CACHE[key]

    coords = _coords(raw)
    if coords:
        _CACHE[key] = coords
        return coords

    if key in _KNOWN:
        _CACHE[key] = _KNOWN[key]
        return _KNOWN[key]

    last_err: Exception | None = None
    for fn in (_open_meteo, _photon, _nominatim):
        try:
            hit = fn(raw)
            if hit:
                _CACHE[key] = hit
                return hit
        except requests.RequestException as e:
            last_err = e
            time.sleep(0.2)

    if key in _KNOWN:
        return _KNOWN[key]

    if last_err:
        raise requests.RequestException(
            "Geocoding is busy (too many map lookups). Wait 10 seconds and click Score again."
        ) from last_err
    raise ValueError(f"Could not find location: {place}")
