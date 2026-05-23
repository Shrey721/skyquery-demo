import os
import asyncio
import logging
from typing import List, Dict, Any

import trino

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.connection import TrinoConnectionRequest
from app.services import connection_store, trino_service

logger = logging.getLogger(__name__)


class StarburstExecutor:

    def __init__(self):
        self.connection_info: Dict[str, Any] | None = None
        self.mock_mode = settings.MOCK_EXECUTION
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

        if self.mock_mode:
            logger.info("Running in MOCK mode")
            self.connection = None
            return

        self.connection = None

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
        }
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

    async def execute(self, sql: str) -> List[Dict[str, Any]]:

        # Clean SQL before sending to Trino
        sql = sql.strip().rstrip(";").strip()

        logger.info("Executing cleaned SQL: %s", sql)
        print("EXECUTING CLEANED SQL:", sql)

        if self.mock_mode:
            await asyncio.sleep(0.1)

            return [
                {
                    "delayed_flights": 342,
                    "mock": True
                }
            ]

        cursor = None
        for attempt in range(2):
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
                    "Returned %s rows | query_id=%s | connection_info=%s",
                    len(results),
                    trino_service.cursor_query_id(cursor),
                    self.connection_info,
                )
                return results

            except trino.exceptions.TrinoConnectionError as e:
                query_id = trino_service.cursor_query_id(cursor)
                logger.warning(
                    "Trino coordinator transport failure | attempt=%s | query_id=%s | connection_info=%s | error=%s",
                    attempt + 1,
                    query_id,
                    self.connection_info,
                    e,
                )
                self._reset_connection()
                if attempt == 0:
                    logger.info("Retrying Trino execution with a fresh connection")
                    continue
                raise RuntimeError(str(e))

            except Exception as e:
                query_id = trino_service.cursor_query_id(cursor)
                logger.exception(
                    "Trino execution failed | query_id=%s | connection_info=%s | error=%s",
                    query_id,
                    self.connection_info,
                    e,
                )
                raise RuntimeError(str(e))
