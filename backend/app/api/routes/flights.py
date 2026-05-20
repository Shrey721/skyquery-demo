"""
Live flights endpoint — proxies OpenSky Network anonymous API.
Falls back to a small static demo dataset when offline / rate-limited.
"""
from fastapi import APIRouter
import httpx
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

OPENSKY_URL = "https://opensky-network.org/api/states/all"

# Static fallback so the demo always works even without internet
DEMO_AIRCRAFT = [
    {"callsign": "IGO123",  "lat": 22.57, "lon": 88.36, "altitude": 32000, "velocity": 450, "heading": 82,  "origin_country": "India"},
    {"callsign": "AI101",   "lat": 28.61, "lon": 77.21, "altitude": 36000, "velocity": 480, "heading": 270, "origin_country": "India"},
    {"callsign": "UAL945",  "lat": 40.71, "lon": -74.00,"altitude": 38000, "velocity": 520, "heading": 55,  "origin_country": "United States"},
    {"callsign": "BAW302",  "lat": 51.50, "lon": -0.12, "altitude": 35000, "velocity": 510, "heading": 180, "origin_country": "United Kingdom"},
    {"callsign": "AFR007",  "lat": 48.86, "lon": 2.35,  "altitude": 37000, "velocity": 500, "heading": 210, "origin_country": "France"},
    {"callsign": "DLH433",  "lat": 52.52, "lon": 13.40, "altitude": 34000, "velocity": 490, "heading": 95,  "origin_country": "Germany"},
    {"callsign": "SIA318",  "lat": 1.35,  "lon": 103.82,"altitude": 40000, "velocity": 530, "heading": 320, "origin_country": "Singapore"},
    {"callsign": "QFA12",   "lat": -33.87,"lon": 151.21,"altitude": 39000, "velocity": 515, "heading": 10,  "origin_country": "Australia"},
    {"callsign": "THY78",   "lat": 41.01, "lon": 28.98, "altitude": 36500, "velocity": 480, "heading": 130, "origin_country": "Turkey"},
    {"callsign": "EZY456",  "lat": 45.46, "lon": 9.19,  "altitude": 30000, "velocity": 460, "heading": 270, "origin_country": "United Kingdom"},
    {"callsign": "AAL501",  "lat": 33.94, "lon": -118.41,"altitude": 35500,"velocity": 505, "heading": 60,  "origin_country": "United States"},
    {"callsign": "CCA981",  "lat": 39.93, "lon": 116.39,"altitude": 38500, "velocity": 495, "heading": 220, "origin_country": "China"},
    {"callsign": "KLM24",   "lat": 52.31, "lon": 4.76,  "altitude": 37500, "velocity": 510, "heading": 350, "origin_country": "Netherlands"},
    {"callsign": "EVA15",   "lat": 25.08, "lon": 121.23,"altitude": 36000, "velocity": 520, "heading": 50,  "origin_country": "Taiwan"},
    {"callsign": "UAE231",  "lat": 25.25, "lon": 55.36, "altitude": 39000, "velocity": 540, "heading": 280, "origin_country": "United Arab Emirates"},
]


@router.get("/flights/live")
async def get_live_flights():
    """
    Returns normalized live aircraft positions.
    Tries OpenSky Network first; falls back to static demo data.
    """
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(OPENSKY_URL)
            if resp.status_code == 200:
                data = resp.json()
                states = data.get("states", []) or []
                aircraft = []
                for s in states[:300]:          # cap at 300 for performance
                    try:
                        lat = s[6]
                        lon = s[5]
                        if lat is None or lon is None:
                            continue
                        aircraft.append({
                            "callsign":       (s[1] or "").strip() or "UNKNOWN",
                            "lat":            float(lat),
                            "lon":            float(lon),
                            "altitude":       int(s[7] or 0),
                            "velocity":       int(s[9] or 0),
                            "heading":        int(s[10] or 0),
                            "origin_country": s[2] or "",
                        })
                    except Exception:
                        continue
                if aircraft:
                    return aircraft
    except Exception as e:
        logger.warning("OpenSky fetch failed (%s) — returning demo data", e)

    return DEMO_AIRCRAFT
