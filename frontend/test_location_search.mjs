import assert from "node:assert/strict"

import {
  boundsAroundLocation,
  clearGeocodingCache,
  localLocationLookup,
  normalizeLocationQuery,
  resolveLocationQuery,
} from "./lib/location-search.mjs"

function geocodeResponse(result) {
  return {
    ok: true,
    async json() {
      return result ? { results: [result] } : { results: [] }
    },
  }
}

clearGeocodingCache()

const delhi = localLocationLookup("show flights over Delhi")
assert.equal(delhi?.name, "Delhi")
assert.equal(Math.round(delhi.latitude), 29)

const del = localLocationLookup("show flights near DEL")
assert.equal(del?.label, "DEL")
assert.equal(del?.name, "Indira Gandhi International Airport")

assert.equal(normalizeLocationQuery("show flights over Amsterdam"), "amsterdam")
assert.equal(normalizeLocationQuery("flights around Singapore"), "singapore")

let amsterdamCalls = 0
const amsterdam = await resolveLocationQuery("show flights over Amsterdam", {
  fetcher: async () => {
    amsterdamCalls += 1
    return geocodeResponse({
      name: "Amsterdam",
      country: "Netherlands",
      latitude: 52.374,
      longitude: 4.8897,
      timezone: "Europe/Amsterdam",
    })
  },
})
const amsterdamCached = await resolveLocationQuery("Amsterdam", {
  fetcher: async () => {
    amsterdamCalls += 1
    return geocodeResponse(null)
  },
})
assert.equal(amsterdam?.label, "Amsterdam, Netherlands")
assert.equal(amsterdam?.timezone, "Europe/Amsterdam")
assert.equal(amsterdamCached?.label, "Amsterdam, Netherlands")
assert.equal(amsterdamCalls, 1)

clearGeocodingCache()
let dubaiCalls = 0
const dubai = await resolveLocationQuery("show weather near Dubai", {
  fetcher: async () => {
    dubaiCalls += 1
    return geocodeResponse({
      name: "Dubai",
      country: "United Arab Emirates",
      latitude: 25.2048,
      longitude: 55.2708,
      timezone: "Asia/Dubai",
    })
  },
})
assert.equal(dubai?.label, "Dubai, United Arab Emirates")
assert.equal(dubaiCalls, 1)

clearGeocodingCache()
let invalidCalls = 0
const invalid = await resolveLocationQuery("zzzzzzzzzz-no-place", {
  fetcher: async () => {
    invalidCalls += 1
    return geocodeResponse(null)
  },
})
const invalidCached = await resolveLocationQuery("zzzzzzzzzz-no-place", {
  fetcher: async () => {
    invalidCalls += 1
    return geocodeResponse(null)
  },
})
assert.equal(invalid, null)
assert.equal(invalidCached, null)
assert.equal(invalidCalls, 1)

const bbox = boundsAroundLocation(amsterdam)
assert.equal(bbox.lamin < amsterdam.latitude && bbox.lamax > amsterdam.latitude, true)
assert.equal(bbox.lomin < amsterdam.longitude && bbox.lomax > amsterdam.longitude, true)

console.log("location search tests passed")
