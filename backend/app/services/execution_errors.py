import re
from typing import Any, Dict


CONNECTOR_CONNECTION_PATTERNS = (
    "jdbc_error",
    "connection attempt failed",
    "connection refused",
    "could not connect",
    "failed to establish",
    "connection timed out",
    "timeout while connecting",
    "temporarily unavailable",
)


def detect_catalog_from_sql(sql: str | None) -> str | None:
    if not sql:
        return None

    match = re.search(
        r"\b(?:FROM|JOIN)\s+((?:\"[^\"]+\"|[A-Za-z0-9_$-]+))\.",
        sql,
        re.IGNORECASE,
    )
    if not match:
        return None
    return match.group(1).strip('"')


def is_connector_connection_failure(error: Any) -> bool:
    message = str(error or "").lower()
    return any(pattern in message for pattern in CONNECTOR_CONNECTION_PATTERNS)


def build_connector_error_response(
    sql: str,
    error: Any,
    catalog: str | None = None,
    validation: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    source = catalog or detect_catalog_from_sql(sql)
    source_label = source or "connected"
    user_message = (
        "The SQL was generated correctly, but SkyQuery could not reach the "
        f"{source_label} data source. Please check the Postgres/Trino connector and try again."
    )

    return {
        "error": True,
        "error_type": "connector_connection_failed",
        "source": source,
        "catalog": source,
        "user_message": user_message,
        "generated_sql": sql,
        "sql": sql,
        "validation": validation or {"valid": True, "is_valid": True, "errors": []},
        "execution": {
            "rows": [],
            "preview": [],
            "columns": [],
            "chart_suggestion": "table",
            "visualization": "table",
            "rendering": {
                "mode": "error",
                "header": "Connector unavailable",
                "default_tab": "sql",
                "chart_default_active": False,
            },
        },
        "summary": user_message,
        "metadata": {
            "error_type": "connector_connection_failed",
            "source": source,
            "raw_error": str(error),
        },
        "rendering": {
            "mode": "error",
            "header": "Connector unavailable",
            "default_tab": "sql",
            "chart_default_active": False,
        },
    }
