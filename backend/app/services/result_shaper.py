from numbers import Number
from typing import Any, Dict, List

from app.services.metadata_rendering import build_rendering_config
from app.services.query_result_intent import classify_result_intent


def _is_numeric(value: Any) -> bool:
    return isinstance(value, Number) and not isinstance(value, bool)


def _has_meaningful_chart_shape(rows: List[Dict[str, Any]], columns: List[str]) -> bool:
    if not rows or len(columns) < 2:
        return False

    numeric_columns = [
        column
        for column in columns
        if any(_is_numeric(row.get(column)) for row in rows)
    ]
    dimension_columns = [
        column
        for column in columns
        if any(row.get(column) is not None and not _is_numeric(row.get(column)) for row in rows)
    ]

    return bool(numeric_columns and dimension_columns)


def shape_result(
    rows: List[Dict[str, Any]],
    question: str | None = None,
    sql: str | None = None,
    intent: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    rows = rows or []

    columns = list(rows[0].keys()) if rows else []

    preview_rows = rows[:100]
    limited_rows = rows[:10000]

    result_intent = classify_result_intent(
        question=question,
        sql=sql,
        rows=rows,
        columns=columns,
        initial_intent=intent,
    )

    chart_suggestion = "table"
    visualization = "table"

    if result_intent["category"] == "metadata":
        # Metadata-only outputs represent catalogs/schemas/tables, so chart
        # recommendations are suppressed and the UI is steered to stat/table
        # rendering. This avoids turning schema rows into fake analytics.
        visualization = result_intent.get("preferred_layout", "table")
    elif result_intent["category"] in {"empty", "error", "preview"}:
        visualization = "table"
    elif len(columns) == 2 and _has_meaningful_chart_shape(rows, columns):
        chart_suggestion = "bar"
        visualization = "chart"

    rendering = build_rendering_config(
        result_intent=result_intent,
        rows=limited_rows,
        columns=columns,
        chart_suggestion=chart_suggestion,
        visualization=visualization,
    )

    return {
        "columns": columns,
        "row_count": len(rows),
        "rows": limited_rows,
        "preview_rows": preview_rows,
        "chart_suggestion": chart_suggestion,
        "visualization": visualization,
        "result_intent": result_intent,
        "rendering": rendering,
    }


def shape_results(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    return shape_result(rows)
