"use client"

import { motion } from "framer-motion"
import { useEffect, useRef, useState, useMemo } from "react"
import {
  Database,
  Search,
  BarChart3,
  Table2,
  Code2,
  Download,
  ArrowUpRight,
  Sparkles,
  Pin,
  RefreshCw,
  Share2,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react"

import type { ChatMessage } from "@/app/page"
import type { MockResponse } from "@/lib/mock-data"
import { ResultVisualizer, detectGeoMapIntent, detectLiveAirspaceIntent, detectVisualizationIntent, getCompatibleVisualizations, inferVisualization } from "./result-visualizer"
import { detectGeoCompatibility, GeoMap } from "./geo-map"

interface ChatWorkspaceProps {
  messages: ChatMessage[]
  onFollowUp: (text: string, context?: any) => void
  schemaMetadata?: any
  sessionId: string
  onRefreshQuery?: (sessionId: string, messageId: string, query: string) => void
}

type ActiveTab = "chart" | "table" | "sql" | "export"
type ChartSubtype = "stat" | "line" | "bar" | "scatter" | "heatmap" | "geo" | "list"

const METADATA_RESULT_COLUMNS = new Set([
  "table_count",
  "table_name",
  "table_schema",
  "table_catalog",
  "schema_name",
  "catalog_name",
  "column_name",
  "data_type",
])

const CHART_TYPES = new Set<ChartSubtype>(["stat", "line", "bar", "scatter", "heatmap", "geo", "list"])

function normalizeChartType(value: any): ChartSubtype | null {
  if (!value) return null
  const normalized = String(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "")
  if (normalized.includes("bar") || normalized.includes("column") || normalized.includes("histogram")) return "bar"
  if (normalized.includes("line") || normalized.includes("trend") || normalized.includes("time_series")) return "line"
  if (normalized.includes("scatter") || normalized.includes("correlation")) return "scatter"
  if (normalized.includes("heat")) return "heatmap"
  if (normalized.includes("geo") || normalized.includes("map")) return "geo"
  if (normalized.includes("stat") || normalized.includes("kpi") || normalized.includes("card")) return "stat"
  if (normalized.includes("list")) return "list"
  return CHART_TYPES.has(normalized as ChartSubtype) ? normalized as ChartSubtype : null
}

function findBackendChartSuggestion(...sources: any[]): ChartSubtype | null {
  const seen = new Set<any>()
  const preferredKeys = /^(chart|chart_type|charttype|chart_suggestion|visualization|visualization_type|selected_chart_mode|primary_view|type|kind|mode)$/i

  const visit = (value: any, depth = 0): ChartSubtype | null => {
    if (value == null || depth > 4) return null
    const direct = normalizeChartType(value)
    if (direct && typeof value !== "object") return direct
    if (typeof value !== "object" || seen.has(value)) return null
    seen.add(value)

    for (const [key, nested] of Object.entries(value)) {
      if (preferredKeys.test(key)) {
        const match = normalizeChartType(nested)
        if (match) return match
      }
    }
    for (const nested of Object.values(value)) {
      const match = visit(nested, depth + 1)
      if (match) return match
    }
    return null
  }

  for (const source of sources) {
    const match = visit(source)
    if (match) return match
  }
  return null
}

function isPlainTableIntent(query: string): boolean {
  const q = query.toLowerCase()
  return /\b(show|list|preview|display|get)\b.*\b(records|rows|table|raw)\b/.test(q) ||
    /\b(all records|all rows|as table|in a table|table view|raw data|preview rows)\b/.test(q)
}

function isHighConfidenceChartIntent(query: string): boolean {
  const intent = detectVisualizationIntent(query)
  if (intent.type && intent.type !== "table" && intent.confidence >= 0.7) return true
  const q = query.toLowerCase()
  return /\b(compare|comparison|ranking|ranked|top|bottom|trend|over time|by\s+\w+|versus|vs|correlation|distribution|breakdown)\b/.test(q)
}

function pickBestSupportedChart(supported: ChartSubtype[], preferred: ChartSubtype | null): ChartSubtype | null {
  if (preferred && supported.includes(preferred)) return preferred
  const priority: ChartSubtype[] = ["bar", "line", "geo", "scatter", "heatmap", "stat"]
  return priority.find(type => supported.includes(type)) || null
}

function describeBarAvailability(headers: string[], rows: any[], supported: ChartSubtype[]): string {
  if (supported.includes("bar")) return "true: categorical_or_text_dimension_and_numeric_measure_detected"
  if (!rows.length) return "false: no_rows"
  const numericHeaders = headers.filter(header => {
    const values = rows.map(row => row?.[header]).filter(value => value !== null && value !== undefined && value !== "")
    if (!values.length) return false
    const numericMatches = values.filter(value => {
      const cleaned = typeof value === "string" ? value.replace(/[$,%]/g, "").trim() : value
      return cleaned !== "" && Number.isFinite(Number(cleaned))
    }).length
    return numericMatches / values.length > 0.8
  })
  const textHeaders = headers.filter(header => {
    const values = rows.map(row => row?.[header]).filter(value => value !== null && value !== undefined && value !== "")
    return values.some(value => !Number.isFinite(Number(typeof value === "string" ? value.replace(/[$,%]/g, "").trim() : value)))
  })
  return `false: text_dimensions=${textHeaders.length}, numeric_measures=${numericHeaders.length}`
}

function isMetadataResult(response: MockResponse, rows?: any[], headersOverride?: string[]): boolean {
  const intent = (response as any).result_intent
  const category = typeof intent === "string" ? intent : intent?.category
  if (category === "metadata") return true
  const rendering = (response as any).rendering
  if (rendering?.mode === "metadata" || rendering?.template_source === "metadata_result_rendering") return true

  const headers = (headersOverride || response.tableHeaders || []).map((header) => String(header).toLowerCase())
  const metadataHits = headers.filter((header) => METADATA_RESULT_COLUMNS.has(header))
  const hasCatalogSchemaTableShape =
    (headers.includes("table_catalog") || headers.includes("catalog_name") || headers.includes("catalog")) &&
    (headers.includes("table_schema") || headers.includes("schema_name") || headers.includes("schema")) &&
    (headers.includes("table_name") || headers.includes("column_name"))
  const hasColumnMetadataShape = headers.includes("column_name") && headers.includes("data_type")
  const hasStructuralTableShape = headers.includes("table_name") && (headers.includes("column_count") || headers.includes("table_count"))
  const nonIndexHeaders = headers.filter((header) => header !== "__row_index")
  const metadataRatio = nonIndexHeaders.length > 0 ? metadataHits.length / nonIndexHeaders.length : 0
  const rowSample = rows || response.rows || []
  const lowCardinalityStructuralResult = rowSample.length <= 250 && metadataRatio >= 0.6

  return hasCatalogSchemaTableShape || hasColumnMetadataShape || hasStructuralTableShape || lowCardinalityStructuralResult
}

function normalizeInsightCards(cards: any[] | undefined) {
  if (!Array.isArray(cards)) return []
  return cards
    .map((card) => ({
      title: String(card?.title || "Insight"),
      body: String(card?.body || card?.text || ""),
    }))
    .filter((card) => card.body)
}

// ---------- Inline loading dots ----------
function InlineLoader() {
  const steps = [
    "Interpreting schema...",
    "Generating SQL...",
    "Querying Starburst cluster...",
    "Rendering results...",
  ]
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s < steps.length - 1 ? s + 1 : s))
    }, 350)
    return () => clearInterval(interval)
  }, [steps.length])

  return (
    <motion.div
      className="flex items-center gap-3 py-4 text-muted-foreground font-medium"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
          style={{ animationDelay: "200ms" }}
        />
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
          style={{ animationDelay: "400ms" }}
        />
      </div>
      <span className="text-sm">{steps[step]}</span>
    </motion.div>
  )
}

