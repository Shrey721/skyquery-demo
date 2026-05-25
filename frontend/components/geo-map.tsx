"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Maximize2, X, RefreshCw, Radio, Globe, Filter, ChevronDown, Crosshair } from "lucide-react"
import { frontendConfig } from "@/lib/config"

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
export interface GeoRow {
  lat: number
  lon: number
  [key: string]: any
}

export interface LiveAircraft {
  callsign: string
  lat: number
  lon: number
  altitude: number
  velocity: number
  heading: number
  origin_country: string
}

interface GeoMapProps {
  // Query-result mode
  rows?: any[]
  headers?: string[]
  // Live mode state passed in from parent (so it persists across re-renders)
  mode?: "query" | "live"
  onModeChange?: (m: "query" | "live") => void
  enableLivePolling?: boolean
  queryResultId?: string
  navigationOnly?: boolean
}

// ─────────────────────────────────────────────────────
// Coordinate detection helpers
// ─────────────────────────────────────────────────────
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

const GEO_LOCATION_FIELD_NAMES = new Set([
  "city",
  "airport",
  "origin",
  "destination",
  "location",
  "name",
  "country",
  "region",
  "state",
])

const GEO_CODE_FIELD_NAMES = new Set([
  "iata",
  "icao",
  "airportcode",
  "origincode",
  "destinationcode",
])

function isValidLat(value: any): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n >= -90 && n <= 90
}

function isValidLon(value: any): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n >= -180 && n <= 180
}

function validPairCount(rows: any[], latKey: string, lonKey: string): number {
  return rows.filter(row => isValidLat(row[latKey]) && isValidLon(row[lonKey])).length
}

function parseGeometryPoint(value: any): { lat: number; lon: number } | null {
  if (typeof value !== "string") return null
  const match = value.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i)
  if (!match) return null
  const lon = Number(match[1])
  const lat = Number(match[2])
  return isValidLat(lat) && isValidLon(lon) ? { lat, lon } : null
}

export function detectGeoCoordinateKeys(rows: any[] = [], headers: string[] = []): { latKey: string | null; lonKey: string | null; geometryKey?: string | null; confidence: number; reason: string } {
  if (!headers.length || !rows.length) {
    return { latKey: null, lonKey: null, geometryKey: null, confidence: 0, reason: "empty_rows_or_headers" }
  }

  const latCandidates = headers.filter(header => {
    const h = normalizeHeader(header)
    return h === "lat" || h === "latitude" || h === "y" || h.endsWith("lat") || h.endsWith("latitude") || h.includes("latitudedeg")
  })
  const lonCandidates = headers.filter(header => {
    const h = normalizeHeader(header)
    return h === "lon" || h === "lng" || h === "long" || h === "longitude" || h === "x" || h.endsWith("lon") || h.endsWith("lng") || h.endsWith("long") || h.endsWith("longitude") || h.includes("longitudedeg")
  })

  let best: { latKey: string | null; lonKey: string | null; count: number; confidence: number; reason: string } = {
    latKey: null,
    lonKey: null,
    count: 0,
    confidence: 0,
    reason: "no_named_coordinate_pair",
  }

  for (const latKey of latCandidates) {
    for (const lonKey of lonCandidates) {
      if (latKey === lonKey) continue
      const count = validPairCount(rows, latKey, lonKey)
      const confidence = count / Math.max(rows.length, 1)
      if (count > best.count || confidence > best.confidence) {
        best = { latKey, lonKey, count, confidence, reason: "named_coordinate_pair" }
      }
    }
  }

  if (best.latKey && best.lonKey && best.confidence > 0) {
    return { latKey: best.latKey, lonKey: best.lonKey, geometryKey: null, confidence: best.confidence, reason: best.reason }
  }

  const numericHeaders = headers.filter(header => rows.some(row => Number.isFinite(Number(row[header]))))
  for (const latKey of numericHeaders) {
    for (const lonKey of numericHeaders) {
      if (latKey === lonKey) continue
      const count = validPairCount(rows, latKey, lonKey)
      const confidence = count / Math.max(rows.length, 1)
      const h1 = normalizeHeader(latKey)
      const h2 = normalizeHeader(lonKey)
      const nameHint = /(coord|geo|point|position|location|airport|place)/.test(`${h1}${h2}`)
      if (nameHint && confidence >= 0.8 && confidence > best.confidence) {
        best = { latKey, lonKey, count, confidence, reason: "range_checked_numeric_geo_pair" }
      }
    }
  }

  if (best.latKey && best.lonKey) {
    return { latKey: best.latKey, lonKey: best.lonKey, geometryKey: null, confidence: best.confidence, reason: best.reason }
  }

  const geometryKey = headers.find(header => {
    const h = normalizeHeader(header)
    return h.includes("geom") || h.includes("geometry") || h.includes("point") || h.includes("location")
  })
  if (geometryKey) {
    const count = rows.filter(row => parseGeometryPoint(row[geometryKey])).length
    const confidence = count / Math.max(rows.length, 1)
    if (count > 0) {
      return { latKey: null, lonKey: null, geometryKey, confidence, reason: "wkt_point_geometry" }
    }
  }

  return { latKey: null, lonKey: null, geometryKey: null, confidence: best.confidence, reason: best.reason }
}

