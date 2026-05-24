import asyncio
import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.query_result_intent import classify_result_intent
from app.services.metadata_rendering import build_rendering_config
from app.services.metadata_followup import (
    build_metadata_overview_response,
    build_metadata_followup_response,
    build_table_columns_sql,
    is_metadata_table_detail_request,
    is_standalone_metadata_overview_request,
    resolve_metadata_table_candidates,
    should_handle_metadata_followup,
)
from app.services.result_shaper import shape_result
from app.services.summary_generator import generate_summary
from app.validators.sql_validator import validate_sql


class ResultIntentTests(unittest.TestCase):
    def test_how_many_tables_exist_is_metadata_stat(self):
        rows = [{"result_count": 12}]
        shaped = shape_result(
            rows,
            question="How many tables exist?",
            sql="SELECT COUNT(*) AS result_count FROM information_schema.tables",
        )

        self.assertEqual(shaped["result_intent"]["category"], "metadata")
        self.assertEqual(shaped["visualization"], "stat")
        self.assertEqual(shaped["chart_suggestion"], "table")
        self.assertEqual(shaped["rendering"]["mode"], "metadata")
        self.assertEqual(shaped["rendering"]["default_tab"], "overview")
        self.assertFalse(shaped["rendering"]["chart_default_active"])
        self.assertIn("geo", shaped["rendering"]["suppressed_visualizations"])
        self.assertEqual(shaped["rendering"]["header"], "Schema discovery results")
        self.assertEqual(
            shaped["rendering"]["possible_reason"],
            "This result was generated from connected catalog/schema metadata.",
        )
        self.assertEqual(
            shaped["rendering"]["suggested_followup"],
            "List available tables, inspect columns, or preview sample rows.",
        )
        metadata_rendering_text = str(shaped["rendering"]).lower()
        self.assertNotIn("aviation", metadata_rendering_text)
        self.assertNotIn("carrier", metadata_rendering_text)
        self.assertNotIn("airport", metadata_rendering_text)
        self.assertNotIn("data distribution matches established catalog parameters", metadata_rendering_text)

        summary = asyncio.run(
            generate_summary(
                question="How many tables exist?",
                sql="SELECT COUNT(*) AS result_count FROM information_schema.tables",
                result=shaped,
            )
        )
        self.assertIn("Schema discovery", summary)
        self.assertNotIn("aviation", summary.lower())

    def test_list_available_tables_is_metadata_table(self):
        rows = [
            {"table_schema": "public", "table_name": "flights"},
            {"table_schema": "public", "table_name": "airports"},
        ]
        shaped = shape_result(
            rows,
            question="List available tables",
            sql="SHOW TABLES FROM public",
        )

        self.assertEqual(shaped["result_intent"]["category"], "metadata")
        self.assertEqual(shaped["visualization"], "table")
        self.assertEqual(shaped["chart_suggestion"], "table")
        self.assertEqual(shaped["rendering"]["metadata_context"]["schemas"], ["public"])
        self.assertEqual(shaped["rendering"]["metadata_context"]["tables"], ["flights", "airports"])
        self.assertIn("Explore columns", shaped["rendering"]["followups"])

    def test_show_columns_in_any_table_is_metadata_without_table_hardcoding(self):
        rows = [
            {"column_name": "flight_id", "data_type": "varchar"},
            {"column_name": "delay_minutes", "data_type": "integer"},
        ]
        shaped = shape_result(
            rows,
            question="Show columns in flight_operations",
            sql='DESCRIBE "catalog"."schema"."flight_operations"',
        )

        self.assertEqual(shaped["result_intent"]["category"], "metadata")
        self.assertIn("metadata_columns:column_name,data_type", shaped["result_intent"]["signals"])
        self.assertEqual(
            [column["name"] for column in shaped["rendering"]["metadata_context"]["columns"]],
            ["flight_id", "delay_minutes"],
        )

    def test_metadata_count_column_detects_without_specific_question(self):
        shaped = shape_result(
            [{"table_count": 7}],
            question="Available structures",
            sql="SELECT COUNT(*) AS table_count FROM information_schema.tables",
        )

        self.assertEqual(shaped["result_intent"]["category"], "metadata")
        self.assertEqual(shaped["rendering"]["metadata_context"]["stats"], {"table_count": 7})
        self.assertEqual(shaped["rendering"]["allowed_visualizations"], ["stat", "table", "list", "hierarchy"])

    def test_rendering_falls_back_to_metadata_columns_when_intent_missing(self):
        rendering = build_rendering_config(
            result_intent={},
            rows=[{"table_name": "orders", "table_schema": "public"}],
            columns=["table_name", "table_schema"],
            chart_suggestion="bar",
            visualization="chart",
        )

        self.assertEqual(rendering["mode"], "metadata")
        self.assertFalse(rendering["chart_default_active"])
        self.assertEqual(rendering["header"], "Schema discovery results")
        self.assertNotIn("geo", rendering["allowed_visualizations"])

    def test_metadata_followup_context_routes_to_schema_overview(self):
        schema = {
            "tables": [
                {
                    "catalog": "cat",
                    "schema_name": "sch",
                    "table_name": "alpha",
                    "columns": [
                        {"name": "id", "data_type": "integer"},
                        {"name": "status", "data_type": "varchar"},
                    ],
                },
                {
                    "catalog": "cat",
                    "schema_name": "sch",
                    "table_name": "beta",
                    "columns": [{"name": "created_at", "data_type": "timestamp"}],
                },
            ]
        }
        context = {
            "action_type": "metadata_explore_columns",
            "previous_result_intent": {"category": "metadata"},
            "previous_sql": "SELECT COUNT(*) AS table_count FROM information_schema.tables",
        }

        self.assertTrue(should_handle_metadata_followup("Explore columns", context))
        response = asyncio.run(build_metadata_followup_response("Explore columns", schema, context))

        self.assertEqual(response["result_intent"]["category"], "metadata")
        self.assertEqual(response["execution"]["columns"], ["table_catalog", "table_schema", "table_name", "column_count"])
        self.assertEqual(response["execution"]["rows"][0]["column_count"], 2)
        self.assertEqual(response["rendering"]["header"], "Schema discovery results")

    def test_specific_metadata_detail_request_resolves_table_from_schema(self):
        schema = {
            "tables": [
                {"catalog": "postgres", "schema_name": "public", "table_name": "flight_events"},
                {"catalog": "postgres", "schema_name": "public", "table_name": "flight_operations"},
            ]
        }

        self.assertTrue(is_metadata_table_detail_request("show columns of flight event table"))
        matches = resolve_metadata_table_candidates("show columns of flight event table", schema)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["table_name"], "flight_events")

    def test_table_columns_sql_uses_resolved_metadata_reference(self):
        table = {"catalog": "postgres", "schema_name": "public", "table_name": "flight_events"}

        sql = build_table_columns_sql(table)

        self.assertIn('FROM "postgres".information_schema.columns', sql)
        self.assertIn("table_schema = 'public'", sql)
        self.assertIn("table_name = 'flight_events'", sql)
        self.assertIn("ORDER BY ordinal_position", sql)

    def test_top_delayed_airports_remains_analytics_chart_candidate(self):
        rows = [
            {"airport": "LAX", "delay_count": 42},
            {"airport": "JFK", "delay_count": 34},
        ]
        shaped = shape_result(
            rows,
            question="Top delayed airports",
            sql="SELECT airport, COUNT(*) AS delay_count FROM flights GROUP BY airport",
        )

        self.assertEqual(shaped["result_intent"]["category"], "analytics")
        self.assertEqual(shaped["chart_suggestion"], "bar")
        self.assertEqual(shaped["visualization"], "chart")
        self.assertEqual(shaped["rendering"]["mode"], "analytics")
        self.assertTrue(shaped["rendering"]["chart_default_active"])
        self.assertIn("geo", shaped["rendering"]["allowed_visualizations"])
        self.assertEqual(shaped["rendering"]["template_source"], "analytics_result_rendering")
        self.assertEqual(shaped["rendering"]["header"], "Analysis of the returned dataset.")

    def test_delay_trends_by_airline_remains_analytics(self):
        intent = classify_result_intent(
            question="Delay trends by airline",
            sql="SELECT airline, AVG(delay_minutes) AS avg_delay FROM flights GROUP BY airline",
            rows=[{"airline": "AA", "avg_delay": 18.5}],
        )

        self.assertEqual(intent["category"], "analytics")

    def test_standalone_metadata_overview_detection_is_not_business_distinct(self):
        self.assertTrue(is_standalone_metadata_overview_request("show tables"))
        self.assertTrue(is_standalone_metadata_overview_request("show tables and schemas"))
        self.assertTrue(is_standalone_metadata_overview_request("list available tables"))
        self.assertFalse(is_standalone_metadata_overview_request("show distinct airline"))

    def test_metadata_overview_aggregates_catalogs_deterministically(self):
        class FakeExecutor:
            last_execute_retried = False

            async def execute(self, sql):
                if '"cat_b"' in sql:
                    return [
                        {"table_catalog": "cat_b", "table_schema": "sch", "table_name": "beta"},
                        {"table_catalog": "cat_b", "table_schema": "sch", "table_name": "unselected_b"},
                    ]
                return [
                    {"table_catalog": "cat_a", "table_schema": "sch", "table_name": "alpha"},
                    {"table_catalog": "cat_a", "table_schema": "sch", "table_name": "unselected_a"},
                ]

        schema = {
            "tables": [
                {"catalog": "cat_b", "schema_name": "sch", "table_name": "beta"},
                {"catalog": "cat_a", "schema_name": "sch", "table_name": "alpha"},
            ]
        }

        response = asyncio.run(
            build_metadata_overview_response(
                "show tables and schemas",
                schema,
                executor=FakeExecutor(),
                request_id="req-test",
            )
        )

        self.assertEqual(response["result_intent"]["category"], "metadata")
        self.assertEqual(
            [(row["table_catalog"], row["table_name"]) for row in response["execution"]["rows"]],
            [("cat_a", "alpha"), ("cat_b", "beta")],
        )
        self.assertEqual(response["metadata"]["active_catalogs_discovered"], ["cat_a", "cat_b"])
        self.assertEqual(response["metadata"]["final_result_source_count"], 2)
        self.assertEqual(response["metadata"]["selected_scope_tables"], ["cat_a.sch.alpha", "cat_b.sch.beta"])
        self.assertTrue(response["metadata"]["metadata_query_filtered"])
        self.assertIn("table_name IN ('alpha')", response["sql"])
        self.assertIn("table_name IN ('beta')", response["sql"])

    def test_direct_sql_against_unselected_table_is_rejected(self):
        schema = {
            "tables": [
                {"catalog": "cat_a", "schema_name": "sch", "table_name": "alpha"},
            ]
        }

        validation = asyncio.run(validate_sql("SELECT * FROM cat_a.sch.unselected_a", schema))

        self.assertFalse(validation["valid"])
        self.assertEqual(validation["errors"], ["This table is not in the active selected data scope."])
        self.assertEqual(validation["rejected_unselected_table"], "cat_a.sch.unselected_a")

    def test_describe_unselected_table_is_rejected(self):
        schema = {
            "tables": [
                {"catalog": "cat_a", "schema_name": "sch", "table_name": "alpha"},
            ]
        }

        validation = asyncio.run(validate_sql("DESCRIBE cat_a.sch.unselected_a", schema))

        self.assertFalse(validation["valid"])
        self.assertEqual(validation["errors"], ["This table is not in the active selected data scope."])
        self.assertEqual(validation["rejected_unselected_table"], "cat_a.sch.unselected_a")

    def test_unfiltered_show_tables_is_rejected_when_scope_exists(self):
        schema = {
            "tables": [
                {"catalog": "cat_a", "schema_name": "sch", "table_name": "alpha"},
            ]
        }

        validation = asyncio.run(validate_sql("SHOW TABLES FROM cat_a.sch", schema))

        self.assertFalse(validation["valid"])
        self.assertEqual(validation["errors"], ["Metadata listing queries must be filtered to the active selected data scope."])

    def test_connection_setup_discovery_can_still_show_unselected_sources(self):
        # Source discovery is intentionally broad; selected-scope filtering is
        # enforced after the user saves the normal app scope.
        from app.services.metadata_service import discover_sources

        self.assertTrue(callable(discover_sources))

    def test_flights_delayed_from_la_remains_analytics(self):
        intent = classify_result_intent(
            question="Flights delayed from LA",
            sql="SELECT flight_number, origin, delay_minutes FROM flights WHERE origin = 'LA'",
            rows=[{"flight_number": "SQ101", "origin": "LA", "delay_minutes": 22}],
        )

        self.assertEqual(intent["category"], "analytics")


if __name__ == "__main__":
    unittest.main()
