import asyncio
import unittest
from unittest.mock import patch

from app.models.connection import TrinoConnectionRequest
from app.models.metadata import SelectedSource, SelectedSourcesRequest
from app.services import metadata_service
from app.services.sql_repair import qualify_information_schema_with_catalog_filter, repair_sql
from app.validators.sql_validator import validate_sql


class SelectedScopeTests(unittest.TestCase):
    def test_save_selected_sources_rejects_empty_scope(self):
        with patch.object(metadata_service.redis_cache, "set_selected_sources"), patch.object(
            metadata_service.redis_cache, "clear_metadata"
        ):
            with self.assertRaisesRegex(ValueError, "Select at least one table"):
                metadata_service.save_selected_sources(SelectedSourcesRequest(selected_sources=[]))

    def test_save_selected_sources_deduplicates_tables(self):
        saved = {}

        with patch.object(
            metadata_service.redis_cache,
            "set_selected_sources",
            lambda value: saved.update(value=value),
        ), patch.object(metadata_service.redis_cache, "clear_metadata", lambda: None):
            result = metadata_service.save_selected_sources(
                SelectedSourcesRequest(
                    selected_sources=[
                        SelectedSource(catalog="mysql", schema="complaint_db", tables=["complaints", "complaints"])
                    ]
                )
            )

        self.assertEqual(result[0].tables, ["complaints"])
        self.assertIn("complaint_db", saved["value"])

    def test_build_selected_schema_context_describes_only_selected_tables(self):
        executed = []

        class FakeCursor:
            def execute(self, sql):
                executed.append(sql)

            def fetchall(self):
                return [("id", "integer", "NO"), ("body", "varchar", "YES")]

        class FakeConnection:
            def cursor(self):
                return FakeCursor()

        with patch.object(
            metadata_service,
            "_active_connection_request",
            lambda db: TrinoConnectionRequest(host="localhost", port=8080, username="trino"),
        ), patch.object(
            metadata_service.trino_service,
            "get_trino_connection",
            lambda req: FakeConnection(),
        ), patch.object(metadata_service.redis_cache, "set_metadata", lambda value: None):
            selected = [SelectedSource(catalog="mysql", schema="complaint_db", tables=["complaints"])]
            context = metadata_service.buildSelectedSchemaContext(db=None, selected_sources=selected)

        self.assertEqual(len(context.tables), 1)
        self.assertEqual(context.tables[0].qualified_name, "mysql.complaint_db.complaints")
        self.assertEqual(executed, ['DESCRIBE "mysql"."complaint_db"."complaints"'])

    def test_sql_validator_blocks_unselected_tables(self):
        schema = {
            "tables": [
                {
                    "catalog": "mysql",
                    "schema_name": "complaint_db",
                    "table_name": "complaints",
                    "columns": [{"name": "id", "data_type": "integer", "is_nullable": False}],
                }
            ]
        }

        result = asyncio.run(validate_sql("SELECT * FROM mysql.complaint_db.conversation_logs", schema))

        self.assertFalse(result["valid"])
        self.assertIn("selected data sources", result["errors"][0])

    def test_sql_validator_requires_fully_qualified_table_names(self):
        schema = {
            "tables": [
                {
                    "catalog": "mysql",
                    "schema_name": "complaint_db",
                    "table_name": "complaints",
                    "columns": [{"name": "id", "data_type": "integer", "is_nullable": False}],
                }
            ]
        }

        result = asyncio.run(validate_sql("SELECT * FROM complaints", schema))

        self.assertFalse(result["valid"])
        self.assertIn("fully qualified", result["errors"][0])

    def test_sql_validator_allows_information_schema_columns(self):
        schema = {
            "tables": [
                {
                    "catalog": "postgres",
                    "schema_name": "public",
                    "table_name": "flight_operations",
                    "columns": [],
                }
            ]
        }

        sql = """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_catalog = 'mysql'
          AND table_schema = 'trino_my'
          AND table_name = 'airport_data'
        ORDER BY ordinal_position
        """
        result = asyncio.run(validate_sql(sql, schema))

        self.assertTrue(result["valid"], result["errors"])

    def test_sql_validator_allows_information_schema_tables(self):
        schema = {
            "tables": [
                {
                    "catalog": "postgres",
                    "schema_name": "public",
                    "table_name": "flight_operations",
                    "columns": [],
                }
            ]
        }

        result = asyncio.run(
            validate_sql(
                "SELECT table_catalog, table_schema, table_name FROM mysql.information_schema.tables",
                schema,
            )
        )

        self.assertTrue(result["valid"], result["errors"])

    def test_sql_validator_allows_fully_qualified_business_table(self):
        schema = {
            "tables": [
                {
                    "catalog": "postgres",
                    "schema_name": "public",
                    "table_name": "flight_operations",
                    "columns": [{"name": "id", "data_type": "integer", "is_nullable": False}],
                }
            ]
        }

        result = asyncio.run(validate_sql("SELECT * FROM postgres.public.flight_operations", schema))

        self.assertTrue(result["valid"], result["errors"])

    def test_sql_validator_allows_show_and_describe_metadata_statements(self):
        for sql in ["SHOW TABLES", "SHOW SCHEMAS", 'DESCRIBE "postgres"."public"."flight_operations"']:
            result = asyncio.run(validate_sql(sql, {"tables": []}))
            self.assertTrue(result["valid"], result["errors"])

    def test_sql_validator_keeps_write_operations_blocked(self):
        for sql in [
            "DROP TABLE postgres.public.flight_operations",
            "DELETE FROM postgres.public.flight_operations",
            "UPDATE postgres.public.flight_operations SET id = 1",
            "INSERT INTO postgres.public.flight_operations VALUES (1)",
        ]:
            result = asyncio.run(validate_sql(sql, {"tables": []}))
            self.assertFalse(result["valid"], sql)

    def test_information_schema_sql_is_qualified_for_trino_execution(self):
        sql = """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_catalog = 'mysql'
          AND table_schema = 'trino_my'
          AND table_name = 'airport_data'
        ORDER BY ordinal_position
        """

        fixed = qualify_information_schema_with_catalog_filter(sql)

        self.assertIn('FROM "mysql".information_schema.columns', fixed)

    def test_sql_repair_preserves_metadata_sql_shape(self):
        sql = """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_catalog = 'mysql'
          AND table_schema = 'trino_my'
          AND table_name = 'airport_data'
        """

        repaired = asyncio.run(
            repair_sql(
                question="explore columns",
                failed_sql=sql,
                error_message="Catalog must be specified when session catalog is not set",
            )
        )

        self.assertIn('FROM "mysql".information_schema.columns', repaired["sql"])
        self.assertNotIn("repaired_query", repaired["sql"])


if __name__ == "__main__":
    unittest.main()