function rowsToGeoPoints(rows: any[], headers: string[]): GeoRow[] {
  const { latKey, lonKey, geometryKey } = detectGeoCoordinateKeys(rows, headers)
  if (latKey && lonKey) {
    return rows
      .map(r => ({ ...r, lat: Number(r[latKey]), lon: Number(r[lonKey]) }))
      .filter(r => isValidLat(r.lat) && isValidLon(r.lon))
  }

  if (!geometryKey) return []
  return rows
    .map(row => {
      const parsed = parseGeometryPoint(row[geometryKey])
      return parsed ? { ...row, ...parsed } : null
    })
    .filter((row): row is GeoRow => Boolean(row))
}

export interface GeoCompatibilityDecision {
  compatible: boolean
  latKey: string | null
  lonKey: string | null
  geometryKey: string | null
  confidence: number
  pointCount: number
  locationFields: string[]
  codeFields: string[]
  reason: string
}

function detectRecognizableFields(headers: string[], fieldNames: Set<string>): string[] {
  return headers.filter(header => fieldNames.has(normalizeHeader(header)))
}

export function detectGeoCompatibility(rows: any[] = [], headers: string[] = []): GeoCompatibilityDecision {
  const coordinateDetection = detectGeoCoordinateKeys(rows, headers)
  const pointCount = rowsToGeoPoints(rows, headers).length
  const locationFields = detectRecognizableFields(headers, GEO_LOCATION_FIELD_NAMES)
  const codeFields = detectRecognizableFields(headers, GEO_CODE_FIELD_NAMES)

  let reason = coordinateDetection.reason
  if (pointCount > 0) {
    reason = coordinateDetection.geometryKey ? "renderable_geometry_points" : "renderable_coordinate_points"
  } else if (locationFields.length || codeFields.length) {
    reason = "recognizable_location_or_code_columns_without_coordinate_enrichment"
  } else if (reason !== "empty_rows_or_headers") {
    reason = "no_recognizable_geographic_fields"
  }

  return {
    compatible: pointCount > 0,
    latKey: coordinateDetection.latKey,
    lonKey: coordinateDetection.lonKey,
    geometryKey: coordinateDetection.geometryKey || null,
    confidence: coordinateDetection.confidence,
    pointCount,
    locationFields,
    codeFields,
    reason,
  }
}

// ─────────────────────────────────────────────────────
// Dark-style popup content builder
// ─────────────────────────────────────────────────────
const PRIORITY_FIELDS = ["name", "airport_name", "callsign", "code", "iata", "icao", "city", "country", "origin_country", "altitude", "speed", "velocity", "heading", "weather", "timestamp", "description"]

