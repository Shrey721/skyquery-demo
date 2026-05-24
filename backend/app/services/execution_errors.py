import re
from typing import Any, Dict


CONNECTOR_CONNECTION_PATTERNS = (
    "jdbc_error",
    "connector_connection_failed",
    "connection attempt failed",
    "connection refused",
    "could not connect",
    "failed to establish",
    "connection timed out",
    "timeout while connecting",
    "temporarily unavailable",
)

NON_TRANSIENT_QUERY_PATTERNS = (
    "syntax error",
    "syntax_error",
    "mismatched input",
    "table not found",
    "table_not_found",
    "column not found",
    "column_not_found",
    "column cannot be resolved",
    "permission denied",
    "access denied",
    "invalid catalog",
    "invalid schema",
    "catalog does not exist",
    "schema does not exist",
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
    if any(pattern in message for pattern in NON_TRANSIENT_QUERY_PATTERNS):
        return False
    if re.search(
        r"\b(?:table|column|catalog|schema)\b.*\b(?:not found|does not exist|cannot be resolved)\b",
        message,
    ):
        return False
    return any(pattern in message for pattern in CONNECTOR_CONNECTION_PATTERNS)


def build_connector_error_response(
    sql: str,
    error: Any,
    catalog: str | None = None,
    validation: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    source = catalog or detect_catalog_from_sql(sql)
    user_message = (
        "The query engine connected, but the underlying data source was temporarily unavailable. "
        "Please retry or check the catalog connection."
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
