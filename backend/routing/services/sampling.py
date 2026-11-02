import math
from datetime import timedelta

EARTH_RADIUS_MILES = 3958.8


def haversine(lng1, lat1, lng2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(a))


def auto_interval(total_miles):
    # Assignment: 10 / 25 / 50 miles. Chhota trip = zyada detail.
    if total_miles < 100:
        return 10
    if total_miles < 400:
        return 25
    return 50


def sample_route(route, departure, interval_miles=None):
    coords = route["coordinates"]  # [lng, lat]
    if len(coords) < 2:
        return []

    # 1. Cumulative distance har point tak
    cum = [0.0]
    for (lng1, lat1), (lng2, lat2) in zip(coords, coords[1:]):
        cum.append(cum[-1] + haversine(lng1, lat1, lng2, lat2))

    raw_total = cum[-1]
    if raw_total == 0:
        return []

    # Route API ki distance se match karo taake miles consistent rahein
    scale = route["distance_miles"] / raw_total
    cum = [c * scale for c in cum]
    total = cum[-1]

    interval = interval_miles or auto_interval(total)

    # 2. Target mile markers: 0, N, 2N, ... aur end
    targets = []
    d = 0.0
    while d < total:
        targets.append(d)
        d += interval
    targets.append(total)

    # 3. Har target ka lat/lng interpolate karo
    checkpoints = []
    j = 0
    for idx, t in enumerate(targets):
        while j < len(cum) - 2 and cum[j + 1] < t:
            j += 1
        seg = cum[j + 1] - cum[j]
        frac = 0 if seg == 0 else (t - cum[j]) / seg
        lng = coords[j][0] + frac * (coords[j + 1][0] - coords[j][0])
        lat = coords[j][1] + frac * (coords[j + 1][1] - coords[j][1])

        eta = departure + timedelta(hours=route["duration_hours"] * (t / total))
        next_t = targets[idx + 1] if idx + 1 < len(targets) else t

        checkpoints.append({
            "mile": round(t, 1),
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "eta": eta.isoformat(),
            "segment_miles": round(next_t - t, 2),  # is point se agle point tak
        })
    return checkpoints