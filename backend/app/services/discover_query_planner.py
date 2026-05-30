"""Deterministic source routing for Discover operational queries."""

from __future__ import annotations

import re
from typing import Any

LIVE_TERMS = re.compile(r"\b(live|flights?|aircraft|planes?|airspace|traffic|airborne)\b", re.I)
WEATHER_TERMS = re.compile(r"\b(weather|temperature|rain|wind|storm|visibility|weather risk)\b", re.I)
AIRPORT_TERMS = re.compile(r"\b(airports?|nearest airport|nearby airports?|airport layer)\b", re.I)
ENTERPRISE_TERMS = re.compile(
    r"\b(delay|delayed|on[- ]?time|performance|cancellations?|cancelled|operations?|operational|"
    r"historical|enterprise|throughput|airport stats?|airport statistics|kpis?|congestion|risk from enterprise|high risk airports?)\b",
    re.I,
)

ENTERPRISE_INTENTS = (
    ("delay", re.compile(r"\b(delay|delayed)\b", re.I)),
    ("on_time", re.compile(r"\bon[- ]?time\b", re.I)),
    ("cancellation", re.compile(r"\b(cancellations?|cancelled)\b", re.I)),
    ("historical", re.compile(r"\bhistorical\b", re.I)),
    ("performance", re.compile(r"\b(performance|airport stats?|airport statistics|kpis?)\b", re.I)),
    ("operations", re.compile(r"\b(operations?|operational|throughput|congestion)\b", re.I)),
)

LOCATION_SCOPE = re.compile(r"\b(?:near|around|over|at|in|for)\s+([a-z]{2,})\b", re.I)
NON_LOCATION_SCOPE_WORDS = {"airport", "airports", "high", "low", "poor", "risk", "delay", "delays", "performance", "cancellation"}


def interpret_enterprise_filter(question: str) -> str | None:
    text = (question or "").lower()
    if "high risk airport" in text or "poor performance" in text:
        return "high_risk"
    if "high delay" in text or "high-delay" in text:
        return "high_delay"
    if "low on-time" in text or "low on time" in text:
        return "low_on_time"
    if "high cancellation" in text:
        return "high_cancellation"
    return None


def has_explicit_location_scope(question: str) -> bool:
    return any(match.group(1).lower() not in NON_LOCATION_SCOPE_WORDS for match in LOCATION_SCOPE.finditer(question or ""))


def plan_discover_query(question: str, location: str | None = None) -> dict[str, Any]:
    text = (question or "").strip()
    needs_trino = bool(ENTERPRISE_TERMS.search(text))
    mentions_weather = bool(WEATHER_TERMS.search(text))
    mentions_airports = bool(AIRPORT_TERMS.search(text))
    mentions_live = bool(LIVE_TERMS.search(text))
    enterprise_filter = interpret_enterprise_filter(text)
    enterprise_first = bool(enterprise_filter and not has_explicit_location_scope(text))

    if needs_trino:
        primary_source = "trino"
        intent = "combined" if mentions_weather or mentions_live or mentions_airports else "enterprise"
    elif mentions_weather:
        primary_source = "openmeteo"
        intent = "weather"
    elif mentions_airports:
        primary_source = "airports_csv"
        intent = "airport"
    else:
        primary_source = "opensky"
        intent = "live_airspace"

    needs_opensky = mentions_live or needs_trino or (not mentions_weather and not mentions_airports)
    needs_weather = mentions_weather or needs_trino or (not mentions_airports)
    needs_airports = mentions_airports or needs_trino
    context_sources = [
        source
        for source, enabled in (
            ("opensky", needs_opensky and primary_source != "opensky"),
            ("openmeteo", needs_weather and primary_source != "openmeteo"),
            ("airports_csv", needs_airports and primary_source != "airports_csv"),
            ("trino", needs_trino and primary_source != "trino"),
        )
        if enabled
    ]
    enterprise_intent = next((name for name, pattern in ENTERPRISE_INTENTS if pattern.search(text)), None)

    return {
        "intent": intent,
        "primarySource": primary_source,
        "contextSources": context_sources,
        "location": location,
        "needsTrino": needs_trino,
        "needsOpenSky": needs_opensky,
        "needsWeather": needs_weather,
        "needsAirports": needs_airports,
        "enterpriseIntent": enterprise_intent,
        "enterpriseFilter": enterprise_filter,
        "enterpriseFirst": enterprise_first,
        "locationGeocodingSkippedReason": "enterprise_first_query_without_explicit_location" if enterprise_first else None,
    }
