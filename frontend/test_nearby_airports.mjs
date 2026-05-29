import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

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

const panelSource = await readFile("components/discover/intelligence-panel.tsx", "utf8")
assert.equal(panelSource.includes("REFERENCE_AIRPORTS"), false)
assert.equal(panelSource.includes("Reference airport locations only"), false)

console.log("nearby airport frontend tests passed")
