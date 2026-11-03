from django.test import SimpleTestCase

from routing.services.geocode import geocode
from routing.services.demo import apply_demo_high_wind
from routing.services.routes import via_point, _too_similar
from routing.services.recommend import recommend_route
from routing.services.risk import (
    apply_load_rules,
    classify_weather,
    rain_risk,
    snow_risk,
    summarize_route_risk,
    wind_risk,
)
from routing.services.sampling import auto_interval, haversine, sample_route


class RiskRulesTests(SimpleTestCase):
    def test_wind_bands(self):
        self.assertEqual(wind_risk(10), "Low")
        self.assertEqual(wind_risk(25), "Moderate")
        self.assertEqual(wind_risk(35), "High")
        self.assertEqual(wind_risk(45), "Severe")
        self.assertEqual(wind_risk(55), "No Travel")

    def test_rain_bands(self):
        self.assertEqual(rain_risk(0.05), "Low")
        self.assertEqual(rain_risk(0.10), "Moderate")
        self.assertEqual(rain_risk(0.25), "High")
        self.assertEqual(rain_risk(0.50), "Severe")
        self.assertEqual(rain_risk(1.01), "No Travel")

    def test_snow_bands(self):
        self.assertEqual(snow_risk(0.2), "Low")
        self.assertEqual(snow_risk(0.5), "Moderate")
        self.assertEqual(snow_risk(1.0), "High")
        self.assertEqual(snow_risk(2.0), "Severe")
        self.assertEqual(snow_risk(3.1), "No Travel")

    def test_load_rules(self):
        self.assertEqual(apply_load_rules("Low", 55, 1000), "No Travel")
        self.assertEqual(apply_load_rules("Severe", 50, 35_000), "No Travel")
        self.assertEqual(apply_load_rules("High", 40, 45_000), "Severe")
        self.assertEqual(apply_load_rules("Moderate", 40, 20_000), "Moderate")

    def test_classify_takes_worst_and_load(self):
        # Heavy rain wins
        r = classify_weather(10, 0.6, 0, 20_000)
        self.assertEqual(r["risk"], "Severe")
        # Load elevates wind band
        r2 = classify_weather(40, 0, 0, 50_000)
        self.assertEqual(r2["risk"], "Severe")


class SamplingTests(SimpleTestCase):
    def test_auto_interval(self):
        self.assertEqual(auto_interval(50), 10)
        self.assertEqual(auto_interval(200), 25)
        self.assertEqual(auto_interval(500), 50)

    def test_haversine_zero(self):
        self.assertAlmostEqual(haversine(-87.6, 41.8, -87.6, 41.8), 0.0)

    def test_sample_includes_start_end(self):
        from datetime import datetime, timezone

        route = {
            "distance_miles": 100.0,
            "duration_hours": 2.0,
            "coordinates": [
                [-87.6, 41.8],
                [-87.0, 41.8],
                [-86.4, 41.8],
            ],
        }
        cps = sample_route(route, datetime(2026, 11, 3, 8, tzinfo=timezone.utc), 50)
        self.assertEqual(cps[0]["mile"], 0.0)
        self.assertAlmostEqual(cps[-1]["mile"], 100.0, places=0)
        self.assertTrue(all("eta" in c for c in cps))


class RecommendTests(SimpleTestCase):
    def test_prefers_fewer_severe_miles(self):
        routes = [
            {
                "id": 0,
                "duration_hours": 5,
                "summary": {
                    "no_travel_miles": 0,
                    "severe_miles": 40,
                    "high_miles": 0,
                    "avg_risk": 1.0,
                },
            },
            {
                "id": 1,
                "duration_hours": 6,
                "summary": {
                    "no_travel_miles": 0,
                    "severe_miles": 10,
                    "high_miles": 20,
                    "avg_risk": 1.2,
                },
            },
        ]
        rec = recommend_route(routes)
        self.assertEqual(rec["route_id"], 1)

    def test_summary_miles(self):
        cps = [
            {"segment_miles": 20, "risk": "Low"},
            {"segment_miles": 10, "risk": "Severe"},
            {"segment_miles": 0, "risk": "High"},
        ]
        s = summarize_route_risk(cps)
        self.assertEqual(s["severe_miles"], 10)
        self.assertEqual(s["miles_by_risk"]["Low"], 20)


class GeocodeTests(SimpleTestCase):
    def test_known_demo_cities(self):
        chi = geocode("Chicago, IL")
        det = geocode("Detroit, MI")
        self.assertAlmostEqual(chi["lat"], 41.8781, places=3)
        self.assertAlmostEqual(det["lng"], -83.0458, places=3)

    def test_lat_lng(self):
        p = geocode("41.88, -87.63")
        self.assertAlmostEqual(p["lat"], 41.88, places=2)


class RoutePadTests(SimpleTestCase):
    def test_via_is_off_the_direct_line(self):
        origin = {"lat": 41.88, "lng": -87.63}
        dest = {"lat": 42.33, "lng": -83.05}
        lat, lng = via_point(origin, dest, sign=1, offset_miles=40)
        mid_lat = (origin["lat"] + dest["lat"]) / 2
        mid_lng = (origin["lng"] + dest["lng"]) / 2
        self.assertGreater(abs(lat - mid_lat) + abs(lng - mid_lng), 0.2)

    def test_similar_routes_use_midpoint(self):
        a = {"coordinates": [[-87.6, 41.8], [-85.0, 42.0], [-83.0, 42.3]]}
        b = {"coordinates": [[-87.6, 41.8], [-85.0, 42.0], [-83.0, 42.3]]}
        c = {"coordinates": [[-87.6, 41.8], [-86.2, 41.2], [-83.0, 42.3]]}
        self.assertTrue(_too_similar(a, b))
        self.assertFalse(_too_similar(a, c))


class DemoWindTests(SimpleTestCase):
    def test_heavy_load_makes_40mph_severe(self):
        routes = [
            {
                "checkpoints": [
                    {"segment_miles": 50, "rain_in_hr": 0, "snow_in_hr": 0, "risk": "Low"}
                ]
            },
            {
                "checkpoints": [
                    {"segment_miles": 50, "rain_in_hr": 0, "snow_in_hr": 0, "risk": "Low"}
                ]
            },
            {
                "checkpoints": [
                    {"segment_miles": 50, "rain_in_hr": 0, "snow_in_hr": 0, "risk": "Low"}
                ]
            },
        ]
        apply_demo_high_wind(routes, 41_000)
        self.assertEqual(routes[0]["checkpoints"][0]["risk"], "Moderate")
        self.assertEqual(routes[1]["checkpoints"][0]["risk"], "Severe")
        self.assertEqual(routes[2]["checkpoints"][0]["risk"], "No Travel")
