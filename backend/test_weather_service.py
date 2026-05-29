import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services import weather_service


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


class WeatherServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        weather_service._memory_cache = {}
        weather_service._fetch_locks = {}
        FakeClient.responses = []
        FakeClient.call_count = 0
        FakeClient.last_params = None

    @staticmethod
    def payload():
        return {
            "current": {
                "temperature_2m": 33.2,
                "wind_speed_10m": 18.5,
                "wind_direction_10m": 250,
                "cloud_cover": 42,
                "precipitation": 0,
                "visibility": 10000,
            }
        }

    async def test_weather_is_normalized_and_cached(self):
        FakeClient.responses = [FakeResponse(payload=self.payload())]
        with patch.object(weather_service.httpx, "AsyncClient", FakeClient), patch.object(
            weather_service.redis_client, "get", side_effect=RuntimeError("no redis")
        ), patch.object(weather_service.redis_client, "setex", side_effect=RuntimeError("no redis")), patch.object(
            settings, "WEATHER_CACHE_TTL_SECONDS", 600
        ):
            first = await weather_service.get_weather(28.5562, 77.1)
            second = await weather_service.get_weather(28.5562, 77.1)

        self.assertEqual(FakeClient.call_count, 1)
        self.assertIn("temperature_2m", FakeClient.last_params["current"])
        self.assertEqual(first["temperature"], 33.2)
        self.assertEqual(first["windSpeed"], 18.5)
        self.assertEqual(first["riskLevel"], "Low")
        self.assertTrue(second["cached"])

    async def test_weather_cache_expires(self):
        first_payload = self.payload()
        second_payload = self.payload()
        second_payload["current"]["temperature_2m"] = 35.5
        FakeClient.responses = [FakeResponse(payload=first_payload), FakeResponse(payload=second_payload)]
        with patch.object(weather_service.httpx, "AsyncClient", FakeClient), patch.object(
            weather_service.redis_client, "get", side_effect=RuntimeError("no redis")
        ), patch.object(weather_service.redis_client, "setex", side_effect=RuntimeError("no redis")), patch.object(
            settings, "WEATHER_CACHE_TTL_SECONDS", 1
        ):
            first = await weather_service.get_weather(28.5562, 77.1)
            await weather_service.asyncio.sleep(1.05)
            second = await weather_service.get_weather(28.5562, 77.1)

        self.assertEqual(FakeClient.call_count, 2)
        self.assertEqual(first["temperature"], 33.2)
        self.assertEqual(second["temperature"], 35.5)
        self.assertFalse(second["cached"])

    async def test_force_refresh_bypasses_weather_cache(self):
        first_payload = self.payload()
        second_payload = self.payload()
        second_payload["current"]["wind_speed_10m"] = 31
        FakeClient.responses = [FakeResponse(payload=first_payload), FakeResponse(payload=second_payload)]
        with patch.object(weather_service.httpx, "AsyncClient", FakeClient), patch.object(
            weather_service.redis_client, "get", side_effect=RuntimeError("no redis")
        ), patch.object(weather_service.redis_client, "setex", side_effect=RuntimeError("no redis")), patch.object(
            settings, "WEATHER_CACHE_TTL_SECONDS", 600
        ):
            first = await weather_service.get_weather(28.5562, 77.1)
            second = await weather_service.get_weather(28.5562, 77.1, force_refresh=True)

        self.assertEqual(FakeClient.call_count, 2)
        self.assertEqual(first["windSpeed"], 18.5)
        self.assertEqual(second["windSpeed"], 31)
        self.assertEqual(second["riskLevel"], "Medium")

    async def test_provider_failure_keeps_last_cached_data(self):
        FakeClient.responses = [FakeResponse(payload=self.payload()), FakeResponse(status_code=502)]
        with patch.object(weather_service.httpx, "AsyncClient", FakeClient), patch.object(
            weather_service.redis_client, "get", side_effect=RuntimeError("no redis")
        ), patch.object(weather_service.redis_client, "setex", side_effect=RuntimeError("no redis")), patch.object(
            settings, "WEATHER_CACHE_TTL_SECONDS", 600
        ):
            first = await weather_service.get_weather(28.5562, 77.1)
            second = await weather_service.get_weather(28.5562, 77.1, force_refresh=True)

        self.assertEqual(FakeClient.call_count, 2)
        self.assertEqual(second["temperature"], first["temperature"])
        self.assertTrue(second["cached"])
        self.assertTrue(second["stale"])
        self.assertEqual(second["message"], weather_service.WEATHER_STALE_MESSAGE)

    def test_risk_levels_include_compounding_conditions(self):
        self.assertEqual(weather_service.calculate_aviation_risk(15, 0, 10000, 20), "Low")
        self.assertEqual(weather_service.calculate_aviation_risk(30, 0, 10000, 20), "Medium")
        self.assertEqual(weather_service.calculate_aviation_risk(30, 2, 10000, 20), "High")
        self.assertEqual(weather_service.calculate_aviation_risk(10, 0, 1500, 20), "High")


if __name__ == "__main__":
    unittest.main()
