import asyncio
import unittest
from unittest.mock import patch

from app.services.discover_enterprise_service import (
    ENTERPRISE_REQUIRED_MESSAGE,
    NO_CRITERIA_MATCH_MESSAGE,
    NO_TABLE_MESSAGE,
    UNAVAILABLE_MESSAGE,
    airport_codes,
    aggregate_airport_summaries,
    build_airport_query,
    discover_enterprise_candidates,
    enrich_discover_airports,
    interpret_enterprise_filter,
    select_airport_candidates,
    select_enterprise_tables,
)
from app.services.discover_query_planner import plan_discover_query


SCHEMA = {
    "tables": [
        {
            "catalog": "supabase",
            "schema_name": "public",
            "table_name": "airport_daily_performance",
            "columns": [
                {"name": "airport_code"},
                {"name": "performance_date"},
                {"name": "total_flights"},
                {"name": "delayed_flights"},
                {"name": "cancelled_flights"},
                {"name": "avg_departure_delay"},
                {"name": "avg_arrival_delay"},
                {"name": "on_time_percentage"},
                {"name": "weather_delay_count"},
                {"name": "maintenance_delay_count"},
            ],
        },
        {
            "catalog": "supabase",
            "schema_name": "public",
            "table_name": "unrelated",
            "columns": [{"name": "id"}, {"name": "value"}],
        },
    ]
}
AIRPORTS = [{"iataCode": "ATL", "icaoCode": "KATL", "ident": "KATL", "code": "ATL"}]


class FakeExecutor:
    async def execute(self, sql):
        self.sql = sql
        return [
            {"airport_code": "ATL", "performance_date": "2026-05-01", "total_flights": 980, "delayed_flights": 250, "cancelled_flights": 10, "avg_departure_delay": 35, "avg_arrival_delay": 28, "on_time_percentage": 72, "weather_delay_count": 30, "maintenance_delay_count": 5},
            {"airport_code": "ATL", "performance_date": "2026-05-02", "total_flights": 1020, "delayed_flights": 270, "cancelled_flights": 12, "avg_departure_delay": 33, "avg_arrival_delay": 26, "on_time_percentage": 74, "weather_delay_count": 32, "maintenance_delay_count": 7},
        ]


class FailingExecutor:
    async def execute(self, sql):
        raise RuntimeError("Trino unavailable")


class LowRiskExecutor:
    async def execute(self, sql):
        return [{"airport_code": "ATL", "performance_date": "2026-05-01", "total_flights": 100, "delayed_flights": 2, "cancelled_flights": 0, "avg_departure_delay": 3, "avg_arrival_delay": 2, "on_time_percentage": 98}]


class ComparisonExecutor:
    async def execute(self, sql):
        return [
            {"airport_code": "DEL", "performance_date": "2026-05-01", "total_flights": 100, "delayed_flights": 30, "cancelled_flights": 3, "avg_departure_delay": 35, "avg_arrival_delay": 25, "on_time_percentage": 70},
            {"airport_code": "ATL", "performance_date": "2026-05-01", "total_flights": 120, "delayed_flights": 20, "cancelled_flights": 2, "avg_departure_delay": 18, "avg_arrival_delay": 14, "on_time_percentage": 82},
        ]


