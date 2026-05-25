"""Live aircraft positions provided by OpenSky Network."""

import asyncio
import logging
import time

import httpx
from fastapi import APIRouter, HTTPException
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
_aircraft_cache: list[dict] = []
_aircraft_cached_at: float | None = None
_upstream_retry_after: float | None = None
_fetch_lock = asyncio.Lock()


def _cached_aircraft(max_age_seconds: int) -> list[dict] | None:
    if _aircraft_cached_at is None or not _aircraft_cache:
        return None
    if time.monotonic() - _aircraft_cached_at > max_age_seconds:
        return None
    return list(_aircraft_cache)


def _normalize_aircraft(payload: dict) -> list[dict]:
    aircraft = []
    for state in (payload.get("states", []) or [])[:300]:
        try:
            latitude = state[6]
            longitude = state[5]
            if latitude is None or longitude is None:
                continue
            aircraft.append(
                {
                    "callsign": (state[1] or "").strip() or "UNKNOWN",
                    "lat": float(latitude),
                    "lon": float(longitude),
                    "altitude": int(state[7] or 0),
                    "velocity": int(state[9] or 0),
                    "heading": int(state[10] or 0),
                    "origin_country": state[2] or "",
                }
            )
        except Exception:
            continue
    return aircraft


def _status_error_category(status_code: int) -> str:
    if status_code == 429:
        return "rate_limited"
    if status_code in {401, 403}:
        return "authorization"
    if status_code >= 500:
        return "provider_upstream_error"
    return "provider_http_error"


@router.get("/flights/live")
async def get_live_flights():
    """Return normalized real aircraft data, retaining recent data through outages."""
    global _aircraft_cache, _aircraft_cached_at, _upstream_retry_after

    logger.info("Live airspace endpoint called: GET /api/v1/flights/live")
    cached = _cached_aircraft(settings.OPENSKY_CACHE_TTL_SECONDS)
    if cached is not None:
        logger.info("Live airspace response source=fresh_cache aircraft_count=%d", len(cached))
        return cached
    stale = _cached_aircraft(settings.OPENSKY_STALE_TTL_SECONDS)
    if stale is not None and _upstream_retry_after is not None and time.monotonic() < _upstream_retry_after:
        logger.info("Live airspace response source=stale_cache aircraft_count=%d", len(stale))
        return stale

    async with _fetch_lock:
        cached = _cached_aircraft(settings.OPENSKY_CACHE_TTL_SECONDS)
        if cached is not None:
            logger.info("Live airspace response source=fresh_cache aircraft_count=%d", len(cached))
            return cached
        stale = _cached_aircraft(settings.OPENSKY_STALE_TTL_SECONDS)
        if stale is not None and _upstream_retry_after is not None and time.monotonic() < _upstream_retry_after:
            logger.info("Live airspace response source=stale_cache aircraft_count=%d", len(stale))
            return stale

        error_category = "unknown"
        try:
            async with httpx.AsyncClient(timeout=settings.OPENSKY_TIMEOUT_SECONDS) as client:
                response = await client.get(settings.OPENSKY_API_URL)
            logger.info("Live airspace provider response_status=%d", response.status_code)
            if response.status_code != 200:
                error_category = _status_error_category(response.status_code)
                raise RuntimeError(f"provider returned HTTP {response.status_code}")
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("states"), list):
                error_category = "invalid_payload"
                raise ValueError("provider returned invalid states payload")
            aircraft = _normalize_aircraft(payload)
            _aircraft_cache = aircraft
            _aircraft_cached_at = time.monotonic()
            _upstream_retry_after = None
            logger.info("Live airspace response source=provider aircraft_count=%d", len(aircraft))
            return aircraft
        except httpx.TimeoutException as exc:
            error_category = "timeout"
            provider_error = exc
        except httpx.RequestError as exc:
            error_category = "network_error"
            provider_error = exc
        except Exception as exc:
            provider_error = exc

        stale = _cached_aircraft(settings.OPENSKY_STALE_TTL_SECONDS)
        if stale is not None:
            _upstream_retry_after = time.monotonic() + max(settings.OPENSKY_CACHE_TTL_SECONDS, 1)
            logger.warning(
                "Live airspace provider failed category=%s; serving cached aircraft_count=%d: %s",
                error_category,
                len(stale),
                provider_error,
            )
            return stale
        logger.warning(
            "Live airspace provider failed category=%s and no cached data is available: %s",
            error_category,
            provider_error,
        )
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Live airspace provider unavailable. Check OPENSKY_API_URL or network access.",
                "provider_error_category": error_category,
            },
        ) from provider_error
