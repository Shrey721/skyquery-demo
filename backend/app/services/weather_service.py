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


WEATHER_CODE_LABELS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail",
}


def visibility_status(visibility: float | None) -> str:
    if visibility is None:
        return "Unavailable"
    km = visibility / 1000
    if km >= 10:
        return "Good"
    if km >= 5:
        return "Moderate"
    if km >= 2:
        return "Poor"
    return "Very Poor"


def precipitation_status(precipitation: float | None) -> str:
    rain = precipitation or 0
    if rain <= 0:
        return "None"
    if rain < 2:
        return "Light"
    if rain <= 7.5:
        return "Moderate"
    return "Heavy"


def wind_status(wind_speed: float | None, wind_gusts: float | None = None) -> str:
    wind = wind_speed or 0
    gusts = wind_gusts or 0
    if gusts > 60 or wind > 45:
        return "High"
    if wind >= 25:
        return "Medium"
    return "Low"


def calculate_aviation_risk(
    wind_speed: float | None,
    precipitation: float | None,
    visibility: float | None,
    cloud_cover: float | None,
    wind_gusts: float | None = None,
) -> RiskLevel:
    """Classify basic aviation weather risk from current conditions."""
    wind = wind_speed or 0
    gusts = wind_gusts or 0
    rain = precipitation or 0
    visibility_m = visibility if visibility is not None else 10_000
    clouds = cloud_cover or 0

    if visibility_m < 2_000 or rain > 7.5 or gusts > 60 or wind > 50:
        return "High"
    if visibility_m < 10_000 or rain >= 2 or wind > 30 or clouds > 85:
        return "Medium"
    return "Low"


def risk_contributors(
    wind_speed: float | None,
    precipitation: float | None,
    visibility: float | None,
    cloud_cover: float | None,
    wind_gusts: float | None,
) -> list[str]:
    contributors: list[str] = []
    if visibility is not None and visibility < 10_000:
        contributors.append(f"{visibility_status(visibility).lower()} visibility")
    if (precipitation or 0) >= 2:
        contributors.append(f"{precipitation_status(precipitation).lower()} precipitation")
    if (wind_speed or 0) > 30:
        contributors.append("elevated wind")
    if (wind_gusts or 0) > 60:
        contributors.append("high wind gusts")
    if (cloud_cover or 0) > 85:
        contributors.append("high cloud cover")
    return contributors


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
    apparent_temperature = _number(current, "apparent_temperature")
    humidity = _number(current, "relative_humidity_2m")
    rain = _number(current, "rain")
    showers = _number(current, "showers")
    snowfall = _number(current, "snowfall")
    pressure_msl = _number(current, "pressure_msl")
    surface_pressure = _number(current, "surface_pressure")
    wind_speed = _number(current, "wind_speed_10m")
    wind_direction = _number(current, "wind_direction_10m")
    wind_gusts = _number(current, "wind_gusts_10m")
    cloud_cover = _number(current, "cloud_cover")
    precipitation = _number(current, "precipitation")
    visibility = _number(current, "visibility")
    weather_code = _number(current, "weather_code")
    weather_code_int = int(weather_code) if weather_code is not None else None
    operational_risk = calculate_aviation_risk(wind_speed, precipitation, visibility, cloud_cover, wind_gusts)
    fetched_at = datetime.now(timezone.utc).isoformat()

    return {
        "source": "open-meteo",
        "latitude": latitude,
        "longitude": longitude,
        "temperature": temperature,
        "apparentTemperature": apparent_temperature,
        "humidity": humidity,
        "precipitation": precipitation,
        "rain": rain,
        "showers": showers,
        "snowfall": snowfall,
        "cloudCover": cloud_cover,
        "pressureMsl": pressure_msl,
        "surfacePressure": surface_pressure,
        "visibility": visibility,
        "windSpeed": wind_speed,
        "windDirection": wind_direction,
        "windGusts": wind_gusts,
        "weatherCode": weather_code_int,
        "weatherCondition": WEATHER_CODE_LABELS.get(weather_code_int, "Unknown" if weather_code_int is not None else None),
        "operationalRisk": operational_risk,
        "riskLevel": operational_risk,
        "riskContributors": risk_contributors(wind_speed, precipitation, visibility, cloud_cover, wind_gusts),
        "visibilityStatus": visibility_status(visibility),
        "precipitationStatus": precipitation_status(precipitation),
        "windStatus": wind_status(wind_speed, wind_gusts),
        "lastUpdated": fetched_at,
        "fetched_at": fetched_at,
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
                    "apparent_temperature",
                    "relative_humidity_2m",
                    "precipitation",
                    "rain",
                    "showers",
                    "snowfall",
                    "cloud_cover",
                    "pressure_msl",
                    "surface_pressure",
                    "visibility",
                    "wind_speed_10m",
                    "wind_direction_10m",
                    "wind_gusts_10m",
                    "weather_code",
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
