"""Airport-level enterprise enrichment for Discover using selected Trino metadata."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.executors.starburst_executor import StarburstExecutor
from app.services.discover_query_planner import plan_discover_query
from app.services.schema_loader import load_schema
from app.services.trino_service import qualified_name, quote_identifier

logger = logging.getLogger(__name__)

AIRPORT_COLUMNS = ("airport_code", "airport", "iata", "iata_code", "icao", "icao_code", "ident", "airport_name")
METRIC_COLUMNS = (
    "delay", "avg_delay", "delay_minutes", "on_time", "on_time_rate", "cancellation",
    "cancellations", "cancelled", "total_flights", "performance", "performance_score",
    "congestion", "congestion_score", "risk",
)
DISPLAY_METRICS = {
    "avgDelay": ("avg_delay", "delay_minutes", "delay"),
    "onTimeRate": ("on_time_rate", "on_time"),
    "cancellations": ("cancellations", "cancellation", "cancelled"),
    "totalFlights": ("total_flights",),
    "performance": ("performance_score", "performance"),
    "congestion": ("congestion_score", "congestion"),
}
HONESTY_NOTE = "Enterprise enrichment is airport-level unless live flight identifiers match enterprise records."
NO_TABLE_MESSAGE = "No matching enterprise performance table was found in the selected Trino context."
UNAVAILABLE_MESSAGE = "Enterprise data is unavailable. Live public feeds are still available, but delay/performance metrics require Trino."


def _column_names(table: dict[str, Any]) -> list[str]:
    return [str(column.get("name") or "") for column in table.get("columns", []) if column.get("name")]


def _matching_column(columns: list[str], candidates: tuple[str, ...]) -> str | None:
    by_lower = {column.lower(): column for column in columns}
    return next((by_lower[candidate] for candidate in candidates if candidate in by_lower), None)


def select_enterprise_tables(schema: dict[str, Any]) -> list[dict[str, Any]]:
    selected = []
    for table in schema.get("tables", []):
        columns = _column_names(table)
        code_column = _matching_column(columns, AIRPORT_COLUMNS)
        metric_columns = [column for column in columns if column.lower() in METRIC_COLUMNS]
        if code_column and metric_columns:
            selected.append({**table, "code_column": code_column, "metric_columns": metric_columns})
    return selected


def airport_codes(airports: list[dict[str, Any]]) -> list[str]:
    codes: list[str] = []
    for airport in airports:
        for key in ("iataCode", "icaoCode", "ident", "code"):
            code = str(airport.get(key) or "").strip().upper()
            if code and code not in codes:
                codes.append(code)
    return codes


def build_airport_query(table: dict[str, Any], codes: list[str], limit: int = 50) -> str:
    safe_limit = max(1, min(limit, 100))
    selected_columns = [table["code_column"], *table["metric_columns"]]
    rendered_columns = ", ".join(quote_identifier(column) for column in dict.fromkeys(selected_columns))
    rendered_codes = ", ".join(f"'{code.replace(chr(39), chr(39) * 2)}'" for code in codes)
    table_ref = qualified_name(table["catalog"], table["schema_name"], table["table_name"])
    code_ref = quote_identifier(table["code_column"])
    return f"SELECT {rendered_columns} FROM {table_ref} WHERE upper(CAST({code_ref} AS VARCHAR)) IN ({rendered_codes}) LIMIT {safe_limit}"


def _risk_for(row: dict[str, Any]) -> str | None:
    explicit = row.get("risk")
    if explicit not in (None, ""):
        return str(explicit)
    delay = row.get("avg_delay", row.get("delay_minutes", row.get("delay")))
    try:
        minutes = float(delay)
    except (TypeError, ValueError):
        return None
    return "High" if minutes >= 30 else "Medium" if minutes >= 15 else "Low"


def _metric_value(row: dict[str, Any], candidates: tuple[str, ...]) -> Any:
    by_lower = {str(key).lower(): value for key, value in row.items()}
    return next((by_lower[candidate] for candidate in candidates if candidate in by_lower), None)


def _shape_row(row: dict[str, Any], table: dict[str, Any]) -> dict[str, Any]:
    code = str(row.get(table["code_column"]) or "").upper()
    metrics = {name: _metric_value(row, candidates) for name, candidates in DISPLAY_METRICS.items()}
    return {
        "airportCode": code,
        "metrics": {name: value for name, value in metrics.items() if value is not None},
        "risk": _risk_for({str(key).lower(): value for key, value in row.items()}),
        "raw": row,
    }


async def enrich_discover_airports(
    question: str,
    location: str | None,
    airports: list[dict[str, Any]],
    *,
    schema: dict[str, Any] | None = None,
    executor: StarburstExecutor | None = None,
    timeout_seconds: float = 12,
) -> dict[str, Any]:
    plan = plan_discover_query(question, location)
    logger.info("Discover query | original_query=%s | query_plan=%s | resolved_location=%s", question, plan, location)
    if not plan["needsTrino"]:
        return {"queryPlan": plan, "available": False, "sourceTables": [], "rows": [], "matchedAirportsCount": 0}

    selected_schema = schema if schema is not None else load_schema()
    tables = select_enterprise_tables(selected_schema or {})
    codes = airport_codes(airports)
    logger.info("Discover enterprise selection | selected_tables=%s | matched_airport_codes=%s", [table.get("table_name") for table in tables], codes)
    if not tables:
        return {"queryPlan": plan, "available": False, "message": NO_TABLE_MESSAGE, "sourceTables": [], "rows": [], "matchedAirportsCount": 0, "honestyNote": HONESTY_NOTE}
    if not codes:
        return {"queryPlan": plan, "available": True, "message": "No nearby airport codes were available for enterprise matching.", "sourceTables": [], "rows": [], "matchedAirportsCount": 0, "honestyNote": HONESTY_NOTE}

    runner = executor or StarburstExecutor()
    shaped_rows: list[dict[str, Any]] = []
    source_tables: list[str] = []
    try:
        for table in tables[:3]:
            sql = build_airport_query(table, codes)
            source = f"{table['catalog']}.{table['schema_name']}.{table['table_name']}"
            logger.info("Discover enterprise query | source_table=%s | generated_sql=%s", source, sql)
            rows = await asyncio.wait_for(runner.execute(sql), timeout=timeout_seconds)
            source_tables.append(source)
            shaped_rows.extend(_shape_row(row, table) for row in rows)
    except Exception:
        logger.exception("Discover enterprise query failed | original_query=%s | selected_tables=%s", question, source_tables)
        return {"queryPlan": plan, "available": False, "message": UNAVAILABLE_MESSAGE, "sourceTables": source_tables, "rows": [], "matchedAirportsCount": 0, "honestyNote": HONESTY_NOTE}

    matched_codes = {row["airportCode"] for row in shaped_rows if row["airportCode"]}
    logger.info("Discover enterprise result | row_count=%s | matched_airport_codes=%s", len(shaped_rows), sorted(matched_codes))
    return {
        "queryPlan": plan,
        "available": True,
        "sourceTables": source_tables,
        "rows": shaped_rows,
        "matchedAirportsCount": len(matched_codes),
        "honestyNote": HONESTY_NOTE,
    }
