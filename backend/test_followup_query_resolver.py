import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.execution_errors import (
    build_connector_error_response,
    is_connector_connection_failure,
)
from app.services.followup_query_resolver import (
    classify_followup_routing,
    looks_like_elliptical_filter,
    resolve_followup_query,
    sanity_check_followup_resolution,
)


SCHEMA = {
    "tables": [
        {
            "catalog": "postgres",
            "schema_name": "public",
            "table_name": "flight_events",
            "columns": [
                {"name": "event_id", "data_type": "varchar"},
                {"name": "severity", "data_type": "varchar", "sample_values": ["low", "medium", "high"]},
                {"name": "event_type", "data_type": "varchar"},
            ],
        }
    ]
}

CONTEXT = {
    "previous_sql": "SELECT * FROM postgres.public.flight_events LIMIT 100",
    "previous_columns": ["event_id", "severity", "event_type"],
    "previous_rows": [{"event_id": "1", "severity": "High", "event_type": "Weather Hold"}],
    "previous_result_intent": {"category": "preview"},
}

ERROR_CONTEXT = {
    **CONTEXT,
    "previous_result_intent": {"category": "error"},
    "executionError": "Connector unavailable",
}


class FollowupQueryResolverTests(unittest.TestCase):
    def test_standalone_query_after_table_context_routes_to_nl_sql(self):
        routing = classify_followup_routing("show me delayed flights from los angeles", SCHEMA, CONTEXT)

        self.assertEqual(routing["routing_decision"], "standalone_query")
        self.assertIn("complete_query_length", routing["standalone_signals"])

    def test_standalone_query_after_error_context_routes_to_nl_sql(self):
        routing = classify_followup_routing("show me delayed flights from los angeles", SCHEMA, ERROR_CONTEXT)

        self.assertEqual(routing["routing_decision"], "standalone_query")
        self.assertLess(routing["previous_context_trust_score"], 0.5)

    def test_vague_followup_after_successful_table_result_uses_context(self):
        routing = classify_followup_routing("show one with high severity", SCHEMA, CONTEXT)

        self.assertEqual(routing["routing_decision"], "contextual_followup")
        self.assertIn("short_filter_mentions_previous_column", routing["followup_signals"])

    def test_typo_heavy_vague_followup_after_context_uses_context_safely(self):
        routing = classify_followup_routing("show me onw with highs seberit", SCHEMA, CONTEXT)
        resolved = resolve_followup_query("show me onw with highs seberit", SCHEMA, CONTEXT)
        sanity = sanity_check_followup_resolution("show me onw with highs seberit", SCHEMA, CONTEXT, resolved, routing)

        self.assertEqual(routing["routing_decision"], "contextual_followup")
        self.assertTrue(sanity["accepted"], sanity["reason"])

    def test_vague_query_with_no_context_asks_clarification(self):
        routing = classify_followup_routing("show one with high severity", SCHEMA, None)

        self.assertEqual(routing["routing_decision"], "ambiguous_needs_clarification")

    def test_sanity_check_rejects_table_name_as_filter_value(self):
        routing = {
            "routing_decision": "contextual_followup",
            "routing_confidence": 0.9,
            "semantic_terms": ["flight_events"],
            "non_schema_semantic_terms": [],
        }
        suspicious = {
            "status": "resolved",
            "table": SCHEMA["tables"][0],
            "filters": [{"column": "severity", "operator": "=", "value": "flight_events"}],
            "sql": 'SELECT * FROM "postgres"."public"."flight_events" WHERE LOWER(CAST("severity" AS VARCHAR)) = LOWER(\'flight_events\') LIMIT 100',
            "token_corrections": [],
        }

        sanity = sanity_check_followup_resolution("show flight_events severity", SCHEMA, CONTEXT, suspicious, routing)

        self.assertFalse(sanity["accepted"])
        self.assertIn("table_or_schema_name_used_as_filter_value", sanity["reason"])

    def test_resolves_followup_filter_from_previous_table_and_sample_value(self):
        resolved = resolve_followup_query("show one with high severity", SCHEMA, CONTEXT)

        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["filters"], [{"column": "severity", "operator": "=", "value": "high"}])
        self.assertIn('FROM "postgres"."public"."flight_events"', resolved["sql"])
        self.assertIn('LOWER(CAST("severity" AS VARCHAR)) = LOWER(\'high\')', resolved["sql"])
        self.assertIn("LIMIT 1", resolved["sql"])

    def test_resolves_plural_preview_followup_without_single_row_limit(self):
        resolved = resolve_followup_query("show me ones with high severity", SCHEMA, CONTEXT)

        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["filters"], [{"column": "severity", "operator": "=", "value": "high"}])
        self.assertIn("LIMIT 100", resolved["sql"])

    def test_resolves_short_typo_preview_word_without_hardcoded_phrase(self):
        resolved = resolve_followup_query("show me ons with high severity", SCHEMA, CONTEXT)

        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["filters"], [{"column": "severity", "operator": "=", "value": "high"}])
        self.assertIn("LIMIT 100", resolved["sql"])
        self.assertIn({"from": "ons", "to": "ones", "matched": "ones", "category": "operation", "confidence": 0.857}, resolved["token_corrections"])

    def test_resolves_multiple_typos_against_context_words(self):
        resolved = resolve_followup_query("show me onw with highs seberit", SCHEMA, CONTEXT)

        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["filters"], [{"column": "severity", "operator": "=", "value": "high"}])
        self.assertIn("LIMIT 1", resolved["sql"])
        self.assertEqual(resolved["normalized_query"], "show me one with high severity")

    def test_resolves_filter_without_with_marker_from_context_values(self):
        resolved = resolve_followup_query("show high severity rows", SCHEMA, CONTEXT)

        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["filters"], [{"column": "severity", "operator": "=", "value": "high"}])
        self.assertIn("LIMIT 100", resolved["sql"])

    def test_resolves_typo_column_text_from_previous_columns(self):
        resolved = resolve_followup_query("show one with high severityh", SCHEMA, CONTEXT)

        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["filters"][0]["column"], "severity")
        self.assertEqual(resolved["filters"][0]["value"], "high")

    def test_no_previous_context_is_elliptical_clarification_candidate(self):
        self.assertTrue(looks_like_elliptical_filter("show one with high severity"))
        self.assertIsNone(resolve_followup_query("show one with high severity", SCHEMA, None))

    def test_connector_connection_failure_response_is_structured(self):
        err = 'TrinoExternalError(type=EXTERNAL, name=JDBC_ERROR, message="The connection attempt failed.")'

        self.assertTrue(is_connector_connection_failure(err))
        response = build_connector_error_response("SELECT * FROM postgres.public.flight_events LIMIT 1", err)

        self.assertEqual(response["error_type"], "connector_connection_failed")
        self.assertEqual(response["catalog"], "postgres")
        self.assertEqual(response["generated_sql"], "SELECT * FROM postgres.public.flight_events LIMIT 1")
        self.assertNotIn("Traceback", response["user_message"])


if __name__ == "__main__":
    unittest.main()
