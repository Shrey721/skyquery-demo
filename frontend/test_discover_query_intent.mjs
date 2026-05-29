import assert from "node:assert/strict"

import {
  buildWeatherImpactAssessment,
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
assert.deepEqual(buildWeatherImpactAssessment(stormLondon, { operationalRisk: "Low", precipitationStatus: "None", windStatus: "Low", windGusts: 20 }, 12), {
  impactMode: true,
  impactType: "storm",
  impactTypeLabel: "Storm",
  flightsInArea: 12,
  impactedCount: 0,
  detected: false,
  assessment: "No storm-like conditions detected near this area.",
  contributors: [],
  honestyLabel: "Impact assessment is area-level based on Open-Meteo conditions, not radar cell tracking.",
})
assert.equal(buildWeatherImpactAssessment(stormLondon, { operationalRisk: "High", precipitationStatus: "Heavy", windStatus: "Low", windGusts: 20 }, 12).impactedCount, 12)

const rainDelhi = parseDiscoverQuery("flights affected by rain near Delhi")
assert.equal(normalizeLocationQuery("flights affected by rain near Delhi"), "delhi")
assert.equal(rainDelhi.fetchWeather, true)
assert.equal(rainDelhi.fetchFlights, true)
assert.equal(rainDelhi.impactType, "rain")
assert.equal(shouldMarkFlightsImpacted(rainDelhi, { precipitationStatus: "Moderate", rain: 2.4 }), true)
assert.equal(shouldMarkFlightsImpacted(rainDelhi, { precipitationStatus: "Light", rain: 0.8 }), true)
assert.equal(buildWeatherImpactAssessment(rainDelhi, { precipitationStatus: "None", rain: 0, precipitation: 0 }, 7).impactedCount, 0)
assert.equal(buildWeatherImpactAssessment(rainDelhi, { precipitationStatus: "Moderate", rain: 0, precipitation: 2.2 }, 7).impactedCount, 7)

const windMumbai = parseDiscoverQuery("show aircraft in high wind around Mumbai")
assert.equal(windMumbai.impactType, "wind")
assert.equal(shouldMarkFlightsImpacted(windMumbai, { windStatus: "High", windSpeed: 48, windGusts: 64 }), true)
assert.equal(buildWeatherImpactAssessment(windMumbai, { windStatus: "Low", windSpeed: 10, windGusts: 20 }, 4).impactedCount, 0)
assert.equal(buildWeatherImpactAssessment(windMumbai, { windStatus: "Medium", windSpeed: 20, windGusts: 60 }, 4).impactedCount, 4)

const visibilityQuery = parseDiscoverQuery("show flights in poor visibility near London")
assert.equal(visibilityQuery.impactType, "visibility")
assert.equal(buildWeatherImpactAssessment(visibilityQuery, { visibilityStatus: "Poor", visibility: 4500 }, 9).impactedCount, 9)

const normalFlightQuery = parseDiscoverQuery("show flights over Tokyo")
assert.equal(normalFlightQuery.impactMode, false)
assert.equal(buildWeatherImpactAssessment(normalFlightQuery, { operationalRisk: "High" }, 8), null)

const generalWeatherQuery = parseDiscoverQuery("show flights affected by weather near Dubai")
assert.equal(generalWeatherQuery.impactType, "general_weather")
assert.equal(buildWeatherImpactAssessment(generalWeatherQuery, { operationalRisk: "Medium" }, 3).impactedCount, 3)

assert.equal(
  requestedWeatherMetricSummary(tempTokyo, { temperature: 22 }, 5),
  "Temperature is 22 C. 5 flights in this area.",
)

console.log("discover query intent tests passed")
