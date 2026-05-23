import logging
import re
from typing import Any, Dict, List

from app.services.result_shaper import shape_result
from app.services.summary_generator import generate_summary

logger = logging.getLogger(__name__)

METADATA_ACTION_TERMS = {
    "catalog",
    "catalogs",
    "column",
    "columns",
    "connected",
    "describe",
    "inspect",
    "preview",
    "schema",
    "schemas",
    "source",
    "sources",
    "structure",
    "table",
    "tables",
}

METADATA_DETAIL_TERMS = {
    "column",
    "columns",
    "describe",
    "field",
    "fields",
    "structure",
}


def _intent_category(intent: Any) -> str | None:
    if isinstance(intent, str):
        return intent
    if isinstance(intent, dict):
        return intent.get("category") or intent.get("label") or intent.get("intent")
    return None


def _is_previous_metadata(context: Dict[str, Any] | None) -> bool:
    if not isinstance(context, dict):
        return False

    candidates = [
        context.get("previous_result_intent"),
        context.get("result_intent"),
        (context.get("previous_response") or {}).get("result_intent"),
        (context.get("previous_response") or {}).get("rendering", {}).get("mode"),
    ]
    return any(_intent_category(candidate) == "metadata" for candidate in candidates)


def _metadata_action_requested(question: str, context: Dict[str, Any] | None) -> bool:
    action_type = (context or {}).get("action_type") or (context or {}).get("action")
    if isinstance(action_type, str) and action_type.startswith("metadata_"):
        return True

    words = {
        part
        for token in question.lower().replace("_", " ").split()
        for part in token.strip(".,!?;:").split("/")
        if part
    }
    return bool(words.intersection(METADATA_ACTION_TERMS))


def should_handle_metadata_followup(question: str, context: Dict[str, Any] | None) -> bool:
    return _is_previous_metadata(context) and _metadata_action_requested(question, context)


def is_metadata_table_detail_request(question: str, context: Dict[str, Any] | None = None) -> bool:
    """Detect generic table-structure requests without assuming any domain table names.

    This lets specific metadata requests execute information_schema SQL even when
    conversation context exists, instead of falling back to a cached schema overview.
    """
    action_type = (context or {}).get("action_type") or (context or {}).get("action")
    if isinstance(action_type, str) and action_type.startswith("metadata_"):
        action_words = set(re.split(r"[_\W]+", action_type.lower()))
        return bool(action_words.intersection(METADATA_DETAIL_TERMS))

    words = {
        part
        for token in question.lower().replace("_", " ").split()
        for part in token.strip(".,!?;:").split("/")
        if part
    }
    return bool(words.intersection(METADATA_DETAIL_TERMS))


def _normalize_tables(schema: Dict[str, Any]) -> List[Dict[str, Any]]:
    tables = schema.get("tables") if isinstance(schema, dict) else []
    if isinstance(tables, list):
        return [table for table in tables if isinstance(table, dict)]

    normalized = []
    catalogs = schema.get("catalogs", {}) if isinstance(schema, dict) else {}
    if isinstance(catalogs, dict):
        for catalog_name, catalog in catalogs.items():
            schemas = (catalog or {}).get("schemas", {})
            if not isinstance(schemas, dict):
                continue
            for schema_name, schema_meta in schemas.items():
                schema_tables = (schema_meta or {}).get("tables", {})
                if not isinstance(schema_tables, dict):
                    continue
                for table_name, table_meta in schema_tables.items():
                    if isinstance(table_meta, dict):
                        normalized.append(
                            {
                                **table_meta,
                                "catalog": table_meta.get("catalog") or catalog_name,
                                "schema_name": table_meta.get("schema_name") or schema_name,
                                "table_name": table_meta.get("table_name") or table_name,
                            }
                        )
    return normalized


def _column_count(table: Dict[str, Any]) -> int:
    columns = table.get("columns") or []
    if isinstance(columns, dict):
        return len(columns)
    if isinstance(columns, list):
        return len(columns)
    return 0


def _column_rows_for_table(table: Dict[str, Any]) -> List[Dict[str, Any]]:
    columns = table.get("columns") or []
    if isinstance(columns, dict):
        columns = [{"name": name, **(meta if isinstance(meta, dict) else {})} for name, meta in columns.items()]

    rows = []
    for column in columns if isinstance(columns, list) else []:
        if isinstance(column, dict):
            rows.append(
                {
                    "table_catalog": table.get("catalog"),
                    "table_schema": table.get("schema_name") or table.get("schema"),
                    "table_name": table.get("table_name") or table.get("name") or table.get("table"),
                    "column_name": column.get("name") or column.get("column_name") or column.get("column"),
                    "data_type": column.get("data_type") or column.get("type"),
                }
            )
    return rows


def _quote_identifier(value: Any) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def _quote_literal(value: Any) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _table_display_name(table: Dict[str, Any]) -> str:
    return ".".join(
        str(part)
        for part in [
            table.get("catalog"),
            table.get("schema_name") or table.get("schema"),
            table.get("table_name") or table.get("name") or table.get("table"),
        ]
        if part
    )