class DiscoverEnterpriseTests(unittest.TestCase):
    def test_query_router(self):
        delay = plan_discover_query("show airport performance near Atlanta")
        self.assertTrue(delay["needsTrino"])
        self.assertEqual(delay["primarySource"], "trino")
        self.assertTrue(delay["needsOpenSky"])
        self.assertTrue(delay["needsWeather"])
        self.assertTrue(delay["needsAirports"])
        self.assertFalse(plan_discover_query("show temperature over Tokyo")["needsTrino"])
        self.assertFalse(plan_discover_query("show flights near Atlanta")["needsTrino"])
        self.assertFalse(plan_discover_query("show airports near Amsterdam")["needsTrino"])
        combined = plan_discover_query("show live flights near high-delay airports around Atlanta")
        self.assertTrue(combined["needsTrino"])
        self.assertTrue(combined["needsOpenSky"])
        self.assertEqual(combined["primarySource"], "trino")
        weather = plan_discover_query("show weather risk near airports with poor performance")
        self.assertTrue(weather["needsTrino"])
        self.assertTrue(weather["needsWeather"])
        enterprise_first = plan_discover_query("show weather impacted flights near high risk airports")
        self.assertTrue(enterprise_first["enterpriseFirst"])
        self.assertEqual(enterprise_first["enterpriseFilter"], "high_risk")
        self.assertEqual(enterprise_first["locationGeocodingSkippedReason"], "enterprise_first_query_without_explicit_location")
        scoped = plan_discover_query("show live flights near high-delay airports around Atlanta")
        self.assertFalse(scoped["enterpriseFirst"])
        comparison = plan_discover_query("compare DEL and ATL performance")
        self.assertTrue(comparison["comparison"])
        self.assertTrue(comparison["enterpriseFirst"])

    def test_selected_table_and_airport_code_matching(self):
        tables = select_enterprise_tables(SCHEMA)
        self.assertEqual([table["table_name"] for table in tables], ["airport_daily_performance"])
        self.assertEqual(airport_codes(AIRPORTS), ["ATL", "KATL"])
        self.assertEqual(airport_codes([{"iataCode": None, "icaoCode": "VIDP", "ident": "VIDP"}]), ["VIDP"])
        sql = build_airport_query(tables[0], ["ATL"])
        self.assertIn('FROM "supabase"."public"."airport_daily_performance"', sql)
        self.assertIn("LIMIT 50", sql)

    def test_enrichment_and_fallbacks(self):
        result = asyncio.run(enrich_discover_airports("show delay statistics for ATL", "Atlanta", AIRPORTS, schema=SCHEMA, executor=FakeExecutor()))
        self.assertTrue(result["available"])
        self.assertEqual(result["matchedAirportsCount"], 1)
        self.assertEqual(result["airportSummaries"][0]["risk"], "High")
        self.assertEqual(result["airportSummaries"][0]["totals"]["totalFlights"], 2000)
        self.assertEqual(result["airportSummaries"][0]["recordCount"], 2)
        no_table = asyncio.run(enrich_discover_airports("show delay statistics for ATL", "Atlanta", AIRPORTS, schema={"tables": []}, executor=FakeExecutor()))
        self.assertEqual(no_table["message"], NO_TABLE_MESSAGE)
        unavailable = asyncio.run(enrich_discover_airports("show delay statistics for ATL", "Atlanta", AIRPORTS, schema=SCHEMA, executor=FailingExecutor()))
        self.assertEqual(unavailable["message"], UNAVAILABLE_MESSAGE)

    def test_summary_risk_scoring_and_sorting(self):
        summaries = aggregate_airport_summaries([
            {"airportCode": "LOW", "raw": {"total_flights": 100, "delayed_flights": 5, "avg_departure_delay": 4, "on_time_percentage": 95}},
            {"airportCode": "MED", "raw": {"total_flights": 100, "delayed_flights": 15, "avg_departure_delay": 4, "on_time_percentage": 90}},
            {"airportCode": "DEL", "raw": {"performance_date": "2026-05-01", "total_flights": 100, "delayed_flights": 10, "cancelled_flights": 2, "avg_departure_delay": 30, "avg_arrival_delay": 20, "on_time_percentage": 90}},
            {"airportCode": "DEL", "raw": {"performance_date": "2026-05-02", "total_flights": 120, "delayed_flights": 12, "cancelled_flights": 3, "avg_departure_delay": 32, "avg_arrival_delay": 22, "on_time_percentage": 88}},
        ])
        self.assertEqual([summary["airportCode"] for summary in summaries], ["DEL", "MED", "LOW"])
        self.assertEqual(summaries[0]["risk"], "High")
        self.assertEqual(summaries[1]["risk"], "Medium")
        self.assertEqual(summaries[0]["recordCount"], 2)
        self.assertEqual(summaries[0]["dateRange"], {"start": "2026-05-01", "end": "2026-05-02"})
        self.assertEqual(len(summaries[0]["dailyRecords"]), 2)

    def test_semantic_enterprise_filter_and_candidate_resolution(self):
        self.assertEqual(interpret_enterprise_filter("show flights near airports with poor performance"), "high_risk")
        self.assertEqual(interpret_enterprise_filter("show flights near airports with high delay"), "high_delay")
        self.assertEqual(interpret_enterprise_filter("show flights near airports with low on-time"), "low_on_time")
        self.assertEqual(interpret_enterprise_filter("show flights near airports with high cancellation"), "high_cancellation")
        with patch("app.services.discover_enterprise_service.airports_by_codes", return_value=[{"code": "ATL", "iataCode": "ATL", "icaoCode": "KATL", "ident": "KATL", "name": "Atlanta", "city": "Atlanta", "country": "US", "type": "large_airport", "lat": 33.64, "lon": -84.42, "distanceNm": 0}]):
            result = asyncio.run(discover_enterprise_candidates("show flights near airports with poor performance", schema=SCHEMA, executor=FakeExecutor()))
        self.assertEqual(result["interpretedEnterpriseFilter"], "high_risk")
        self.assertEqual(result["selectedAirports"][0]["code"], "ATL")
        self.assertEqual(result["matchedAirportsCount"], 1)

    def test_semantic_enterprise_filter_no_match(self):
        summaries = [{"airportCode": "LOW", "risk": "Low", "rates": {"delayRate": 2, "onTimePercentage": 98}, "averages": {"departureDelay": 2}, "totals": {"cancelledFlights": 0}}]
        self.assertEqual(select_airport_candidates(summaries, "high_risk"), [])
        self.assertEqual(NO_CRITERIA_MATCH_MESSAGE, "No high-risk airports found in the selected enterprise data.")
        result = asyncio.run(discover_enterprise_candidates("show flights near airports with poor performance", schema=SCHEMA, executor=LowRiskExecutor()))
        self.assertEqual(result["selectedAirports"], [])
        self.assertEqual(result["message"], NO_CRITERIA_MATCH_MESSAGE)

    def test_semantic_enterprise_filter_requires_trino(self):
        result = asyncio.run(discover_enterprise_candidates("show weather impacted flights near high risk airports", schema=SCHEMA, executor=FailingExecutor()))
        self.assertEqual(result["message"], ENTERPRISE_REQUIRED_MESSAGE)

    def test_comparison_query_returns_all_requested_airports(self):
        airports = [
            {"code": "DEL", "iataCode": "DEL", "icaoCode": "VIDP", "ident": "VIDP", "name": "Delhi", "city": "New Delhi", "country": "IN", "type": "large_airport", "lat": 28.56, "lon": 77.1, "distanceNm": 0},
            {"code": "ATL", "iataCode": "ATL", "icaoCode": "KATL", "ident": "KATL", "name": "Atlanta", "city": "Atlanta", "country": "US", "type": "large_airport", "lat": 33.64, "lon": -84.42, "distanceNm": 0},
        ]
        with patch("app.services.discover_enterprise_service.airports_from_comparison_query", return_value=airports):
            result = asyncio.run(discover_enterprise_candidates("compare DEL and ATL performance", schema=SCHEMA, executor=ComparisonExecutor()))
        self.assertTrue(result["comparison"])
        self.assertEqual([summary["airportCode"] for summary in result["airportSummaries"]], ["DEL", "ATL"])
        self.assertEqual([airport["code"] for airport in result["selectedAirports"]], ["DEL", "ATL"])


if __name__ == "__main__":
    unittest.main()
