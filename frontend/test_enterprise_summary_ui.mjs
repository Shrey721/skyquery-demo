import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./components/discover/intelligence-panel.tsx", import.meta.url), "utf8")

assert.match(source, /const \[dailyOpen, setDailyOpen\] = useState\(false\)/)
assert.match(source, /setDailyOpen\(\(open\) => !open\)/)
assert.match(source, /\{dailyOpen && \(/)
assert.match(source, /max-h-72 overflow-auto/)
assert.match(source, /max-h-\[720px\].*overflow-y-auto/)
assert.match(source, /enterprise\?\.airportSummaries\?\.length/)
assert.match(source, /<KpiChip label="On-Time"/)
assert.match(source, /<KpiChip label="Delay Rate"/)
assert.match(source, /<TrendBadge label="Traffic"/)
assert.match(source, /<TrendBadge label="Delays"/)
assert.match(source, /function dailyTrend/)
assert.match(source, /function SparklineCard/)
assert.match(source, /processed \$\{formatMetric\(summary\.totals\.totalFlights\)\} flights across/)
assert.match(source, /Viewing context for/)
assert.match(source, /enterprise airport\{enterprise\.selectedAirports\.length === 1 \? "" : "s"\} found/)
assert.match(source, /<EnterpriseComparisonTable/)
assert.match(source, /onClick=\{\(\) => onSelect\?\.\(summary\.airportCode\)\}/)
assert.match(source, /event\.stopPropagation\(\)/)

console.log("enterprise summary UI tests passed")
