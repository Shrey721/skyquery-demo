import asyncio
import unittest

from app.services.discover_enterprise_service import (
    NO_TABLE_MESSAGE,
    UNAVAILABLE_MESSAGE,
    airport_codes,
    build_airport_query,
    enrich_discover_airports,
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
                {"name": "iata"},
                {"name": "avg_delay"},
                {"name": "on_time_rate"},
                {"name": "cancelled"},
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
        return [{"iata": "ATL", "avg_delay": 22, "on_time_rate": 78, "cancelled": 3}]


class FailingExecutor:
    async def execute(self, sql):
        raise RuntimeError("Trino unavailable")


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
        self.assertEqual(result["rows"][0]["risk"], "Medium")
        no_table = asyncio.run(enrich_discover_airports("show delay statistics for ATL", "Atlanta", AIRPORTS, schema={"tables": []}, executor=FakeExecutor()))
        self.assertEqual(no_table["message"], NO_TABLE_MESSAGE)
        unavailable = asyncio.run(enrich_discover_airports("show delay statistics for ATL", "Atlanta", AIRPORTS, schema=SCHEMA, executor=FailingExecutor()))
        self.assertEqual(unavailable["message"], UNAVAILABLE_MESSAGE)


if __name__ == "__main__":
    unittest.main()
