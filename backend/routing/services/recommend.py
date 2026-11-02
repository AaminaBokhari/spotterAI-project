"""Choose the safest practical route using the assignment preference order."""

from __future__ import annotations


def recommend_route(routes: list[dict]) -> dict | None:
    if not routes:
        return None

    def key(route: dict):
        s = route.get("summary") or {}
        # Prefer: fewest severe (incl. no-travel) → fewest high → lowest avg risk → shortest time
        return (
            s.get("severe_miles", 0),
            s.get("high_miles", 0),
            s.get("avg_risk", 0),
            route.get("duration_hours", 0),
        )

    best = min(routes, key=key)
    return {
        "route_id": best["id"],
        "reason": _reason(best, routes),
    }


def _reason(best: dict, routes: list[dict]) -> str:
    s = best.get("summary") or {}
    others = [r for r in routes if r["id"] != best["id"]]
    parts = [
        f"Route {best['id'] + 1} preferred:",
        f"{s.get('severe_miles', 0)} severe/no-travel miles,",
        f"{s.get('high_miles', 0)} high-risk miles,",
        f"avg risk {s.get('avg_risk', 0)},",
        f"{best.get('duration_hours', 0)} h travel.",
    ]
    if others:
        runner = min(
            others,
            key=lambda r: (
                (r.get("summary") or {}).get("severe_miles", 0),
                (r.get("summary") or {}).get("high_miles", 0),
            ),
        )
        rs = runner.get("summary") or {}
        if rs.get("severe_miles", 0) > s.get("severe_miles", 0):
            parts.append(
                f"Beats Route {runner['id'] + 1} on severe miles "
                f"({s.get('severe_miles', 0)} vs {rs.get('severe_miles', 0)})."
            )
        elif rs.get("high_miles", 0) > s.get("high_miles", 0):
            parts.append(
                f"Beats Route {runner['id'] + 1} on high-risk miles "
                f"({s.get('high_miles', 0)} vs {rs.get('high_miles', 0)})."
            )
        elif best.get("duration_hours", 0) <= runner.get("duration_hours", 999):
            parts.append("Also competitive on travel time.")
    return " ".join(parts)
