import time

import requests

HEADERS = {"User-Agent": "corridor-truck-routing/1.0 (assessment)"}
_last_call = 0.0


def geocode(place: str) -> dict:
    """Geocode via Nominatim with a polite 1 req/sec throttle."""
    global _last_call
    wait = 1.05 - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)

    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": place, "format": "json", "limit": 1},
        headers=HEADERS,
        timeout=15,
    )
    _last_call = time.time()
    r.raise_for_status()
    results = r.json()
    if not results:
        raise ValueError(f"Could not find location: {place}")
    x = results[0]
    return {"name": x["display_name"], "lat": float(x["lat"]), "lng": float(x["lon"])}
