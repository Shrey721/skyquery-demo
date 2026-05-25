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

    def test_scoped_connection_discovers_only_active_catalog_and_schema(self):
        executed = []

        class FakeCursor:
            def execute(self, sql):
                executed.append(sql)

            def fetchall(self):
                return [("alpha",), ("beta",)]

        class FakeConnection:
            def cursor(self):
                return FakeCursor()

        with patch.object(
            metadata_service,
            "_active_connection_request",
            lambda db: TrinoConnectionRequest(
                host="localhost",
                port=8080,
                username="trino",
                catalog="cat_a",
                schema="sch_x",
            ),
        ), patch.object(
            metadata_service.trino_service,
            "get_trino_connection",
            lambda req: FakeConnection(),
        ):
            result = metadata_service.discover_sources(db=None)

        self.assertEqual([source.catalog for source in result.sources], ["cat_a"])
        self.assertEqual([schema.schema for schema in result.sources[0].schemas], ["sch_x"])
        self.assertEqual(result.sources[0].schemas[0].tables, ["alpha", "beta"])
        self.assertEqual(executed, ['SHOW TABLES FROM "cat_a"."sch_x"'])

    def test_unscoped_connection_can_browse_sources_for_initial_selection(self):
        executed = []

        class FakeCursor:
            def execute(self, sql):
                executed.append(sql)

            def fetchall(self):
                if executed[-1] == "SHOW CATALOGS":
                    return [("cat_a",), ("cat_b",)]
                if executed[-1] == 'SHOW SCHEMAS FROM "cat_a"':
                    return [("sch_x",)]
                if executed[-1] == 'SHOW SCHEMAS FROM "cat_b"':
                    return [("sch_y",)]
                return [("table_one",)]

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
        ):
            result = metadata_service.discover_sources(db=None)

        self.assertEqual([source.catalog for source in result.sources], ["cat_a", "cat_b"])
        self.assertIn("SHOW CATALOGS", executed)
        self.assertIn('SHOW SCHEMAS FROM "cat_a"', executed)
        self.assertIn('SHOW SCHEMAS FROM "cat_b"', executed)

    def test_saved_source_selection_cannot_escape_active_connection_scope(self):
        with patch.object(
            metadata_service,
            "_active_connection_request",
            lambda db: TrinoConnectionRequest(
                host="localhost",
                port=8080,
                username="trino",
                catalog="cat_a",
                schema="sch_x",
            ),
        ):
            with self.assertRaisesRegex(ValueError, "outside the active connection scope"):
                metadata_service.save_selected_sources(
                    SelectedSourcesRequest(
                        selected_sources=[
                            SelectedSource(catalog="cat_b", schema="sch_y", tables=["hidden_table"])
                        ]
                    ),
                    db=object(),
                )

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

    def test_context_build_rejects_stale_source_outside_active_scope(self):
        with patch.object(
            metadata_service,
            "_active_connection_request",
            lambda db: TrinoConnectionRequest(
                host="localhost",
                port=8080,
                username="trino",
                catalog="cat_a",
                schema="sch_x",
            ),
        ):
            with self.assertRaisesRegex(ValueError, "outside the active connection scope"):
                metadata_service.buildSelectedSchemaContext(
                    db=None,
                    selected_sources=[
                        SelectedSource(catalog="cat_b", schema="sch_y", tables=["hidden_table"])
                    ],
                )

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
        self.assertIn("active selected data scope", result["errors"][0])

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