function GeoNavigationView({
  navigation,
  messageId,
  enableLivePolling,
  geoSource,
}: {
  navigation: NonNullable<ChatMessage["navigation"]>
  messageId: string
  enableLivePolling: boolean
  geoSource: { rows: any[]; headers: string[]; queryResultId: string } | null
}) {
  const mode = navigation.target === "live_airspace" ? "live" : "query"
  const assistantMessage = navigation.target === "geo_map" && !geoSource
    ? "There is no current map-compatible result to open."
    : navigation.assistantMessage
  return (
    <div className="space-y-4">
      <motion.p
        className="text-sm leading-relaxed font-semibold text-foreground bg-primary/[0.03] border-l-2 border-primary/50 pl-3.5 py-1.5 rounded-r-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {assistantMessage}
      </motion.p>
      {navigation.target === "live_airspace" ? (
        <GeoMap
          mode={mode}
          enableLivePolling={enableLivePolling}
          navigationOnly
          queryResultId={messageId}
        />
      ) : geoSource ? (
        <GeoMap
          rows={geoSource.rows}
          headers={geoSource.headers}
          mode="query"
          queryResultId={geoSource.queryResultId}
        />
      ) : (
        <div className="rounded-xl border border-border/30 bg-secondary/10 p-6 text-sm text-muted-foreground">
          No current result contains map-ready geographic fields. Run a query returning locations or latitude/longitude fields first.
        </div>
      )}
    </div>
  )
}

function rowsFromResponse(response: MockResponse): { rows: any[]; headers: string[] } {
  const headers = response.tableHeaders || []
  const rows = response.rows && response.rows.length > 0
    ? response.rows
    : (response.tableRows || []).map((row) =>
        Object.fromEntries(headers.map((header, index) => [header, row.cells[index]]))
      )
  return { rows, headers }
}

function findCurrentGeoSource(messages: ChatMessage[], beforeIndex: number) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message.response || message.navigation) continue
    const result = rowsFromResponse(message.response)
    if (detectGeoCompatibility(result.rows, result.headers).compatible) {
      return { ...result, queryResultId: message.id }
    }
    return null
  }
  return null
}

function getGeoNavigation(message: ChatMessage): NonNullable<ChatMessage["navigation"]> | null {
  if (message.navigation) return message.navigation
  if (detectLiveAirspaceIntent(message.query)) {
    return { target: "live_airspace", assistantMessage: "Opening Live Airspace." }
  }
  if (detectGeoMapIntent(message.query)) {
    return { target: "geo_map", assistantMessage: "Opening Geo Map." }
  }
  const response: any = message.response
  const target = response?.rendering?.navigation_target ||
    (response?.result_intent?.category === "live_airspace" ? "live_airspace" : null)
  if (target !== "live_airspace" && target !== "geo_map") return null
  return {
    target,
    assistantMessage: target === "live_airspace" ? "Opening Live Airspace." : "Opening Geo Map.",
  }
}

export function generateFollowUpsFromMetadata(
  userQuery: string,
  sql: string,
  headers: string[],
  schemaMetadata: any
): string[] {
  const fallbackFollowUps = [
    "Show more rows",
    "Group results by a field",
    "List available columns"
  ];

  try {
    const qLower = userQuery.toLowerCase();
    const suggestions: string[] = [];

    // Let's analyze headers (columns returned by the SQL)
    const returnedCols = (headers || []).map(h => h.toLowerCase());

    // If we have schemaMetadata, we can offer extremely rich follow-ups
    const tables = schemaMetadata?.tables || [];
    const tableNames = tables.map((t: any) => (typeof t === "string" ? t : t.name || t.table_name || "")).filter(Boolean);

    // Context A: Aviation-specific extremely precise follow-ups
    if (tableNames.some((t: string) => t.toLowerCase().includes("flight"))) {
      if (returnedCols.includes("status")) {
        suggestions.push("Group results by status");
      }
      if (returnedCols.includes("airline") || returnedCols.includes("carrier")) {
        suggestions.push("Group results by carrier");
      }
      if (returnedCols.includes("airport") || returnedCols.includes("origin") || returnedCols.includes("destination")) {
        suggestions.push("Group results by location");
      }
    }

    // Context B: Generic metadata-aware follow-ups based on returned columns!
    if (returnedCols.length > 0) {
      const primaryCol = returnedCols[0];
      suggestions.push(`Group results by ${primaryCol}`);
      if (returnedCols.length > 1) {
        const secondaryCol = returnedCols[1];
        suggestions.push(`Compare ${primaryCol} with ${secondaryCol}`);
      }
    }

    // Context C: Table-aware follow-ups
    if (tableNames.length > 0) {
      // Find a table that wasn't queried (not in the user query / SQL) to suggest cross-table discovery!
      const unqueriedTable = tableNames.find((t: string) => !qLower.includes(t.toLowerCase()) && !sql.toLowerCase().includes(t.toLowerCase()));
      if (unqueriedTable) {
        suggestions.push(`Correlate these results with ${unqueriedTable} data`);
      }
    }

    // Guarantee unique and populated suggestions
    const unique = Array.from(new Set(suggestions)).filter(Boolean);
    while (unique.length < 3) {
      const nextFallback = fallbackFollowUps.find((item) => !unique.includes(item));
      if (nextFallback) {
        unique.push(nextFallback);
      } else {
        break;
      }
    }

    return unique.slice(0, 3);
  } catch (e) {
    console.error("Error generating follow-ups from metadata:", e);
    return fallbackFollowUps;
  }
}

interface KPI {
  label: string
  value: string
  sub: string
}

