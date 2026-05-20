import os
import asyncio
import logging
from typing import List, Dict, Any

import trino

from app.db.database import SessionLocal
from app.models.connection import TrinoConnectionRequest
from app.services import connection_store, trino_service

logger = logging.getLogger(__name__)


class StarburstExecutor:

    def __init__(self):
        self.mock_mode = (
            str(os.getenv("MOCK_EXECUTION", "false")).lower() == "true"
        )

        if self.mock_mode:
            logger.info("Running in MOCK mode")
            self.connection = None
            return

        self.connection = self._connect()

        logger.info("Connected to Trino successfully")

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
                logger.info(
                    "Executing through active Trino endpoint %s:%s",
                    active_conn.host,
                    active_conn.port,
                )
                return trino_service.get_trino_connection(conn_req)
        finally:
            db.close()

        trino_host = os.getenv("TRINO_HOST", "localhost")
        trino_port = int(os.getenv("TRINO_PORT", 8081))
        connect_kwargs = {
            "host": trino_host,
            "port": trino_port,
            "user": os.getenv("TRINO_USER", "admin"),
        }
        if os.getenv("TRINO_DEFAULT_CATALOG") or os.getenv("TRINO_CATALOG"):
            connect_kwargs["catalog"] = os.getenv("TRINO_DEFAULT_CATALOG") or os.getenv("TRINO_CATALOG")
        if os.getenv("TRINO_DEFAULT_SCHEMA") or os.getenv("TRINO_SCHEMA"):
            connect_kwargs["schema"] = os.getenv("TRINO_DEFAULT_SCHEMA") or os.getenv("TRINO_SCHEMA")

        print("TRINO HOST:", trino_host)
        print("TRINO PORT:", trino_port)
        return trino.dbapi.connect(**connect_kwargs)

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

        try:
            cursor = self.connection.cursor()
            cursor.execute(sql)

            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]

            results = [
                dict(zip(columns, row))
                for row in rows
            ]

            logger.info("Returned %s rows", len(results))
            return results

        except Exception as e:
            logger.exception("Trino execution failed")
            raise RuntimeError(str(e))
