import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const page = await readFile(new URL("./components/discover/discover-page.tsx", import.meta.url), "utf8")
const filters = await readFile(new URL("./components/discover/discover-filters.tsx", import.meta.url), "utf8")
const theme = await readFile(new URL("./components/theme-toggle.tsx", import.meta.url), "utf8")
const map = await readFile(new URL("./components/discover/aviation-map.tsx", import.meta.url), "utf8")

assert.doesNotMatch(filters, /Congestion/)
assert.doesNotMatch(filters, /Weather connected/)
assert.doesNotMatch(filters, /weatherConnected/)
assert.match(page, /<Link href="\/" aria-label="SkyQuery home"/)
assert.match(theme, /z-\[1100\]/)
assert.match(theme, /z-\[1200\]/)
assert.match(page, /const \[sidebarOpen, setSidebarOpen\] = useState\(true\)/)
assert.match(page, /const \[sidebarWidth, setSidebarWidth\] = useState\(360\)/)
assert.match(page, /Math\.max\(320, Math\.min\(640,/)
assert.match(page, /skyquery_discover_sidebar_width/)
assert.match(page, /aria-label="Collapse intelligence panel"/)
assert.match(page, /aria-label="Open intelligence panel"/)
assert.match(page, /aria-label="Resize intelligence panel"/)
assert.match(map, /ResizeObserver/)
assert.match(map, /invalidateSize/)

console.log("discover UI shell tests passed")