export function generateIntelligentKPIs(
  query: string,
  headers: string[],
  rows: any[],
  existingKpis: any[]
): KPI[] {
  const qLower = query.toLowerCase()
  const kpis: KPI[] = []

  if (!rows || rows.length === 0) {
    return [
      { label: "Result Count", value: "0", sub: "No records found" }
    ]
  }

  // 1. Preserve or extract any existing meaningful business/data KPIs
  const validExisting = (existingKpis || []).filter(k =>
    k.label &&
    !k.label.toLowerCase().includes("status") &&
    !k.sub?.toLowerCase().includes("backend")
  )
  kpis.push(...validExisting)

  // 2. Identify column details
  const delayCol = headers.find(h => h.toLowerCase().includes("delay"))
  const carrierCol = headers.find(h => h.toLowerCase().includes("carrier") || h.toLowerCase().includes("airline"))
  const airportCol = headers.find(h => h.toLowerCase().includes("airport") || h.toLowerCase().includes("origin") || h.toLowerCase().includes("dest"))

  const getVal = (row: any, col: string) => {
    if (!row || !col) return 0
    const rawVal = row[col]
    const parsed = typeof rawVal === "number" ? rawVal : Number(String(rawVal).replace(/[$,%]/g, ""))
    return isNaN(parsed) ? 0 : parsed
  }

  // A. Flight/delay statistics
  if (delayCol) {
    const delayVals = rows.map(r => getVal(r, delayCol))
    const totalDelays = delayVals.reduce((a, b) => a + b, 0)
    const avgDelay = totalDelays / rows.length
    const maxDelay = Math.max(...delayVals)
    const delayedCount = delayVals.filter(v => v > 15).length
    const onTimeCount = delayVals.filter(v => v <= 15).length
    const onTimePct = (onTimeCount / rows.length) * 100

    kpis.push({
      label: "Average Delay",
      value: `${avgDelay.toFixed(1)} mins`,
      sub: "Mean arrival/departure offset"
    })

    kpis.push({
      label: "Peak Delay",
      value: `${maxDelay.toLocaleString()} mins`,
      sub: "Maximum recorded delay duration"
    })

    if (rows.length > 1) {
      kpis.push({
        label: "On-Time Percentage",
        value: `${onTimePct.toFixed(1)}%`,
        sub: "Flights with <= 15m delay"
      })
      kpis.push({
        label: "Delayed Volume",
        value: delayedCount.toLocaleString(),
        sub: "Flights delayed > 15m"
      })
    }
  }

  // B. Carrier/airline grouping
  if (carrierCol && rows.length > 1) {
    const carriers = rows.map(r => String(r[carrierCol]))
    const uniqueCarriers = new Set(carriers)

    const carrierMetrics: Record<string, number> = {}
    rows.forEach(r => {
      const c = String(r[carrierCol])
      const val = delayCol ? getVal(r, delayCol) : 1
      carrierMetrics[c] = (carrierMetrics[c] || 0) + val
    })

    let topCarrier = ""
    let maxMetric = -1
    Object.entries(carrierMetrics).forEach(([c, val]) => {
      if (val > maxMetric) {
        maxMetric = val
        topCarrier = c
      }
    })

    kpis.push({
      label: "Active Carriers",
      value: uniqueCarriers.size.toString(),
      sub: "Unique operators analysed"
    })

    if (topCarrier) {
      kpis.push({
        label: delayCol ? "Highest Delay Carrier" : "Highest Traffic Carrier",
        value: topCarrier,
        sub: delayCol ? `Total cumulative delay: ${maxMetric.toLocaleString()}m` : `Total operations: ${maxMetric.toLocaleString()}`
      })
    }
  }

  // C. Airport grouping
  if (airportCol && rows.length > 1) {
    const airports = rows.map(r => String(r[airportCol]))
    const uniqueAirports = new Set(airports)
    kpis.push({
      label: "Reported Airports",
      value: uniqueAirports.size.toString(),
      sub: "Operational hubs involved"
    })
  }

  // D. General fallback if list is too small
  if (kpis.length < 3) {
    kpis.push({
      label: "Total Records",
      value: rows.length.toLocaleString(),
      sub: "Analysed dataset rows count"
    })

    const numericCols = headers.filter(h => {
      const val = rows[0][h]
      return typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)))
    })

    if (numericCols.length > 0) {
      const firstNum = numericCols[0]
      const vals = rows.map(r => getVal(r, firstNum))
      const sum = vals.reduce((a, b) => a + b, 0)
      kpis.push({
        label: `Total ${firstNum}`,
        value: sum.toLocaleString(),
        sub: `Sum total of ${firstNum}`
      })
    }
  }

  const finalKpis: KPI[] = []
  const seenLabels = new Set<string>()
  kpis.forEach(k => {
    if (!seenLabels.has(k.label.toLowerCase())) {
      seenLabels.add(k.label.toLowerCase())
      finalKpis.push(k)
    }
  })

  return finalKpis.slice(0, 4)
}

interface InsightData {
  keyInsight: string
  possibleReason: string
  suggestedFollowUp: string
}

export function generateInsightPanel(
  query: string,
  headers: string[],
  rows: any[],
  summaryText?: string
): InsightData {
  const qLower = query.toLowerCase()

  let keyInsight = summaryText || `Successfully analysed ${rows.length} records across ${headers.length} attributes.`
  let possibleReason = "This view is based only on returned query rows."
  let suggestedFollowUp = "Refine the query or choose another returned field for comparison."

  if (rows.length === 0) {
    return {
      keyInsight: "No matching records found for this query context.",
      possibleReason: "No rows were returned by the data source.",
      suggestedFollowUp: "Try widening filters or inspecting available fields."
    }
  }

  const hasTime = headers.some(h => {
    const hl = h.toLowerCase()
    return hl.includes("date") || hl.includes("time") || hl.includes("hour") || hl.includes("day") || hl.includes("month")
  })
  const hasDelay = headers.some(h => h.toLowerCase().includes("delay"))
  const numericCols = headers.filter(h => {
    const val = rows[0][h]
    return typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)))
  })

  const getVal = (row: any, col: string) => {
    if (!row || !col) return 0
    const rawVal = row[col]
    const parsed = typeof rawVal === "number" ? rawVal : Number(String(rawVal).replace(/[$,%]/g, ""))
    return isNaN(parsed) ? 0 : parsed
  }

  if (hasDelay) {
    const delayCol = headers.find(h => h.toLowerCase().includes("delay"))!
    const delayVals = rows.map(r => getVal(r, delayCol))
    const avgDelay = delayVals.reduce((a, b) => a + b, 0) / rows.length

    if (hasTime) {
      keyInsight = `The returned delay values average ${avgDelay.toFixed(1)} across the selected time field.`
      possibleReason = "The average is calculated from returned values only."
      suggestedFollowUp = "Compare the delay field across another returned dimension."
    } else {
      keyInsight = `The returned delay values average ${avgDelay.toFixed(1)}.`
      possibleReason = "The average is calculated from returned values only."
      suggestedFollowUp = "Group this delay field by another returned dimension."
    }
  } else if (hasTime && numericCols.length > 0) {
    const firstNum = numericCols[0]
    keyInsight = `The result includes ${firstNum} values grouped over a time field.`
    possibleReason = "The result contains a time field and a numeric field."
    suggestedFollowUp = `Compare ${firstNum} with another returned metric.`
  } else if (qLower.includes("elevation") || qLower.includes("airport")) {
    keyInsight = summaryText || `The query returned ${rows.length} row(s) containing location-related fields.`
    possibleReason = "The result contains fields referenced in the query."
    suggestedFollowUp = "Compare returned location fields with a numeric measure."
  } else if (qLower.includes("weather")) {
    keyInsight = summaryText || `The query returned ${rows.length} row(s) containing weather-related fields.`
    possibleReason = "The result contains fields referenced in the query."
    suggestedFollowUp = "Group returned values by another available field."
  }

  return {
    keyInsight,
    possibleReason,
    suggestedFollowUp
  }
}

