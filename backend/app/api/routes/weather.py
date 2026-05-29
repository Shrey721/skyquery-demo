"""Current weather intelligence for live airspace regions."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.services.weather_service import get_weather

router = APIRouter()


@router.get("/weather")
async def read_weather(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    force_refresh: Annotated[bool, Query()] = False,
) -> dict[str, Any]:
    return await get_weather(lat, lon, force_refresh)
