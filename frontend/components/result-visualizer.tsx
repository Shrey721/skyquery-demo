"use client"

import React, { useMemo, useState, useEffect, useRef } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
  Brush,
} from "recharts"
import { motion } from "framer-motion"
import { BarChart3, LineChart as LineIcon, AlertCircle, Compass, HelpCircle } from "lucide-react"
import dynamic from "next/dynamic"
import { detectGeoCompatibility } from "./geo-map"

const GeoMap = dynamic(() => import("./geo-map").then(m => ({ default: m.GeoMap })), { ssr: false })

// Types matching application response structures
interface ResultVisualizerProps {
  headers: string[]
  rows: any[]
  chartTitle?: string
  userQuery?: string
  rendering?: any
  queryResultId?: string
  initialChartType?: VizType | null
}

interface InferredViz {
  type: "stat" | "line" | "bar" | "scatter" | "heatmap" | "geo" | "list" | "fallback"
  xAxisKey?: string
  yAxisKeys?: string[]
  subtitle?: string
}

type VizType = "stat" | "line" | "bar" | "scatter" | "heatmap" | "geo" | "list";

export interface VisualizationIntentDetails {
  type: VizType | "table" | null
  explicit: boolean
  confidence: number
  explicitTerms: string[]
  normalizedIntent: string | null
}

// Map response color keys to theme colors
function getThemeColor(colorKey: string): string {
  switch (colorKey) {
    case "primary":
      return "var(--primary, #06b6d4)"
    case "accent":
      return "var(--accent, #a855f7)"
    case "warning":
      return "#f59e0b"
    case "muted":
      return "rgba(34,211,238,0.25)"
    default:
      return "var(--primary, #06b6d4)"
  }
}

// Clean and parse values to numbers for accurate visualization mapping
export function parseNumericValue(val: any): number | null {
  if (typeof val === "number") return val
  if (typeof val !== "string") return null

  // Remove commas, currency symbols, and percentage signs
  const cleaned = val.replace(/[$,%]/g, "").trim()

  // Check for M or K suffixes (millions or thousands)
  let multiplier = 1
  let finalCleaned = cleaned

  if (cleaned.endsWith("M") || cleaned.endsWith("m")) {
    multiplier = 1000000
    finalCleaned = cleaned.slice(0, -1)
  } else if (cleaned.endsWith("K") || cleaned.endsWith("k")) {
    multiplier = 1000
    finalCleaned = cleaned.slice(0, -1)
  }

  const num = Number(finalCleaned)
  if (!isNaN(num) && finalCleaned !== "") {
    return num * multiplier
  }
  return null
}