function generateRelaxedFilterFollowUps(userQuery: string): string[] {
  const q = userQuery.toLowerCase();
  const suggestions = [];

  if (q.includes("delay") || q.includes("status") || q.includes("cancelled") || q.includes("diverted")) {
    suggestions.push("Remove delay/status filter");
  }
  
  if (q.includes("airport") || q.includes("origin") || q.includes("destination") || q.includes("dest") || q.includes("from ") || q.includes("to ")) {
    suggestions.push("Try a different airport");
  }

  suggestions.push("Show rows without the current filter");
  
  if (suggestions.length < 3) {
    suggestions.push("Relax date or time filter");
  }
  if (suggestions.length < 3) {
    suggestions.push("Inspect available fields");
  }

  return suggestions.slice(0, 3);
}

function generateContextualSummary(
  userQuery: string,
  tableHeaders: string[],
  rowCount: number,
  kpis: any[],
  defaultSummary: string
): string {
  if (rowCount === 0) {
    return "No matching records were found for this query. The filter criteria may be too narrow.";
  }
  if (!userQuery) return defaultSummary;
  const q = userQuery.toLowerCase();
  const headers = tableHeaders.map(h => h.toLowerCase());

  // Delay queries
  if (q.includes("delay") || q.includes("delayed") || q.includes("late")) {
    if (headers.includes("carrier") || headers.includes("airline") || headers.includes("unique_carrier")) {
      return "Returned values grouped by a category field.";
    }
    if (headers.includes("airport") || headers.includes("origin") || headers.includes("dest")) {
      return "Returned values grouped by location fields.";
    }
    if (q.includes("hour") || q.includes("time") || headers.includes("hour")) {
      return "Returned values summarized across a time field.";
    }
    return "Returned values include a delay-related field.";
  }

  // Duration queries
  if (q.includes("duration") || q.includes("time") || q.includes("length") || q.includes("how long")) {
    if (q.includes("hour") || headers.includes("hour") || headers.includes("departure_hour")) {
      return "Returned values summarized across a time field.";
    }
    return "Returned values include a duration-related field.";
  }

  // Status queries
  if (q.includes("status") || q.includes("cancelled") || q.includes("diverted")) {
    return "Returned values include a status-related field.";
  }

  // Destination / Origin / Routes
  if (q.includes("route") || q.includes("destination") || q.includes("popular") || q.includes("most") || q.includes("frequency")) {
    return "Returned values grouped by location fields.";
  }

  // Fallback but clean summary
  if (q.includes("average") || q.includes("avg") || q.includes("mean")) {
    return "Summary of returned average values.";
  }

  // Clean conversational fallback instead of technical executions
  return defaultSummary || "Analysis of returned data.";
}

