import os
import asyncio
import logging
from typing import List, Dict, Any

import trino
from trino.auth import BasicAuthentication

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.connection import TrinoConnectionRequest
from app.services import connection_store, trino_service
from app.services.execution_errors import is_connector_connection_failure

logger = logging.getLogger(__name__)

class TransientConnectorExecutionError(RuntimeError):
    """Signals a connector failure after transient execution retries are exhausted."""


class StarburstExecutor:

    def __init__(self):
        self.connection_info: Dict[str, Any] | None = None
        self.mock_mode = False
        logger.info(
            "Trino executor startup config | cwd=%s | database_url=%s | TRINO_HOST=%s | TRINO_PORT=%s | TRINO_USER=%s | TRINO_CATALOG=%s | TRINO_SCHEMA=%s | mock_mode=%s",
            os.getcwd(),
            settings.DATABASE_URL,
            settings.TRINO_HOST,
            settings.TRINO_PORT,
            settings.TRINO_USER,
            settings.TRINO_DEFAULT_CATALOG,
            settings.TRINO_DEFAULT_SCHEMA,
            self.mock_mode,
        )

        self.connection = None
        self.last_execute_retried = False

    def _connect(self):
        db = SessionLocal()
        try:
            active_conn = connection_store.get_active_connection(db)
            if active_conn:
                conn_req = TrinoConnectionRequest(
                    host=active_conn.host,
                    port=active_conn.port,
                    default_catalog=active_conn.default_catalog,
                    default_schema=active_conn.default_schema,
                    username=active_conn.username,
                    password=connection_store.decrypt_password(active_conn.encrypted_password),
                    ssl=active_conn.ssl_enabled,
                )
                self.connection_info = trino_service.connection_debug_info(conn_req, source="active_saved_connection")
                logger.info(
                    "Using active saved Trino connection | final_endpoint=%s://%s:%s | user=%s | active_catalog=%s | active_schema=%s",
                    self.connection_info["http_scheme"],
                    self.connection_info["host"],
                    self.connection_info["port"],
                    self.connection_info["user"],
                    self.connection_info["catalog"],
                    self.connection_info["schema"],
                )
                return trino_service.get_trino_connection(conn_req)
        finally:
            db.close()

        trino_host = settings.TRINO_HOST
        trino_port = settings.TRINO_PORT
        connect_kwargs = {
            "host": trino_host,
            "port": trino_port,
            "user": settings.TRINO_USER,
            "http_scheme": settings.TRINO_HTTP_SCHEME,
            "verify": settings.TRINO_VERIFY_SSL,
        }
        if settings.TRINO_PASSWORD:
            connect_kwargs["auth"] = BasicAuthentication(settings.TRINO_USER, settings.TRINO_PASSWORD)
        if settings.TRINO_DEFAULT_CATALOG:
            connect_kwargs["catalog"] = settings.TRINO_DEFAULT_CATALOG
        if settings.TRINO_DEFAULT_SCHEMA:
            connect_kwargs["schema"] = settings.TRINO_DEFAULT_SCHEMA

        self.connection_info = {
            "source": "environment_fallback",
            "host": trino_host,
            "port": trino_port,
            "user": connect_kwargs["user"],
            "catalog": connect_kwargs.get("catalog", ""),
            "schema": connect_kwargs.get("schema", ""),
            "http_scheme": connect_kwargs["http_scheme"],
            "ssl_enabled": connect_kwargs["http_scheme"] == "https",
        }
        logger.info(
            "Using environment Trino connection | final_endpoint=%s://%s:%s | user=%s | active_catalog=%s | active_schema=%s",
            self.connection_info["http_scheme"],
            self.connection_info["host"],
            self.connection_info["port"],
            self.connection_info["user"],
            self.connection_info["catalog"],
            self.connection_info["schema"],
        )
        return trino.dbapi.connect(**connect_kwargs)

    def _reset_connection(self):
        if self.connection is not None:
            try:
                self.connection.close()
            except Exception:
                logger.debug("Ignoring error while closing stale Trino connection", exc_info=True)
        self.connection = None

    @staticmethod
    def _is_transient_connector_error(error: Exception) -> bool:
        return isinstance(error, trino.exceptions.TrinoConnectionError) or is_connector_connection_failure(error)

    async def execute(self, sql: str) -> List[Dict[str, Any]]:
        self.last_execute_retried = False

        # Clean SQL before sending to Trino
        sql = sql.strip().rstrip(";").strip()

        total_attempts = settings.TRINO_QUERY_MAX_RETRIES + 1
        for attempt in range(1, total_attempts + 1):
            cursor = None
            logger.info(
                "Trino query execution | attempt=%s/%s | sanitized_sql=%s",
                attempt,
                total_attempts,
                sql,
            )
            try:
                if self.connection is None:
                    self.connection = self._connect()
                    logger.info("Connected to Trino successfully | connection_info=%s", self.connection_info)

                cursor = self.connection.cursor()
                cursor.execute(sql)

                rows = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]

                results = [
                    dict(zip(columns, row))
                    for row in rows
                ]

                logger.info(
                    "Trino query success | attempt=%s/%s | returned_rows=%s | query_id=%s | connection_info=%s",
                    attempt,
                    total_attempts,
                    len(results),
                    trino_service.cursor_query_id(cursor),
                    self.connection_info,
                )
                return results

            except Exception as e:
                query_id = trino_service.cursor_query_id(cursor)
                transient = self._is_transient_connector_error(e)
                has_retry = transient and attempt < total_attempts
                error_category = "connector_connection_failed" if transient else "query_execution_error"

                logger.warning(
                    "Trino query failure | attempt=%s/%s | sanitized_sql=%s | error_category=%s | retrying=%s | query_id=%s | connection_info=%s | error=%s",
                    attempt,
                    total_attempts,
                    sql,
                    error_category,
                    has_retry,
                    query_id,
                    self.connection_info,
                    e,
                )

                if not transient:
                    raise RuntimeError(str(e)) from e

                self._reset_connection()
                if has_retry:
                    self.last_execute_retried = True
                    delay = settings.TRINO_QUERY_RETRY_DELAY_SECONDS
                    logger.info(
                        "Retrying transient Trino connector failure | next_attempt=%s/%s | delay_seconds=%s | sanitized_sql=%s",
                        attempt + 1,
                        total_attempts,
                        delay,
                        sql,
                    )
                    if delay > 0:
                        await asyncio.sleep(delay)
                    continue

                raise TransientConnectorExecutionError(
                    f"connector_connection_failed: {e}"
                ) from e