// Helper to identify coordinate headers
const isGeoColumn = (header: string): boolean => {
  const hLower = header.toLowerCase()
  return hLower === "lat" ||
    hLower === "lon" ||
    hLower === "lng" ||
    hLower.includes("latitude") ||
    hLower.includes("longitude") ||
    hLower.includes("geom") ||
    hLower.includes("coordinate")
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 3
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

function hasVizTerm(tokens: string[], terms: string[]): boolean {
  return tokens.some(token => terms.some(term => token === term || (token.length >= 4 && term.length >= 4 && editDistance(token, term) <= 2)))
}

export function detectVisualizationIntent(userQuery: string): VisualizationIntentDetails {
  const q = userQuery.toLowerCase()
  const tokens: string[] = q.match(/[a-z0-9]+/g) || []
  const explicitTerms: string[] = []
  const addTerm = (term: string) => { if (!explicitTerms.includes(term)) explicitTerms.push(term) }

  if (/\b(as\s+table|in\s+a\s+table|table\s+view|raw\s+table|show\s+.*\b(records|rows)\b|all\s+(flight\s+)?records|list\s+.*records|preview\s+.*)\b/.test(q)) {
    return { type: "table", explicit: true, confidence: 0.95, explicitTerms: ["table"], normalizedIntent: "table" }
  }

  const genericTerms = ["chart", "graph", "plot", "diagram", "visual", "visualization", "dashboard"]
  const hasGenericViz = hasVizTerm(tokens, genericTerms) || /\bdashboard\s+view\b/.test(q)
  if (hasGenericViz) addTerm("visualization")

  const scores: Record<VizType, number> = { bar: 0, line: 0, scatter: 0, heatmap: 0, geo: 0, stat: 0, list: 0 }
  const score = (type: VizType, amount: number, term: string) => {
    scores[type] += amount
    addTerm(term)
  }

  if (hasVizTerm(tokens, ["bar", "column", "histogram", "barchart", "barchrt"]) || /\bbar\s*(chart|graph|plot)?\b/.test(q)) score("bar", 0.85, "bar")
  if (/\b(compare|comparison|comparing|ranking|ranked|top|bottom|breakdown|by\s+\w+)\b/.test(q)) score("bar", 0.55, "comparison")
  if (/\bline\s*(chart|graph|plot)\b/.test(q)) score("line", 1.05, "line")
  else if (hasVizTerm(tokens, ["line", "trend", "trends", "timeline"]) || /\b(over\s+time|time\s+series)\b/.test(q)) score("line", 0.8, "trend")
  if (hasVizTerm(tokens, ["scatter", "scater", "correlation", "relationship"]) || /\b(vs|versus|relationship)\b/.test(q)) score("scatter", 0.85, "scatter")
  if (hasVizTerm(tokens, ["heatmap", "intensity", "matrix"])) score("heatmap", 0.85, "heatmap")
  if (hasVizTerm(tokens, ["map", "geo", "geographic", "location", "locations", "coordinate", "coordinates", "spatial"])) score("geo", 0.85, "geo")
  if (
    hasVizTerm(tokens, ["card", "kpi", "summary"]) ||
    tokens.some(token => ["stat", "stats", "statistic", "statistics"].includes(token)) ||
    /\bsummary\s+metric\b/.test(q)
  ) score("stat", 0.85, "stat")
  if (hasVizTerm(tokens, ["diagram", "diagarm"])) {
    addTerm("diagram")
    if (scores.line === 0 && scores.bar === 0 && scores.geo === 0 && scores.scatter === 0 && scores.heatmap === 0) scores.bar += 0.35
  }

  const ranked = (Object.entries(scores) as Array<[VizType, number]>).sort((a, b) => b[1] - a[1])
  const [bestType, bestScore] = ranked[0]
  const confidence = Math.min(0.99, bestScore + (hasGenericViz ? 0.15 : 0))
  const explicit = hasGenericViz || bestScore >= 0.75
  const type = confidence >= 0.55 ? bestType : null

  return {
    type,
    explicit,
    confidence,
    explicitTerms,
    normalizedIntent: type,
  }
}

// Parse user query to extract specific visualization intent
export function parseUserIntent(userQuery: string): VizType | "table" | null {
  return detectVisualizationIntent(userQuery).type
}

export type GeoNavigationTarget = "live_airspace" | "geo_map"

const UI_NAVIGATION_TERMS = new Set([
  "please", "show", "open", "display", "view", "switch", "change", "select", "go", "take", "me",
  "to", "the", "a", "tab", "workspace", "screen", "mode", "visualization", "visualisation",
  "this", "it", "current", "result", "results", "last", "previous", "existing", "on", "as",
])
const GEO_VIEW_TERMS = new Set(["geo", "geomap", "geographic", "geospatial", "map"])
const LIVE_VIEW_TERMS = new Set(["live", "realtime", "real", "time", "airspace", "aircraft", "radar", "traffic"])

/**
 * UI-only map requests contain a requested workspace and navigation language,
 * but no dataset, measure, filter, or location terms that require a query.
 */
export function classifyGeoNavigationIntent(userQuery: string): GeoNavigationTarget | null {
  const tokens: string[] = userQuery.toLowerCase().match(/[a-z0-9]+/g) || []
  if (!tokens.length) return null

  const hasLiveQualifier = tokens.includes("live") || tokens.includes("realtime") ||
    (tokens.includes("real") && tokens.includes("time"))
  const hasLiveView = hasLiveQualifier && tokens.some(token => LIVE_VIEW_TERMS.has(token) && !["live", "realtime", "real", "time"].includes(token))
  const hasGeoView = tokens.some(token => GEO_VIEW_TERMS.has(token))
  const allowedLiveTerms = new Set([...UI_NAVIGATION_TERMS, ...GEO_VIEW_TERMS, ...LIVE_VIEW_TERMS])
  const allowedGeoTerms = new Set([...UI_NAVIGATION_TERMS, ...GEO_VIEW_TERMS])
  const hasNavigationAction = tokens.some(token => UI_NAVIGATION_TERMS.has(token))

  if (hasLiveView && tokens.every(token => allowedLiveTerms.has(token)) && (hasNavigationAction || tokens.length <= 3)) {
    return "live_airspace"
  }
  if (hasGeoView && tokens.every(token => allowedGeoTerms.has(token)) && (hasNavigationAction || tokens.length <= 2)) {
    return "geo_map"
  }
  return null
}

export function detectLiveAirspaceIntent(userQuery: string): boolean {
  return classifyGeoNavigationIntent(userQuery) === "live_airspace"
}

export function detectGeoMapIntent(userQuery: string): boolean {
  return classifyGeoNavigationIntent(userQuery) === "geo_map"
}

// Smart type inference engine inspecting values, naming conventions, and shapes
export function inferVisualization(headers: string[], rows: any[]): InferredViz {
  const rowCount = rows.length

  if (rowCount === 0) {
    return { type: "fallback", subtitle: "No data returned." }
  }

  // Selector Rule 1: Geospatial Coordinates Detection
  const geoDetection = detectGeoCompatibility(rows, headers)
  if (geoDetection.compatible) {
    return {
      type: "geo",
      xAxisKey: geoDetection.latKey || geoDetection.geometryKey || undefined,
      yAxisKeys: geoDetection.lonKey ? [geoDetection.lonKey] : [],
      subtitle: `${geoDetection.reason}: ${geoDetection.latKey || geoDetection.geometryKey} / ${geoDetection.lonKey || "geometry"}`,
    }
  }

  // Selector Rule 2: Single-Row Aggregates
  if (rowCount === 1) {
    return { type: "stat" }
  }

  // Helper to check if string matches date patterns
  const isDateString = (val: any): boolean => {
    if (typeof val !== "string") return false
    if (!isNaN(Number(val))) return false

    const dateRegexes = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}:\d{2}(:\d{2})?$/,
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/,
      /^[A-Za-z]{3}\s\d{1,2}$/,
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i,
      /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i,
    ]

    if (dateRegexes.some(rx => rx.test(val))) return true

    const parsed = Date.parse(val)
    return !isNaN(parsed) && val.length > 4
  }

  // Inspect each column's type across all rows
  const colTypes: Record<string, "datetime" | "numeric" | "categorical" | "unknown"> = {}
  const colCardinalities: Record<string, number> = {}

  headers.forEach(header => {
    const nonNullValues = rows
      .map(r => r[header])
      .filter(v => v !== null && v !== undefined && v !== "")

    if (nonNullValues.length === 0) {
      colTypes[header] = "unknown"
      colCardinalities[header] = 0
      return
    }

    const uniqueVals = new Set(nonNullValues)
    colCardinalities[header] = uniqueVals.size

    const hLower = header.toLowerCase()
    const isDateName = hLower.includes("date") ||
      hLower.includes("time") ||
      hLower.includes("hour") ||
      hLower.includes("day") ||
      hLower.includes("timestamp") ||
      hLower.includes("dt") ||
      hLower.includes("epoch") ||
      hLower.includes("year") ||
      hLower.includes("month") ||
      hLower.includes("week")

    const dateMatches = nonNullValues.filter(v => isDateString(v)).length
    const isDateVal = dateMatches / nonNullValues.length > 0.6

    if (isDateName || isDateVal) {
      colTypes[header] = "datetime"
      return
    }

    const numericMatches = nonNullValues.filter(v => parseNumericValue(v) !== null).length
    const isNumericVal = numericMatches / nonNullValues.length > 0.8

    if (isNumericVal) {
      if ((hLower.includes("id") || hLower.includes("year") || hLower.includes("month") || hLower.includes("code")) && uniqueVals.size <= 5) {
        colTypes[header] = "categorical"
      } else {
        colTypes[header] = "numeric"
      }
      return
    }

    colTypes[header] = "categorical"
  })

  const datetimeCols = headers.filter(h => colTypes[h] === "datetime")
  const numericCols = headers.filter(h => colTypes[h] === "numeric")
  const categoricalCols = headers.filter(h => colTypes[h] === "categorical")

  // Selector Rule 3: 2 Categorical + 1 Numeric/Count -> Heatmap
  if (categoricalCols.length >= 2 && numericCols.length >= 1) {
    return {
      type: "heatmap",
      xAxisKey: categoricalCols[0],
      yAxisKeys: [categoricalCols[1], numericCols[0]],
    }
  }

  // Selector Rule 4: Date/Time + Numeric -> Line
  if (datetimeCols.length > 0 && numericCols.length > 0) {
    return {
      type: "line",
      xAxisKey: datetimeCols[0],
      yAxisKeys: numericCols.slice(0, 3),
    }
  }

  // Selector Rule 5: 2 Numeric -> Scatter
  if (numericCols.length >= 2) {
    return {
      type: "scatter",
      xAxisKey: numericCols[0],
      yAxisKeys: [numericCols[1]],
    }
  }

  // Selector Rule 6: Categorical + Numeric -> Bar
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    return {
      type: "bar",
      xAxisKey: categoricalCols[0],
      yAxisKeys: [numericCols[0]],
    }
  }

  // Fallback to any non-numeric column if no categorical found but numeric exists
  const remainingCols = headers.filter(h => colTypes[h] !== "numeric")
  if (remainingCols.length > 0 && numericCols.length > 0) {
    return {
      type: "bar",
      xAxisKey: remainingCols[0],
      yAxisKeys: [numericCols[0]],
    }
  }

  // Selector Rule 7: Categorical Columns with No Numeric Measures -> List/Card view
  if (categoricalCols.length > 0) {
    return {
      type: "list",
      xAxisKey: categoricalCols[0],
      subtitle: `Displaying distinct values for ${categoricalCols[0]}`
    }
  }

  return {
    type: "fallback",
    subtitle: "This dataset could not be automatically converted into a chart. Please view the 'Table' tab to inspect the raw records."
  }
}

