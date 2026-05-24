from numbers import Number
from typing import Any, Dict, List


CATALOG_FIELDS = ("catalog_name", "table_catalog", "catalog")
SCHEMA_FIELDS = ("schema_name", "table_schema", "schema")
TABLE_FIELDS = ("table_name", "table")
COLUMN_FIELDS = ("column_name", "column")
TYPE_FIELDS = ("data_type", "type")
COUNT_FIELDS = ("table_count", "result_count", "count")
METADATA_RENDER_COLUMNS = {
    "table_count",
    "table_name",
    "table_schema",
    "table_catalog",
    "schema_name",
    "catalog_name",
    "column_name",
    "data_type",
}


def _first_present(row: Dict[str, Any], fields: tuple[str, ...]) -> Any:
    lower_lookup = {str(key).lower(): key for key in row.keys()}
    for field in fields:
        original_key = lower_lookup.get(field)
        if original_key is not None:
            return row.get(original_key)
    return None


def _unique(values: List[Any]) -> List[Any]:
    seen = set()
    result = []
    for value in values:
        if value is None:
            continue
        key = str(value)
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def build_metadata_context(rows: List[Dict[str, Any]], columns: List[str]) -> Dict[str, Any]:
    catalogs = _unique([_first_present(row, CATALOG_FIELDS) for row in rows])
    schemas = _unique([_first_present(row, SCHEMA_FIELDS) for row in rows])
    tables = _unique([_first_present(row, TABLE_FIELDS) for row in rows])
    column_items = []

    for row in rows:
        column_name = _first_present(row, COLUMN_FIELDS)
        if column_name is None:
            continue
        column_items.append(
            {
                "name": column_name,
                "data_type": _first_present(row, TYPE_FIELDS),
                "table": _first_present(row, TABLE_FIELDS),
                "schema": _first_present(row, SCHEMA_FIELDS),
                "catalog": _first_present(row, CATALOG_FIELDS),
            }
        )

    stats = {}
    for row in rows:
        for column in columns:
            normalized = str(column).lower()
            value = row.get(column)
            if normalized in COUNT_FIELDS and isinstance(value, Number) and not isinstance(value, bool):
                stats[column] = value

    hierarchy: Dict[str, Any] = {}
    for row in rows:
        catalog = _first_present(row, CATALOG_FIELDS)
        schema = _first_present(row, SCHEMA_FIELDS)
        table = _first_present(row, TABLE_FIELDS)
        column = _first_present(row, COLUMN_FIELDS)
        data_type = _first_present(row, TYPE_FIELDS)

        catalog_key = str(catalog) if catalog is not None else "default"
        schema_key = str(schema) if schema is not None else "default"
        if catalog is None and schema is None and table is None:
            continue

        catalog_node = hierarchy.setdefault(catalog_key, {"schemas": {}})
        schema_node = catalog_node["schemas"].setdefault(schema_key, {"tables": {}})
        if table is not None:
            table_node = schema_node["tables"].setdefault(str(table), {"columns": []})
            if column is not None:
                table_node["columns"].append({"name": column, "data_type": data_type})

    return {
        "catalogs": catalogs,
        "schemas": schemas,
        "tables": tables,
        "columns": column_items,
        "stats": stats,
        "hierarchy": hierarchy,
    }


def build_metadata_followups(context: Dict[str, Any], result_columns: List[str]) -> List[str]:
    followups = []

    if context.get("tables"):
        followups.extend(["Explore columns", "Preview rows", "Describe table structure"])
    if context.get("schemas"):
        followups.append("Inspect schemas")
    if context.get("catalogs"):
        followups.append("Explore connected sources")
    if not followups:
        followups.extend(["List available tables", "Inspect schemas", "Explore connected sources"])

    return _unique(followups)[:5]


def build_rendering_config(
    result_intent: Dict[str, Any],
    rows: List[Dict[str, Any]],
    columns: List[str],
    chart_suggestion: str,
    visualization: str,
) -> Dict[str, Any]:
    category = result_intent.get("category") if isinstance(result_intent, dict) else result_intent
    normalized_columns = {str(column).lower() for column in columns}
    is_metadata = category == "metadata" or bool(normalized_columns.intersection(METADATA_RENDER_COLUMNS))

    if is_metadata:
        metadata_context = build_metadata_context(rows, columns)
        followups = build_metadata_followups(metadata_context, columns)
        title = "Schema discovery results"
        if metadata_context.get("catalogs"):
            title = "Connected data source metadata"
        elif metadata_context.get("tables") or metadata_context.get("schemas"):
            title = "Catalog exploration results"

        # Metadata rendering differs from analytical rendering because these
        # rows describe data structures. Charts/maps can imply distributions or
        # causal patterns that are not present in catalog metadata.
        return {
            "mode": "metadata",
            "header": "Schema discovery results",
            "title": title,
            "possible_reason": "This result was generated from connected catalog/schema metadata.",
            "summary_style": "catalog",
            "default_tab": "table" if visualization != "stat" else "overview",
            "primary_view": visualization,
            "allowed_visualizations": ["stat", "table", "list", "hierarchy"],
            "suppressed_visualizations": ["bar", "line", "scatter", "geo", "heatmap"],
            "chart_default_active": False,
            "followups": followups,
            "followup_chips": followups,
            "suggested_followup": "List available tables, inspect columns, or preview sample rows.",
            "insight_cards": [
                {
                    "title": "Catalog metadata",
                    "body": "This result describes available data structures returned by the query.",
                },
                {
                    "title": "Next exploration step",
                    "body": "List available tables, inspect columns, or preview sample rows.",
                },
            ],
            "template_source": "metadata_result_rendering",
            "metadata_context": metadata_context,
        }

    # Analytical responses keep the existing chart-friendly behavior. The
    # chart suggestion is still guarded by result_shaper so charts only appear
    # for data with a usable dimension plus numeric measure.
    return {
        "mode": category or "analytics",
        "header": "Analysis of the returned dataset.",
        "title": "Analytical results",
        "possible_reason": "",
        "summary_style": "analytics",
        "default_tab": "chart" if chart_suggestion != "table" else "table",
        "primary_view": visualization,
        "allowed_visualizations": ["table", "bar", "line", "scatter", "geo", "heatmap"],
        "suppressed_visualizations": [],
        "chart_default_active": chart_suggestion != "table",
        "followups": [],
        "followup_chips": [],
        "suggested_followup": "",
        "insight_cards": [],
        "template_source": "analytics_result_rendering",
        "metadata_context": {},
    }
