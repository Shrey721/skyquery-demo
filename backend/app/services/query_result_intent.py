import re
from numbers import Number
from typing import Any, Dict, Iterable, List


METADATA_COLUMNS = {
    "table_name",
    "table_schema",
    "table_catalog",
    "column_name",
    "data_type",
    "ordinal_position",
    "is_nullable",
    "column_default",
    "schema_name",
    "catalog_name",
    "table_count",
}

METADATA_TERMS = {
    "catalog",
    "catalogs",
    "column",
    "columns",
    "database",
    "databases",
    "data source",
    "data sources",
    "describe",
    "schema",
    "schemas",
    "table",
    "tables",
}

PREVIEW_TERMS = {
    "list",
    "show",
    "preview",
    "sample",
    "records",
    "rows",
}


def _normalise_columns(columns: Iterable[str]) -> set[str]:
    return {str(column).strip().lower() for column in columns if column is not None}


def _sql_uses_metadata(sql: str | None) -> bool:
    if not sql:
        return False

    normalized = re.sub(r"\s+", " ", sql).strip().lower()
    return bool(
        "information_schema" in normalized
        or re.search(r"\bshow\s+(tables|schemas|catalogs|columns)\b", normalized)
        or re.search(r"\bdescribe\b|\bdesc\b", normalized)
    )


def _question_mentions_metadata(question: str | None) -> bool:
    if not question:
        return False

    normalized = question.lower()
    return any(term in normalized for term in METADATA_TERMS)


def _question_requests_preview(question: str | None) -> bool:
    if not question:
        return False

    normalized = question.lower()
    return any(term in normalized for term in PREVIEW_TERMS)


def _single_numeric_value(rows: List[Dict[str, Any]], columns: List[str]) -> bool:
    if len(rows) != 1 or len(columns) != 1:
        return False

    value = rows[0].get(columns[0])
    return isinstance(value, Number) and not isinstance(value, bool)


def classify_result_intent(
    question: str | None = None,
    sql: str | None = None,
    rows: List[Dict[str, Any]] | None = None,
    columns: List[str] | None = None,
    initial_intent: Dict[str, Any] | None = None,
    error: str | None = None,
) -> Dict[str, Any]:
    # Metadata intent is detected from generic structural signals, not fixed
    # questions or known table names: SQL metadata commands, metadata-shaped
    # result columns, and schema/catalog terminology in the user request.
    rows = rows or []
    columns = columns or (list(rows[0].keys()) if rows else [])
    normalized_columns = _normalise_columns(columns)

    if error:
        return {
            "category": "error",
            "label": "error_or_empty",
            "reason": "SQL execution returned an error.",
            "signals": ["execution_error"],
        }

    if not rows:
        return {
            "category": "empty",
            "label": "error_or_empty",
            "reason": "SQL execution returned no rows.",
            "signals": ["empty_result"],
        }

    signals: list[str] = []
    if _sql_uses_metadata(sql):
        signals.append("metadata_sql")

    metadata_column_hits = sorted(normalized_columns.intersection(METADATA_COLUMNS))
    if metadata_column_hits:
        signals.append("metadata_columns:" + ",".join(metadata_column_hits))

    if _question_mentions_metadata(question):
        signals.append("metadata_question_terms")

    initial_label = (initial_intent or {}).get("intent")
    if initial_label == "schema_exploration":
        signals.append("initial_schema_intent")

    if signals:
        layout = "stat" if _single_numeric_value(rows, columns) else "table"
        return {
            "category": "metadata",
            "label": "schema_metadata",
            "reason": "Metadata/schema-discovery signals were found in the SQL, returned columns, or question.",
            "signals": signals,
            "preferred_layout": layout,
            "suggested_followups": [
                "List tables by schema.",
                "Show columns and data types for a table.",
                "Which schemas are available?",
            ],
        }

    if _question_requests_preview(question) and len(rows) > 1:
        return {
            "category": "preview",
            "label": "row_preview",
            "reason": "The question asks to list or preview rows.",
            "signals": ["preview_question_terms"],
            "preferred_layout": "table",
        }

    return {
        "category": "analytics",
        "label": "data_analytics",
        "reason": "No metadata or preview-only signals were found.",
        "signals": ["default_analytics"],
        "preferred_layout": "chart",
    }
