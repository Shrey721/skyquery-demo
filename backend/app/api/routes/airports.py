"""Airport lookup endpoints backed by the local OurAirports dataset."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.services.airport_service import airports_in_bounds, nearby_airports

router = APIRouter()


@router.get("/airports/nearby")
async def read_nearby_airports(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    limit: Annotated[int, Query(ge=1, le=50)] = 5,
) -> dict[str, Any]:
    return nearby_airports(lat, lon, limit)


@router.get("/airports/bounds")
async def read_airports_in_bounds(
    lamin: Annotated[float, Query(ge=-90, le=90)],
    lomin: Annotated[float, Query(ge=-180, le=180)],
    lamax: Annotated[float, Query(ge=-90, le=90)],
    lomax: Annotated[float, Query(ge=-180, le=180)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> dict[str, Any]:
    return airports_in_bounds(lamin, lomin, lamax, lomax, limit)
