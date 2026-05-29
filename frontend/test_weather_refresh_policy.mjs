import assert from "node:assert/strict"

import {
  isAllowedWeatherFetchReason,
  weatherCacheKey,
} from "./lib/weather-refresh-policy.mjs"

assert.equal(weatherCacheKey({ label: "A", latitude: 28.61, longitude: 77.21 }), weatherCacheKey({ label: "B", latitude: 28.64, longitude: 77.24 }))
assert.equal(isAllowedWeatherFetchReason("initial_load"), true)
assert.equal(isAllowedWeatherFetchReason("manual_refresh"), true)
assert.equal(isAllowedWeatherFetchReason("search_submit"), true)
assert.equal(isAllowedWeatherFetchReason("hover"), false)
assert.equal(isAllowedWeatherFetchReason("map_pan"), false)
assert.equal(isAllowedWeatherFetchReason("map_zoom"), false)
assert.equal(isAllowedWeatherFetchReason("marker_select"), false)

console.log("weather refresh policy tests passed")
