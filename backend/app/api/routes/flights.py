"""Live aircraft positions provided by OpenSky Network."""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/flights/live")
async def get_live_flights():
    """Return normalized live aircraft positions without synthetic fallbacks."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(settings.OPENSKY_URL)
    except Exception as exc:
        logger.warning("OpenSky fetch failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Live aircraft data is temporarily unavailable.",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="Live aircraft provider returned an unavailable response.",
        )

    aircraft = []
    for state in (response.json().get("states", []) or [])[:300]:
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
