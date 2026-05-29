import assert from "node:assert/strict"

import {
  parseDiscoverQuery,
  requestedWeatherMetricSummary,
  shouldMarkFlightsImpacted,
  weatherImpactSummary,
} from "./lib/discover-query-intent.mjs"
import { normalizeLocationQuery } from "./lib/location-search.mjs"

const tempTokyo = parseDiscoverQuery("show temperature over Tokyo")
assert.equal(normalizeLocationQuery("show temperature over Tokyo"), "tokyo")
assert.equal(tempTokyo.fetchWeather, true)
assert.equal(tempTokyo.fetchFlights, true)
assert.equal(tempTokyo.requestedMetric, "temperature")

const visibilityLondon = parseDiscoverQuery("visibility near London")
assert.equal(normalizeLocationQuery("visibility near London"), "london")
assert.equal(visibilityLondon.fetchWeather, true)
assert.equal(visibilityLondon.fetchFlights, true)
assert.equal(visibilityLondon.requestedMetric, "visibility")

const stormLondon = parseDiscoverQuery("show flights near storm over London")
assert.equal(normalizeLocationQuery("show flights near storm over London"), "london")
assert.equal(stormLondon.fetchWeather, true)
assert.equal(stormLondon.fetchFlights, true)
assert.equal(stormLondon.impactType, "storm")
assert.equal(shouldMarkFlightsImpacted(stormLondon, {
  weatherCode: 95,
  precipitationStatus: "Moderate",
  windStatus: "Medium",
  cloudCover: 90,
}), true)
assert.equal(weatherImpactSummary(stormLondon, {}, 0), "No storm-like conditions detected near this area.")

const rainDelhi = parseDiscoverQuery("flights affected by rain near Delhi")
assert.equal(normalizeLocationQuery("flights affected by rain near Delhi"), "delhi")
assert.equal(rainDelhi.fetchWeather, true)
assert.equal(rainDelhi.fetchFlights, true)
assert.equal(rainDelhi.impactType, "rain")
assert.equal(shouldMarkFlightsImpacted(rainDelhi, { precipitationStatus: "Moderate", rain: 2.4 }), true)
assert.equal(shouldMarkFlightsImpacted(rainDelhi, { precipitationStatus: "Light", rain: 0.8 }), false)

const windMumbai = parseDiscoverQuery("show aircraft in high wind around Mumbai")
assert.equal(windMumbai.impactType, "wind")
assert.equal(shouldMarkFlightsImpacted(windMumbai, { windStatus: "High", windSpeed: 48, windGusts: 64 }), true)

assert.equal(
  requestedWeatherMetricSummary(tempTokyo, { temperature: 22 }, 5),
  "Temperature is 22 C. 5 flights in this area.",
)

console.log("discover query intent tests passed")
