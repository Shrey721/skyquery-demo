import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.api.routes import flights
from app.core.config import settings


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class FakeClient:
    responses = []
    call_count = 0
    last_timeout = None
    last_url = None

    def __init__(self, *args, **kwargs):
        FakeClient.last_timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url):
        FakeClient.call_count += 1
        FakeClient.last_url = url
        response = FakeClient.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class LiveFlightsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        flights._aircraft_cache = []
        flights._aircraft_cached_at = None
        flights._upstream_retry_after = None
        FakeClient.responses = []
        FakeClient.call_count = 0
        FakeClient.last_timeout = None
        FakeClient.last_url = None

    @staticmethod
    def payload():
        return {
            "states": [
                ["id", "TEST123 ", "Test Country", None, None, 77.2, 28.6, 1200, None, 250, 180],
            ]
        }

    async def test_recent_success_is_reused_without_another_upstream_fetch(self):
        FakeClient.responses = [FakeResponse(payload=self.payload())]
        with patch.object(flights.httpx, "AsyncClient", FakeClient), patch.object(
            settings, "OPENSKY_CACHE_TTL_SECONDS", 30
        ), patch.object(
            settings, "OPENSKY_API_URL", "https://provider.test/states"
        ), patch.object(
            settings, "OPENSKY_TIMEOUT_SECONDS", 4.5
        ):
            first = await flights.get_live_flights()
            second = await flights.get_live_flights()

        self.assertEqual(first, second)
        self.assertEqual(first[0]["callsign"], "TEST123")
        self.assertEqual(FakeClient.call_count, 1)
        self.assertEqual(FakeClient.last_url, "https://provider.test/states")
        self.assertEqual(FakeClient.last_timeout, 4.5)

    async def test_stale_real_snapshot_is_served_during_transient_failure(self):
        flights._aircraft_cache = [{"callsign": "CACHED", "lat": 1.0, "lon": 2.0}]
        flights._aircraft_cached_at = 100.0
        FakeClient.responses = [RuntimeError("upstream unavailable")]

        with patch.object(flights.httpx, "AsyncClient", FakeClient), patch.object(
            flights.time, "monotonic", return_value=120.0
        ), patch.object(settings, "OPENSKY_CACHE_TTL_SECONDS", 5), patch.object(
            settings, "OPENSKY_STALE_TTL_SECONDS", 60
        ):
            result = await flights.get_live_flights()
            repeated_result = await flights.get_live_flights()

        self.assertEqual(result, flights._aircraft_cache)
        self.assertEqual(repeated_result, flights._aircraft_cache)
        self.assertEqual(FakeClient.call_count, 1)

    async def test_rate_limit_without_cached_snapshot_reports_provider_category(self):
        FakeClient.responses = [FakeResponse(status_code=429)]
        with patch.object(flights.httpx, "AsyncClient", FakeClient):
            with self.assertRaises(HTTPException) as context:
                await flights.get_live_flights()

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(
            context.exception.detail["message"],
            "Live airspace provider unavailable. Check OPENSKY_API_URL or network access.",
        )
        self.assertEqual(context.exception.detail["provider_error_category"], "rate_limited")


if __name__ == "__main__":
    unittest.main()
