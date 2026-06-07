"use client"

import { useEffect, useRef, useState } from "react"
import type { LiveAircraft, MapBounds } from "@/lib/public-flights-api"
import type { NearbyAirport } from "@/lib/nearby-airports-api"
import type { AirspaceConflictPair, ScannerRiskLevel } from "@/lib/airspace-scanner"

interface AviationMapProps {
  aircraft: LiveAircraft[]
  selectedAircraft: LiveAircraft | null
  onSelectAircraft: (aircraft: LiveAircraft) => void
  onBoundsChange: (bounds: MapBounds) => void
  focusLocation?: { latitude: number; longitude: number; zoom?: number; nonce: number } | null
  fitLocations?: { locations: Array<{ latitude: number; longitude: number }>; nonce: number } | null
  airports?: NearbyAirport[]
  showAirports?: boolean
  scannerMode?: boolean
  scannerConflicts?: AirspaceConflictPair[]
}

type TrafficView = "density" | "regional" | "aircraft"

interface DensityCell {
  latitude: number
  longitude: number
  aircraft: LiveAircraft[]
}

const INDIVIDUAL_ZOOM = 10
const REGIONAL_ZOOM = 7
const LOW_ZOOM_ICON_CAP = 300
const MEDIUM_ZOOM_ICON_CAP = 800

function trafficViewAtZoom(zoom: number): TrafficView {
  if (zoom >= INDIVIDUAL_ZOOM) return "aircraft"
  if (zoom >= REGIONAL_ZOOM) return "regional"
  return "density"
}

