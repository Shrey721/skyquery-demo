import assert from "node:assert/strict"

import {
  buildWeatherImpactAssessment,
  parseDiscoverQuery,
  requestedWeatherMetricSummary,
  shouldMarkFlightsImpacted,
  weatherImpactSummary,
} from "./lib/discover-query-intent.mjs"
import { hasExplicitLocationScope, isComparisonQuery, semanticEnterpriseFilter } from "./lib/discover-query-intent.mjs"
import { normalizeLocationQuery } from "./lib/location-search.mjs"

const tempTokyo = parseDiscoverQuery("show temperature over Tokyo")
assert.equal(normalizeLocationQuery("show temperature over Tokyo"), "tokyo")
assert.equal(tempTokyo.fetchWeather, true)
assert.equal(tempTokyo.fetchFlights, true)
assert.equal(tempTokyo.fetchAirports, false)
assert.equal(tempTokyo.requestedMetric, "temperature")

const visibilityLondon = parseDiscoverQuery("visibility near London")
assert.equal(normalizeLocationQuery("visibility near London"), "london")
assert.equal(visibilityLondon.fetchWeather, true)
assert.equal(visibilityLondon.fetchFlights, true)
assert.equal(visibilityLondon.requestedMetric, "visibility")

const airportsDelhi = parseDiscoverQuery("show airports near Delhi")
assert.equal(normalizeLocationQuery("show airports near Delhi"), "delhi")
assert.equal(airportsDelhi.fetchAirports, true)
assert.equal(airportsDelhi.fetchFlights, false)
assert.equal(airportsDelhi.fetchWeather, false)

const airportsAmsterdam = parseDiscoverQuery("airports around Amsterdam")
assert.equal(normalizeLocationQuery("airports around Amsterdam"), "amsterdam")
assert.equal(airportsAmsterdam.fetchAirports, true)
assert.equal(airportsAmsterdam.fetchFlights, false)
assert.equal(airportsAmsterdam.fetchWeather, false)

const majorBangkok = parseDiscoverQuery("show major airports near Bangkok")
assert.equal(normalizeLocationQuery("show major airports near Bangkok"), "bangkok")
assert.equal(majorBangkok.fetchAirports, true)
assert.equal(majorBangkok.fetchFlights, false)
assert.equal(majorBangkok.fetchWeather, false)

const nearestDel = parseDiscoverQuery("nearest airports near DEL")
assert.equal(normalizeLocationQuery("nearest airports near DEL"), "del")
assert.equal(nearestDel.fetchAirports, true)
assert.equal(nearestDel.fetchFlights, false)
assert.equal(nearestDel.fetchWeather, false)

const selectedAircraftAirports = parseDiscoverQuery("show airports around selected aircraft")
assert.equal(selectedAircraftAirports.fetchAirports, true)
assert.equal(selectedAircraftAirports.fetchFlights, false)
assert.equal(selectedAircraftAirports.fetchWeather, false)
assert.equal(selectedAircraftAirports.selectedAircraftAirportMode, true)

const flightsAndAirports = parseDiscoverQuery("show flights and airports near Delhi")
assert.equal(flightsAndAirports.fetchAirports, true)
assert.equal(flightsAndAirports.fetchFlights, true)
assert.equal(flightsAndAirports.fetchWeather, false)

const airportsAndWeather = parseDiscoverQuery("show airports and weather near Amsterdam")
assert.equal(airportsAndWeather.fetchAirports, true)
assert.equal(airportsAndWeather.fetchFlights, false)
assert.equal(airportsAndWeather.fetchWeather, true)

const airportsNearFlights = parseDiscoverQuery("show airports near flights over Bangkok")
assert.equal(normalizeLocationQuery("show airports near flights over Bangkok"), "bangkok")
assert.equal(airportsNearFlights.fetchAirports, true)
assert.equal(airportsNearFlights.fetchFlights, true)
assert.equal(airportsNearFlights.fetchWeather, false)

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
assert.equal(normalFlightQuery.fetchFlights, true)
assert.equal(normalFlightQuery.fetchWeather, true)
assert.equal(buildWeatherImpactAssessment(normalFlightQuery, { operationalRisk: "High" }, 8), null)

const enterpriseAtlanta = parseDiscoverQuery("show airport performance near Atlanta")
assert.equal(enterpriseAtlanta.queryPlan.needsTrino, true)
assert.equal(enterpriseAtlanta.queryPlan.primarySource, "trino")
assert.equal(enterpriseAtlanta.fetchFlights, true)
assert.equal(enterpriseAtlanta.fetchWeather, true)
assert.equal(enterpriseAtlanta.fetchAirports, true)
assert.equal(normalizeLocationQuery("show airport performance near Atlanta"), "atlanta")

const enterpriseLive = parseDiscoverQuery("show live flights near high-delay airports around Delhi")
assert.equal(enterpriseLive.queryPlan.primarySource, "trino")
assert.equal(enterpriseLive.queryPlan.needsOpenSky, true)

const enterpriseWeather = parseDiscoverQuery("show weather risk near airports with poor performance")
assert.equal(enterpriseWeather.queryPlan.needsTrino, true)
assert.equal(enterpriseWeather.queryPlan.needsWeather, true)
assert.equal(semanticEnterpriseFilter("show flights near airports with poor performance"), "high_risk")
assert.equal(semanticEnterpriseFilter("show weather impacted flights near high risk airports"), "high_risk")
assert.equal(semanticEnterpriseFilter("show flights near airports with high delay"), "high_delay")
assert.equal(semanticEnterpriseFilter("show flights near airports with low on-time"), "low_on_time")
assert.equal(semanticEnterpriseFilter("show flights near airports with high cancellation"), "high_cancellation")
assert.equal(semanticEnterpriseFilter("show airport performance near Atlanta"), null)
assert.equal(parseDiscoverQuery("show weather impacted flights near high risk airports").enterpriseFirst, true)
assert.equal(parseDiscoverQuery("show live flights near high-delay airports").enterpriseFirst, true)
assert.equal(parseDiscoverQuery("show live flights near high-delay airports around Atlanta").enterpriseFirst, false)
assert.equal(hasExplicitLocationScope("show live flights near high-delay airports around Atlanta"), true)
assert.equal(hasExplicitLocationScope("show weather impacted flights near high risk airports"), false)
assert.equal(isComparisonQuery("compare DEL and ATL performance"), true)
assert.equal(parseDiscoverQuery("compare DEL and ATL performance").enterpriseFirst, true)

const generalWeatherQuery = parseDiscoverQuery("show flights affected by weather near Dubai")
assert.equal(generalWeatherQuery.impactType, "general_weather")
assert.equal(buildWeatherImpactAssessment(generalWeatherQuery, { operationalRisk: "Medium" }, 3).impactedCount, 3)

const scannerDelhi = parseDiscoverQuery("show close calls near Delhi")
assert.equal(normalizeLocationQuery("show close calls near Delhi"), "delhi")
assert.equal(scannerDelhi.scannerMode, true)
assert.equal(scannerDelhi.fetchFlights, false)
assert.equal(scannerDelhi.fetchWeather, false)
assert.equal(scannerDelhi.queryPlan.intent, "airspace_scanner")

const scannerAtl = parseDiscoverQuery("airspace scanner near ATL")
assert.equal(scannerAtl.scannerMode, true)
assert.equal(normalizeLocationQuery("airspace scanner near ATL"), "atl")

assert.equal(
  requestedWeatherMetricSummary(tempTokyo, { temperature: 22 }, 5),
  "Temperature is 22 C. 5 flights in this area.",
)

console.log("discover query intent tests passed")
