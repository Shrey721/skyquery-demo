import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./components/discover/discover-page.tsx", import.meta.url), "utf8")

assert.ok(source.indexOf("fetchDiscoverEnterpriseCandidates(search)") < source.indexOf("resolveLocationQuery(search)"))
assert.match(source, /No high-risk airports found in the selected enterprise data\./)
assert.match(source, /if \(intent\.enterpriseFirst\)/)
assert.match(source, /selectedAirport\.lat/)
assert.match(source, /selectedAirport\.lon/)

console.log("semantic enterprise flow tests passed")