function buildPopupHtml(row: any, isAircraft = false): string {
  const skipKeys = new Set(["lat", "lon", "lng", "latitude", "longitude", "__row_index"])
  const fields = Object.entries(row).filter(([k]) => !skipKeys.has(k.toLowerCase()))
  const sorted = [...fields].sort(([a], [b]) => {
    const ai = PRIORITY_FIELDS.indexOf(a.toLowerCase())
    const bi = PRIORITY_FIELDS.indexOf(b.toLowerCase())
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  const rows = sorted.slice(0, 8).map(([k, v]) => `
    <tr>
      <td style="color:#94a3b8;padding:2px 8px 2px 0;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap">${k}</td>
      <td style="color:#f1f5f9;padding:2px 0;font-size:11px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis">${String(v ?? "")}</td>
    </tr>`).join("")
  const icon = isAircraft ? "✈" : "📍"
  const title = isAircraft ? (row.callsign || "Aircraft") : (row.name || row.airport_name || row.city || `${row.lat?.toFixed(4)}, ${row.lon?.toFixed(4)}`)
  return `
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px;min-width:180px;font-family:'Geist',sans-serif">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;border-bottom:1px solid #1e293b;padding-bottom:8px">
        <span style="font-size:14px">${icon}</span>
        <span style="color:#f1f5f9;font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${title}</span>
      </div>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
    </div>`
}

// ─────────────────────────────────────────────────────
// Aircraft SVG icon (rotated by heading)
// ─────────────────────────────────────────────────────
function makeAircraftIcon(L: any, heading: number, isSelected = false) {
  const color = isSelected ? "#22d3ee" : "#a5f3fc"
  const glow = isSelected ? "drop-shadow(0 0 6px #22d3ee)" : "drop-shadow(0 0 3px #0891b2)"
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      style="transform:rotate(${heading}deg);filter:${glow}">
      <path fill="${color}" d="M12 2L8 14H4l8 3 8-3h-4L12 2z"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  })
}

function makeQueryMarkerIcon(L: any) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28">
      <circle cx="11" cy="11" r="9" fill="#0891b2" fill-opacity="0.9" stroke="#22d3ee" stroke-width="1.5"/>
      <circle cx="11" cy="11" r="4" fill="#22d3ee"/>
      <line x1="11" y1="20" x2="11" y2="27" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [22, 28],
    iconAnchor: [11, 27],
    popupAnchor: [0, -28],
  })
}

// ─────────────────────────────────────────────────────
// Main Map Renderer — with proper invalidateSize handling
// ─────────────────────────────────────────────────────
type ClusterableGeoPoint = { lat: number; lon: number; popupHtml: string; icon: any }

function clusterGeoPoints(points: ClusterableGeoPoint[]) {
  if (points.length <= 120) {
    return points.map(point => ({ ...point, count: 1 }))
  }
  const precision = points.length > 1000 ? 0 : points.length > 350 ? 1 : 2
  const buckets = new Map<string, { latSum: number; lonSum: number; count: number; points: ClusterableGeoPoint[] }>()
  points.forEach(point => {
    const key = `${point.lat.toFixed(precision)}:${point.lon.toFixed(precision)}`
    const bucket = buckets.get(key) || { latSum: 0, lonSum: 0, count: 0, points: [] }
    bucket.latSum += point.lat
    bucket.lonSum += point.lon
    bucket.count += 1
    bucket.points.push(point)
    buckets.set(key, bucket)
  })

  return Array.from(buckets.values()).map(bucket => {
    const first = bucket.points[0]
    return {
      lat: bucket.latSum / bucket.count,
      lon: bucket.lonSum / bucket.count,
      popupHtml: bucket.count === 1
        ? first.popupHtml
        : `<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px;min-width:160px;font-family:'Geist',sans-serif;color:#f1f5f9">
            <div style="font-size:12px;font-weight:700;margin-bottom:4px">${bucket.count} nearby points</div>
            <div style="font-size:10px;color:#94a3b8">Zoom in for more detail.</div>
          </div>`,
      icon: first.icon,
      count: bucket.count,
    }
  })
}

interface MapCoreProps {
  geoRows: GeoRow[]
  aircraft: LiveAircraft[]
  mode: "query" | "live"
  height?: number
  fillParent?: boolean
  onCountUpdate?: (n: number) => void
  /** called with a recenter function so parent can wire a button */
  onRecenterReady?: (fn: () => void) => void
}

