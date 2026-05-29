"""Live aircraft positions provided by OpenSky Network."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from hashlib import sha256
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.services.redis_cache import redis_client

router = APIRouter()
logger = logging.getLogger(__name__)
_memory_cache: dict[str, tuple[float, float, dict[str, Any]]] = {}
_fetch_locks: dict[str, asyncio.Lock] = {}
_backoff_until: dict[str, float] = {}
_failure_counts: dict[str, int] = {}

RATE_LIMIT_MESSAGE = "Live flight data is temporarily rate-limited. Showing last cached data."


def _cache_key(bounds: dict[str, float] | None) -> str:
    serialized = "global" if bounds is None else ":".join(
        f"{bounds[name]:.4f}" for name in ("lamin", "lomin", "lamax", "lomax")
    )
    return f"skyquery:flights:opensky:{sha256(serialized.encode()).hexdigest()[:24]}"


def _read_cache(key: str) -> dict[str, Any] | None:
    try:
        cached = redis_client.get(key)
        if cached:
            return json.loads(cached)
    except Exception as exc:
        logger.debug("Flight cache Redis read unavailable, using local cache: %s", exc)

    local = _memory_cache.get(key)
    if local is None:
        return None
    fresh_until, stale_until, result = local
    now = time.monotonic()
    if stale_until <= now:
        _memory_cache.pop(key, None)
        return None
    if fresh_until <= now:
        return None
    return result


def _read_stale_cache(key: str) -> dict[str, Any] | None:
    local = _memory_cache.get(key)
    if local is None:
        return None
    _, stale_until, result = local
    if stale_until <= time.monotonic():
        _memory_cache.pop(key, None)
        return None
    return result


def _write_cache(key: str, result: dict[str, Any]) -> None:
    ttl = max(settings.OPENSKY_CACHE_TTL_SECONDS, 1)
    stale_ttl = max(settings.OPENSKY_STALE_TTL_SECONDS, ttl)
    _memory_cache[key] = (time.monotonic() + ttl, time.monotonic() + stale_ttl, result)
    try:
        redis_client.setex(key, ttl, json.dumps(result))
    except Exception as exc:
        logger.debug("Flight cache Redis write unavailable, retaining local cache: %s", exc)


def _retry_after_seconds(key: str) -> int:
    return max(0, round(_backoff_until.get(key, 0) - time.monotonic()))


def _record_fetch_failure(key: str) -> None:
    failures = _failure_counts.get(key, 0) + 1
    _failure_counts[key] = failures
    delay = min(300, 30 * (2 ** (failures - 1)))
    _backoff_until[key] = time.monotonic() + delay


def _record_fetch_success(key: str) -> None:
    _failure_counts.pop(key, None)
    _backoff_until.pop(key, None)


def _stale_response(result: dict[str, Any], key: str) -> dict[str, Any]:
    return {
        **result,
        "cached": True,
        "stale": True,
        "data_status": "stale",
        "message": RATE_LIMIT_MESSAGE,
        "retry_after_seconds": _retry_after_seconds(key),
    }


def _optional_number(state: list[Any], index: int) -> float | None:
    if len(state) <= index or state[index] is None:
        return None
    try:
        return float(state[index])
    except (TypeError, ValueError):
        return None


def _normalize_aircraft(payload: dict[str, Any]) -> list[dict[str, Any]]:
    aircraft: list[dict[str, Any]] = []
    for state in payload.get("states", []) or []:
        longitude = _optional_number(state, 5)
        latitude = _optional_number(state, 6)
        if longitude is None or latitude is None:
            continue
        altitude_m = _optional_number(state, 7)
        if altitude_m is None:
            altitude_m = _optional_number(state, 13)
        velocity_ms = _optional_number(state, 9)
        last_contact = _optional_number(state, 4)
        aircraft.append(
            {
                "source": "opensky",
                "icao24": str(state[0] or "").strip() if state else "",
                "callsign": str(state[1] or "").strip() if len(state) > 1 else "",
                "origin_country": str(state[2] or "") if len(state) > 2 else "",
                "longitude": longitude,
                "latitude": latitude,
                "altitude_m": altitude_m,
                "altitude_ft": round(altitude_m * 3.28084) if altitude_m is not None else None,
                "velocity_ms": velocity_ms,
                "speed_kts": round(velocity_ms * 1.94384) if velocity_ms is not None else None,
                "heading": _optional_number(state, 10),
                "vertical_rate": _optional_number(state, 11),
                "last_seen": (
                    datetime.fromtimestamp(last_contact, tz=timezone.utc).isoformat()
                    if last_contact is not None
                    else None
                ),
                "on_ground": bool(state[8]) if len(state) > 8 and state[8] is not None else False,
            }
        )
    return aircraft


def _validated_bounds(
    lamin: float | None, lomin: float | None, lamax: float | None, lomax: float | None
) -> dict[str, float] | None:
    supplied = [value is not None for value in (lamin, lomin, lamax, lomax)]
    if any(supplied) and not all(supplied):
        raise HTTPException(status_code=422, detail="All four map bounds are required.")
    if not any(supplied):
        return None
    assert lamin is not None and lomin is not None and lamax is not None and lomax is not None
    if lamin >= lamax or lomin >= lomax:
        raise HTTPException(status_code=422, detail="Map bounds must define a positive area.")
    return {"lamin": lamin, "lomin": lomin, "lamax": lamax, "lomax": lomax}


def _provider_error(status_code: int) -> tuple[int, str]:
    if status_code == 429:
        return 429, "OpenSky rate limit reached. Try again shortly."
    if status_code in {401, 403}:
        return 502, "Public flight API authorization failed."
    return 502, "Public flight API unavailable."


@router.get("/flights/live")
async def get_live_flights(
    lamin: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lomin: Annotated[float | None, Query(ge=-180, le=180)] = None,
    lamax: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lomax: Annotated[float | None, Query(ge=-180, le=180)] = None,
    force_refresh: Annotated[bool, Query()] = False,
) -> dict[str, Any]:
    """Return real OpenSky states for the requested visible map rectangle."""
    bounds = _validated_bounds(lamin, lomin, lamax, lomax)
    key = _cache_key(bounds)
    if not force_refresh:
        cached = _read_cache(key)
        if cached is not None:
            return {**cached, "cached": True, "stale": False, "data_status": "cached"}

    stale = _read_stale_cache(key)
    if _backoff_until.get(key, 0) > time.monotonic():
        if stale is not None:
            return _stale_response(stale, key)
        raise HTTPException(
            status_code=429,
            detail=f"OpenSky rate limit cooldown active. Try again in {_retry_after_seconds(key)} seconds.",
        )

    lock = _fetch_locks.setdefault(key, asyncio.Lock())
    async with lock:
        if not force_refresh:
            cached = _read_cache(key)
            if cached is not None:
                return {**cached, "cached": True, "stale": False, "data_status": "cached"}

        if _backoff_until.get(key, 0) > time.monotonic():
            stale = _read_stale_cache(key)
            if stale is not None:
                return _stale_response(stale, key)
            raise HTTPException(
                status_code=429,
                detail=f"OpenSky rate limit cooldown active. Try again in {_retry_after_seconds(key)} seconds.",
            )

        try:
            async with httpx.AsyncClient(timeout=settings.OPENSKY_TIMEOUT_SECONDS) as client:
                response = await client.get(settings.OPENSKY_API_URL, params=bounds or {})
        except httpx.TimeoutException as exc:
            _record_fetch_failure(key)
            stale = _read_stale_cache(key)
            if stale is not None:
                return _stale_response(stale, key)
            raise HTTPException(status_code=504, detail="OpenSky rate limit or timeout.") from exc
        except httpx.RequestError as exc:
            _record_fetch_failure(key)
            stale = _read_stale_cache(key)
            if stale is not None:
                return _stale_response(stale, key)
            raise HTTPException(status_code=502, detail="Public flight API unavailable.") from exc

        if response.status_code != 200:
            _record_fetch_failure(key)
            stale = _read_stale_cache(key)
            if stale is not None:
                return _stale_response(stale, key)
            status_code, message = _provider_error(response.status_code)
            raise HTTPException(status_code=status_code, detail=message)

        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("states"), list):
            raise HTTPException(status_code=502, detail="Public flight API returned invalid data.")

        result = {
            "source": "opensky",
            "aircraft": _normalize_aircraft(payload),
            "bounds": bounds,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "cached": False,
            "stale": False,
            "data_status": "live",
        }
        _write_cache(key, result)
        _record_fetch_success(key)
        logger.info("OpenSky positions loaded for bounds=%s count=%d", bounds, len(result["aircraft"]))
        return result
