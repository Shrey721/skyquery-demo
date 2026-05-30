import unittest

from app.services import airport_service


class AirportServiceTests(unittest.TestCase):
    def setUp(self):
        airport_service.clear_airport_cache()

    def test_amsterdam_coordinates_return_ams_near_top(self):
        result = airport_service.nearby_airports(52.3676, 4.9041, limit=5)
        codes = [airport["code"] for airport in result["airports"]]
        self.assertIn("AMS", codes[:3])
        self.assertEqual(result["source"], airport_service.AIRPORT_DATASET_SOURCE)

    def test_bangkok_coordinates_return_bkk_or_dmk_nearby(self):
        result = airport_service.nearby_airports(13.7563, 100.5018, limit=5)
        codes = {airport["code"] for airport in result["airports"]}
        self.assertTrue({"BKK", "DMK"} & codes)

    def test_delhi_coordinates_return_del_nearby(self):
        result = airport_service.nearby_airports(28.6139, 77.209, limit=5)
        codes = [airport["code"] for airport in result["airports"]]
        self.assertIn("DEL", codes[:3])

    def test_ocean_coordinates_do_not_crash(self):
        result = airport_service.nearby_airports(0, -140, limit=5)
        self.assertLessEqual(len(result["airports"]), 5)
        self.assertIn("source", result)

    def test_excluded_airport_types_are_not_returned(self):
        result = airport_service.nearby_airports(40.070985, -74.933689, limit=10)
        excluded = airport_service.EXCLUDED_TYPES
        self.assertFalse(any(airport["type"] in excluded for airport in result["airports"]))

    def test_airports_in_amsterdam_bounds_returns_ams(self):
        result = airport_service.airports_in_bounds(51.8, 4.1, 52.7, 5.5, limit=10)
        codes = [airport["code"] for airport in result["airports"]]
        self.assertIn("AMS", codes)
        self.assertLessEqual(len(result["airports"]), 10)

    def test_airports_in_bounds_clamps_limit(self):
        result = airport_service.airports_in_bounds(20, 70, 35, 90, limit=500)
        self.assertLessEqual(len(result["airports"]), 100)

    def test_comparison_query_resolves_requested_airports(self):
        result = airport_service.airports_from_comparison_query("compare DEL and ATL performance")
        codes = [airport["code"] for airport in result]
        self.assertEqual(codes, ["DEL", "ATL"])


if __name__ == "__main__":
    unittest.main()