// Compute all compatible layouts for front-end switching
export function getCompatibleVisualizations(headers: string[], rows: any[]): VizType[] {
  const rowCount = rows.length
  if (rowCount === 0) return []

  const list: VizType[] = []

  // 1. Stat Cards
  if (rowCount >= 1) {
    list.push("stat")
  }

  const geoDetection = detectGeoCompatibility(rows, headers)
  if (geoDetection.compatible) {
    list.push("geo")
  }

  // Clean and parse numerical values to check active column classifications
  const cleanedRows = rows.map((r) => {
    const cleaned: any = { ...r }
    headers.forEach(h => {
      const val = r[h]
      if (val !== undefined && val !== null) {
        const num = parseNumericValue(val)
        if (num !== null) {
          cleaned[h] = num
        }
      }
    })
    return cleaned
  })

  // Inspect each column's type across all rows
  const colTypes: Record<string, "datetime" | "numeric" | "categorical" | "unknown"> = {}
  const isDateString = (val: any): boolean => {
    if (typeof val !== "string") return false
    if (!isNaN(Number(val))) return false

    const dateRegexes = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}:\d{2}(:\d{2})?$/,
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/,
      /^[A-Za-z]{3}\s\d{1,2}$/,
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i,
      /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i,
    ]
    if (dateRegexes.some(rx => rx.test(val))) return true
    const parsed = Date.parse(val)
    return !isNaN(parsed) && val.length > 4
  }

  headers.forEach(header => {
    const nonNullValues = cleanedRows
      .map(r => r[header])
      .filter(v => v !== null && v !== undefined && v !== "")

    if (nonNullValues.length === 0) {
      colTypes[header] = "unknown"
      return
    }

    const uniqueVals = new Set(nonNullValues)
    const hLower = header.toLowerCase()
    const isDateName = hLower.includes("date") || hLower.includes("time") || hLower.includes("hour") || hLower.includes("day") || hLower.includes("timestamp") || hLower.includes("dt") || hLower.includes("epoch") || hLower.includes("year") || hLower.includes("month") || hLower.includes("week")
    const dateMatches = nonNullValues.filter(v => isDateString(v)).length
    const isDateVal = dateMatches / nonNullValues.length > 0.6

    if (isDateName || isDateVal) {
      colTypes[header] = "datetime"
      return
    }

    const numericMatches = nonNullValues.filter(v => parseNumericValue(v) !== null).length
    const isNumericVal = numericMatches / nonNullValues.length > 0.8

    if (isNumericVal) {
      if ((hLower.includes("id") || hLower.includes("year") || hLower.includes("month") || hLower.includes("code")) && uniqueVals.size <= 5) {
        colTypes[header] = "categorical"
      } else {
        colTypes[header] = "numeric"
      }
      return
    }
    colTypes[header] = "categorical"
  })

  const datetimeCols = headers.filter(h => colTypes[h] === "datetime")
  const numericCols = headers.filter(h => colTypes[h] === "numeric")
  const categoricalCols = headers.filter(h => colTypes[h] === "categorical")

  // Heatmap check: 2 categorical + 1 numeric
  if (categoricalCols.length >= 2 && numericCols.length >= 1) {
    list.push("heatmap")
  }

  // Line check: datetime + numeric
  if (datetimeCols.length > 0 && numericCols.length > 0) {
    list.push("line")
  }

  // Scatter check: 2 numeric
  if (numericCols.length >= 2) {
    list.push("scatter")
  }

  // Bar check: categorical + numeric
  if ((categoricalCols.length > 0 || headers.filter(h => colTypes[h] !== "numeric").length > 0) && numericCols.length > 0) {
    list.push("bar")
  }

  // List/Card view compatibility check
  if (categoricalCols.length > 0) {
    list.push("list")
  }

  return list
}

function labelize(value: string | undefined): string {
  if (!value) return ""
  return value
    .replace(/^__/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCompactValue(value: any): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value ?? "")
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 2,
  }).format(value)
}

function uniqueCount(data: any[], key?: string): number {
  if (!key) return 0
  return new Set(data.map(row => row[key]).filter(value => value !== null && value !== undefined && value !== "")).size
}

type OverflowStrategy = "normal" | "scroll" | "top-n" | "sparse-ticks" | "clustered" | "compact-grid"

interface DensityDiagnostics {
  chartType: VizType
  rowCount: number
  categoryCount: number
  labelDensity: number
  overflowStrategy: OverflowStrategy
  renderedPointCount: number
  longLabelCount: number
  availableChartWidth: number
  isOvercrowded: boolean
}

interface LineAxisDiagnostics {
  chartType: "line"
  pointCount: number
  xLabelDensity: number
  tickInterval: number
  overflowStrategy: "normal" | "sparse-ticks"
  scrollEnabled: boolean
  innerChartWidth: number
  ticks: any[]
  tickAngle: number
  tickAnchor: "middle" | "end"
  tickMaxLength: number
}

function estimateLabelDensity(labels: any[], availableWidth: number): { density: number; longLabelCount: number; maxLabelLength: number } {
  const safeWidth = Math.max(availableWidth || 640, 320)
  const stringLabels = labels.map(value => String(value ?? ""))
  const totalLabelPixels = stringLabels.reduce((sum, label) => sum + Math.min(Math.max(label.length * 6, 28), 150), 0)
  const longLabelCount = stringLabels.filter(label => label.length > 16).length
  return {
    density: totalLabelPixels / safeWidth,
    longLabelCount,
    maxLabelLength: stringLabels.reduce((max, label) => Math.max(max, label.length), 0),
  }
}

function isLikelyDateAxisValue(value: any): boolean {
  if (value instanceof Date) return true
  if (typeof value !== "string") return false
  if (!isNaN(Number(value))) return false
  return /(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)/i.test(value) ||
    (!isNaN(Date.parse(value)) && value.length > 4)
}

function buildLineAxisDiagnostics(data: any[], xAxisKey: string | undefined, availableWidth: number): LineAxisDiagnostics {
  const labels = xAxisKey ? data.map(row => row[xAxisKey]) : []
  const pointCount = labels.length
  const safeWidth = Math.max(availableWidth || 640, 320)
  const stringLabels = labels.map(value => String(value ?? ""))
  const maxLabelLength = stringLabels.reduce((max, label) => Math.max(max, label.length), 0)
  const hasDateLabels = labels.some(isLikelyDateAxisValue)
  const estimatedLabelWidth = Math.min(Math.max(maxLabelLength * 6, hasDateLabels ? 72 : 48), hasDateLabels ? 120 : 150)
  const maxReadableTicks = Math.max(2, Math.floor(safeWidth / estimatedLabelWidth))
  const xLabelDensity = pointCount > 0 ? (pointCount * estimatedLabelWidth) / safeWidth : 0
  const needsSparseTicks = pointCount > maxReadableTicks || xLabelDensity > 1
  const tickInterval = needsSparseTicks ? Math.max(1, Math.ceil(pointCount / maxReadableTicks)) : 1
  const scrollEnabled = needsSparseTicks && pointCount > 16
  const pointSpacing = pointCount > 240 ? 24 : pointCount > 120 ? 30 : 38
  const innerChartWidth = scrollEnabled
    ? Math.max(safeWidth, pointCount * pointSpacing)
    : safeWidth

  const candidateTicks = needsSparseTicks
    ? labels.filter((_, index) => index % tickInterval === 0)
    : labels
  const lastLabel = labels[labels.length - 1]
  const tickValues = lastLabel !== undefined
    ? [...candidateTicks, lastLabel]
    : candidateTicks
  const seenTicks = new Set<string>()
  const ticks = tickValues.filter(value => {
    const key = String(value ?? "")
    if (seenTicks.has(key)) return false
    seenTicks.add(key)
    return true
  })

  return {
    chartType: "line",
    pointCount,
    xLabelDensity: Number(xLabelDensity.toFixed(2)),
    tickInterval,
    overflowStrategy: needsSparseTicks ? "sparse-ticks" : "normal",
    scrollEnabled,
    innerChartWidth,
    ticks,
    tickAngle: needsSparseTicks && maxLabelLength > 10 ? -25 : 0,
    tickAnchor: needsSparseTicks && maxLabelLength > 10 ? "end" : "middle",
    tickMaxLength: needsSparseTicks ? 14 : 18,
  }
}

function pickDensityStrategy(chartType: VizType, rowCount: number, categoryCount: number, labelDensity: number, longLabelCount: number): OverflowStrategy {
  if (chartType === "geo") return rowCount > 80 ? "clustered" : "normal"
  if (chartType === "stat" || chartType === "list") return rowCount > 30 ? "scroll" : "normal"
  if (chartType === "scatter") return rowCount > 180 ? "scroll" : "normal"
  if (chartType === "heatmap") return rowCount > 400 || categoryCount > 18 || labelDensity > 1.8 ? "compact-grid" : "normal"
  if (chartType === "line") return rowCount > 60 || categoryCount > 24 || labelDensity > 1.35 ? "sparse-ticks" : "normal"
  if (chartType === "bar") {
    if (categoryCount > 40 || labelDensity > 2.4 || (categoryCount > 20 && longLabelCount > 4)) return "top-n"
    if (categoryCount > 10 || labelDensity > 1.1 || longLabelCount > 2) return "scroll"
  }
  return "normal"
}

function sortRowsByMetric(rows: any[], metricKey?: string): any[] {
  if (!metricKey) return rows
  return [...rows].sort((a, b) => {
    const valA = Number(a[metricKey])
    const valB = Number(b[metricKey])
    if (Number.isFinite(valA) && Number.isFinite(valB)) return valB - valA
    return String(a[metricKey] ?? "").localeCompare(String(b[metricKey] ?? ""))
  })
}

