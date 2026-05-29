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
    searchSubmitForQuery() {
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
assert.equal(recorder.fetchWeatherForLocation("sidebar_expand"), false)
assert.deepEqual(recorder.weatherCalls, [])

assert.equal(recorder.fetchWeatherForLocation("initial_load"), true)
assert.equal(recorder.fetchWeatherForLocation("manual_refresh"), true)
assert.equal(recorder.fetchWeatherForLocation("search_submit"), true)
assert.deepEqual(recorder.weatherCalls, ["initial_load", "manual_refresh", "search_submit"])

const searchRecorder = createWeatherFetchRecorder()
searchRecorder.searchSubmitForQuery("show temperature over Tokyo")
assert.deepEqual(searchRecorder.weatherCalls, ["search_submit"])
assert.deepEqual(searchRecorder.flightCalls, ["search_submit"])

const visibilityRecorder = createWeatherFetchRecorder()
visibilityRecorder.searchSubmitForQuery("visibility near London")
assert.deepEqual(visibilityRecorder.weatherCalls, ["search_submit"])
assert.deepEqual(visibilityRecorder.flightCalls, ["search_submit"])

const rainRecorder = createWeatherFetchRecorder()
rainRecorder.searchSubmitForQuery("rain near Delhi")
assert.deepEqual(rainRecorder.weatherCalls, ["search_submit"])
assert.deepEqual(rainRecorder.flightCalls, ["search_submit"])

const flightsRecorder = createWeatherFetchRecorder()
flightsRecorder.searchSubmitForQuery("show flights over Tokyo")
assert.deepEqual(flightsRecorder.weatherCalls, ["search_submit"])
assert.deepEqual(flightsRecorder.flightCalls, ["search_submit"])

const combinedRecorder = createWeatherFetchRecorder()
combinedRecorder.searchSubmitForQuery("show flights and weather over Tokyo")
combinedRecorder.fetchWeatherForLocation("map_pan")
combinedRecorder.fetchWeatherForLocation("map_zoom")
combinedRecorder.fetchFlightsForLocation("map_pan")
combinedRecorder.fetchFlightsForLocation("map_zoom")
assert.deepEqual(combinedRecorder.weatherCalls, ["search_submit"])
assert.deepEqual(combinedRecorder.flightCalls, ["search_submit"])

const initialRecorder = createWeatherFetchRecorder()
initialRecorder.fetchWeatherForLocation("initial_load")
assert.deepEqual(initialRecorder.weatherCalls, ["initial_load"])

console.log("weather manual trigger tests passed")
