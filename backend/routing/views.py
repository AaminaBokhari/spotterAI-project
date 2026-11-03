from datetime import datetime

import requests
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .services.demo import apply_demo_high_wind
from .services.geocode import geocode
from .services.heatmap import build_heatmap
from .services.recommend import recommend_route
from .services.risk import summarize_route_risk
from .services.routes import get_routes
from .services.sampling import sample_route
from .services.weather import enrich_checkpoints


def _parse_request(data):
    origin_text = data.get("origin")
    dest_text = data.get("destination")
    dep_text = data.get("departure_time")
    weight = data.get("weight_lb")
    interval = data.get("interval_miles")

    if not origin_text or not dest_text:
        return None, Response({"error": "origin and destination are required"}, status=400)

    try:
        departure = datetime.fromisoformat(str(dep_text).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None, Response(
            {"error": "departure_time must be ISO format, e.g. 2026-11-03T08:00"},
            status=400,
        )

    try:
        weight = float(weight)
        if weight <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return None, Response({"error": "weight_lb must be a positive number"}, status=400)

    if interval is not None and int(interval) not in (10, 25, 50):
        return None, Response({"error": "interval_miles must be 10, 25 or 50"}, status=400)

    return {
        "origin_text": origin_text,
        "dest_text": dest_text,
        "departure": departure,
        "weight": weight,
        "interval": int(interval) if interval is not None else None,
        "demo_weather": bool(data.get("demo_weather")),
    }, None


@api_view(["POST"])
def analyze(request):
    parsed, err = _parse_request(request.data)
    if err:
        return err

    try:
        origin = geocode(parsed["origin_text"])
        dest = geocode(parsed["dest_text"])
        routes = get_routes(origin, dest)
    except ValueError as e:
        return Response({"error": str(e)}, status=400)
    except requests.RequestException as e:
        return Response({"error": f"Routing/geocoding failed: {e}"}, status=502)

    try:
        for route in routes:
            raw_cps = sample_route(route, parsed["departure"], parsed["interval"])
            route["checkpoints"] = enrich_checkpoints(raw_cps, parsed["weight"])
            route["summary"] = summarize_route_risk(route["checkpoints"])
            route["interval_miles"] = (
                parsed["interval"]
                if parsed["interval"] is not None
                else (10 if route["distance_miles"] < 100 else 25 if route["distance_miles"] < 400 else 50)
            )
        if parsed["demo_weather"]:
            apply_demo_high_wind(routes, parsed["weight"])
    except requests.RequestException as e:
        return Response(
            {"error": f"Weather service busy or unavailable — retry in a moment ({e})"},
            status=502,
        )

    recommendation = recommend_route(routes)
    return Response(
        {
            "origin": origin,
            "destination": dest,
            "weight_lb": parsed["weight"],
            "departure_time": parsed["departure"].isoformat(),
            "routes": routes,
            "recommendation": recommendation,
            "demo_weather": parsed["demo_weather"],
        }
    )


@api_view(["POST"])
def heatmap(request):
    """Weather risk heatmap for the corridor. Accepts routes geometry + weight + hour."""
    weight = request.data.get("weight_lb")
    hour_offset = request.data.get("hour_offset", 0)
    routes = request.data.get("routes") or []
    grid = request.data.get("grid", 12)

    try:
        weight = float(weight)
        if weight <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return Response({"error": "weight_lb must be a positive number"}, status=400)

    if not routes:
        # Allow origin/destination rebuild
        parsed, err = _parse_request(request.data)
        if err:
            return Response({"error": "routes geometry or origin/destination required"}, status=400)
        try:
            origin = geocode(parsed["origin_text"])
            dest = geocode(parsed["dest_text"])
            routes = get_routes(origin, dest)
        except (ValueError, requests.RequestException) as e:
            return Response({"error": str(e)}, status=400)

    try:
        data = build_heatmap(routes, weight, hour_offset=hour_offset, grid=grid)
    except ValueError as e:
        return Response({"error": str(e)}, status=400)
    except requests.RequestException:
        return Response({"error": "Weather service failed, try again"}, status=502)

    return Response(data)


@api_view(["GET"])
def health(_request):
    return Response({"status": "ok"})
