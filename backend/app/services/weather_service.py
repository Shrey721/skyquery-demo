"""Weather intelligence from Open-Meteo."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Literal

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.services.redis_cache import redis_client

logger = logging.getLogger(__name__)

RiskLevel = Literal["Low", "Medium", "High"]

_memory_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_fetch_locks: dict[str, asyncio.Lock] = {}
WEATHER_STALE_MESSAGE = "Weather temporarily unavailable. Showing cached data."


def _cache_key(latitude: float, longitude: float) -> str:
    serialized = f"{latitude:.3f}:{longitude:.3f}"
    return f"skyquery:weather:openmeteo:{sha256(serialized.encode()).hexdigest()[:24]}"


def _read_cache(key: str) -> dict[str, Any] | None:
    try:
        cached = redis_client.get(key)
        if cached:
            return json.loads(cached)
    except Exception as exc:
        logger.debug("Weather cache Redis read unavailable, using local cache: %s", exc)

    local = _memory_cache.get(key)
    if local is None:
        return None
    expires_at, result = local
    if expires_at <= time.monotonic():
        _memory_cache.pop(key, None)
        return None
    return result


def _write_cache(key: str, result: dict[str, Any]) -> None:
    ttl = max(settings.WEATHER_CACHE_TTL_SECONDS, 1)
    _memory_cache[key] = (time.monotonic() + ttl, result)
    try:
        redis_client.setex(key, ttl, json.dumps(result))
    except Exception as exc:
        logger.debug("Weather cache Redis write unavailable, retaining local cache: %s", exc)


def _cached_fallback(result: dict[str, Any] | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {**result, "cached": True, "stale": True, "message": WEATHER_STALE_MESSAGE}


def calculate_aviation_risk(
    wind_speed: float | None,
    precipitation: float | None,
    visibility: float | None,
    cloud_cover: float | None,
) -> RiskLevel:
    """Classify basic aviation weather risk from current conditions."""
    wind = wind_speed or 0
    rain = precipitation or 0
    visibility_m = visibility if visibility is not None else 10_000
    clouds = cloud_cover or 0

    high_flags = [
        wind >= 45,
        rain >= 7.5,
        visibility_m < 2_000,
        clouds >= 95 and visibility_m < 5_000,
    ]
    medium_flags = [
        wind >= 28,
        rain >= 1.5,
        visibility_m < 5_000,
        clouds >= 85,
    ]

    if any(high_flags) or sum(medium_flags) >= 2:
        return "High"
    if any(medium_flags):
        return "Medium"
    return "Low"


def _number(payload: dict[str, Any], name: str) -> float | None:
    value = payload.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_weather(payload: dict[str, Any], latitude: float, longitude: float) -> dict[str, Any]:
    current = payload.get("current")
    if not isinstance(current, dict):
        raise HTTPException(status_code=502, detail="Weather provider returned invalid data.")

    temperature = _number(current, "temperature_2m")
    wind_speed = _number(current, "wind_speed_10m")
    wind_direction = _number(current, "wind_direction_10m")
    cloud_cover = _number(current, "cloud_cover")
    precipitation = _number(current, "precipitation")
    visibility = _number(current, "visibility")

    return {
        "source": "open-meteo",
        "latitude": latitude,
        "longitude": longitude,
        "temperature": temperature,
        "windSpeed": wind_speed,
        "windDirection": wind_direction,
        "cloudCover": cloud_cover,
        "precipitation": precipitation,
        "visibility": visibility,
        "riskLevel": calculate_aviation_risk(wind_speed, precipitation, visibility, cloud_cover),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "cached": False,
    }


async def get_weather(latitude: float, longitude: float, force_refresh: bool = False) -> dict[str, Any]:
    key = _cache_key(latitude, longitude)
    if not force_refresh:
        cached = _read_cache(key)
        if cached is not None:
            return {**cached, "cached": True}

    lock = _fetch_locks.setdefault(key, asyncio.Lock())
    async with lock:
        if not force_refresh:
            cached = _read_cache(key)
            if cached is not None:
                return {**cached, "cached": True}
        fallback = _read_cache(key)

        params = {
            "latitude": round(latitude, 4),
            "longitude": round(longitude, 4),
            "current": ",".join(
                [
                    "temperature_2m",
                    "wind_speed_10m",
                    "wind_direction_10m",
                    "cloud_cover",
                    "precipitation",
                    "visibility",
                ]
            ),
            "timezone": "auto",
        }
        try:
            async with httpx.AsyncClient(timeout=settings.OPEN_METEO_TIMEOUT_SECONDS) as client:
                response = await client.get(settings.OPEN_METEO_API_URL, params=params)
        except httpx.TimeoutException as exc:
            cached_fallback = _cached_fallback(fallback)
            if cached_fallback is not None:
                return cached_fallback
            raise HTTPException(status_code=504, detail="Weather provider timed out.") from exc
        except httpx.RequestError as exc:
            cached_fallback = _cached_fallback(fallback)
            if cached_fallback is not None:
                return cached_fallback
            raise HTTPException(status_code=502, detail="Weather provider unavailable.") from exc

        if response.status_code != 200:
            cached_fallback = _cached_fallback(fallback)
            if cached_fallback is not None:
                return cached_fallback
            raise HTTPException(status_code=502, detail="Weather provider unavailable.")

        payload = response.json()
        if not isinstance(payload, dict):
            cached_fallback = _cached_fallback(fallback)
            if cached_fallback is not None:
                return cached_fallback
            raise HTTPException(status_code=502, detail="Weather provider returned invalid data.")

        result = _normalize_weather(payload, latitude, longitude)
        _write_cache(key, result)
        logger.info("Open-Meteo weather loaded for lat=%s lon=%s risk=%s", latitude, longitude, result["riskLevel"])
        return result
