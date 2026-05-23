import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def _format_value(value: Any) -> str:
    if value is None:
        return "null"
    return str(value)


def _metadata_summary(
    question: str,
    row_count: int,
    columns: List[str],
    preview_rows: List[Dict[str, Any]],
    result_intent: Dict[str, Any],
    rendering: Dict[str, Any],
) -> str:
    if not preview_rows:
        return "Schema discovery completed but returned no matching metadata rows."

    if row_count == 1 and len(columns) == 1:
        column = columns[0]
        value = preview_rows[0].get(column)
        return f"Schema discovery returned {column}: {_format_value(value)}."

    visible_columns = ", ".join(columns[:5])
    summary = f"Schema discovery returned {row_count} row(s)"
    if visible_columns:
        summary += f" with metadata fields: {visible_columns}"
    summary += "."

    followups = rendering.get("followups") or result_intent.get("suggested_followups") or []
    if followups:
        summary += " Suggested next steps: " + " ".join(followups[:2])

    return summary


def _preview_summary(question: str, row_count: int, columns: List[str]) -> str:
    visible_columns = ", ".join(columns[:5])
    if visible_columns:
        return f"The query returned {row_count} row(s) for preview/listing with columns: {visible_columns}."
    return f"The query returned {row_count} row(s) for preview/listing."


async def generate_summary(
    question: str,
    sql: str | None = None,
    result: Any = None,
    schema: Dict[str, Any] | None = None,
    history: list | None = None,
    recent_sqls: list | None = None,
    result_preview: list | None = None,
    **kwargs
) -> str:

    result = result if result is not None else kwargs.get("shaped_result")

    if isinstance(result, list):
        row_count = len(result)
        preview_rows = result[:5]
        columns = list(preview_rows[0].keys()) if preview_rows else []
        result_intent = {}
        rendering = {}

    elif isinstance(result, dict):
        row_count = result.get("row_count", 0)
        preview_rows = result_preview or result.get("preview_rows", [])
        columns = result.get("columns", [])
        result_intent = result.get("result_intent", {})
        rendering = result.get("rendering", {})

    else:
        row_count = 0
        preview_rows = []
        columns = []
        result_intent = {}
        rendering = {}

    detected_category = result_intent.get("category")

    # Insight guardrails: summaries must be grounded in returned columns/rows.
    # Metadata results must not be reframed as aviation performance analysis.
    if detected_category == "metadata":
        return _metadata_summary(question, row_count, columns, preview_rows, result_intent, rendering)

    if detected_category == "preview":
        return _preview_summary(question, row_count, columns)

    if detected_category in {"empty", "error"}:
        return f"The query ran successfully but returned {row_count} row(s)."

    if preview_rows:
        return f"The query ran successfully and returned {row_count} row(s) for: {question}"

    return f"The query ran successfully but returned {row_count} row(s)."
