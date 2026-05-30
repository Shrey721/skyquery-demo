import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./components/discover/discover-page.tsx", import.meta.url), "utf8")
const mapSource = await readFile(new URL("./components/discover/aviation-map.tsx", import.meta.url), "utf8")

assert.ok(source.indexOf("fetchDiscoverEnterpriseCandidates(search)") < source.indexOf("resolveLocationQuery(search)"))
assert.match(source, /No high-risk airports found in the selected enterprise data\./)
assert.match(source, /if \(intent\.enterpriseFirst\)/)
assert.match(source, /selectedAirport\.lat/)
assert.match(source, /selectedAirport\.lon/)
assert.match(source, /switchEnterpriseAirport/)
assert.match(source, /reason: "enterprise_airport_select"/)
assert.match(source, /fetchWeatherForLocation\("enterprise_airport_select"/)
assert.match(source, /loadNearbyAirports\(airport\.lat, airport\.lon/)
assert.ok(source.indexOf("const switchEnterpriseAirport") < source.indexOf("fetchDiscoverEnterpriseCandidates(search)"))
assert.match(source, /fitLocations/)
assert.match(mapSource, /map\.fitBounds/)
const switchHandler = source.slice(source.indexOf("const switchEnterpriseAirport"), source.indexOf("const handleSearchChange"))
assert.doesNotMatch(switchHandler, /fetchDiscoverEnterprise/)

console.log("semantic enterprise flow tests passed")