function buildGroundedInsight(data: any[], categoryKey?: string, metricKey?: string): string | null {
  if (!categoryKey || !metricKey || data.length === 0) return null
  const points = data
    .map(row => ({ label: String(row[categoryKey] ?? "Unknown"), value: Number(row[metricKey]) }))
    .filter(point => Number.isFinite(point.value))
  if (points.length < 2) return null

  const sorted = [...points].sort((a, b) => b.value - a.value)
  const high = sorted[0]
  const low = sorted[sorted.length - 1]
  const delta = high.value - low.value
  if (!Number.isFinite(delta) || delta === 0) return `${labelize(metricKey)} is evenly distributed across ${points.length} categories.`

  const ratio = low.value !== 0 ? Math.abs(high.value / low.value) : null
  if (points.length <= 4) {
    return ratio && Number.isFinite(ratio)
      ? `${high.label} leads ${low.label} by ${formatCompactValue(delta)} (${formatCompactValue(ratio)}x).`
      : `${high.label} leads ${low.label} by ${formatCompactValue(delta)}.`
  }
  return `${high.label} is highest at ${formatCompactValue(high.value)}; ${low.label} is lowest at ${formatCompactValue(low.value)}.`
}

// Gorgeous dark custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/95 p-3 shadow-xl backdrop-blur-md">
        <p className="mb-2 max-w-[220px] truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-5 text-xs">
              <span className="flex items-center gap-1.5 text-foreground/80">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                {labelize(entry.name)}
              </span>
              <span className="font-bold text-foreground">
                {formatCompactValue(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export function ResultVisualizer({
  headers,
  rows,
  chartTitle,
  userQuery,
  rendering,
  queryResultId,
  initialChartType,
}: ResultVisualizerProps) {
  const [mounted, setMounted] = useState(false)
  const [selectedOverride, setSelectedOverride] = useState<VizType | null>(null)
  const [autoModeForced, setAutoModeForced] = useState(false)
  const [geoMode, setGeoMode] = useState<"query" | "live">("query")
  const [userManuallySelectedGeoLayer, setUserManuallySelectedGeoLayer] = useState(false)
  const [chartLimit, setChartLimit] = useState<10 | 25 | "all">(25)
  const [sortChartByMetric, setSortChartByMetric] = useState(true)
  const [availableChartWidth, setAvailableChartWidth] = useState(720)
  const chartShellRef = useRef<HTMLDivElement>(null)
  const userManuallySelectedGeoLayerRef = useRef(false)
  const lastAutoGeoResultRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const element = chartShellRef.current
    if (!element) return
    const updateWidth = () => setAvailableChartWidth(Math.max(Math.round(element.getBoundingClientRect().width), 320))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    window.addEventListener("resize", updateWidth)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateWidth)
    }
  }, [mounted])

  // Reset override selection when result dataset updates
  useEffect(() => {
    setSelectedOverride(null)
    setAutoModeForced(false)
    setChartLimit(25)
    setSortChartByMetric(true)
  }, [rows])

  // Process and clean raw data
  const { data, subtitle, viz } = useMemo(() => {
    if (!rows || rows.length === 0) {
      return { data: [], subtitle: undefined, viz: { type: "fallback" as const } }
    }

    // Clean and parse numerical values
    const cleanedRows = rows.map((r, idx) => {
      const cleaned: any = { ...r, __row_index: idx }
      headers.forEach(h => {
        const val = r[h]
        if (val !== undefined && val !== null) {
          const num = parseNumericValue(val)
          if (num !== null) {
            cleaned[h] = num
          }
        }
      })
      return cleaned
    })

    const inferred = inferVisualization(headers, cleanedRows)

    return { data: cleanedRows, subtitle: undefined, viz: inferred }
  }, [headers, rows])

  // Get all compatible visualizations for front-end control toggling
  const compatibleList = useMemo(() => {
    return getCompatibleVisualizations(headers, rows)
  }, [headers, rows])

  const geoDetection = useMemo(() => detectGeoCompatibility(rows, headers), [rows, headers])
  const hasGeoPoints = geoDetection.compatible
  const currentQueryResultId = useMemo(() => {
    return queryResultId || `${headers.join("|")}:${rows.length}:${JSON.stringify(rows[0] || {})}`
  }, [queryResultId, headers, rows])

  useEffect(() => {
    setSelectedOverride(null)
    setAutoModeForced(false)
    setChartLimit(25)
    setSortChartByMetric(true)
  }, [currentQueryResultId])

  const visualizationIntent = useMemo(() => {
    return detectVisualizationIntent(userQuery || "")
  }, [userQuery])
  const liveAirspaceIntent = useMemo(() => {
    return detectLiveAirspaceIntent(userQuery || "")
  }, [userQuery])
  const parsedIntent = visualizationIntent.type
  const explicitVisualizationRequested = Boolean(
    visualizationIntent.explicit && parsedIntent && parsedIntent !== "table"
  )
  const requestedChartType: VizType | null =
    explicitVisualizationRequested && parsedIntent && parsedIntent !== "table" ? parsedIntent : null
  const explicitGeoIntent = explicitVisualizationRequested && requestedChartType === "geo"

  const intentIsCompatible = useMemo(() => {
    if (!parsedIntent || parsedIntent === "table") return false
    if (parsedIntent === "geo") return hasGeoPoints
    return compatibleList.includes(parsedIntent)
  }, [parsedIntent, compatibleList, hasGeoPoints])

  const initialChartCompatible = Boolean(initialChartType && compatibleList.includes(initialChartType))
  const backendSuggestedChartType = useMemo<VizType | null>(() => {
    const renderingView = String(rendering?.primary_view || rendering?.visualization_type || rendering?.selected_chart_mode || "").toLowerCase()
    if (renderingView === "geo" && hasGeoPoints) return "geo" as VizType
    if (["bar", "line", "scatter", "heatmap", "geo", "stat", "list"].includes(renderingView) && compatibleList.includes(renderingView as VizType)) {
      return renderingView as VizType
    }
    if (!explicitVisualizationRequested && initialChartType && initialChartCompatible) {
      return initialChartType
    }
    return null
  }, [rendering, hasGeoPoints, compatibleList, explicitVisualizationRequested, initialChartType, initialChartCompatible])

  const autoChartType = useMemo<VizType>(() => {
    const renderingView = String(rendering?.primary_view || rendering?.visualization_type || rendering?.selected_chart_mode || "").toLowerCase()
    const backendGeo = renderingView === "geo" || Number(rendering?.geo_confidence || 0) >= 0.75
    if ((backendGeo || backendSuggestedChartType === "geo" || viz.type === "geo") && hasGeoPoints) {
      return "geo"
    }
    if (backendSuggestedChartType && compatibleList.includes(backendSuggestedChartType)) {
      return backendSuggestedChartType
    }

    const inferredType = viz.type === "fallback" ? "bar" : viz.type
    if (compatibleList.includes(inferredType)) {
      return inferredType
    }

    return compatibleList[0] || inferredType
  }, [rendering, backendSuggestedChartType, viz.type, hasGeoPoints, compatibleList])

  // The actual render type selected
  const renderType = useMemo<VizType>(() => {
    if (selectedOverride && compatibleList.includes(selectedOverride)) return selectedOverride
    if (autoModeForced) return autoChartType
    if (liveAirspaceIntent) return "geo"
    if (explicitGeoIntent && hasGeoPoints) return "geo"
    if (requestedChartType && intentIsCompatible) return requestedChartType
    return autoChartType
  }, [selectedOverride, compatibleList, autoModeForced, autoChartType, liveAirspaceIntent, explicitGeoIntent, hasGeoPoints, requestedChartType, intentIsCompatible])

  const finalChartType = renderType
  const userSelectedChartType = selectedOverride
  const selectedChartType = finalChartType
  const autoSelectedChartType = autoChartType
  const renderedComponentType = finalChartType
  const mismatchDetected = renderedComponentType !== finalChartType
  const fallbackReason = explicitGeoIntent && !hasGeoPoints
    ? "explicit_geo_coordinates_missing"
    : explicitVisualizationRequested && requestedChartType && requestedChartType !== finalChartType
      ? `requested_${requestedChartType}_unsupported_used_${finalChartType}`
      : null
  const fallbackChartType = fallbackReason ? finalChartType : null
  const showIntentWarning = useMemo(() => {
    return Boolean(
      explicitVisualizationRequested &&
      requestedChartType &&
      requestedChartType !== finalChartType
    )
  }, [explicitVisualizationRequested, requestedChartType, finalChartType])

  useEffect(() => {
    const selectedBefore = geoMode
    const isNewResult = lastAutoGeoResultRef.current !== currentQueryResultId
    const preferredGeoMode = liveAirspaceIntent ? "live" : "query"
    const shouldApply = renderType === "geo" &&
      (hasGeoPoints || liveAirspaceIntent) &&
      (isNewResult || lastAutoGeoResultRef.current === null) &&
      !userManuallySelectedGeoLayerRef.current

    let reason = "skipped"
    if (renderType !== "geo") {
      reason = "not_geo_visualization"
    } else if (!hasGeoPoints && !liveAirspaceIntent) {
      reason = "no_geo_points"
    } else if (userManuallySelectedGeoLayerRef.current && !isNewResult) {
      reason = "user_selected_layer_for_current_result"
    } else if (!isNewResult) {
      reason = "already_applied_for_result"
    }

    if (isNewResult) {
      userManuallySelectedGeoLayerRef.current = false
      setUserManuallySelectedGeoLayer(false)
    }

    if (renderType === "geo" && (hasGeoPoints || liveAirspaceIntent) && isNewResult) {
      reason = liveAirspaceIntent ? "new_geo_result_default_live_airspace" : "new_geo_result_default_query_result"
      lastAutoGeoResultRef.current = currentQueryResultId
      setGeoMode(preferredGeoMode)
    } else if (shouldApply) {
      reason = liveAirspaceIntent ? "initial_geo_result_default_live_airspace" : "initial_geo_result_default_query_result"
      lastAutoGeoResultRef.current = currentQueryResultId
      setGeoMode(preferredGeoMode)
    }

    console.log("autoGeoEffect fired", {
      queryResultId: currentQueryResultId,
      selectedGeoLayerBefore: selectedBefore === "query" ? "query_result" : "live_airspace",
      selectedGeoLayerAfter: shouldApply || (renderType === "geo" && (hasGeoPoints || liveAirspaceIntent) && isNewResult) ? (preferredGeoMode === "query" ? "query_result" : "live_airspace") : (geoMode === "query" ? "query_result" : "live_airspace"),
      liveAirspaceIntent,
      userManuallySelectedGeoLayer: userManuallySelectedGeoLayerRef.current,
      reason,
    })
  }, [renderType, hasGeoPoints, liveAirspaceIntent, currentQueryResultId, geoMode])

  const handleGeoModeChange = (nextMode: "query" | "live") => {
    userManuallySelectedGeoLayerRef.current = true
    setUserManuallySelectedGeoLayer(true)
    setGeoMode(nextMode)
    console.log("Geo layer manually selected", {
      queryResultId: currentQueryResultId,
      selectedGeoLayer: nextMode === "query" ? "query_result" : "live_airspace",
      userManuallySelectedGeoLayer: true,
    })
  }

  useEffect(() => {
    console.log("Visualization diagnostics", {
      rawUserQuery: userQuery || "",
      visualization_type: finalChartType,
      selected_default_tab: "chart",
      selected_chart_mode: finalChartType,
      liveAirspaceIntent,
      explicit_visualization_terms_detected: visualizationIntent.explicitTerms,
      explicit_visualization_requested: explicitVisualizationRequested,
      normalized_visualization_intent: visualizationIntent.normalizedIntent,
      requested_chart_type: requestedChartType,
      backendSuggestedChartType,
      autoSelectedChartType,
      autoChartType,
      selectedChartType,
      userSelectedChartType,
      has_coordinate_fields: hasGeoPoints,
      finalChartType,
      renderedComponentType,
      mismatchDetected,
      supported_chart_types: compatibleList,
      supportedChartTypes: compatibleList,
      fallbackChartType,
      fallbackReason,
      final_default_chart_type: finalChartType,
      why_bar_available_true_false: compatibleList.includes("bar")
        ? "true: result_shape_supports_bar"
        : "false: missing_categorical_text_dimension_or_numeric_measure",
      previous_chart_state_reused: false,
      geo_points_detected: hasGeoPoints ? rows.length : 0,
      query_result_layer_active: finalChartType === "geo" && geoMode === "query",
      userManuallySelectedGeoLayer,
      geo_detection: geoDetection,
    })
  }, [userQuery, finalChartType, visualizationIntent, liveAirspaceIntent, explicitVisualizationRequested, requestedChartType, backendSuggestedChartType, autoSelectedChartType, autoChartType, selectedChartType, userSelectedChartType, fallbackChartType, fallbackReason, renderedComponentType, mismatchDetected, compatibleList, hasGeoPoints, rows.length, geoMode, geoDetection, userManuallySelectedGeoLayer])

  // Compute exact coordinates/keys for the rendering type selected
  const activeVizKeys = useMemo(() => {
    // If matches inferred viz type, reuse keys
    if (renderType === viz.type) {
      return {
        xAxisKey: viz.xAxisKey,
        yAxisKeys: viz.yAxisKeys,
      }
    }

    // Otherwise, dynamically find matching keys for chosen renderType
    const cleanedRows = data;
    const colTypes: Record<string, "datetime" | "numeric" | "categorical" | "unknown"> = {}
    const isDateString = (val: any): boolean => {
      if (typeof val !== "string") return false
      if (!isNaN(Number(val))) return false
      const dateRegexes = [
        /^\d{4}-\d{2}-\d{2}$/,
        /^\d{2}:\d{2}(:\d{2})?$/,
        /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/,
        /^[A-Za-z]{3}\s\d{1,2}$/,
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i,
        /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i,
      ]
      if (dateRegexes.some(rx => rx.test(val))) return true
      const parsed = Date.parse(val)
      return !isNaN(parsed) && val.length > 4
    }

    headers.forEach(header => {
      const nonNullValues = cleanedRows
        .map(r => r[header])
        .filter(v => v !== null && v !== undefined && v !== "")

      if (nonNullValues.length === 0) {
        colTypes[header] = "unknown"
        return
      }

      const uniqueVals = new Set(nonNullValues)
      const hLower = header.toLowerCase()
      const isDateName = hLower.includes("date") || hLower.includes("time") || hLower.includes("hour") || hLower.includes("day") || hLower.includes("timestamp") || hLower.includes("dt") || hLower.includes("epoch") || hLower.includes("year") || hLower.includes("month") || hLower.includes("week")
      const dateMatches = nonNullValues.filter(v => isDateString(v)).length
      const isDateVal = dateMatches / nonNullValues.length > 0.6

      if (isDateName || isDateVal) {
        colTypes[header] = "datetime"
        return
      }

      const numericMatches = nonNullValues.filter(v => parseNumericValue(v) !== null).length
      const isNumericVal = numericMatches / nonNullValues.length > 0.8

      if (isNumericVal) {
        if ((hLower.includes("id") || hLower.includes("year") || hLower.includes("month") || hLower.includes("code")) && uniqueVals.size <= 5) {
          colTypes[header] = "categorical"
        } else {
          colTypes[header] = "numeric"
        }
        return
      }
      colTypes[header] = "categorical"
    })

    const datetimeCols = headers.filter(h => colTypes[h] === "datetime")
    const numericCols = headers.filter(h => colTypes[h] === "numeric")
    const categoricalCols = headers.filter(h => colTypes[h] === "categorical")
    const geoCols = headers.filter(isGeoColumn)

    if (renderType === "geo") {
      return {
        xAxisKey: geoDetection.latKey || headers[0],
        yAxisKeys: geoDetection.lonKey ? [geoDetection.lonKey] : [],
      }
    }

    if (renderType === "line") {
      return {
        xAxisKey: datetimeCols[0] || categoricalCols[0] || headers[0],
        yAxisKeys: numericCols.slice(0, 3).length > 0 ? numericCols.slice(0, 3) : [headers[1] || headers[0]],
      }
    }

    if (renderType === "bar") {
      return {
        xAxisKey: categoricalCols[0] || datetimeCols[0] || headers[0],
        yAxisKeys: numericCols.length > 0 ? [numericCols[0]] : [headers[1] || headers[0]],
      }
    }

    if (renderType === "scatter") {
      return {
        xAxisKey: numericCols[0] || headers[0],
        yAxisKeys: numericCols.length > 1 ? [numericCols[1]] : [numericCols[0] || headers[0]],
      }
    }

    if (renderType === "heatmap") {
      return {
        xAxisKey: categoricalCols[0] || headers[0],
        yAxisKeys: [
          categoricalCols[1] || datetimeCols[0] || headers[0],
          numericCols[0] || headers[1] || headers[0],
        ],
      }
    }

    return {
      xAxisKey: undefined,
      yAxisKeys: undefined,
    }
  }, [renderType, viz, headers, data, geoDetection])

  const finalTitle = useMemo(() => {
    if (userQuery) {
      let cleaned = userQuery.trim()
      cleaned = cleaned.replace(/^(show me|show|select|list|display|query|get|find|plot)\s+/i, "")
      if (cleaned.endsWith("?")) {
        cleaned = cleaned.slice(0, -1)
      }
      if (cleaned.length > 0) {
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
      }
    }

    if (renderType === "line" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys) {
      return `${activeVizKeys.yAxisKeys.join(" & ")} by ${activeVizKeys.xAxisKey}`
    }
    if (renderType === "bar" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys) {
      return `${activeVizKeys.yAxisKeys[0]} by ${activeVizKeys.xAxisKey}`
    }
    if (renderType === "scatter" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys) {
      return `${activeVizKeys.yAxisKeys[0]} vs ${activeVizKeys.xAxisKey}`
    }
    if (renderType === "heatmap" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys) {
      return `${activeVizKeys.yAxisKeys[1]} Grid map`
    }
    if (renderType === "stat") {
      return "Key Aggregates"
    }

    return chartTitle || "Result Visualization"
  }, [userQuery, renderType, activeVizKeys, chartTitle])

  const densityDiagnostics = useMemo<DensityDiagnostics>(() => {
    const categoryKey = activeVizKeys.xAxisKey
    const categoryLabels = categoryKey
      ? Array.from(new Set(data.map(row => row[categoryKey]).filter(value => value !== null && value !== undefined && value !== "")))
      : []
    const categoryCount = categoryKey ? categoryLabels.length : data.length
    const { density, longLabelCount } = estimateLabelDensity(categoryLabels, availableChartWidth)
    const overflowStrategy = pickDensityStrategy(renderType, data.length, categoryCount, density, longLabelCount)
    const shouldLimit = overflowStrategy === "top-n" && renderType === "bar" && chartLimit !== "all"
    const renderedPointCount = shouldLimit ? Math.min(Number(chartLimit), data.length) : data.length

    return {
      chartType: renderType,
      rowCount: data.length,
      categoryCount,
      labelDensity: Number(density.toFixed(2)),
      overflowStrategy,
      renderedPointCount,
      longLabelCount,
      availableChartWidth,
      isOvercrowded: overflowStrategy !== "normal",
    }
  }, [activeVizKeys.xAxisKey, availableChartWidth, chartLimit, data, renderType])

  const plottedData = useMemo(() => {
    const metricKey = activeVizKeys.yAxisKeys?.[0]
    const ordered = sortChartByMetric && (renderType === "bar" || renderType === "stat")
      ? sortRowsByMetric(data, metricKey)
      : data
    if (densityDiagnostics.overflowStrategy === "top-n" && renderType === "bar" && chartLimit !== "all") {
      return ordered.slice(0, Number(chartLimit))
    }
    return ordered
  }, [activeVizKeys.yAxisKeys, chartLimit, data, densityDiagnostics.overflowStrategy, renderType, sortChartByMetric])

  const lineAxisDiagnostics = useMemo(() => {
    return buildLineAxisDiagnostics(plottedData, activeVizKeys.xAxisKey, availableChartWidth)
  }, [activeVizKeys.xAxisKey, availableChartWidth, plottedData])

  const heatmapLabels = useMemo(() => {
    if (renderType !== "heatmap" || !activeVizKeys.xAxisKey || !activeVizKeys.yAxisKeys) {
      return { xLabels: [] as string[], yLabels: [] as string[] }
    }
    const xLabels = Array.from(new Set(data.map(d => String(d[activeVizKeys.xAxisKey!]))))
    const yLabels = Array.from(new Set(data.map(d => String(d[activeVizKeys.yAxisKeys![0]]))))
    if (densityDiagnostics.overflowStrategy === "compact-grid" && chartLimit !== "all") {
      return {
        xLabels: xLabels.slice(0, Number(chartLimit)),
        yLabels: yLabels.slice(0, Number(chartLimit)),
      }
    }
    return { xLabels, yLabels }
  }, [activeVizKeys.xAxisKey, activeVizKeys.yAxisKeys, chartLimit, data, densityDiagnostics.overflowStrategy, renderType])

  const chartMetadata = useMemo(() => {
    const categoryKey = activeVizKeys.xAxisKey
    const metricKeys = activeVizKeys.yAxisKeys || []
    const primaryMetric = metricKeys[0]
    const categoryCount = uniqueCount(data, categoryKey)
    const isSmallComparison = renderType === "bar" && categoryCount >= 2 && categoryCount <= 4
    const isDense = densityDiagnostics.isOvercrowded || data.length > 12 || categoryCount > 10
    const chartHeight = renderType === "bar"
      ? isSmallComparison ? 240 : isDense ? 300 : 260
      : renderType === "line"
        ? isDense ? 300 : 260
      : renderType === "scatter"
          ? data.length > 50 ? 300 : 260
          : renderType === "heatmap"
            ? isDense ? 360 : 260
            : 230
    const margin = {
      top: isSmallComparison ? 18 : 12,
      right: isSmallComparison ? 28 : 18,
      left: 8,
      bottom: categoryCount > 6 ? 54 : 18,
    }
    const subtitleParts = [
      primaryMetric ? labelize(primaryMetric) : null,
      categoryKey ? `by ${labelize(categoryKey)}` : null,
      isDense ? `${plottedData.length} plotted of ${data.length}` : null,
    ].filter(Boolean)
    const insight = buildGroundedInsight(data, categoryKey, primaryMetric)
    const minPointWidth = renderType === "line" ? 18 : renderType === "bar" ? 72 : 14
    const scrollWidth = densityDiagnostics.overflowStrategy === "normal"
      ? "100%"
      : Math.max(availableChartWidth, Math.min(Math.max(categoryCount, data.length) * minPointWidth, 5200))

    return {
      categoryKey,
      metricKeys,
      primaryMetric,
      categoryCount,
      isSmallComparison,
      isDense,
      chartHeight,
      margin,
      subtitle: subtitle || subtitleParts.join(" "),
      insight,
      containerClass: isSmallComparison ? "mx-auto w-full max-w-2xl" : "w-full",
      barCategoryGap: isSmallComparison ? "42%" : categoryCount > 8 ? "18%" : "28%",
      maxBarSize: isSmallComparison ? 64 : 46,
      tickAngle: categoryCount > 6 || densityDiagnostics.longLabelCount > 0 ? -35 : 0,
      tickAnchor: categoryCount > 6 || densityDiagnostics.longLabelCount > 0 ? "end" : "middle",
      scrollWidth,
      lineTickInterval: lineAxisDiagnostics.tickInterval,
    }
  }, [activeVizKeys, availableChartWidth, data, densityDiagnostics, lineAxisDiagnostics.tickInterval, plottedData.length, renderType, subtitle])

  useEffect(() => {
    console.log("Visualization layout diagnostics", {
      chartType: densityDiagnostics.chartType,
      rowCount: densityDiagnostics.rowCount,
      categoryCount: densityDiagnostics.categoryCount,
      labelDensity: densityDiagnostics.labelDensity,
      overflowStrategy: densityDiagnostics.overflowStrategy,
      renderedPointCount: densityDiagnostics.renderedPointCount,
      selected_visualization_type: renderType,
      detected_metric_columns: chartMetadata.metricKeys,
      adaptive_layout_decisions: {
        small_comparison: chartMetadata.isSmallComparison,
        dense_result: chartMetadata.isDense,
        chart_height: chartMetadata.chartHeight,
        max_bar_size: chartMetadata.maxBarSize,
        tick_angle: chartMetadata.tickAngle,
        available_chart_width: densityDiagnostics.availableChartWidth,
      },
    })
  }, [renderType, chartMetadata, densityDiagnostics])

  useEffect(() => {
    if (renderType !== "line") return
    console.log("Line chart axis diagnostics", {
      chartType: lineAxisDiagnostics.chartType,
      pointCount: lineAxisDiagnostics.pointCount,
      scrollEnabled: lineAxisDiagnostics.scrollEnabled,
      innerChartWidth: lineAxisDiagnostics.innerChartWidth,
      visibleTickInterval: lineAxisDiagnostics.tickInterval,
      overflowStrategy: lineAxisDiagnostics.overflowStrategy,
    })
  }, [renderType, lineAxisDiagnostics])

  const allSwitchers: { type: VizType; label: string }[] = [
    { type: "bar", label: "Bar" },
    { type: "line", label: "Line" },
    { type: "scatter", label: "Scatter" },
    { type: "heatmap", label: "Heatmap" },
    { type: "geo", label: "Geo" },
    { type: "stat", label: "Stat" },
  ]

  if (!mounted) {
    return <div className="h-48 w-full animate-pulse rounded-xl bg-secondary/15" />
  }

  // Fallback state if result shape has no compatible types and auto-inference fails
  if (viz.type === "fallback" && !selectedOverride && !(explicitGeoIntent && hasGeoPoints)) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center border border-border/40 rounded-xl bg-secondary/10"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <AlertCircle className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
        <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">No chartable structure detected, view table</h3>
        <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
          {viz.subtitle || "This dataset could not be automatically converted into a chart. Please select the table tab above to view the raw records."}
        </p>
      </motion.div>
    )
  }

  const showDensityNotice = densityDiagnostics.isOvercrowded && ["bar", "line", "scatter", "heatmap"].includes(renderType)
  const showLimitControls = (renderType === "bar" && densityDiagnostics.overflowStrategy === "top-n") ||
    (renderType === "heatmap" && densityDiagnostics.overflowStrategy === "compact-grid")
  const isAutoActive = selectedOverride === null && finalChartType === autoChartType

  return (
    <div ref={chartShellRef} className="space-y-4">
      {/* Intent fallback notification */}
      {showIntentWarning && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2 text-[10px] text-yellow-500/90 leading-normal flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 animate-pulse" />
          <span>
            {requestedChartType === "geo"
              ? "GeoMap needs latitude/longitude or recognizable location/code columns."
              : <>Requested <strong>{requestedChartType} chart</strong> was not compatible with this result shape, so Auto selected <strong>{finalChartType} chart</strong> instead.</>}
          </span>
        </div>
      )}

      {initialChartType && !initialChartCompatible && !(liveAirspaceIntent && initialChartType === "geo") && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2 text-[10px] leading-normal text-yellow-500/90">
          Chart view unavailable because required fields were not returned.
        </div>
      )}

      {/* Graph Switcher Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/20 pb-3">
        <div className="flex flex-wrap items-center gap-1 bg-secondary/15 rounded-lg p-1 border border-border/20 select-none">
          <button
            onClick={() => {
              setSelectedOverride(null)
              setAutoModeForced(true)
            }}
            className={`rounded px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${isAutoActive
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-secondary/35 hover:text-foreground"
              }`}
          >
            Auto ({autoChartType})
          </button>
          {allSwitchers.map((item) => {
            const isCompatible = compatibleList.includes(item.type)
            const isActive = selectedOverride === item.type || (!isAutoActive && selectedOverride === null && finalChartType === item.type)
            return (
              <button
                key={item.type}
                disabled={!isCompatible}
                onClick={() => {
                  setSelectedOverride(item.type)
                  setAutoModeForced(false)
                }}
                className={`rounded px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all duration-200 ${isActive
                    ? "bg-primary text-primary-foreground shadow cursor-pointer"
                    : isCompatible
                      ? "text-muted-foreground hover:bg-secondary/35 hover:text-foreground cursor-pointer"
                      : "text-muted-foreground/30 opacity-40 cursor-not-allowed"
                  }`}
                title={isCompatible ? `Switch to ${item.label} view` : `${item.label} view is incompatible with this data shape`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
        {showLimitControls && (
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/20 bg-secondary/15 p-1 select-none">
            {[10, 25, "all"].map((limit) => (
              <button
                key={String(limit)}
                onClick={() => setChartLimit(limit as 10 | 25 | "all")}
                className={`rounded px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all ${chartLimit === limit
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:bg-secondary/35 hover:text-foreground"
                  }`}
                title={limit === "all" ? "Render all chart data with scrolling" : `Show top ${limit} in chart`}
              >
                {limit === "all" ? "All" : `Top ${limit}`}
              </button>
            ))}
            {renderType === "bar" && (
              <label className="ml-1 flex items-center gap-1.5 px-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                <input
                  type="checkbox"
                  checked={sortChartByMetric}
                  onChange={(event) => setSortChartByMetric(event.target.checked)}
                  className="h-3 w-3 accent-primary"
                />
                Sort
              </label>
            )}
          </div>
        )}
      </div>

      {showDensityNotice && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2 text-[10px] leading-normal text-yellow-500/90">
          Large result set detected. Showing {plottedData.length} in chart; full data is available in the Table tab.
        </div>
      )}

      {/* 1. STAT CARDS */}
      {renderType === "stat" && data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {headers
            .map(header => {
              const val = data[0][header]
              return { label: header, value: String(val) }
            })
            .filter(k => k.value.length < 35 && k.label !== "__row_index")
            .map((kpi, i) => (
              <motion.div
                key={kpi.label}
                className="rounded-xl border border-border/60 bg-card/70 m-0.5 p-4 shadow-md backdrop-blur-sm transition-all hover:border-primary/20"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
              >
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                <p className="mt-1.5 text-2xl font-bold text-foreground tracking-tight">
                  {kpi.value}
                </p>
              </motion.div>
            ))}
        </div>
      )}

      {/* 2. LINE CHART */}
      {renderType === "line" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <LineIcon className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
                {finalTitle}
              </span>
            </div>
            {chartMetadata.subtitle && <span className="text-[10px] text-muted-foreground">{chartMetadata.subtitle}</span>}
          </div>
          {chartMetadata.insight && (
            <p className="text-xs leading-relaxed text-muted-foreground">{chartMetadata.insight}</p>
          )}
          {lineAxisDiagnostics.scrollEnabled && (
            <p className="text-[10px] text-muted-foreground/80">Scroll horizontally to explore full trend</p>
          )}

          <div className="w-full overflow-x-auto pb-2">
            <div
              className="pt-2"
              style={{
                height: chartMetadata.chartHeight,
                width: lineAxisDiagnostics.scrollEnabled ? lineAxisDiagnostics.innerChartWidth : "100%",
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
              <LineChart data={plottedData} margin={chartMetadata.margin}>
                <defs>
                  {activeVizKeys.yAxisKeys.map((key, i) => {
                    const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]
                    return (
                      <linearGradient key={key} id={`glow-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0.0} />
                      </linearGradient>
                    )
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey={activeVizKeys.xAxisKey}
                  stroke="var(--muted-foreground)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                  interval={0}
                  ticks={lineAxisDiagnostics.ticks}
                  angle={lineAxisDiagnostics.tickAngle}
                  textAnchor={lineAxisDiagnostics.tickAnchor}
                  tickFormatter={(v) => {
                    const label = String(v ?? "")
                    return label.length > lineAxisDiagnostics.tickMaxLength
                      ? `${label.slice(0, lineAxisDiagnostics.tickMaxLength - 1)}...`
                      : label
                  }}
                  label={{ value: labelize(activeVizKeys.xAxisKey), position: "insideBottom", offset: -12, fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactValue}
                  width={54}
                  label={{ value: labelize(activeVizKeys.yAxisKeys[0]), angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={32}
                  iconSize={8}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 10, color: "var(--muted-foreground)" }}
                />
                {activeVizKeys.yAxisKeys.map((key, i) => {
                  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={colors[i % colors.length]}
                      strokeWidth={2.25}
                      dot={plottedData.length <= 24 ? { r: 2.5, strokeWidth: 1, fill: "var(--background)" } : false}
                      activeDot={{ r: 4.5, strokeWidth: 0 }}
                      animationDuration={700}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 3. BAR CHART */}
      {renderType === "bar" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
                {finalTitle}
              </span>
            </div>
            {chartMetadata.subtitle && <span className="text-[10px] text-muted-foreground">{chartMetadata.subtitle}</span>}
          </div>
          {chartMetadata.insight && (
            <p className="text-xs leading-relaxed text-muted-foreground">{chartMetadata.insight}</p>
          )}

          <div className={`${chartMetadata.containerClass} overflow-x-auto pb-2`}>
            <div className="pt-2" style={{ height: chartMetadata.chartHeight, width: chartMetadata.scrollWidth }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plottedData} margin={chartMetadata.margin} barCategoryGap={chartMetadata.barCategoryGap}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey={activeVizKeys.xAxisKey}
                  stroke="var(--muted-foreground)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                  interval={0}
                  angle={chartMetadata.tickAngle}
                  textAnchor={chartMetadata.tickAnchor as "middle" | "end"}
                  tickFormatter={(v) => String(v).length > 18 ? `${String(v).slice(0, 17)}...` : String(v)}
                  label={{ value: labelize(activeVizKeys.xAxisKey), position: "insideBottom", offset: -12, fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactValue}
                  width={54}
                  label={{ value: labelize(activeVizKeys.yAxisKeys[0]), angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey={activeVizKeys.yAxisKeys[0]} radius={[5, 5, 0, 0]} maxBarSize={chartMetadata.maxBarSize} animationDuration={650}>
                  {plottedData.map((entry: any, index: number) => {
                    const finalColor = entry.rawColor ? getThemeColor(entry.rawColor) : "url(#barGradient)"
                    return <Cell key={`cell-${index}`} fill={finalColor} />
                  })}
                  {plottedData.length <= 8 && (
                    <LabelList
                      dataKey={activeVizKeys.yAxisKeys[0]}
                      position="top"
                      formatter={formatCompactValue}
                      fill="var(--muted-foreground)"
                      fontSize={10}
                    />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 4. SCATTER PLOT */}
      {renderType === "scatter" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
                {finalTitle}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {labelize(activeVizKeys.yAxisKeys[0])} vs {labelize(activeVizKeys.xAxisKey)}
            </span>
          </div>

          <div className="w-full overflow-x-auto pb-2">
            <div className="pt-2" style={{ height: chartMetadata.chartHeight, width: chartMetadata.scrollWidth }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={chartMetadata.margin}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  type="number"
                  dataKey={activeVizKeys.xAxisKey}
                  name={activeVizKeys.xAxisKey}
                  stroke="var(--muted-foreground)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  dy={6}
                  tickFormatter={formatCompactValue}
                  label={{ value: labelize(activeVizKeys.xAxisKey), position: "insideBottom", offset: -12, fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey={activeVizKeys.yAxisKeys[0]}
                  name={activeVizKeys.yAxisKeys[0]}
                  stroke="var(--muted-foreground)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactValue}
                  width={54}
                  label={{ value: labelize(activeVizKeys.yAxisKeys[0]), angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Scatter name={`${labelize(activeVizKeys.xAxisKey)} vs ${labelize(activeVizKeys.yAxisKeys[0])}`} data={plottedData} fill="var(--chart-1)" animationDuration={650}>
                  {plottedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="var(--chart-1)" fillOpacity={0.72} stroke="var(--chart-1)" strokeWidth={1} />
                  ))}
                </Scatter>
                {plottedData.length > 180 && (
                  <Brush height={18} travellerWidth={8} stroke="var(--chart-1)" />
                )}
              </ScatterChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 5. HEATMAP GRID */}
      {renderType === "heatmap" && activeVizKeys.xAxisKey && activeVizKeys.yAxisKeys && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
                {finalTitle}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Heatmap grid of {activeVizKeys.yAxisKeys[1]} by {activeVizKeys.xAxisKey} & {activeVizKeys.yAxisKeys[0]}
            </span>
          </div>

          <div className="max-h-[420px] overflow-auto pb-2">
            <div
              className="select-none p-1"
              style={{
                minWidth: Math.max(420, heatmapLabels.xLabels.length * 72 + 96),
              }}
            >
              <div className="flex">
                <div className="sticky left-0 z-10 w-24 flex-shrink-0 bg-background text-[8px] font-bold text-muted-foreground/40 border-r border-border/10 pr-2 text-right self-end pb-1 truncate">
                  {activeVizKeys.yAxisKeys[0]} \ {activeVizKeys.xAxisKey}
                </div>
                {heatmapLabels.xLabels.map(x => (
                  <div key={x} className="w-[72px] flex-shrink-0 text-center text-[9px] font-semibold text-muted-foreground truncate px-1" title={x}>
                    {x}
                  </div>
                ))}
              </div>

              <div className="space-y-1 mt-1">
                {heatmapLabels.yLabels.map(y => {
                  const xLabels = heatmapLabels.xLabels
                  const valKey = activeVizKeys.yAxisKeys![1]
                  const values = data.map(d => Number(d[valKey]) || 0)
                  const maxVal = Math.max(...values, 1)

                  const rowLookup: Record<string, number> = {}
                  data.forEach(d => {
                    if (String(d[activeVizKeys.yAxisKeys![0]]) === y) {
                      rowLookup[String(d[activeVizKeys.xAxisKey!])] = Number(d[valKey]) || 0
                    }
                  })

                  return (
                    <div key={y} className="flex items-center">
                      <div className="sticky left-0 z-10 w-24 flex-shrink-0 bg-background text-[9px] font-semibold text-muted-foreground/80 text-right pr-2 truncate" title={y}>
                        {y}
                      </div>
                      {xLabels.map(x => {
                        const val = rowLookup[x] || 0
                        const ratio = maxVal > 0 ? val / maxVal : 0
                        const bgCol = ratio > 0
                          ? `rgba(6, 182, 212, ${0.15 + ratio * 0.75})`
                          : "rgba(255, 255, 255, 0.02)"

                        return (
                          <div
                            key={x}
                            style={{ backgroundColor: bgCol }}
                            className="h-6 w-[72px] flex-shrink-0 rounded-md m-0.5 border border-transparent hover:border-cyan-400/50 hover:scale-105 transition-all flex items-center justify-center cursor-help"
                            title={`${x} x ${y}: ${val}`}
                          >
                            <span className="truncate px-1 text-[9px] font-bold text-white/90">
                              {val > 0 ? val.toLocaleString() : ""}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. GEOSPATIAL MAP */}
      {renderType === "geo" && (
        <GeoMap
          rows={rows}
          headers={headers}
          mode={geoMode}
          onModeChange={handleGeoModeChange}
          queryResultId={currentQueryResultId}
        />
      )}

      {/* 7. DISTINCT VALUES LIST/CARD VIEW */}
      {renderType === "list" && activeVizKeys.xAxisKey && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-primary animate-spin-slow" />
              <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
                {finalTitle} (Distinct Values)
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Found {data.length} distinct item{data.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {data.map((row, idx) => {
              const value = row[activeVizKeys.xAxisKey!];
              if (value === undefined || value === null || value === "") return null;
              return (
                <motion.div
                  key={`${value}-${idx}`}
                  className="rounded-xl border border-border/50 bg-card/80 m-0.5 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-secondary/40 dark:bg-[#0c0a09]/30 dark:hover:bg-[#0c0a09]/50 flex items-center gap-3"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.5) }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary border border-primary/20">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Distinct Entry</p>
                    <p className="text-sm font-bold text-foreground truncate mt-0.5" title={String(value)}>
                      {String(value)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  )
}
