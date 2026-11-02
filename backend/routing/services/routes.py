import requests

METERS_PER_MILE = 1609.344

def get_routes(origin: dict, dest: dict) -> list[dict]:
    coords = f"{origin['lng']},{origin['lat']};{dest['lng']},{dest['lat']}"
    r = requests.get(
        f"https://router.project-osrm.org/route/v1/driving/{coords}",
        params={
            "alternatives": "3",
            "overview": "full",
            "geometries": "geojson",  # polyline decode ki zarurat nahi
        },
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if data.get("code") != "Ok":
        raise ValueError("No route found between these locations")

    return [
        {
            "id": i,
            "distance_miles": round(rt["distance"] / METERS_PER_MILE, 1),
            "duration_hours": round(rt["duration"] / 3600, 2),
            "coordinates": rt["geometry"]["coordinates"],  # [lng, lat] pairs
        }
        for i, rt in enumerate(data["routes"][:3])
    ]