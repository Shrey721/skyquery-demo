"use client"

import { useEffect, useRef, useState } from "react"
import type { LiveAircraft, MapBounds } from "@/lib/public-flights-api"

interface AviationMapProps {
  aircraft: LiveAircraft[]
  selectedAircraft: LiveAircraft | null
  onSelectAircraft: (aircraft: LiveAircraft) => void
  onBoundsChange: (bounds: MapBounds) => void
  focusLocation?: { latitude: number; longitude: number; zoom?: number; nonce: number } | null
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

export function AviationMap({ aircraft, selectedAircraft, onSelectAircraft, onBoundsChange, focusLocation }: AviationMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const densityLayerRef = useRef<any>(null)
  const aircraftLayerRef = useRef<any>(null)
  const aircraftRef = useRef(aircraft)
  const selectedRef = useRef(selectedAircraft)
  const onSelectRef = useRef(onSelectAircraft)
  const onBoundsRef = useRef(onBoundsChange)
  const renderRef = useRef<() => void>(() => undefined)
  const [trafficView, setTrafficView] = useState<TrafficView>("density")
  const [renderedCount, setRenderedCount] = useState(0)

  useEffect(() => {
    aircraftRef.current = aircraft
    selectedRef.current = selectedAircraft
    onSelectRef.current = onSelectAircraft
    onBoundsRef.current = onBoundsChange
    renderRef.current()
  }, [aircraft, onBoundsChange, onSelectAircraft, selectedAircraft])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusLocation) return
    map.setView([focusLocation.latitude, focusLocation.longitude], focusLocation.zoom ?? 8, { animate: true })
  }, [focusLocation])

  renderRef.current = () => {
    const L = leafletRef.current
    const map = mapRef.current
    const densityLayer = densityLayerRef.current
    const aircraftLayer = aircraftLayerRef.current
    if (!L || !map || !densityLayer || !aircraftLayer) return

    const zoom = map.getZoom()
    const view = trafficViewAtZoom(zoom)
    const currentAircraft = aircraftRef.current
    densityLayer.clearLayers()
    aircraftLayer.clearLayers()
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

    const markerAircraft = view === "density"
      ? sampleAircraft(map, currentAircraft, LOW_ZOOM_ICON_CAP, 42)
      : view === "regional"
        ? sampleAircraft(map, currentAircraft, MEDIUM_ZOOM_ICON_CAP, 26)
        : currentAircraft
    const selectedId = view === "aircraft" ? selectedRef.current?.icao24 : undefined
    markerAircraft.forEach((flight) => {
      const isSelected = Boolean(selectedId && flight.icao24 === selectedId)
      const marker = L.marker([flight.latitude, flight.longitude], {
        pane: "discoverAircraft",
        icon: planeIcon(L, flight, isSelected, view),
        keyboard: false,
        interactive: view === "aircraft",
        riseOnHover: view === "aircraft",
        riseOffset: isSelected ? 1000 : 0,
      })
      if (view === "aircraft") marker.on("click", () => onSelectRef.current(flight))
      marker.addTo(aircraftLayer)
    })
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
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)
      L.control.zoom({ position: "bottomright" }).addTo(map)
      densityLayerRef.current = L.layerGroup().addTo(map)
      aircraftLayerRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
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

  const modeLabel = trafficView === "density" ? "RADAR DENSITY" : trafficView === "regional" ? "REGIONAL TRAFFIC" : "AIRCRAFT"

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" aria-label="Live aircraft map" />
      <div className="pointer-events-none absolute bottom-6 left-4 z-[500] rounded-md border border-cyan-400/20 bg-black/65 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.16em] text-cyan-200/80 backdrop-blur-sm">
        {modeLabel} / {renderedCount} DISPLAYED
      </div>
    </div>
  )
}
