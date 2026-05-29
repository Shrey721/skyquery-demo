import assert from "node:assert/strict"

import { isAllowedWeatherFetchReason } from "./lib/weather-refresh-policy.mjs"

function createWeatherFetchRecorder() {
  const weatherCalls = []
  const flightCalls = []
  return {
    fetchWeatherForLocation(reason) {
      if (!isAllowedWeatherFetchReason(reason)) {
        return false
      }
      weatherCalls.push(reason)
      return true
    },
    fetchFlightsForLocation(reason) {
      if (!["initial_load", "manual_refresh", "search_submit"].includes(reason)) {
        return false
      }
      flightCalls.push(reason)
      return true
    },
    searchSubmit() {
      this.fetchWeatherForLocation("search_submit")
      this.fetchFlightsForLocation("search_submit")
    },
    weatherCalls,
    flightCalls,
  }
}

const recorder = createWeatherFetchRecorder()

assert.equal(recorder.fetchWeatherForLocation("hover"), false)
assert.equal(recorder.fetchWeatherForLocation("map_pan"), false)
assert.equal(recorder.fetchWeatherForLocation("map_zoom"), false)
assert.equal(recorder.fetchWeatherForLocation("marker_select"), false)
assert.deepEqual(recorder.weatherCalls, [])

assert.equal(recorder.fetchWeatherForLocation("initial_load"), true)
assert.equal(recorder.fetchWeatherForLocation("manual_refresh"), true)
assert.equal(recorder.fetchWeatherForLocation("search_submit"), true)
assert.deepEqual(recorder.weatherCalls, ["initial_load", "manual_refresh", "search_submit"])

const searchRecorder = createWeatherFetchRecorder()
searchRecorder.searchSubmit()
assert.deepEqual(searchRecorder.weatherCalls, ["search_submit"])
assert.deepEqual(searchRecorder.flightCalls, ["search_submit"])

const initialRecorder = createWeatherFetchRecorder()
initialRecorder.fetchWeatherForLocation("initial_load")
assert.deepEqual(initialRecorder.weatherCalls, ["initial_load"])

console.log("weather manual trigger tests passed")