function densityCells(map: any, aircraft: LiveAircraft[], cellSize: number): DensityCell[] {
  const cells = new Map<string, DensityCell>()
  aircraft.forEach((flight) => {
    const point = map.latLngToContainerPoint([flight.latitude, flight.longitude])
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`
    const existing = cells.get(key)
    if (existing) {
      existing.latitude += flight.latitude
      existing.longitude += flight.longitude
      existing.aircraft.push(flight)
    } else {
      cells.set(key, { latitude: flight.latitude, longitude: flight.longitude, aircraft: [flight] })
    }
  })
  return Array.from(cells.values(), (cluster) => ({
    ...cluster,
    latitude: cluster.latitude / cluster.aircraft.length,
    longitude: cluster.longitude / cluster.aircraft.length,
  }))
}

function planeIcon(L: any, flight: LiveAircraft, selected: boolean, view: TrafficView) {
  const heading = flight.heading != null && Number.isFinite(flight.heading) ? flight.heading : 0
  const impactedClass = flight.weather_impacted ? " is-weather-impacted" : ""
  return L.divIcon({
    className: "discover-marker-shell",
    html: `<span class="discover-plane is-${view}${selected ? " is-selected" : ""}${impactedClass}" style="transform:rotate(${heading}deg)" aria-hidden="true">&#9992;</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function airportIcon(L: any, airport: NearbyAirport) {
  return L.divIcon({
    className: "discover-marker-shell",
    html: `<span class="discover-airport-marker" aria-hidden="true"><svg viewBox="0 0 28 28" focusable="false"><circle cx="14" cy="14" r="10.5" /><path d="M14 7.5v13" /><path d="M10 11.5h8" /><path d="M11.5 18.5h5" /></svg></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function airportTooltip(airport: NearbyAirport) {
  const cityLine = [airport.city, airport.country].filter(Boolean).map(escapeHtml).join(", ")
  return `
    <div class="discover-airport-tooltip">
      <strong>${escapeHtml(airport.code || airport.ident || "Airport")}</strong>
      <span>${escapeHtml(airport.name || "Unknown airport")}</span>
      ${cityLine ? `<span>${cityLine}</span>` : ""}
      <span>${Math.round(airport.distanceNm)} nm</span>
      <span>${escapeHtml(airport.type || "airport")}</span>
    </div>
  `
}

function airportPopup(airport: NearbyAirport) {
  const city = airport.city ? `${escapeHtml(airport.city)}, ` : ""
  return `
    <div class="discover-airport-popup">
      <strong>${escapeHtml(airport.code || airport.ident || "Airport")}</strong>
      <span>${escapeHtml(airport.name || "Unknown airport")}</span>
      <span>${city}${escapeHtml(airport.country || "Unknown")}</span>
      <span>${Math.round(airport.distanceNm)} nm / ${escapeHtml(airport.type || "airport")}</span>
    </div>
  `
}

function scannerColor(risk: ScannerRiskLevel) {
  if (risk === "Critical") return "#ef4444"
  if (risk === "High") return "#f97316"
  if (risk === "Medium") return "#f59e0b"
  return "#38bdf8"
}

function scannerIcon(L: any, flight: LiveAircraft, risk: ScannerRiskLevel) {
  const heading = flight.heading != null && Number.isFinite(flight.heading) ? flight.heading : 0
  const color = scannerColor(risk)
  return L.divIcon({
    className: "discover-marker-shell",
    html: `<span class="discover-scanner-plane" style="--scanner-color:${color};transform:rotate(${heading}deg)" aria-hidden="true">&#9992;</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function formatFlight(flight: LiveAircraft) {
  return escapeHtml(flight.callsign || flight.icao24.toUpperCase())
}

function scannerPopup(pair: AirspaceConflictPair) {
  const weather = pair.weatherContext.unavailable
    ? "Weather context unavailable. Scanner is using aircraft separation only."
    : pair.weatherContext.factors.length
      ? `Weather factor: ${escapeHtml(pair.weatherContext.factors.join(", "))}`
      : "Weather factor: none detected"
  return `
    <div class="discover-airport-popup">
      <strong>Possible proximity conflict</strong>
      <span>Flight A: ${formatFlight(pair.aircraftA)} / ${Math.round(pair.altitudeA ?? 0).toLocaleString()} ft / ${pair.aircraftA.speed_kts == null ? "speed unavailable" : `${Math.round(pair.aircraftA.speed_kts)} kt`}</span>
      <span>Flight B: ${formatFlight(pair.aircraftB)} / ${Math.round(pair.altitudeB ?? 0).toLocaleString()} ft / ${pair.aircraftB.speed_kts == null ? "speed unavailable" : `${Math.round(pair.aircraftB.speed_kts)} kt`}</span>
      <span>Distance: ${pair.horizontalKm.toFixed(1)} km</span>
      <span>Vertical separation: ${Math.round(pair.verticalFt).toLocaleString()} ft</span>
      <span>Base proximity risk: ${pair.baseRisk}</span>
      <span>${weather}</span>
      <span>Weather-adjusted risk: ${pair.weatherAdjustedRisk}</span>
      <span>This is a proximity screen from public feeds, not ATC conflict prediction.</span>
    </div>
  `
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function sampleAircraft(map: any, aircraft: LiveAircraft[], cap: number, cellSize: number): LiveAircraft[] {
  if (aircraft.length <= cap) return aircraft
  const cells = densityCells(map, aircraft, cellSize)
    .sort((left, right) => right.aircraft.length - left.aircraft.length)
  const sampled: LiveAircraft[] = []
  let index = 0
  while (sampled.length < cap) {
    let added = false
    cells.forEach((cell) => {
      const flight = cell.aircraft[index]
      if (flight && sampled.length < cap) {
        sampled.push(flight)
        added = true
      }
    })
    if (!added) break
    index += 1
  }
  return sampled
}

export function AviationMap({ aircraft, selectedAircraft, onSelectAircraft, onBoundsChange, focusLocation, fitLocations, airports = [], showAirports = false, scannerMode = false, scannerConflicts = [] }: AviationMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const densityLayerRef = useRef<any>(null)
  const aircraftLayerRef = useRef<any>(null)
  const airportLayerRef = useRef<any>(null)
  const scannerLayerRef = useRef<any>(null)
  const aircraftRef = useRef(aircraft)
  const airportsRef = useRef(airports)
  const showAirportsRef = useRef(showAirports)
  const scannerModeRef = useRef(scannerMode)
  const scannerConflictsRef = useRef(scannerConflicts)
  const fitLocationsRef = useRef(fitLocations)
  const selectedRef = useRef(selectedAircraft)
  const onSelectRef = useRef(onSelectAircraft)
  const onBoundsRef = useRef(onBoundsChange)
  const renderRef = useRef<() => void>(() => undefined)
  const [trafficView, setTrafficView] = useState<TrafficView>("density")
  const [renderedCount, setRenderedCount] = useState(0)

  useEffect(() => {
    aircraftRef.current = aircraft
    airportsRef.current = airports
    showAirportsRef.current = showAirports
    scannerModeRef.current = scannerMode
    scannerConflictsRef.current = scannerConflicts
    selectedRef.current = selectedAircraft
    onSelectRef.current = onSelectAircraft
    onBoundsRef.current = onBoundsChange
    renderRef.current()
  }, [aircraft, airports, onBoundsChange, onSelectAircraft, scannerConflicts, scannerMode, selectedAircraft, showAirports])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusLocation) return
    map.setView([focusLocation.latitude, focusLocation.longitude], focusLocation.zoom ?? 8, { animate: true })
  }, [focusLocation])

  useEffect(() => {
    fitLocationsRef.current = fitLocations
    const map = mapRef.current
    if (!map || !fitLocations || fitLocations.locations.length < 2) return
    map.fitBounds(fitLocations.locations.map((location) => [location.latitude, location.longitude]), { padding: [32, 32] })
  }, [fitLocations])

  useEffect(() => {
    if (!hostRef.current) return
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize({ pan: false }))
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [])

  renderRef.current = () => {
    const L = leafletRef.current
    const map = mapRef.current
    const densityLayer = densityLayerRef.current
    const aircraftLayer = aircraftLayerRef.current
    const airportLayer = airportLayerRef.current
    const scannerLayer = scannerLayerRef.current
    if (!L || !map || !densityLayer || !aircraftLayer || !airportLayer || !scannerLayer) return

    const zoom = map.getZoom()
    const view = trafficViewAtZoom(zoom)
    const currentAircraft = aircraftRef.current
    densityLayer.clearLayers()
    aircraftLayer.clearLayers()
    airportLayer.clearLayers()
    scannerLayer.clearLayers()
    setTrafficView(view)

    if (view !== "aircraft") {
      const cellSize = view === "density" ? 84 : 56
      densityCells(map, currentAircraft, cellSize)
        .filter((cell) => cell.aircraft.length > 1)
        .forEach((cell) => {
          const intensity = Math.min(1, Math.log2(cell.aircraft.length + 1) / 4)
          const coreRadius = (view === "density" ? 11 : 8) + intensity * (view === "density" ? 17 : 12)
          L.circleMarker([cell.latitude, cell.longitude], {
            pane: "discoverDensity",
            className: "discover-density-halo",
            radius: coreRadius * 1.8,
            stroke: false,
            fillColor: "#22d3ee",
            fillOpacity: 0.035 + intensity * 0.055,
            interactive: false,
          }).addTo(densityLayer)
          L.circleMarker([cell.latitude, cell.longitude], {
            pane: "discoverDensity",
            className: "discover-density-core",
            radius: coreRadius,
            stroke: false,
            fillColor: "#22d3ee",
            fillOpacity: 0.07 + intensity * 0.13,
            interactive: false,
          }).addTo(densityLayer)
        })
    }

    const markerAircraft = scannerModeRef.current
      ? currentAircraft
      : view === "density"
      ? sampleAircraft(map, currentAircraft, LOW_ZOOM_ICON_CAP, 42)
      : view === "regional"
        ? sampleAircraft(map, currentAircraft, MEDIUM_ZOOM_ICON_CAP, 26)
        : currentAircraft
    const selectedId = view === "aircraft" || scannerModeRef.current ? selectedRef.current?.icao24 : undefined
    markerAircraft.forEach((flight) => {
      const isSelected = Boolean(selectedId && flight.icao24 === selectedId)
      const marker = L.marker([flight.latitude, flight.longitude], {
        pane: "discoverAircraft",
        icon: planeIcon(L, flight, isSelected, scannerModeRef.current ? "aircraft" : view),
        keyboard: false,
        interactive: view === "aircraft" || scannerModeRef.current,
        riseOnHover: view === "aircraft" || scannerModeRef.current,
        riseOffset: isSelected ? 1000 : 0,
      })
      if (view === "aircraft" || scannerModeRef.current) marker.on("click", () => onSelectRef.current(flight))
      marker.addTo(aircraftLayer)
    })
    if (scannerModeRef.current) {
      scannerConflictsRef.current.forEach((pair) => {
        const color = scannerColor(pair.weatherAdjustedRisk)
        L.polyline([
          [pair.aircraftA.latitude, pair.aircraftA.longitude],
          [pair.aircraftB.latitude, pair.aircraftB.longitude],
        ], {
          pane: "discoverScanner",
          color,
          weight: pair.weatherAdjustedRisk === "Critical" ? 3 : 2,
          opacity: 0.85,
          dashArray: pair.weatherAdjustedRisk === "Low" ? "5 7" : undefined,
        }).bindPopup(scannerPopup(pair), { className: "discover-airport-popup-shell" }).addTo(scannerLayer)
        ;[pair.aircraftA, pair.aircraftB].forEach((flight) => {
          L.marker([flight.latitude, flight.longitude], {
            pane: "discoverScanner",
            icon: scannerIcon(L, flight, pair.weatherAdjustedRisk),
            keyboard: false,
            riseOnHover: true,
          }).bindPopup(scannerPopup(pair), { className: "discover-airport-popup-shell" }).addTo(scannerLayer)
        })
      })
    }
    if (showAirportsRef.current) {
      airportsRef.current.slice(0, 10).forEach((airport) => {
        if (!Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return
        L.marker([airport.lat, airport.lon], {
          pane: "discoverAirports",
          icon: airportIcon(L, airport),
          keyboard: false,
          riseOnHover: true,
          riseOffset: 750,
        })
          .bindTooltip(airportTooltip(airport), {
            direction: "top",
            offset: [0, -10],
            opacity: 0.96,
            sticky: true,
            className: "discover-airport-tooltip-shell",
          })
          .bindPopup(airportPopup(airport), { className: "discover-airport-popup-shell" })
          .addTo(airportLayer)
      })
    }
    setRenderedCount(markerAircraft.length)
  }

  useEffect(() => {
    let cancelled = false
    async function initialize() {
      if (!hostRef.current || mapRef.current) return
      const imported = await import("leaflet")
      if (cancelled || !hostRef.current) return
      const L = imported.default ?? imported
      leafletRef.current = L
      const map = L.map(hostRef.current, {
        center: [22.6, 78.9],
        zoom: 5,
        zoomControl: false,
        zoomAnimation: true,
        markerZoomAnimation: true,
      })
      map.createPane("discoverDensity")
      const densityPane = map.getPane("discoverDensity")
      if (densityPane) densityPane.style.zIndex = "330"
      map.createPane("discoverAircraft")
      const aircraftPane = map.getPane("discoverAircraft")
      if (aircraftPane) aircraftPane.style.zIndex = "430"
      map.createPane("discoverAirports")
      const airportsPane = map.getPane("discoverAirports")
      if (airportsPane) airportsPane.style.zIndex = "450"
      map.createPane("discoverScanner")
      const scannerPane = map.getPane("discoverScanner")
      if (scannerPane) scannerPane.style.zIndex = "520"
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)
      L.control.zoom({ position: "bottomright" }).addTo(map)
      densityLayerRef.current = L.layerGroup().addTo(map)
      aircraftLayerRef.current = L.layerGroup().addTo(map)
      airportLayerRef.current = L.layerGroup().addTo(map)
      scannerLayerRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
      const pendingFit = fitLocationsRef.current
      if (pendingFit && pendingFit.locations.length >= 2) {
        map.fitBounds(pendingFit.locations.map((location) => [location.latitude, location.longitude]), { padding: [32, 32] })
      }
      const reportBounds = () => {
        const visible = map.getBounds()
        onBoundsRef.current({
          lamin: visible.getSouth(),
          lomin: visible.getWest(),
          lamax: visible.getNorth(),
          lomax: visible.getEast(),
        })
      }
      map.on("moveend", () => {
        renderRef.current()
        reportBounds()
      })
      map.on("zoomend", renderRef.current)
      renderRef.current()
      reportBounds()
    }
    initialize()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  const modeLabel = scannerMode ? "AIRSPACE SCANNER" : trafficView === "density" ? "RADAR DENSITY" : trafficView === "regional" ? "REGIONAL TRAFFIC" : "AIRCRAFT"

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" aria-label="Live aircraft map" />
      <div className="pointer-events-none absolute bottom-6 left-4 z-[500] rounded-md border border-cyan-400/20 bg-black/65 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.16em] text-cyan-200/80 backdrop-blur-sm">
        {modeLabel} / {renderedCount} DISPLAYED
      </div>
    </div>
  )
}
