import logging
import re
from typing import Dict, Any

logger = logging.getLogger(__name__)


def sanitize_trino_sql(sql: str) -> str:
    """
    Sanitizes SQL queries to ensure Trino compatibility.
    Specifically, replaces 'column ILIKE value' with 'LOWER(column) LIKE LOWER(value)'
    """
    if not sql:
        return sql
    # Regular expression to match: column_name [NOT] ILIKE 'value'
    # Group 1: column name (including optional table alias like t.column)
    # Group 2: optional 'NOT ' prefix (with single/multiple spaces)
    # Group 3: string literal value (including single quotes)
    pattern = r"(\b[a-zA-Z_][a-zA-Z0-9_\.]*)\s+(not\s+)?ilike\s+('[^']*')"
    
    # We replace with LOWER(column) [NOT] LIKE LOWER(value)
    sanitized = re.sub(pattern, r"LOWER(\1) \2LIKE LOWER(\3)", sql, flags=re.IGNORECASE)
    return sanitized


async def repair_sql(
    question: str,
    failed_sql: str,
    error_message: str,
    schema: Dict[str, Any] | None = None,
    recent_sqls: list | None = None,
    history: list | None = None,
    selected_tables: list | None = None,
    intent: Dict[str, Any] | None = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Simple fallback SQL repair service.
    Handles Trino dialect discrepancies like ILIKE operators.
    """

    logger.warning(
        "Repairing SQL. Error: %s | Failed SQL: %s",
        error_message,
        failed_sql,
    )

    repaired_sql = failed_sql.strip()
    explanation = "Applied fallback SQL repair logic."

    # Check for Trino-unsupported ILIKE operator in failed SQL or in error messages
    if "ilike" in repaired_sql.lower() or "ilike" in error_message.lower():
        repaired_sql = sanitize_trino_sql(repaired_sql)
        explanation = "Detected unsupported ILIKE operator in Trino dialect. Repaired by converting to case-insensitive LOWER() LIKE LOWER()."

    # Check for Trino timestamp duration cast errors
    err_lower = error_message.lower()
    sql_lower = repaired_sql.lower()
    if (
        "cannot cast timestamp" in err_lower
        or "timestamp(6) to double" in err_lower
        or ("cast(" in sql_lower and "as double" in sql_lower and ("time" in sql_lower or "date" in sql_lower))
    ):
        # 1. Match CAST(arrival_time AS DOUBLE) - CAST(departure_time AS DOUBLE)
        def replacer(match):
            col1 = match.group(1).strip()
            col2 = match.group(2).strip()
            start = col2
            end = col1
            col1_lower = col1.lower()
            col2_lower = col2.lower()
            if ("dep" in col1_lower or "start" in col1_lower) and ("arr" in col2_lower or "end" in col2_lower):
                start = col1
                end = col2
            return f"date_diff('minute', {start}, {end})"

        pattern = r"CAST\((.*?)\s+AS\s+DOUBLE\)\s*-\s*CAST\((.*?)\s+AS\s+DOUBLE\)"
        repaired_sql = re.sub(pattern, replacer, repaired_sql, flags=re.IGNORECASE)

        # 2. Match direct column timestamp subtraction like arrival_time - departure_time
        def replace_direct_subtraction(match):
            col1 = match.group(1).strip()
            col2 = match.group(2).strip()
            start = col2
            end = col1
            col1_lower = col1.lower()
            col2_lower = col2.lower()
            if ("dep" in col1_lower or "start" in col1_lower) and ("arr" in col2_lower or "end" in col2_lower):
                start = col1
                end = col2
            return f"date_diff('minute', {start}, {end})"

        time_cols_pattern = r"\b([a-zA-Z_][a-zA-Z0-9_\.]*(?:_time|_date|timestamp))\s*-\s*\b([a-zA-Z_][a-zA-Z0-9_\.]*(?:_time|_date|timestamp))"
        repaired_sql = re.sub(time_cols_pattern, replace_direct_subtraction, repaired_sql, flags=re.IGNORECASE)

        explanation = "Detected unsupported timestamp-to-double cast or subtraction in Trino. Repaired by converting to date_diff('minute', start, end)."

    # Remove dangerous statements if present
    forbidden = [
        "DROP",
        "DELETE",
        "UPDATE",
        "INSERT",
        "ALTER",
        "TRUNCATE",
        "CREATE"
    ]

    upper_sql = repaired_sql.upper()

    for keyword in forbidden:
        if keyword in upper_sql:
            repaired_sql = "SELECT 1 AS blocked_query"
            break

    # Ensure SELECT
    if not repaired_sql.upper().startswith("SELECT"):
        repaired_sql = "SELECT 1 AS repaired_query"

    # Ensure LIMIT
    if "LIMIT" not in repaired_sql.upper():
        repaired_sql = repaired_sql.rstrip().rstrip(";")
        repaired_sql += " LIMIT 100"

    logger.info("Repaired SQL: %s", repaired_sql)

    return {
        "sql": repaired_sql,
        "repair_explanation": explanation
    }