function MapCore({ geoRows, aircraft, mode, height = 550, fillParent = false, onCountUpdate, onRecenterReady }: MapCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const leafletRef = useRef<any>(null)
  const initDoneRef = useRef(false)
  // Tracks whether user has manually panned/zoomed — if true, skip auto fitBounds on refresh
  const userInteractedRef = useRef(false)
  // Tracks per-mode whether we have done the initial fitBounds yet
  const firstFitDoneRef = useRef<Record<string, boolean>>({})
  // Stores latest points so recenter can use them without stale closure
  const latestPointsRef = useRef<[number, number][]>([])
  const [mapReady, setMapReady] = useState(false)

  // Safely call invalidateSize after a tick so the DOM has settled
  const invalidate = useCallback((delay = 120) => {
    setTimeout(() => {
      if (mapRef.current) {
        try { mapRef.current.invalidateSize({ animate: false }) } catch (_) { }
      }
    }, delay)
  }, [])

  // ── Boot Leaflet once ──────────────────────────────
  useEffect(() => {
    if (initDoneRef.current) return
    let cancelled = false

    async function init() {
      if (!containerRef.current) return
      const L = await import("leaflet")
      if (cancelled || !containerRef.current || mapRef.current) return

      leafletRef.current = L.default ?? L
      initDoneRef.current = true

      const map = leafletRef.current.map(containerRef.current, {
        center: [20, 0],
        zoom: 2,
        zoomControl: false,
        attributionControl: false,
        // Prefer canvas renderer — faster for many markers
        preferCanvas: true,
      })
      mapRef.current = map
      setMapReady(true)

      // Dark CartoDB tile layer
      leafletRef.current.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19 }
      ).addTo(map)

      leafletRef.current.control.zoom({ position: "bottomright" }).addTo(map)
      leafletRef.current.control.attribution({
        position: "bottomleft",
        prefix: '<span style="color:#334155;font-size:9px">© CartoDB</span>',
      }).addTo(map)

      // Attach user-interaction listeners — once user moves, skip auto fitBounds
      map.on("zoomstart movestart dragstart", () => { userInteractedRef.current = true })

      // Expose recenter function to parent
      const recenter = () => {
        userInteractedRef.current = false
        const pts = latestPointsRef.current
        if (!pts.length) return
        if (pts.length === 1) {
          map.setView(pts[0], 8, { animate: true })
        } else {
          try { map.fitBounds(pts, { padding: [40, 40], maxZoom: 10, animate: true }) } catch (_) { }
        }
      }
      onRecenterReady?.(recenter)

      invalidate(50)
      invalidate(200)
      invalidate(500)
    }

    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── ResizeObserver — invalidate whenever container dimensions change ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => invalidate(80))
    ro.observe(el)
    return () => ro.disconnect()
  }, [invalidate])

  // ── Window resize fallback ────────────────────────
  useEffect(() => {
    const onResize = () => invalidate(100)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [invalidate])

  // ── Draw / redraw markers when data or mode changes ──
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map || !mapReady) {
      console.log("Geo render diagnostics", {
        visualization_type: "geo",
        selected_chart_mode: mode,
        geo_points_detected: geoRows.length,
        geo_markers_rendered: 0,
        query_result_layer_active: mode === "query",
        map_ready: mapReady,
        hydration_complete: false,
      })
      return
    }

    // Clear previous markers
    markersRef.current.forEach(m => { try { m.remove() } catch (_) { } })
    markersRef.current = []
    latestPointsRef.current = []
    onCountUpdate?.(0)

    const points: { lat: number; lon: number; popupHtml: string; icon: any }[] = []

    if (mode === "query") {
      geoRows.forEach(row => {
        points.push({ lat: row.lat, lon: row.lon, popupHtml: buildPopupHtml(row), icon: makeQueryMarkerIcon(L) })
      })
    } else {
      aircraft.forEach(ac => {
        points.push({ lat: ac.lat, lon: ac.lon, popupHtml: buildPopupHtml(ac, true), icon: makeAircraftIcon(L, ac.heading) })
      })
    }

    // Always invalidate after data update
    invalidate(80)

    if (points.length === 0) {
      console.log("Geo render diagnostics", {
        visualization_type: "geo",
        selected_chart_mode: mode,
        geo_points_detected: mode === "query" ? geoRows.length : aircraft.length,
        geo_markers_rendered: 0,
        query_result_layer_active: mode === "query",
        map_ready: true,
        hydration_complete: true,
      })
      return
    }

    const drawablePoints = clusterGeoPoints(points)
    const newMarkers = drawablePoints.map(p => {
      const m = p.count > 1
        ? L.circleMarker([p.lat, p.lon], {
          radius: Math.min(10 + Math.log2(p.count) * 3, 28),
          color: "#22d3ee",
          weight: 1.5,
          fillColor: "#0891b2",
          fillOpacity: 0.55,
        }).addTo(map)
        : L.marker([p.lat, p.lon], { icon: p.icon }).addTo(map)
      m.bindPopup(p.popupHtml, { className: "geo-popup", maxWidth: 280, closeButton: false })
      return m
    })
    markersRef.current = newMarkers
    onCountUpdate?.(points.length)

    // Store latest latlngs for recenter
    const latlngs: [number, number][] = points.map(p => [p.lat, p.lon])
    latestPointsRef.current = latlngs

    // Auto-fit: only on first load per mode, or if user hasn't interacted
    const isFirstFit = !firstFitDoneRef.current[mode]
    if (isFirstFit || !userInteractedRef.current) {
      firstFitDoneRef.current[mode] = true
      if (latlngs.length === 1) {
        map.setView(latlngs[0], 8)
      } else {
        try { map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 10 }) } catch (_) { }
      }
    }

    invalidate(200)
    console.log("Geo render diagnostics", {
      visualization_type: "geo",
      selected_chart_mode: mode,
      geo_points_detected: points.length,
      geo_markers_rendered: newMarkers.length,
      overflowStrategy: points.length > newMarkers.length ? "clustered" : "normal",
      query_result_layer_active: mode === "query",
      map_ready: true,
      hydration_complete: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoRows, aircraft, mode, mapReady])

  // Container style — either explicit pixel height or 100% to fill parent
  const containerStyle: React.CSSProperties = fillParent
    ? { width: "100%", height: "100%", minHeight: 0 }
    : { width: "100%", height: `${height}px`, minHeight: `${height}px` }

  return (
    <>
      <style>{`
        .geo-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .geo-popup .leaflet-popup-content { margin: 0 !important; }
        .geo-popup .leaflet-popup-tip-container { display: none; }
        .leaflet-control-zoom a {
          background: #0f172a !important;
          border-color: #1e293b !important;
          color: #94a3b8 !important;
        }
        .leaflet-control-zoom a:hover { background: #1e293b !important; color: #f1f5f9 !important; }
      `}</style>
      <div
        ref={containerRef}
        style={containerStyle}
        className="rounded-lg overflow-hidden"
      />
    </>
  )
}


