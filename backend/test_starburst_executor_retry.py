import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.config import settings
from app.executors.starburst_executor import StarburstExecutor, TransientConnectorExecutionError
from app.services.execution_errors import build_connector_error_response, is_connector_connection_failure


class FakeCursor:
    def __init__(self, outcomes):
        self._outcomes = outcomes
        self.description = [("value",)]

    def execute(self, sql):
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome

    def fetchall(self):
        return [(1,)]


class FakeConnection:
    def __init__(self, outcomes):
        self._outcomes = outcomes

    def cursor(self):
        return FakeCursor(self._outcomes)

    def close(self):
        return None


def make_executor(outcomes):
    executor = StarburstExecutor.__new__(StarburstExecutor)
    executor.connection_info = {"source": "test"}
    executor.connection = None
    executor.last_execute_retried = False
    executor._connect = lambda: FakeConnection(outcomes)
    return executor


class StarburstExecutorRetryTests(unittest.TestCase):
    def test_retries_transient_connector_failure_then_returns_real_rows(self):
        outcomes = [
            RuntimeError('TrinoExternalError(name=JDBC_ERROR, message="The connection attempt failed.")'),
            "success",
        ]
        executor = make_executor(outcomes)

        with patch.object(settings, "TRINO_QUERY_MAX_RETRIES", 2), patch.object(
            settings, "TRINO_QUERY_RETRY_DELAY_SECONDS", 0
        ):
            rows = asyncio.run(executor.execute("SELECT value FROM catalog.schema.table"))

        self.assertEqual(rows, [{"value": 1}])
        self.assertTrue(executor.last_execute_retried)
        self.assertEqual(outcomes, [])

    def test_does_not_retry_non_transient_query_error(self):
        outcomes = [
            RuntimeError("TrinoExternalError(name=JDBC_ERROR, message='Permission denied for table')"),
            "unused",
        ]
        executor = make_executor(outcomes)

        with patch.object(settings, "TRINO_QUERY_MAX_RETRIES", 2), patch.object(
            settings, "TRINO_QUERY_RETRY_DELAY_SECONDS", 0
        ):
            with self.assertRaisesRegex(RuntimeError, "Permission denied"):
                asyncio.run(executor.execute("SELECT valuee FROM catalog.schema.table"))

        self.assertFalse(executor.last_execute_retried)
        self.assertEqual(outcomes, ["unused"])
        self.assertFalse(is_connector_connection_failure("JDBC_ERROR: permission denied for table"))
        self.assertFalse(is_connector_connection_failure("JDBC_ERROR: Column 'valuee' cannot be resolved"))

    def test_exhausted_transient_failure_builds_clean_connector_response(self):
        outcomes = [
            RuntimeError("connector_connection_failed: temporarily unavailable"),
            RuntimeError("connector_connection_failed: temporarily unavailable"),
        ]
        executor = make_executor(outcomes)

        with patch.object(settings, "TRINO_QUERY_MAX_RETRIES", 1), patch.object(
            settings, "TRINO_QUERY_RETRY_DELAY_SECONDS", 0
        ):
            with self.assertRaises(TransientConnectorExecutionError) as caught:
                asyncio.run(executor.execute("SELECT value FROM catalog.schema.table"))

        self.assertTrue(is_connector_connection_failure(caught.exception))
        response = build_connector_error_response(
            "SELECT value FROM catalog.schema.table",
            caught.exception,
        )
        self.assertEqual(
            response["user_message"],
            "The query engine connected, but the underlying data source was temporarily unavailable. "
            "Please retry or check the catalog connection.",
        )


if __name__ == "__main__":
    unittest.main()