def _normalize_match_text(value: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", "", str(value).lower())
    return text[:-1] if text.endswith("s") else text


def _table_match_score(question: str, table: Dict[str, Any], context: Dict[str, Any] | None) -> float:
    table_name = table.get("table_name") or table.get("name") or table.get("table") or ""
    schema_name = table.get("schema_name") or table.get("schema") or ""
    catalog = table.get("catalog") or ""
    haystack = _normalize_match_text(question)
    candidates = [
        table_name,
        str(table_name).replace("_", " "),
        _table_display_name(table),
        f"{schema_name} {table_name}",
        f"{catalog} {schema_name} {table_name}",
    ]

    selected = (context or {}).get("selected_table") or (context or {}).get("table")
    if selected:
        candidates.insert(0, selected)

    best = 0.0
    for candidate in candidates:
        normalized = _normalize_match_text(candidate)
        if not normalized:
            continue
        if haystack == normalized:
            best = max(best, 1.0)
        elif normalized in haystack:
            best = max(best, 0.92)
        elif haystack in normalized and len(haystack) >= 5:
            best = max(best, 0.72)
        else:
            table_tokens = {
                _normalize_match_text(token)
                for token in re.split(r"[_\W]+", str(candidate).lower())
                if len(token) > 2
            }
            query_tokens = {
                _normalize_match_text(token)
                for token in re.split(r"[_\W]+", question.lower())
                if len(token) > 2
            }
            if table_tokens:
                overlap = len(table_tokens.intersection(query_tokens)) / len(table_tokens)
                best = max(best, overlap * 0.7)
    return best


def resolve_metadata_table_candidates(
    question: str,
    schema: Dict[str, Any],
    context: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    tables = _normalize_tables(schema)
    scored = [
        {**table, "_match_score": _table_match_score(question, table, context)}
        for table in tables
    ]
    matches = [table for table in scored if table["_match_score"] >= 0.65]
    matches.sort(key=lambda table: table["_match_score"], reverse=True)
    if len(matches) > 1 and matches[0]["_match_score"] - matches[1]["_match_score"] >= 0.2:
        return [matches[0]]
    return matches[:5]


def build_table_columns_sql(table: Dict[str, Any]) -> str:
    catalog = table.get("catalog")
    schema_name = table.get("schema_name") or table.get("schema")
    table_name = table.get("table_name") or table.get("name") or table.get("table")

    if catalog and schema_name and table_name:
        return (
            "SELECT column_name, data_type, is_nullable "
            f"FROM {_quote_identifier(catalog)}.information_schema.columns "
            f"WHERE table_schema = {_quote_literal(schema_name)} "
            f"AND table_name = {_quote_literal(table_name)} "
            "ORDER BY ordinal_position"
        )

    return (
        "SELECT column_name, data_type, is_nullable "
        "FROM information_schema.columns "
        f"WHERE table_name = {_quote_literal(table_name)} "
        "ORDER BY ordinal_position"
    )


def build_metadata_clarification_response(
    question: str,
    schema: Dict[str, Any],
    context: Dict[str, Any] | None,
    matches: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    tables = matches or _normalize_tables(schema)
    clarification_sql = "-- Metadata clarification: choose one discovered table to inspect columns"
    rows = [
        {
            "table_catalog": table.get("catalog"),
            "table_schema": table.get("schema_name") or table.get("schema"),
            "table_name": table.get("table_name") or table.get("name") or table.get("table"),
            "column_count": _column_count(table),
        }
        for table in tables
    ]
    shaped = shape_result(
        rows,
        question=question,
        sql=clarification_sql,
        intent={"intent": "schema_exploration"},
    )
    choices = ", ".join(_table_display_name(table) for table in tables[:5])
    summary = "Which table did you mean?"
    if choices:
        summary += f" Matching discovered tables: {choices}."

    return {
        "intent": {"intent": "schema_exploration", "reason": "Metadata table clarification required."},
        "result_intent": shaped["result_intent"],
        "selected_tables": [],
        "sql": clarification_sql,
        "validation": {"valid": True, "is_valid": True, "errors": []},
        "execution": {
            "rows": shaped["rows"],
            "preview": shaped["preview_rows"],
            "columns": shaped["columns"],
            "chart_suggestion": shaped["chart_suggestion"],
            "visualization": shaped["visualization"],
            "rendering": shaped["rendering"],
        },
        "summary": summary,
        "metadata": {
            "schema_tables": len(_normalize_tables(schema)),
            "mock_mode": False,
            "result_intent": shaped["result_intent"],
            "metadata_context": shaped["rendering"].get("metadata_context", {}),
            "routing_reason": "metadata_table_clarification",
            "selected_metadata_strategy": "clarify_table",
        },
        "rendering": shaped["rendering"],
    }


def _metadata_sql_for_tables(tables: List[Dict[str, Any]], selected_table: Dict[str, Any] | None) -> str:
    target_tables = [selected_table] if selected_table else tables
    by_catalog: Dict[str, set[str]] = {}
    table_names: set[str] = set()

    for table in target_tables:
        catalog = table.get("catalog")
        schema_name = table.get("schema_name") or table.get("schema")
        table_name = table.get("table_name") or table.get("name") or table.get("table")
        if catalog and schema_name:
            by_catalog.setdefault(str(catalog), set()).add(str(schema_name))
        if selected_table and table_name:
            table_names.add(str(table_name))

    if not by_catalog:
        return (
            "SELECT table_catalog, table_schema, table_name, column_name, data_type "
            "FROM information_schema.columns "
            "ORDER BY table_catalog, table_schema, table_name, ordinal_position"
        )

    selects = []
    for catalog, schemas in sorted(by_catalog.items()):
        schema_filter = ", ".join(_quote_literal(schema) for schema in sorted(schemas))
        where_parts = [f"table_schema IN ({schema_filter})"]
        if table_names:
            table_filter = ", ".join(_quote_literal(table) for table in sorted(table_names))
            where_parts.append(f"table_name IN ({table_filter})")
        if selected_table:
            selects.append(
                "SELECT table_catalog, table_schema, table_name, column_name, data_type "
                f"FROM {_quote_identifier(catalog)}.information_schema.columns "
                f"WHERE {' AND '.join(where_parts)}"
            )
        else:
            selects.append(
                "SELECT table_catalog, table_schema, table_name, COUNT(*) AS column_count "
                f"FROM {_quote_identifier(catalog)}.information_schema.columns "
                f"WHERE {' AND '.join(where_parts)} "
                "GROUP BY table_catalog, table_schema, table_name"
            )

    if selected_table:
        return " UNION ALL ".join(selects) + " ORDER BY table_catalog, table_schema, table_name, column_name"
    return " UNION ALL ".join(selects) + " ORDER BY table_catalog, table_schema, table_name"


def _pick_referenced_table(question: str, tables: List[Dict[str, Any]], context: Dict[str, Any] | None) -> Dict[str, Any] | None:
    selected = (context or {}).get("selected_table") or (context or {}).get("table")
    candidates = [selected] if selected else []
    candidates.extend(question.lower().replace('"', "").replace("'", "").split())

    for table in tables:
        table_name = str(table.get("table_name") or table.get("name") or table.get("table") or "").lower()
        qualified = ".".join(
            str(part).lower()
            for part in [table.get("catalog"), table.get("schema_name") or table.get("schema"), table_name]
            if part
        )
        for candidate in candidates:
            if not candidate:
                continue
            candidate_text = str(candidate).lower()
            if candidate_text == table_name or candidate_text == qualified:
                return table
    return None


async def build_metadata_followup_response(
    question: str,
    schema: Dict[str, Any],
    context: Dict[str, Any] | None,
    session_metadata: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    tables = _normalize_tables(schema)
    selected_table = _pick_referenced_table(question, tables, context)

    if selected_table:
        rows = _column_rows_for_table(selected_table)
        strategy = "columns_for_selected_table"
    else:
        rows = [
            {
                "table_catalog": table.get("catalog"),
                "table_schema": table.get("schema_name") or table.get("schema"),
                "table_name": table.get("table_name") or table.get("name") or table.get("table"),
                "column_count": _column_count(table),
            }
            for table in tables
        ]
        strategy = "schema_overview_with_column_counts"

    sql = _metadata_sql_for_tables(tables, selected_table)
    shaped = shape_result(rows, question=question, sql=sql, intent={"intent": "schema_exploration"})
    summary = await generate_summary(question=question, sql=sql, result=shaped, schema=schema)

    logger.info(
        "Metadata follow-up routing | query=%s | previous_result_intent=%s | detected_intent=metadata | reason=metadata_context_followup | selected_metadata_strategy=%s",
        question,
        (context or {}).get("previous_result_intent") or (context or {}).get("result_intent"),
        strategy,
    )
    print(
        "METADATA FOLLOWUP DEBUG:",
        {
            "current_query": question,
            "previous_result_intent": (context or {}).get("previous_result_intent") or (context or {}).get("result_intent"),
            "detected_intent": "metadata",
            "routing_reason": "metadata_context_followup",
            "selected_metadata_strategy": strategy,
        },
    )

    return {
        "intent": {"intent": "schema_exploration", "reason": "Context-aware metadata follow-up."},
        "result_intent": shaped["result_intent"],
        "selected_tables": [],
        "sql": sql,
        "validation": {"valid": True, "is_valid": True, "errors": []},
        "execution": {
            "rows": shaped["rows"],
            "preview": shaped["preview_rows"],
            "columns": shaped["columns"],
            "chart_suggestion": shaped["chart_suggestion"],
            "visualization": shaped["visualization"],
            "rendering": shaped["rendering"],
        },
        "summary": summary,
        "metadata": {
            "schema_tables": len(tables),
            "mock_mode": False,
            "llm_token_received": bool((session_metadata or {}).get("llm_token_received")),
            "result_intent": shaped["result_intent"],
            "metadata_context": shaped["rendering"].get("metadata_context", {}),
            "routing_reason": "metadata_context_followup",
            "selected_metadata_strategy": strategy,
        },
        "rendering": shaped["rendering"],
    }
