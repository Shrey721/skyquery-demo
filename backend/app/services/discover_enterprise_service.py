"""Airport-level enterprise enrichment for Discover using selected Trino metadata."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.executors.starburst_executor import StarburstExecutor
from app.services.airport_service import airports_by_codes, airports_from_comparison_query
from app.services.discover_query_planner import interpret_enterprise_filter, plan_discover_query
from app.services.schema_loader import load_schema
from app.services.trino_service import qualified_name, quote_identifier

logger = logging.getLogger(__name__)

AIRPORT_COLUMNS = ("airport_code", "airport", "iata", "iata_code", "icao", "icao_code", "ident", "airport_name")
METRIC_COLUMNS = (
    "delay", "avg_delay", "delay_minutes", "on_time", "on_time_rate", "cancellation",
    "cancellations", "cancelled", "total_flights", "performance", "performance_score",
    "congestion", "congestion_score", "risk", "performance_date", "delayed_flights",
    "cancelled_flights", "avg_departure_delay", "avg_arrival_delay", "on_time_percentage",
    "weather_delay_count", "maintenance_delay_count",
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
NO_CRITERIA_MATCH_MESSAGE = "No high-risk airports found in the selected enterprise data."
ENTERPRISE_REQUIRED_MESSAGE = "Enterprise data is unavailable. This query requires Trino performance data."


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


def build_enterprise_candidates_query(table: dict[str, Any], limit: int = 1000) -> str:
    safe_limit = max(1, min(limit, 1000))
    selected_columns = [table["code_column"], *table["metric_columns"]]
    rendered_columns = ", ".join(quote_identifier(column) for column in dict.fromkeys(selected_columns))
    table_ref = qualified_name(table["catalog"], table["schema_name"], table["table_name"])
    return f"SELECT {rendered_columns} FROM {table_ref} LIMIT {safe_limit}"


def select_airport_candidates(summaries: list[dict[str, Any]], enterprise_filter: str, limit: int = 3) -> list[dict[str, Any]]:
    if enterprise_filter == "high_risk":
        candidates = [summary for summary in summaries if summary["risk"] == "High"]
        return sorted(candidates, key=_enterprise_rank_key)[:limit]
    if enterprise_filter == "high_delay":
        candidates = [summary for summary in summaries if summary["averages"]["departureDelay"] is not None]
        return sorted(candidates, key=lambda summary: -summary["averages"]["departureDelay"])[:limit]
    if enterprise_filter == "low_on_time":
        candidates = [summary for summary in summaries if summary["rates"]["onTimePercentage"] is not None]
        return sorted(candidates, key=lambda summary: summary["rates"]["onTimePercentage"])[:limit]
    if enterprise_filter == "high_cancellation":
        candidates = [summary for summary in summaries if summary["totals"]["cancelledFlights"] > 0]
        return sorted(candidates, key=lambda summary: -summary["totals"]["cancelledFlights"])[:limit]
    return []


def _enterprise_rank_key(summary: dict[str, Any]) -> tuple[int, float, float]:
    risk_order = {"High": 0, "Medium": 1, "Low": 2}
    departure_delay = summary["averages"]["departureDelay"]
    return (risk_order.get(summary["risk"], 3), -summary["rates"]["delayRate"], -(departure_delay or 0))


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


def _number(row: dict[str, Any], key: str) -> float:
    try:
        return float(row.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def _optional_average(rows: list[dict[str, Any]], key: str) -> float | None:
    values = [_number(row, key) for row in rows if row.get(key) not in (None, "")]
    return round(sum(values) / len(values), 1) if values else None


def _risk_for_summary(departure_delay: float | None, delay_rate: float, on_time_percentage: float | None) -> str:
    if (departure_delay is not None and departure_delay >= 30) or delay_rate >= 25 or (on_time_percentage is not None and on_time_percentage < 75):
        return "High"
    if (departure_delay is not None and departure_delay >= 15) or delay_rate >= 15 or (on_time_percentage is not None and on_time_percentage < 85):
        return "Medium"
    return "Low"


def _insight_for_summary(code: str, risk: str, departure_delay: float | None, delay_rate: float, on_time_percentage: float | None) -> str:
    reasons = []
    if departure_delay is not None and departure_delay >= 30:
        reasons.append("elevated departure delays")
    if delay_rate >= 25:
        reasons.append("delay rate")
    if on_time_percentage is not None and on_time_percentage < 75:
        reasons.append("low on-time performance")
    if not reasons and ((departure_delay is not None and departure_delay >= 15) or delay_rate >= 15 or (on_time_percentage is not None and on_time_percentage < 85)):
        reasons.append("moderate operational performance pressure")
    if not reasons:
        return f"{code} shows low operational risk across the selected enterprise records."
    return f"{code} shows {risk.lower()} operational risk due to {' and '.join(reasons)}."


def aggregate_airport_summaries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for shaped_row in rows:
        code = shaped_row.get("airportCode")
        if not code:
            continue
        raw = {str(key).lower(): value for key, value in shaped_row.get("raw", {}).items()}
        if not any(key in raw for key in ("performance_date", "delayed_flights", "cancelled_flights", "avg_departure_delay", "avg_arrival_delay", "on_time_percentage")):
            continue
        grouped.setdefault(code, []).append(raw)

    summaries = []
    for code, daily_rows in grouped.items():
        total_flights = sum(_number(row, "total_flights") for row in daily_rows)
        delayed_flights = sum(_number(row, "delayed_flights") for row in daily_rows)
        cancelled_flights = sum(_number(row, "cancelled_flights") for row in daily_rows)
        weather_delays = sum(_number(row, "weather_delay_count") for row in daily_rows)
        maintenance_delays = sum(_number(row, "maintenance_delay_count") for row in daily_rows)
        delay_rate = round(delayed_flights / total_flights * 100, 1) if total_flights else 0
        cancellation_rate = round(cancelled_flights / total_flights * 100, 1) if total_flights else 0
        departure_delay = _optional_average(daily_rows, "avg_departure_delay")
        arrival_delay = _optional_average(daily_rows, "avg_arrival_delay")
        on_time_percentage = _optional_average(daily_rows, "on_time_percentage")
        dates = sorted(str(row["performance_date"]) for row in daily_rows if row.get("performance_date") not in (None, ""))
        risk = _risk_for_summary(departure_delay, delay_rate, on_time_percentage)
        summaries.append(
            {
                "airportCode": code,
                "risk": risk,
                "dateRange": {"start": dates[0] if dates else None, "end": dates[-1] if dates else None},
                "recordCount": len(daily_rows),
                "totals": {
                    "totalFlights": total_flights,
                    "delayedFlights": delayed_flights,
                    "cancelledFlights": cancelled_flights,
                    "weatherDelays": weather_delays,
                    "maintenanceDelays": maintenance_delays,
                },
                "rates": {
                    "delayRate": delay_rate,
                    "cancellationRate": cancellation_rate,
                    "onTimePercentage": on_time_percentage,
                },
                "averages": {"departureDelay": departure_delay, "arrivalDelay": arrival_delay},
                "insight": _insight_for_summary(code, risk, departure_delay, delay_rate, on_time_percentage),
                "dailyRecords": [
                    {
                        "date": row.get("performance_date"),
                        "flights": _number(row, "total_flights"),
                        "delayed": _number(row, "delayed_flights"),
                        "cancelled": _number(row, "cancelled_flights"),
                        "departureDelay": _number(row, "avg_departure_delay"),
                        "arrivalDelay": _number(row, "avg_arrival_delay"),
                        "onTimePercentage": _number(row, "on_time_percentage"),
                    }
                    for row in sorted(daily_rows, key=lambda row: str(row.get("performance_date") or ""), reverse=True)
                ],
            }
        )
    risk_order = {"High": 0, "Medium": 1, "Low": 2}
    return sorted(summaries, key=lambda summary: (risk_order[summary["risk"]], -summary["rates"]["delayRate"]))


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
        return {"queryPlan": plan, "available": False, "enterpriseConnected": False, "sourceTables": [], "rows": [], "airportSummaries": [], "matchedAirportsCount": 0, "matchedAirports": 0}

    selected_schema = schema if schema is not None else load_schema()
    tables = select_enterprise_tables(selected_schema or {})
    codes = airport_codes(airports)
    logger.info("Discover enterprise selection | selected_tables=%s | matched_airport_codes=%s", [table.get("table_name") for table in tables], codes)
    if not tables:
        return {"queryPlan": plan, "available": False, "enterpriseConnected": False, "message": NO_TABLE_MESSAGE, "sourceTables": [], "rows": [], "airportSummaries": [], "matchedAirportsCount": 0, "matchedAirports": 0, "honestyNote": HONESTY_NOTE}
    if not codes:
        return {"queryPlan": plan, "available": True, "enterpriseConnected": True, "message": "No nearby airport codes were available for enterprise matching.", "sourceTables": [], "rows": [], "airportSummaries": [], "matchedAirportsCount": 0, "matchedAirports": 0, "honestyNote": HONESTY_NOTE}

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
        return {"queryPlan": plan, "available": False, "enterpriseConnected": False, "message": UNAVAILABLE_MESSAGE, "sourceTables": source_tables, "rows": [], "airportSummaries": [], "matchedAirportsCount": 0, "matchedAirports": 0, "honestyNote": HONESTY_NOTE}

    matched_codes = {row["airportCode"] for row in shaped_rows if row["airportCode"]}
    airport_summaries = aggregate_airport_summaries(shaped_rows)
    logger.info("Discover enterprise result | row_count=%s | matched_airport_codes=%s", len(shaped_rows), sorted(matched_codes))
    return {
        "queryPlan": plan,
        "available": True,
        "enterpriseConnected": True,
        "sourceTables": source_tables,
        "rows": shaped_rows,
        "airportSummaries": airport_summaries,
        "matchedAirportsCount": len(matched_codes),
        "matchedAirports": len(matched_codes),
        "honestyNote": HONESTY_NOTE,
    }


async def discover_enterprise_candidates(
    question: str,
    *,
    schema: dict[str, Any] | None = None,
    executor: StarburstExecutor | None = None,
    timeout_seconds: float = 12,
) -> dict[str, Any]:
    plan = plan_discover_query(question)
    enterprise_filter = interpret_enterprise_filter(question)
    logger.info(
        "Discover semantic enterprise filter | original_query=%s | interpreted_enterprise_filter=%s | enterpriseFirst=%s | location_geocoding_skipped_reason=%s",
        question,
        enterprise_filter,
        plan["enterpriseFirst"],
        plan["locationGeocodingSkippedReason"],
    )
    comparison_airports = airports_from_comparison_query(question) if plan["comparison"] else []
    if not enterprise_filter and not comparison_airports:
        return {"queryPlan": plan, "interpretedEnterpriseFilter": None, "selectedAirports": []}

    selected_schema = schema if schema is not None else load_schema()
    tables = select_enterprise_tables(selected_schema or {})
    if not tables:
        logger.info("Discover semantic no match | reason=no_matching_enterprise_table")
        return {"queryPlan": plan, "available": False, "enterpriseConnected": False, "interpretedEnterpriseFilter": enterprise_filter, "message": NO_TABLE_MESSAGE, "sourceTables": [], "rows": [], "airportSummaries": [], "selectedAirports": [], "matchedAirportsCount": 0}

    runner = executor or StarburstExecutor()
    shaped_rows: list[dict[str, Any]] = []
    source_tables: list[str] = []
    try:
        for table in tables[:3]:
            sql = build_enterprise_candidates_query(table)
            source = f"{table['catalog']}.{table['schema_name']}.{table['table_name']}"
            logger.info("Discover semantic enterprise query | source_table=%s | generated_sql=%s", source, sql)
            rows = await asyncio.wait_for(runner.execute(sql), timeout=timeout_seconds)
            source_tables.append(source)
            shaped_rows.extend(_shape_row(row, table) for row in rows)
    except Exception:
        logger.exception("Discover semantic enterprise query failed | original_query=%s", question)
        return {"queryPlan": plan, "available": False, "enterpriseConnected": False, "interpretedEnterpriseFilter": enterprise_filter, "message": ENTERPRISE_REQUIRED_MESSAGE, "sourceTables": source_tables, "rows": [], "airportSummaries": [], "selectedAirports": [], "matchedAirportsCount": 0}

    summaries = aggregate_airport_summaries(shaped_rows)
    if comparison_airports:
        requested_codes = {
            str(code).upper()
            for airport in comparison_airports
            for code in (airport.get("code"), airport.get("iataCode"), airport.get("icaoCode"), airport.get("ident"))
            if code
        }
        candidates = [summary for summary in summaries if summary["airportCode"] in requested_codes]
    else:
        candidates = select_airport_candidates(summaries, enterprise_filter)
    logger.info("Discover semantic airport candidates | interpreted_enterprise_filter=%s | airport_candidates=%s", enterprise_filter, [candidate["airportCode"] for candidate in candidates])
    if not candidates:
        logger.info("Discover semantic no match | reason=no_airport_matching_filter | interpreted_enterprise_filter=%s", enterprise_filter)
        return {"queryPlan": plan, "available": True, "enterpriseConnected": True, "interpretedEnterpriseFilter": enterprise_filter, "message": NO_CRITERIA_MATCH_MESSAGE, "sourceTables": source_tables, "rows": shaped_rows, "airportSummaries": [], "selectedAirports": [], "matchedAirportsCount": 0, "honestyNote": HONESTY_NOTE}
    resolved_airports = comparison_airports or airports_by_codes([candidate["airportCode"] for candidate in candidates])
    airports_by_code = {airport["code"].upper(): airport for airport in resolved_airports}
    for airport in resolved_airports:
        for code in (airport.get("iataCode"), airport.get("icaoCode"), airport.get("ident")):
            if code:
                airports_by_code[str(code).upper()] = airport
    selected_airports = [airports_by_code[candidate["airportCode"]] for candidate in candidates if candidate["airportCode"] in airports_by_code]
    if not selected_airports:
        logger.info("Discover semantic no match | reason=no_candidate_airport_location | airport_candidates=%s", [candidate["airportCode"] for candidate in candidates])
        return {"queryPlan": plan, "available": True, "enterpriseConnected": True, "interpretedEnterpriseFilter": enterprise_filter, "message": NO_CRITERIA_MATCH_MESSAGE, "sourceTables": source_tables, "rows": shaped_rows, "airportSummaries": [], "selectedAirports": [], "matchedAirportsCount": 0, "honestyNote": HONESTY_NOTE}

    selected_codes = {airport["code"].upper() for airport in selected_airports}
    selected_summaries = [summary for summary in candidates if summary["airportCode"] in selected_codes or any(summary["airportCode"] == str(airport.get(key) or "").upper() for airport in selected_airports for key in ("iataCode", "icaoCode", "ident"))]
    logger.info("Discover semantic selected airports | selected_airports=%s", [airport["code"] for airport in selected_airports])
    return {
        "queryPlan": plan,
        "available": True,
        "enterpriseConnected": True,
        "interpretedEnterpriseFilter": enterprise_filter,
        "sourceTables": source_tables,
        "rows": shaped_rows,
        "airportSummaries": selected_summaries,
        "selectedAirports": selected_airports,
        "matchedAirportsCount": len(selected_airports),
        "matchedAirports": len(selected_airports),
        "comparison": plan["comparison"],
        "honestyNote": HONESTY_NOTE,
    }