// ---------- Single message result ----------
function MessageResult({
  response,
  isLatest,
  onFollowUp,
  schemaMetadata,
  userQuery,
  sessionId,
  messageId,
  onRefreshQuery,
}: {
  response: MockResponse
  isLatest: boolean
  onFollowUp: (text: string, context?: any) => void
  schemaMetadata?: any
  userQuery: string
  sessionId?: string
  messageId?: string
  onRefreshQuery?: (sessionId: string, messageId: string, query: string) => void
}) {
  const rendering = (response as any).rendering || {};
  const metadataResult = isMetadataResult(response);
  const selectedHeader = rendering.header || null;

  const visualizationRouting = useMemo(() => {
    const rows = response.rows && response.rows.length > 0
      ? response.rows
      : (response.tableRows || []).map((tr) => {
          const rowObj: any = {};
          (response.tableHeaders || []).forEach((header, idx) => {
            const val = tr.cells[idx];
            if (val !== undefined) rowObj[header] = val;
          });
          return rowObj;
        });
    const headers = response.tableHeaders || [];
    const metadataStyleResult = isMetadataResult(response, rows, headers);
    const explicitIntent = detectVisualizationIntent(userQuery || "");
    const liveAirspaceIntent = detectLiveAirspaceIntent(userQuery || "");
    const userRequestedChart = explicitIntent.explicit && explicitIntent.type && explicitIntent.type !== "table"
      ? explicitIntent.type as ChartSubtype
      : null;
    const explicitVisualizationRequested = Boolean(explicitIntent.explicit && userRequestedChart);
    const explicitGeoIntent = explicitVisualizationRequested && userRequestedChart === "geo";
    const backendChartSuggestion = findBackendChartSuggestion(
      rendering,
      (response as any).chart_suggestion,
      (response as any).chartSuggestion,
      (response as any).result_shaper,
      (response as any).execution,
      (response as any).visualization,
      response,
    );
    const resultShapeChartType = normalizeChartType(inferVisualization(headers, rows).type);
    const compatibleCharts = getCompatibleVisualizations(headers, rows);
    const bestSupportedChart = pickBestSupportedChart(compatibleCharts, resultShapeChartType);
    const geoDetection = detectGeoCompatibility(rows, response.tableHeaders || []);
    const backendGeo =
      String(rendering.primary_view || rendering.visualization_type || rendering.selected_chart_mode || "").toLowerCase() === "geo" ||
      Number(rendering.geo_confidence || 0) >= 0.75;
    const compatible = (type: ChartSubtype | null) => Boolean(type && compatibleCharts.includes(type));
    const geoCompatible = geoDetection.compatible;

    let finalActiveTab: ActiveTab = "table";
    let finalChartSubtype: ChartSubtype | null = null;
    let fallbackReason: string | null = null;

    if (liveAirspaceIntent) {
      finalActiveTab = "chart";
      finalChartSubtype = "geo";
    } else if (explicitIntent.type === "table") {
      finalActiveTab = "table";
      fallbackReason = "explicit_table_request";
    } else if (explicitGeoIntent) {
      if (geoCompatible) {
        finalActiveTab = "chart";
        finalChartSubtype = "geo";
      } else {
        finalActiveTab = "table";
        fallbackReason = "explicit_geo_coordinates_missing";
      }
    } else if (userRequestedChart) {
      if (compatible(userRequestedChart)) {
        finalActiveTab = "chart";
        finalChartSubtype = userRequestedChart;
      } else if (explicitIntent.confidence >= 0.75 && bestSupportedChart) {
        finalActiveTab = "chart";
        finalChartSubtype = bestSupportedChart;
        fallbackReason = "requested_chart_unsupported_used_best_supported";
      } else {
        finalActiveTab = "table";
        fallbackReason = "explicit_chart_fields_unavailable";
      }
    } else if (metadataStyleResult && !explicitIntent.explicit) {
      finalActiveTab = "table";
      fallbackReason = "metadata_style_result_defaults_to_table";
    } else if (backendChartSuggestion && compatible(backendChartSuggestion)) {
      finalActiveTab = "chart";
      finalChartSubtype = backendChartSuggestion;
    } else if ((backendGeo || backendChartSuggestion === "geo") && geoCompatible) {
      finalActiveTab = "chart";
      finalChartSubtype = "geo";
    } else if (rendering.default_tab === "sql") {
      finalActiveTab = "sql";
    } else if (rendering.default_tab === "export") {
      finalActiveTab = "export";
    } else if (rendering.default_tab === "chart" && compatible(resultShapeChartType)) {
      finalActiveTab = "chart";
      finalChartSubtype = resultShapeChartType;
    } else if (metadataStyleResult) {
      finalActiveTab = "table";
      fallbackReason = "metadata_result_defaults_to_table";
    } else if (isPlainTableIntent(userQuery || "")) {
      finalActiveTab = "table";
      fallbackReason = "plain_table_or_preview_request";
    } else if (isHighConfidenceChartIntent(userQuery || "") && bestSupportedChart) {
      finalActiveTab = "chart";
      finalChartSubtype = bestSupportedChart;
    } else if (rendering.default_tab === "table" || rendering.default_tab === "overview") {
      finalActiveTab = "table";
    } else if (compatible(resultShapeChartType) && response.resultType === "chart") {
      finalActiveTab = "chart";
      finalChartSubtype = resultShapeChartType;
    } else {
      finalActiveTab = "table";
      fallbackReason = "default_table";
    }

    const autoChartType = bestSupportedChart;
    const selectedChartType = finalActiveTab === "chart" ? finalChartSubtype : null;
    const renderedComponentType = finalActiveTab === "chart" ? finalChartSubtype : finalActiveTab;
    const mismatchDetected = finalActiveTab === "chart" && !finalChartSubtype;

    console.log("Visualization routing diagnostics", {
      rawUserQuery: userQuery || "",
      liveAirspaceIntent,
      explicit_visualization_terms_detected: explicitIntent.explicitTerms,
      normalized_visualization_intent: explicitIntent.normalizedIntent,
      explicit_visualization_requested: explicitVisualizationRequested,
      explicit_visualization_intent: explicitIntent.explicit ? explicitIntent.type : null,
      requested_chart_type: userRequestedChart,
      has_coordinate_fields: geoCompatible,
      detected_columns: headers,
      matched_latitude_field: geoDetection.latKey,
      matched_longitude_field: geoDetection.lonKey,
      matched_location_fields: geoDetection.locationFields,
      matched_code_fields: geoDetection.codeFields,
      reason_for_incompatibility: geoCompatible ? null : geoDetection.reason,
      supported_chart_types: compatibleCharts,
      backend_chart_suggestion: backendChartSuggestion,
      backendSuggestedChartType: backendChartSuggestion,
      autoSelectedChartType: autoChartType,
      userSelectedChartType: null,
      finalChartType: finalChartSubtype,
      renderedComponentType,
      mismatchDetected,
      autoChartType,
      supportedChartTypes: compatibleCharts,
      selectedChartType,
      fallbackChartType: fallbackReason ? finalChartSubtype : null,
      fallbackReason,
      result_shape_chart_type: resultShapeChartType,
      metadata_style_result_detected: metadataStyleResult,
      metadata_default_table_applied: metadataStyleResult && finalActiveTab === "table" && !explicitIntent.explicit,
      final_active_tab: finalActiveTab,
      final_chart_type: finalChartSubtype,
      final_default_chart_type: finalChartSubtype,
      final_chart_subtype: finalChartSubtype,
      why_bar_available_true_false: describeBarAvailability(headers, rows, compatibleCharts),
      previous_chart_state_reused: false,
    });

    return { activeTab: finalActiveTab, chartSubtype: finalChartSubtype, fallbackReason, requestedChartType: userRequestedChart };
  }, [
    userQuery,
    rendering,
    response,
    response.rows,
    response.tableRows,
    response.tableHeaders,
    response.resultType,
  ]);

  const parsedTabIntent = visualizationRouting.activeTab;
  const initialChartType = visualizationRouting.chartSubtype;

  useEffect(() => {
    if (visualizationRouting.fallbackReason === "explicit_chart_fields_unavailable") {
      console.log("Chart view unavailable because required fields were not returned.", {
        requested_chart_type: visualizationRouting.requestedChartType,
        fallback_chart_type: initialChartType,
        fallback_reason: visualizationRouting.fallbackReason,
      });
    }
  }, [visualizationRouting.fallbackReason, visualizationRouting.requestedChartType, initialChartType]);

  const [activeTab, setActiveTab] = useState<ActiveTab>(parsedTabIntent)
  const [isPinned, setIsPinned] = useState(false)
  const [copiedSql, setCopiedSql] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [tablePage, setTablePage] = useState(0)
  const [tableRowsPerPage, setTableRowsPerPage] = useState(30)
  const loggedResultKey = useRef<string | null>(null)
  const initializedTabResultKey = useRef<string | null>(null)

  useEffect(() => {
    const resultKey = messageId || `${response.sql || ""}:${response.summary || ""}:${response.rowCount || 0}`;
    if (initializedTabResultKey.current === resultKey) return;
    initializedTabResultKey.current = resultKey;
    setActiveTab(parsedTabIntent)
  }, [parsedTabIntent, messageId, response.sql, response.summary, response.rowCount])

  const dynamicFollowUps = useMemo(() => {
    const backendChips = rendering.followup_chips || rendering.followups;
    if (Array.isArray(backendChips) && backendChips.length > 0) return backendChips;
    if (metadataResult) return [];
    if (response.followUps && response.followUps.length > 0) return response.followUps;
    return generateFollowUpsFromMetadata(userQuery, response.sql || "", response.tableHeaders || [], schemaMetadata);
  }, [userQuery, response.sql, response.tableHeaders, schemaMetadata, response.followUps, metadataResult, rendering.followup_chips, rendering.followups]);

  const buildFollowUpContext = (label: string) => ({
    action_type: metadataResult
      ? `metadata_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`
      : "analytics_followup",
    action_label: label,
    previous_question: userQuery,
    previous_result_intent: (response as any).result_intent || (metadataResult ? { category: "metadata" } : undefined),
    previous_sql: response.sql,
    previous_columns: response.tableHeaders || [],
    previous_rows: rowsToUse.slice(0, 25),
    metadata_context: rendering.metadata_context,
  });

  const relaxedFollowUps = useMemo(() => {
    const backendChips = rendering.followup_chips || rendering.followups;
    if (Array.isArray(backendChips) && backendChips.length > 0) return backendChips;
    if (metadataResult) return ["List available tables", "Inspect columns", "Preview sample rows"];
    return generateRelaxedFilterFollowUps(userQuery);
  }, [userQuery, metadataResult, rendering.followup_chips, rendering.followups]);

  const tabs: { key: ActiveTab; label: string; icon: typeof BarChart3 }[] = [
    { key: "chart", label: "chart", icon: BarChart3 },
    { key: "table", label: "table", icon: Table2 },
    { key: "sql", label: "sql", icon: Code2 },
    { key: "export", label: "export", icon: Download },
  ]

  const rowsToUse = useMemo(() => {
    if (response.rows && response.rows.length > 0) {
      return response.rows;
    }
    if (!response.tableHeaders || !response.tableRows) return [];
    return response.tableRows.map((tr) => {
      const rowObj: any = {};
      response.tableHeaders.forEach((header, idx) => {
        const val = tr.cells[idx];
        if (val === undefined) return;
        rowObj[header] = val;
      });
      return rowObj;
    });
  }, [response.rows, response.tableHeaders, response.tableRows]);

  const tableRows = response.tableRows || [];
  const shouldPaginateTable = tableRows.length > 30;
  const tableTotalPages = Math.max(1, Math.ceil(tableRows.length / tableRowsPerPage));
  const clampedTablePage = Math.min(tablePage, tableTotalPages - 1);
  const tablePageStart = clampedTablePage * tableRowsPerPage;
  const tablePageEnd = Math.min(tablePageStart + tableRowsPerPage, tableRows.length);
  const visibleTableRows = shouldPaginateTable
    ? tableRows.slice(tablePageStart, tablePageEnd)
    : tableRows;

  useEffect(() => {
    setTablePage(0);
  }, [messageId, tableRows.length, tableRowsPerPage]);

  const intelligentKPIs = useMemo(() => {
    return generateIntelligentKPIs(userQuery, response.tableHeaders || [], rowsToUse, response.kpis || []);
  }, [userQuery, response.tableHeaders, rowsToUse, response.kpis]);

  const insightData = useMemo(() => {
    if (rowsToUse.length === 0) return null;
    if (metadataResult) {
      const cards = normalizeInsightCards(rendering.insight_cards);
      return {
        keyInsight: cards[0]?.body || response.summary || "Schema discovery results are available.",
        possibleReason: rendering.possible_reason || "This result was generated from connected catalog/schema metadata.",
        suggestedFollowUp: rendering.suggested_followup || "List available tables, inspect columns, or preview sample rows.",
      };
    }
    const generated = generateInsightPanel(userQuery, response.tableHeaders || [], rowsToUse, response.summary);
    return {
      ...generated,
      possibleReason: rendering.possible_reason || generated.possibleReason,
      suggestedFollowUp: rendering.suggested_followup || generated.suggestedFollowUp,
    };
  }, [userQuery, response.tableHeaders, rowsToUse, response.summary, metadataResult, rendering.insight_cards, rendering.possible_reason, rendering.suggested_followup]);

  const selectedInsightCards = useMemo(() => {
    const backendCards = normalizeInsightCards(rendering.insight_cards);
    if (backendCards.length > 0) return backendCards;
    if (!insightData) return [];
    return [
      { title: "Key Insight", body: insightData.keyInsight },
      { title: "Possible Reason", body: insightData.possibleReason },
      { title: "Suggested Follow-up", body: insightData.suggestedFollowUp },
    ];
  }, [rendering.insight_cards, insightData]);

  useEffect(() => {
    const resultKey = messageId || `${response.sql || ""}:${response.summary || ""}:${response.rowCount || 0}`;
    if (loggedResultKey.current === resultKey) return;
    loggedResultKey.current = resultKey;
    console.log({
      result_intent: (response as any).result_intent,
      rendering: (response as any).rendering,
      selectedHeader,
      selectedInsightCards,
    });
  }, [messageId, response, selectedHeader, selectedInsightCards]);

  const handleExportCSV = () => {
    if (!response.tableHeaders || rowsToUse.length === 0) return;
    const headers = response.tableHeaders;
    const csvContent = [
      headers.join(","),
      ...rowsToUse.map((row) =>
        headers
          .map((h) => {
            const val = row[h] === undefined || row[h] === null ? "" : String(row[h]);
            if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `skyquery_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (rowsToUse.length === 0) return;
    const jsonContent = JSON.stringify(rowsToUse, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `skyquery_export_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPNG = () => {
    if (rowsToUse.length === 0) return;
    const svgElement = document.querySelector(".recharts-responsive-container svg") as SVGGraphicsElement | null;
    if (!svgElement) {
      alert("No active chart rendered to export.");
      return;
    }

    try {
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgElement);
      
      // Enforce high contrast text in exported SVG
      svgString = svgString.replace(/<\/svg>/, '<style>text { fill: #f1f5f9 !important; font-family: sans-serif; font-size: 11px; }</style></svg>');

      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2; // retina display resolution enhancement
        const w = svgElement.clientWidth || 800;
        const h = svgElement.clientHeight || 400;
        
        canvas.width = w * scale;
        canvas.height = h * scale;

        const context = canvas.getContext("2d");
        if (context) {
          context.scale(scale, scale);
          
          // Slate-indigo gradient wallpaper backdrop
          const gradient = context.createLinearGradient(0, 0, 0, h);
          gradient.addColorStop(0, "#0b0f19");
          gradient.addColorStop(1, "#111827");
          context.fillStyle = gradient;
          context.fillRect(0, 0, w, h);

          context.drawImage(image, 0, 0, w, h);

          const pngData = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = pngData;
          downloadLink.download = `skyquery_chart_${Date.now()}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (err) {
      console.error("Failed to export PNG:", err);
      alert("Could not export chart as image.");
    }
  };

  if ((response as any).errorType === "connector_connection_failed") {
    const fixes = (response as any).suggestedFixes || [
      "Check Trino container",
      "Check Postgres container",
      "Verify connector credentials",
      "Retry query",
    ];

    return (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-4 backdrop-blur-sm animate-in fade-in duration-200 select-text">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Data source unavailable</h3>
            <p className="text-xs text-muted-foreground/90 leading-relaxed">
              {response.executionError || response.summary}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-secondary/40 p-3 dark:bg-black/30">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Generated SQL</span>
            <button
              onClick={() => response.sql && navigator.clipboard.writeText(response.sql)}
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary/40 hover:text-foreground cursor-pointer"
              title="Copy SQL"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/85">
            <code>{response.sql || "-- SQL unavailable"}</code>
          </pre>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {fixes.map((fix: string) => (
            <div key={fix} className="rounded-lg border border-border/35 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
              {fix}
            </div>
          ))}
        </div>

        {sessionId && messageId && onRefreshQuery && (
          <button
            onClick={() => onRefreshQuery(sessionId, messageId, userQuery)}
            className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-secondary/70 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry query
          </button>
        )}
      </div>
    );
  }

  if (response.resultType === "invalid") {
    return (
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-6 text-center space-y-4 backdrop-blur-sm animate-in fade-in duration-200 select-text">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">I couldn’t understand this query</h3>
          <p className="text-xs text-muted-foreground/85 max-w-md mx-auto leading-relaxed">
            Try restating the question using fields or tables from your connected data.
          </p>
        </div>
        
        <div className="pt-4 border-t border-border/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 select-none">Suggested Prompts</p>
          <div className="flex flex-col gap-2 max-w-sm mx-auto">
            {(response.followUps || []).map((f) => (
              <button
                key={f}
                onClick={() => onFollowUp(f)}
                className="w-full text-left rounded-lg border border-border/40 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/20 px-3.5 py-2.5 text-xs text-muted-foreground transition-all cursor-pointer flex items-center justify-between"
              >
                <span>{f}</span>
                <span className="text-[10px] text-primary/70">Ask →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary text */}
      <motion.p
        className="text-sm leading-relaxed font-semibold text-foreground bg-primary/[0.03] border-l-2 border-primary/50 pl-3.5 py-1.5 rounded-r-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {selectedHeader || generateContextualSummary(userQuery, response.tableHeaders || [], response.rowCount || 0, intelligentKPIs, response.summary)}
      </motion.p>

      {response.executionError && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3.5 text-xs text-muted-foreground backdrop-blur-sm space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-yellow-500">
              <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
              <span>Query Execution Alert</span>
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer select-none font-medium"
            >
              {showDiagnostics ? "Hide Technical Details" : "Show Diagnostics"}
            </button>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            The query could not be executed directly on the live Starburst backend. SkyQuery successfully engaged the secure sandbox engine to simulate and present high-fidelity query analysis.
          </p>
          {showDiagnostics && (
            <p className="leading-relaxed font-mono rounded p-2.5 border border-red-500/20 max-h-36 overflow-y-auto mt-2 select-text bg-red-50 text-red-700 dark:bg-black/40 dark:text-red-300/80">
              {response.executionError}
            </p>
          )}
        </div>
      )}

      {rowsToUse.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card/80 p-6 text-center space-y-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground">
            <Search className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">No matching data found</h3>
            <p className="text-xs text-muted-foreground/80 max-w-md mx-auto leading-relaxed">
              Your query executed successfully, but no records matched your filter criteria in the database.
            </p>
          </div>
          
          <div className="pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Suggested Follow-ups</p>
            <div className="flex flex-wrap justify-center gap-2">
              {relaxedFollowUps.map((f) => (
                <button
                  key={f}
                  onClick={() => onFollowUp(f, buildFollowUpContext(f))}
                  className="rounded-full border border-border/40 bg-secondary/35 hover:bg-secondary/70 hover:border-primary/20 px-3.5 py-1.5 text-xs text-muted-foreground transition-all cursor-pointer"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <motion.div
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            {intelligentKPIs.map((kpi, i) => (
              <motion.div
                key={kpi.label}
                className="rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 + i * 0.05 }}
              >
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {kpi.value}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">
                  {kpi.sub}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Action tabs */}
          <motion.div
            className="overflow-hidden rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25 }}
          >
            {/* Tab bar */}
            <div className="flex items-center border-b border-border/40">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${activeTab === tab.key
                      ? "border-b-2 border-primary bg-secondary/20 text-foreground"
                      : "text-muted-foreground hover:text-foreground/70"
                    }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
              {/* Actions & storm window / metadata chip */}
              <div className="ml-auto mr-3 flex flex-row items-center gap-2.5 py-1">
                <button
                  onClick={() => {
                    setIsPinned(!isPinned)
                    alert(isPinned ? "Result successfully unpinned from dashboard." : "Result successfully pinned to dashboard!")
                  }}
                  className={`rounded p-1.5 transition-colors cursor-pointer ${isPinned ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                    }`}
                  title={isPinned ? "Unpin result" : "Pin result to dashboard"}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => sessionId && messageId && onRefreshQuery?.(sessionId, messageId, userQuery)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-secondary/40 hover:text-foreground cursor-pointer"
                  title="Refresh result"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                {response.resultType === "chart" && (
                  <span className="text-[10px] text-muted-foreground/50">
                    {response.rowCount} rows
                  </span>
                )}
              </div>
            </div>

            {/* Tab content */}
            <div className="p-4">
              {visualizationRouting.fallbackReason === "explicit_chart_fields_unavailable" && (
                <div className="mb-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2 text-[10px] leading-normal text-yellow-500/90">
                  Chart view unavailable because required fields were not returned.
                </div>
              )}
              {visualizationRouting.fallbackReason === "explicit_geo_coordinates_missing" && (
                <div className="mb-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2 text-[10px] leading-normal text-yellow-500/90">
                  GeoMap needs latitude/longitude or recognizable location/code columns.
                </div>
              )}

              {activeTab === "chart" && (
                <ResultVisualizer
                  headers={response.tableHeaders}
                  rows={rowsToUse}
                  chartTitle={response.chartTitle}
                  userQuery={userQuery}
                  rendering={rendering}
                  queryResultId={messageId}
                  initialChartType={initialChartType}
                />
              )}

              {activeTab === "table" && (
                <div className="space-y-3 select-text">
                  {shouldPaginateTable && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/30 bg-secondary/10 px-3 py-2">
                      <span className="text-xs text-muted-foreground">
                        Showing {tablePageStart + 1}{"\u2013"}{tablePageEnd} of {tableRows.length}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Rows
                          <select
                            value={tableRowsPerPage}
                            onChange={(event) => setTableRowsPerPage(Number(event.target.value))}
                            className="rounded-md border border-border/40 bg-secondary/40 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/40"
                          >
                            {[25, 30, 50, 100].map((size) => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          onClick={() => setTablePage((page) => Math.max(0, page - 1))}
                          disabled={clampedTablePage === 0}
                          className="rounded-md border border-border/40 bg-secondary/35 px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setTablePage((page) => Math.min(tableTotalPages - 1, page + 1))}
                          disabled={clampedTablePage >= tableTotalPages - 1}
                          className="rounded-md border border-border/40 bg-secondary/35 px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                  <div className={shouldPaginateTable ? "max-h-[520px] overflow-auto" : "overflow-x-auto"}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40">
                          {response.tableHeaders.map((h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTableRows.map((row, ri) => {
                          const absoluteRowIndex = shouldPaginateTable ? tablePageStart + ri : ri;
                          return (
                            <motion.tr
                              key={absoluteRowIndex}
                              className="border-b border-border/30 transition-colors hover:bg-secondary/20"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.2, delay: Math.min(ri * 0.03, 0.3) }}
                            >
                              {row.cells.map((cell, ci) => (
                                <td
                                  key={ci}
                                  className={`px-3 py-2.5 ${ci === 0
                                      ? "font-medium text-foreground"
                                      : "text-foreground/70"
                                    } ${String(cell).startsWith("+")
                                      ? "text-[#10b981]"
                                      : ""
                                    }`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "sql" && (
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg bg-secondary/50 p-4 font-mono text-xs leading-relaxed text-foreground/80 pr-24 select-text dark:bg-black/30">
                    <code>{response.sql || "-- No SQL was generated for this custom action."}</code>
                  </pre>
                  <button
                    onClick={() => {
                      if (response.sql) {
                        navigator.clipboard.writeText(response.sql);
                        setCopiedSql(true);
                        setTimeout(() => setCopiedSql(false), 2000);
                      }
                    }}
                    className="absolute right-3 top-3 rounded-lg border border-border/40 bg-secondary/80 p-1.5 text-foreground transition-all hover:bg-secondary cursor-pointer hover:border-primary/40 hover:text-foreground opacity-60 hover:opacity-100"
                    title={copiedSql ? "Copied!" : "Copy SQL"}
                  >
                    {copiedSql ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400 animate-in zoom-in-50 duration-150" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              )}

              {activeTab === "export" && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Download className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground font-medium">
                    Export Options
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={handleExportCSV}
                      disabled={rowsToUse.length === 0}
                      className="rounded-lg border border-border/40 bg-secondary/40 px-4 py-1.5 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={rowsToUse.length === 0 ? "No data to export" : "Export as CSV"}
                    >
                      CSV
                    </button>
                    <button
                      onClick={handleExportJSON}
                      disabled={rowsToUse.length === 0}
                      className="rounded-lg border border-border/40 bg-secondary/40 px-4 py-1.5 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={rowsToUse.length === 0 ? "No data to export" : "Export as JSON"}
                    >
                      JSON
                    </button>
                    <button
                      onClick={handleExportPNG}
                      disabled={response.resultType !== "chart" || rowsToUse.length === 0}
                      className="rounded-lg border border-border/40 bg-secondary/40 px-4 py-1.5 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={rowsToUse.length === 0 ? "No chart to export" : response.resultType === "chart" ? "Export chart as PNG" : "No active chart to export"}
                    >
                      Chart (PNG)
                    </button>
                    <button
                      onClick={() => alert("Parquet download is optimized for direct download from Starburst / Trino catalogs. CSV and JSON exports are fully processed online.")}
                      className="rounded-lg border border-border/40 bg-secondary/40 px-4 py-1.5 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-foreground cursor-pointer"
                    >
                      Parquet
                    </button>
                  </div>
                  {rowsToUse.length === 0 && (
                    <p className="text-[10px] text-yellow-500/70 mt-1 select-none">No data is available to export.</p>
                  )}
                </div>
              )}
            </div>

            {/* Insight Panel */}
            {selectedInsightCards.length > 0 && (
              <div className="border-t border-border/30 bg-primary/[0.01] p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>AI Data Insights</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {selectedInsightCards.map((card) => (
                    <div key={`${card.title}-${card.body}`} className="space-y-1 bg-secondary/10 rounded-lg p-3 border border-border/10">
                      <span className="font-semibold text-foreground block">{card.title}</span>
                      <p className="text-muted-foreground leading-relaxed">{card.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* Follow-up pills -- only on latest message */}
      {isLatest && rowsToUse.length > 0 && (
        <motion.div
          className="flex flex-wrap gap-2 pt-1"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          {dynamicFollowUps.map((fu) => (
            <button
              key={fu}
              onClick={() => onFollowUp(fu, buildFollowUpContext(fu))}
              className="flex items-center gap-1.5 rounded-full border border-border/40 bg-secondary/30 px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-secondary/50 hover:text-foreground"
            >
              {fu}
              <ArrowUpRight className="h-3 w-3" />
            </button>
          ))}
        </motion.div>
      )}
    </div>
  )
}

// ---------- Main workspace ----------
export function ChatWorkspace({
  messages,
  onFollowUp,
  schemaMetadata,
  sessionId,
  onRefreshQuery,
}: ChatWorkspaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const latestLiveNavigationMessageId = [...messages].reverse().find((message) =>
    getGeoNavigation(message)?.target === "live_airspace"
  )?.id

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-full border border-border/30 bg-secondary/20 px-5 py-2.5 backdrop-blur-md shadow-lg shadow-black/25">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ask a question to get started
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-8">
        {messages.map((msg, idx) => {
          const isLatest = idx === messages.length - 1
          const navigation = getGeoNavigation(msg)
          const geoSource = navigation?.target === "geo_map" ? findCurrentGeoSource(messages, idx) : null

          return (
            <div key={msg.id} className="space-y-4">
              {/* Query card */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/40 px-4 py-2.5 text-sm text-foreground">
                  <Search className="h-3.5 w-3.5 text-primary" />
                  <span>{msg.query}</span>
                </div>
              </motion.div>

              {/* Loading or result */}
              {msg.isLoading ? (
                <InlineLoader />
              ) : navigation ? (
                <GeoNavigationView
                  navigation={navigation}
                  messageId={msg.id}
                  enableLivePolling={msg.id === latestLiveNavigationMessageId}
                  geoSource={geoSource}
                />
              ) : msg.response ? (
                <MessageResult
                  response={msg.response}
                  isLatest={isLatest}
                  onFollowUp={onFollowUp}
                  schemaMetadata={schemaMetadata}
                  userQuery={msg.query}
                  sessionId={sessionId}
                  messageId={msg.id}
                  onRefreshQuery={onRefreshQuery}
                />
              ) : null}

              {/* Separator between messages (not after last) */}
              {!isLatest && (
                <div className="border-t border-border/20 pt-2" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
