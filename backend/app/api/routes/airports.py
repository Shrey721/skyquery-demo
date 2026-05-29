"""Airport lookup endpoints backed by the local OurAirports dataset."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.services.airport_service import nearby_airports

router = APIRouter()


@router.get("/airports/nearby")
async def read_nearby_airports(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    limit: Annotated[int, Query(ge=1, le=50)] = 5,
) -> dict[str, Any]:
    return nearby_airports(lat, lon, limit)
