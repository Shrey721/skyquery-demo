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
    last_params = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None):
        FakeClient.call_count += 1
        FakeClient.last_params = params
        return FakeClient.responses.pop(0)


class LiveFlightsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        flights._memory_cache = {}
        flights._fetch_locks = {}
        flights._backoff_until = {}
        flights._failure_counts = {}
        FakeClient.responses = []
        FakeClient.call_count = 0
        FakeClient.last_params = None

    @staticmethod
    def payload():
        return {
            "states": [
                ["abc123", "TEST123 ", "India", None, 1716810000, 77.2, 28.6, 1200, False, 250, 180, -2.5],
            ]
        }

    async def test_bounded_response_is_normalized_and_cached(self):
        FakeClient.responses = [FakeResponse(payload=self.payload())]
        with patch.object(flights.httpx, "AsyncClient", FakeClient), patch.object(
            flights.redis_client, "get", side_effect=RuntimeError("no redis")
        ), patch.object(flights.redis_client, "setex", side_effect=RuntimeError("no redis")), patch.object(
            settings, "OPENSKY_CACHE_TTL_SECONDS", 30
        ):
            first = await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)
            second = await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)

        aircraft = first["aircraft"][0]
        self.assertEqual(FakeClient.last_params, {"lamin": 20, "lomin": 70, "lamax": 30, "lomax": 80})
        self.assertEqual(FakeClient.call_count, 1)
        self.assertEqual(aircraft["icao24"], "abc123")
        self.assertEqual(aircraft["callsign"], "TEST123")
        self.assertEqual(aircraft["altitude_ft"], 3937)
        self.assertEqual(aircraft["speed_kts"], 486)
        self.assertTrue(second["cached"])

    async def test_different_bounds_have_separate_cache_entries(self):
        FakeClient.responses = [FakeResponse(payload=self.payload()), FakeResponse(payload=self.payload())]
        with patch.object(flights.httpx, "AsyncClient", FakeClient), patch.object(
            flights.redis_client, "get", return_value=None
        ), patch.object(flights.redis_client, "setex"):
            await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)
            await flights.get_live_flights(lamin=30, lomin=70, lamax=40, lomax=80)

        self.assertEqual(FakeClient.call_count, 2)

    async def test_rate_limit_is_reported_clearly(self):
        FakeClient.responses = [FakeResponse(status_code=429)]
        with patch.object(flights.httpx, "AsyncClient", FakeClient), patch.object(
            flights.redis_client, "get", return_value=None
        ):
            with self.assertRaises(HTTPException) as context:
                await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)

        self.assertEqual(context.exception.status_code, 429)
        self.assertEqual(context.exception.detail, "OpenSky rate limit reached. Try again shortly.")

    async def test_rate_limit_returns_stale_cached_data(self):
        FakeClient.responses = [FakeResponse(payload=self.payload()), FakeResponse(status_code=429)]
        with patch.object(flights.httpx, "AsyncClient", FakeClient), patch.object(
            flights.redis_client, "get", return_value=None
        ), patch.object(flights.redis_client, "setex"), patch.object(
            settings, "OPENSKY_CACHE_TTL_SECONDS", 1
        ), patch.object(
            settings, "OPENSKY_STALE_TTL_SECONDS", 300
        ):
            first = await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)
            await flights.asyncio.sleep(1.05)
            second = await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)

        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertTrue(second["stale"])
        self.assertEqual(second["data_status"], "stale")
        self.assertEqual(second["message"], flights.RATE_LIMIT_MESSAGE)
        self.assertEqual(FakeClient.call_count, 2)

    async def test_backoff_reuses_stale_without_fetching_again(self):
        FakeClient.responses = [FakeResponse(payload=self.payload()), FakeResponse(status_code=429)]
        with patch.object(flights.httpx, "AsyncClient", FakeClient), patch.object(
            flights.redis_client, "get", return_value=None
        ), patch.object(flights.redis_client, "setex"), patch.object(
            settings, "OPENSKY_CACHE_TTL_SECONDS", 1
        ), patch.object(
            settings, "OPENSKY_STALE_TTL_SECONDS", 300
        ):
            await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)
            await flights.asyncio.sleep(1.05)
            await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)
            third = await flights.get_live_flights(lamin=20, lomin=70, lamax=30, lomax=80)

        self.assertTrue(third["stale"])
        self.assertEqual(FakeClient.call_count, 2)

    async def test_partial_bounds_are_rejected(self):
        with self.assertRaises(HTTPException) as context:
            await flights.get_live_flights(lamin=20, lomin=70)
        self.assertEqual(context.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
