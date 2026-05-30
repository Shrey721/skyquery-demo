import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { parseDiscoverQuery } from "./lib/discover-query-intent.mjs"
import { localLocationLookup, normalizeLocationQuery } from "./lib/location-search.mjs"

function createAirportFetchRecorder() {
  const calls = []
  return {
    fetchNearbyAirports(reason, latitude, longitude) {
      if (!["search_submit", "selected_aircraft"].includes(reason)) return false
      calls.push({ reason, latitude, longitude })
      return true
    },
    calls,
  }
}

const recorder = createAirportFetchRecorder()
recorder.fetchNearbyAirports("search_submit", 52.3676, 4.9041)
assert.deepEqual(recorder.calls, [{ reason: "search_submit", latitude: 52.3676, longitude: 4.9041 }])

const selectedRecorder = createAirportFetchRecorder()
selectedRecorder.fetchNearbyAirports("selected_aircraft", 13.69, 100.75)
assert.deepEqual(selectedRecorder.calls, [{ reason: "selected_aircraft", latitude: 13.69, longitude: 100.75 }])

const blockedRecorder = createAirportFetchRecorder()
blockedRecorder.fetchNearbyAirports("hover", 52, 4)
blockedRecorder.fetchNearbyAirports("map_pan", 52, 4)
blockedRecorder.fetchNearbyAirports("map_zoom", 52, 4)
assert.deepEqual(blockedRecorder.calls, [])

const airportsDelhi = parseDiscoverQuery("show airports near Delhi")
assert.equal(normalizeLocationQuery("show airports near Delhi"), "delhi")
assert.equal(localLocationLookup("show airports near Delhi")?.label, "Delhi")
assert.equal(airportsDelhi.fetchAirports, true)
assert.equal(airportsDelhi.fetchFlights, false)
assert.equal(airportsDelhi.fetchWeather, false)

const airportsAmsterdam = parseDiscoverQuery("airports around Amsterdam")
assert.equal(normalizeLocationQuery("airports around Amsterdam"), "amsterdam")
assert.equal(airportsAmsterdam.fetchAirports, true)

const nearestDel = parseDiscoverQuery("nearest airports near DEL")
assert.equal(localLocationLookup("nearest airports near DEL")?.label, "DEL")
assert.equal(nearestDel.fetchAirports, true)

const selectedAircraftAirports = parseDiscoverQuery("show airports around selected aircraft")
assert.equal(selectedAircraftAirports.selectedAircraftAirportMode, true)
assert.equal(selectedAircraftAirports.fetchFlights, false)

function visibleAirportMarkers(showAirports, airports) {
  return showAirports ? airports.slice(0, 10) : []
}

assert.deepEqual(visibleAirportMarkers(false, [{ code: "AMS" }]), [])
assert.equal(visibleAirportMarkers(true, Array.from({ length: 12 }, (_, index) => ({ code: `A${index}` }))).length, 10)

function airportPanelRows(expanded, airports) {
  return airports.slice(0, expanded ? 10 : 5)
}

assert.equal(airportPanelRows(false, Array.from({ length: 12 })).length, 5)
assert.equal(airportPanelRows(true, Array.from({ length: 12 })).length, 10)

const panelSource = await readFile("components/discover/intelligence-panel.tsx", "utf8")
assert.equal(panelSource.includes("REFERENCE_AIRPORTS"), false)
assert.equal(panelSource.includes("Reference airport locations only"), false)
assert.equal(panelSource.includes("nearbyAirportsSource"), true)
assert.equal(panelSource.includes("Airports in current view"), true)

const filterSource = await readFile("components/discover/discover-filters.tsx", "utf8")
assert.equal(filterSource.includes("Airports"), true)

const pageSource = await readFile("components/discover/discover-page.tsx", "utf8")
assert.equal(pageSource.includes("setShowAirports(true)"), true)
assert.equal(pageSource.includes("fetchAirportsInBounds"), true)
assert.equal(pageSource.includes("loadAirportsInCurrentView(bounds)"), true)

const mapSource = await readFile("components/discover/aviation-map.tsx", "utf8")
assert.equal(mapSource.includes(".slice(0, 10)"), true)
assert.equal(mapSource.includes("bindTooltip"), true)
assert.equal(mapSource.includes("onSelectRef.current(airport)"), false)

console.log("nearby airport frontend tests passed")