// ─────────────────────────────────────────────────────
// Live Airspace hook
// ─────────────────────────────────────────────────────
const LIVE_RATE_LIMIT_COOLDOWN_SECONDS = 60
const LIVE_RATE_LIMIT_MESSAGE = "Live airspace provider is rate-limited. Please wait and retry later."

function useLiveAircraft(active: boolean) {
  const [aircraft, setAircraft] = useState<LiveAircraft[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCategory, setErrorCategory] = useState<string | null>(null)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0)
  const cooldownUntilRef = useRef(0)

  const fetch_ = useCallback(async () => {
    if (Date.now() < cooldownUntilRef.current) {
      setRetryAfterSeconds(Math.ceil((cooldownUntilRef.current - Date.now()) / 1000))
      return
    }
    setLoading(true)
    setError(null)
    setErrorCategory(null)
    const endpoint = `${frontendConfig.apiV1BaseUrl}/flights/live`
    try {
      const sessionId = typeof window !== "undefined" ? localStorage.getItem("skyquery_session_id") : null
      const headers: any = { "Content-Type": "application/json" }
      if (sessionId) { headers["Authorization"] = `Bearer ${sessionId}`; headers["X-Session-ID"] = sessionId }
      console.debug("Live airspace request", { endpoint })
      const res = await fetch(endpoint, { credentials: "include", headers })
      console.debug("Live airspace backend response", { endpoint, status: res.status })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        const providerDetail = detail?.detail
        const message = typeof providerDetail === "object"
          ? providerDetail.message
          : providerDetail
        const category = typeof providerDetail === "object"
          ? providerDetail.provider_error_category
          : "unknown"
        console.warn("Live airspace provider unavailable", { endpoint, status: res.status, provider_error_category: category })
        if (category === "rate_limited") {
          cooldownUntilRef.current = Date.now() + LIVE_RATE_LIMIT_COOLDOWN_SECONDS * 1000
          setRetryAfterSeconds(LIVE_RATE_LIMIT_COOLDOWN_SECONDS)
          const rateLimitError: any = new Error(LIVE_RATE_LIMIT_MESSAGE)
          rateLimitError.providerErrorCategory = category
          throw rateLimitError
        }
        const providerError: any = new Error(message || "Live airspace provider unavailable. Check OPENSKY_API_URL or network access.")
        providerError.providerErrorCategory = category
        throw providerError
      }
      const data = await res.json()
      const liveAircraft = Array.isArray(data) ? data : data.aircraft ?? []
      console.debug("Live airspace aircraft received", { endpoint, aircraft_count: liveAircraft.length })
      cooldownUntilRef.current = 0
      setRetryAfterSeconds(0)
      setAircraft(liveAircraft)
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message ?? "Live airspace provider unavailable. Check OPENSKY_API_URL or network access.")
      setErrorCategory(e.providerErrorCategory ?? "unknown")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (retryAfterSeconds <= 0) return
    const id = setInterval(() => {
      setRetryAfterSeconds(Math.max(0, Math.ceil((cooldownUntilRef.current - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [retryAfterSeconds])

  useEffect(() => {
    if (!active) return
    fetch_()
    const id = setInterval(fetch_, 15000)
    return () => clearInterval(id)
  }, [active, fetch_])

  return { aircraft, loading, lastUpdated, error, errorCategory, retryAfterSeconds, refresh: fetch_ }
}

// ─────────────────────────────────────────────────────
// Filter panel
// ─────────────────────────────────────────────────────
interface LiveFilters {
  country: string
  minAlt: number
  maxAlt: number
  minSpeed: number
  maxSpeed: number
}

function filterAircraft(aircraft: LiveAircraft[], f: LiveFilters): LiveAircraft[] {
  return aircraft.filter(ac => {
    if (f.country && !ac.origin_country?.toLowerCase().includes(f.country.toLowerCase())) return false
    if (ac.altitude < f.minAlt || ac.altitude > f.maxAlt) return false
    if (ac.velocity < f.minSpeed || ac.velocity > f.maxSpeed) return false
    return true
  })
}

// ─────────────────────────────────────────────────────
// Main exported GeoMap
// ─────────────────────────────────────────────────────
export function GeoMap({ rows = [], headers = [], mode: externalMode, onModeChange, enableLivePolling = true, queryResultId, navigationOnly = false }: GeoMapProps) {
  const [mode, setMode] = useState<"query" | "live">(externalMode ?? "query")
  const [fullscreen, setFullscreen] = useState(false)
  const [pointCount, setPointCount] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<LiveFilters>({ country: "", minAlt: 0, maxAlt: 60000, minSpeed: 0, maxSpeed: 1200 })
  const [mapKey, setMapKey] = useState(0)
  // Stores the recenter function exposed by MapCore
  const recenterFnRef = useRef<(() => void) | null>(null)

  // ── Memoize coordinate detection so it's synchronous (Issue 2) ──
  const geoRows = useMemo(() => rowsToGeoPoints(rows, headers), [rows, headers])
  const geoCompatibility = useMemo(() => detectGeoCompatibility(rows, headers), [rows, headers])
  const { aircraft: rawAircraft, loading: liveLoading, lastUpdated, error: liveError, errorCategory: liveErrorCategory, retryAfterSeconds, refresh } = useLiveAircraft(mode === "live" && enableLivePolling)

  const aircraft = mode === "live" ? filterAircraft(rawAircraft, filters) : []

  const handleMode = (m: "query" | "live") => {
    console.log("Geo layer click", {
      queryResultId,
      selectedGeoLayerBefore: mode === "query" ? "query_result" : "live_airspace",
      selectedGeoLayerAfter: m === "query" ? "query_result" : "live_airspace",
      userManuallySelectedGeoLayer: true,
    })
    setMode(m)
    onModeChange?.(m)
    // Recenter on mode change so the new data is visible immediately
    // (userInteractedRef in MapCore resets via firstFitDoneRef per-mode)
  }

  // Capture viewport height when entering fullscreen
  const openFullscreen = () => {
    setFullscreen(true)
    setMapKey(k => k + 1)
  }

  const hasGeoData = mode === "query" ? geoRows.length > 0 : aircraft.length > 0

  useEffect(() => {
    if (externalMode && externalMode !== mode) {
      setMode(externalMode)
    }
  }, [externalMode, mode])

  useEffect(() => {
    console.log("Geo layer diagnostics", {
      visualization_type: "geo",
      queryResultId,
      selected_chart_mode: mode,
      geo_points_detected: geoRows.length,
      query_result_layer_active: mode === "query",
      map_ready: false,
      hydration_complete: geoRows.length > 0,
      detected_columns: headers,
      matched_latitude_field: geoCompatibility.latKey,
      matched_longitude_field: geoCompatibility.lonKey,
      matched_location_fields: geoCompatibility.locationFields,
      matched_code_fields: geoCompatibility.codeFields,
      reason_for_incompatibility: geoCompatibility.compatible ? null : geoCompatibility.reason,
      geo_compatibility: geoCompatibility,
    })
  }, [mode, geoRows.length, geoCompatibility, headers, queryResultId])

  return (
    <>
      {/* Fullscreen modal */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            className="fixed inset-0 z-[9999] flex flex-col bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between border-b border-border/30 bg-card/90 px-5 py-3 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#22d3ee]" />
                <span className="text-sm font-semibold tracking-wide text-foreground">
                  {mode === "live" ? "Live Airspace" : "Geospatial View"} — {pointCount} Points
                </span>
                {mode === "live" && lastUpdated && (
                  <span className="text-[10px] text-muted-foreground">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <button
                onClick={() => { setFullscreen(false); setMapKey(k => k + 1) }}
                className="rounded-lg border border-border/40 bg-secondary/40 p-2 text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
                aria-label="Close fullscreen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Map fills the entire remaining height of the fullscreen modal */}
            <div className="flex-1 overflow-hidden" style={{ height: "calc(100vh - 57px)" }}>
              <MapCore
                key={`fs-${mapKey}`}
                geoRows={geoRows}
                aircraft={aircraft}
                mode={mode}
                fillParent
                onCountUpdate={setPointCount}
                onRecenterReady={fn => { recenterFnRef.current = fn }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline card */}
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border/20 bg-secondary/15 p-1">
            <button
              onClick={() => handleMode("query")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${mode === "query" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Globe className="h-3 w-3" /> Query Result
            </button>
            <button
              onClick={() => handleMode("live")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${mode === "live" ? "bg-[#22d3ee] text-black shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Radio className="h-3 w-3" />
              {mode === "live" && liveLoading ? "Loading…" : "Live Airspace"}
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Recenter button — visible whenever map has data */}
            {(mode === "live" ? rawAircraft.length > 0 : geoRows.length > 0) && (
              <button
                onClick={() => recenterFnRef.current?.()}
                className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-secondary/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
                title="Recenter map to fit all points"
              >
                <Crosshair className="h-3 w-3" /> Recenter
              </button>
            )}
            {mode === "live" && (
              <>
                <button
                  onClick={() => setShowFilters(v => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-secondary/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-all hover:text-foreground"
                >
                  <Filter className="h-3 w-3" />
                  Filters
                  <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
                </button>
                <button
                  onClick={refresh}
                  disabled={liveLoading || retryAfterSeconds > 0}
                  className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-secondary/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-all hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${liveLoading ? "animate-spin" : ""}`} />
                  {retryAfterSeconds > 0 ? `Retry in ${retryAfterSeconds}s` : "Refresh"}
                </button>
              </>
            )}
            <button
              onClick={openFullscreen}
              className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-secondary/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
            >
              <Maximize2 className="h-3 w-3" /> Expand
            </button>
          </div>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showFilters && mode === "live" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/30 bg-secondary/10 p-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Country</label>
                  <input
                    type="text"
                    placeholder="e.g. India"
                    value={filters.country}
                    onChange={e => setFilters(f => ({ ...f, country: e.target.value }))}
                    className="w-full rounded-lg border border-border/30 bg-secondary/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Min Altitude (ft)</label>
                  <input type="number" value={filters.minAlt} onChange={e => setFilters(f => ({ ...f, minAlt: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-border/30 bg-secondary/30 px-3 py-2 text-xs text-foreground focus:border-primary/40 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Max Speed (kt)</label>
                  <input type="number" value={filters.maxSpeed} onChange={e => setFilters(f => ({ ...f, maxSpeed: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-border/30 bg-secondary/30 px-3 py-2 text-xs text-foreground focus:border-primary/40 focus:outline-none" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live dashboard overlay bar */}
        {mode === "live" && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#22d3ee]/15 bg-[#22d3ee]/5 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#22d3ee]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#22d3ee]">Live</span>
            </div>
            {(!liveError || rawAircraft.length > 0) && (
              <span className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{aircraft.length}</span> aircraft
                {rawAircraft.length !== aircraft.length && <span className="ml-1 text-muted-foreground/60">({rawAircraft.length} total)</span>}
              </span>
            )}
            {lastUpdated && (
              <span className="text-[11px] text-muted-foreground">
                Updated <span className="text-foreground">{lastUpdated.toLocaleTimeString()}</span>
              </span>
            )}
            {liveError && (
              <span className="text-[11px] text-red-400">⚠ {liveError}</span>
            )}
          </div>
        )}

        {/* No geo data fallback */}
        {mode === "query" && geoRows.length === 0 && !navigationOnly && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-border/30 bg-secondary/10 p-8 text-center">
            <Globe className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground/70">GeoMap needs latitude/longitude or recognizable location/code columns.</p>
          </div>
        )}

        {mode === "live" && liveLoading && rawAircraft.length === 0 && (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border/30 bg-secondary/10 p-8 text-sm text-muted-foreground">
            Loading live location data...
          </div>
        )}

        {mode === "live" && !liveLoading && liveError && rawAircraft.length === 0 && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-border/30 bg-secondary/10 p-8 text-center">
            <p className="text-sm font-semibold text-foreground/70">{liveError}</p>
            {liveErrorCategory === "rate_limited" && retryAfterSeconds > 0 && (
              <p className="text-xs text-muted-foreground">Retry available in {retryAfterSeconds} seconds.</p>
            )}
          </div>
        )}

        {mode === "live" && !liveLoading && !liveError && aircraft.length === 0 && (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border/30 bg-secondary/10 p-8 text-sm text-muted-foreground">
            No live location data returned for the current filters.
          </div>
        )}

        {/* Map — explicit height wrapper ensures Leaflet gets correct dimensions */}
        {(hasGeoData || navigationOnly) && (
          <div
            className="relative overflow-hidden rounded-xl border border-border/30 shadow-lg"
            style={{ height: "550px", minHeight: "550px" }}
          >
            <MapCore
              key={`inline-${mapKey}`}
              geoRows={geoRows}
              aircraft={aircraft}
              mode={mode}
              fillParent
              onCountUpdate={setPointCount}
              onRecenterReady={fn => { recenterFnRef.current = fn }}
            />
            {/* Point count badge */}
            <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-lg border border-border/30 bg-card/85 px-3 py-1.5 text-[10px] font-semibold text-foreground backdrop-blur-sm">
              {pointCount} point{pointCount !== 1 ? "s" : ""} plotted
            </div>
          </div>
        )}
      </div>
    </>
  )
}
