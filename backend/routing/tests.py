from django.test import SimpleTestCase

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
