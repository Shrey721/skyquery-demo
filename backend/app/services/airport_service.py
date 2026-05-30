"""Nearby airport lookup from the local OurAirports dataset."""

from __future__ import annotations

import csv
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.core.config import BACKEND_DIR

logger = logging.getLogger(__name__)

AIRPORT_DATASET_PATH = BACKEND_DIR / "data" / "airports.csv"
AIRPORT_DATASET_SOURCE = "OurAirports local dataset"
EXCLUDED_TYPES = {"closed", "heliport", "seaplane_base", "balloonport"}
TYPE_PRIORITY = {"large_airport": 0, "medium_airport": 1, "small_airport": 2}


@dataclass(frozen=True)
class Airport:
    ident: str
    type: str
    name: str
    lat: float
    lon: float
    country: str
    city: str
    gps_code: str
    iata_code: str
    local_code: str


_airports_cache: list[Airport] | None = None


def _as_float(value: str) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _looks_like_icao(value: str) -> bool:
    return len(value) == 4 and value.isalnum()


def _code_for(airport: Airport) -> str:
    return airport.iata_code or airport.gps_code or airport.ident


def _icao_for(airport: Airport) -> str | None:
    if airport.gps_code:
        return airport.gps_code
    if _looks_like_icao(airport.ident):
        return airport.ident
    return None


def distance_nm(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    radians = math.pi / 180
    d_lat = (lat_b - lat_a) * radians
    d_lon = (lon_b - lon_a) * radians
    a_lat = lat_a * radians
    b_lat = lat_b * radians
    haversine = math.sin(d_lat / 2) ** 2 + math.cos(a_lat) * math.cos(b_lat) * math.sin(d_lon / 2) ** 2
    return 3440.065 * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))


def clear_airport_cache() -> None:
    global _airports_cache
    _airports_cache = None


def load_airports() -> list[Airport]:
    global _airports_cache
    if _airports_cache is not None:
        return _airports_cache

    if not AIRPORT_DATASET_PATH.exists():
        logger.error("Airport dataset unavailable at %s", AIRPORT_DATASET_PATH)
        raise HTTPException(status_code=503, detail="Airport dataset unavailable.")

    airports: list[Airport] = []
    try:
        with AIRPORT_DATASET_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                airport_type = (row.get("type") or "").strip()
                if airport_type in EXCLUDED_TYPES or airport_type not in TYPE_PRIORITY:
                    continue
                lat = _as_float(row.get("latitude_deg") or "")
                lon = _as_float(row.get("longitude_deg") or "")
                if lat is None or lon is None:
                    continue
                airports.append(
                    Airport(
                        ident=(row.get("ident") or "").strip(),
                        type=airport_type,
                        name=(row.get("name") or "").strip(),
                        lat=lat,
                        lon=lon,
                        country=(row.get("iso_country") or "").strip(),
                        city=(row.get("municipality") or "").strip(),
                        gps_code=(row.get("gps_code") or "").strip(),
                        iata_code=(row.get("iata_code") or "").strip(),
                        local_code=(row.get("local_code") or "").strip(),
                    )
                )
    except OSError as exc:
        logger.error("Airport dataset unavailable at %s: %s", AIRPORT_DATASET_PATH, exc)
        raise HTTPException(status_code=503, detail="Airport dataset unavailable.") from exc

    _airports_cache = airports
    logger.info("Loaded %d airports from %s", len(airports), AIRPORT_DATASET_PATH)
    return airports


def nearby_airports(lat: float, lon: float, limit: int = 5) -> dict[str, Any]:
    clamped_limit = max(1, min(limit, 10))
    ranked = sorted(
        (
            (
                distance_nm(lat, lon, airport.lat, airport.lon),
                TYPE_PRIORITY.get(airport.type, 99),
                airport.name,
                airport,
            )
            for airport in load_airports()
        ),
        key=lambda item: (item[0], item[1], item[2]),
    )[:clamped_limit]
    return {
        "airports": [
            {
                "code": _code_for(airport),
                "iataCode": airport.iata_code or None,
                "icaoCode": _icao_for(airport),
                "ident": airport.ident,
                "name": airport.name,
                "city": airport.city,
                "country": airport.country,
                "type": airport.type,
                "lat": airport.lat,
                "lon": airport.lon,
                "distanceNm": round(distance, 1),
            }
            for distance, _, _, airport in ranked
        ],
        "source": AIRPORT_DATASET_SOURCE,
    }


def airports_in_bounds(lamin: float, lomin: float, lamax: float, lomax: float, limit: int = 100) -> dict[str, Any]:
    clamped_limit = max(1, min(limit, 100))
    south = min(lamin, lamax)
    north = max(lamin, lamax)
    west = lomin
    east = lomax
    center_lat = (south + north) / 2
    if west <= east:
        center_lon = (west + east) / 2

        def in_longitude(lon: float) -> bool:
            return west <= lon <= east
    else:
        center_lon = ((west + east + 360) / 2 + 180) % 360 - 180

        def in_longitude(lon: float) -> bool:
            return lon >= west or lon <= east

    ranked = sorted(
        (
            (
                distance_nm(center_lat, center_lon, airport.lat, airport.lon),
                TYPE_PRIORITY.get(airport.type, 99),
                airport.name,
                airport,
            )
            for airport in load_airports()
            if south <= airport.lat <= north and in_longitude(airport.lon)
        ),
        key=lambda item: (item[0], item[1], item[2]),
    )[:clamped_limit]
    return {
        "airports": [
            {
                "code": _code_for(airport),
                "iataCode": airport.iata_code or None,
                "icaoCode": _icao_for(airport),
                "ident": airport.ident,
                "name": airport.name,
                "city": airport.city,
                "country": airport.country,
                "type": airport.type,
                "lat": airport.lat,
                "lon": airport.lon,
                "distanceNm": round(distance, 1),
            }
            for distance, _, _, airport in ranked
        ],
        "source": AIRPORT_DATASET_SOURCE,
    }
