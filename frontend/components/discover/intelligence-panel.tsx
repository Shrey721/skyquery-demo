"use client"

import Link from "next/link"
import { Activity, CloudRain, Database, MapPin, Plane, Radio, RefreshCw, Sparkles } from "lucide-react"
import type { LiveAircraft, MapBounds } from "@/lib/public-flights-api"
import type { WeatherIntelligence, WeatherRegion } from "@/lib/weather-api"

const REFERENCE_AIRPORTS = [
  { code: "DEL", name: "Indira Gandhi International", latitude: 28.5562, longitude: 77.1 },
  { code: "BOM", name: "Chhatrapati Shivaji Maharaj International", latitude: 19.0896, longitude: 72.8656 },
  { code: "BLR", name: "Kempegowda International", latitude: 13.1986, longitude: 77.7066 },
  { code: "HYD", name: "Rajiv Gandhi International", latitude: 17.2403, longitude: 78.4294 },
]

function displayNumber(value: number | null, unit = "") {
  return value == null ? "Unavailable" : `${Math.round(value).toLocaleString()}${unit}`
}

function riskClass(risk?: string) {
  if (risk === "High") return "bg-red-500/10 text-red-300"
  if (risk === "Medium") return "bg-amber-500/10 text-amber-300"
  return "bg-emerald-500/10 text-emerald-300"
}

function distanceNm(flight: LiveAircraft, airport: (typeof REFERENCE_AIRPORTS)[number]) {
  const radians = Math.PI / 180
  const dLat = (airport.latitude - flight.latitude) * radians
  const dLon = (airport.longitude - flight.longitude) * radians
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(flight.latitude * radians) * Math.cos(airport.latitude * radians) * Math.sin(dLon / 2) ** 2
  return Math.round(3440 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export function IntelligencePanel({
  aircraft,
  selected,
  loading,
  apiConnected,
  bounds,
  weather,
  weatherRegion,
  weatherLoading = false,
  weatherError,
  onRefreshWeather,
}: {
  aircraft: LiveAircraft[]
  selected: LiveAircraft | null
  loading: boolean
  apiConnected: boolean
  bounds?: MapBounds | null
  weather?: WeatherIntelligence | null
  weatherRegion?: WeatherRegion | null
  weatherLoading?: boolean
  weatherError?: string | null
  onRefreshWeather?: () => void
}) {
  const airborne = aircraft.filter((flight) => !flight.on_ground)
  const altitudes = airborne.flatMap((flight) => flight.altitude_ft == null ? [] : [flight.altitude_ft])
  const speeds = airborne.flatMap((flight) => flight.speed_kts == null ? [] : [flight.speed_kts])
  const averageAltitude = altitudes.length ? altitudes.reduce((sum, value) => sum + value, 0) / altitudes.length : null
  const averageSpeed = speeds.length ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : null
  const anomalies = aircraft.filter((flight) => {
    const age = flight.last_seen ? (Date.now() - new Date(flight.last_seen).getTime()) / 1000 : Infinity
    return flight.altitude_ft == null || (!flight.on_ground && (flight.altitude_ft ?? 0) < 1000) || Math.abs(flight.vertical_rate ?? 0) > 25 || age > 120
  }).length
  const longitudeWidth = bounds ? Math.max(bounds.lomax - bounds.lomin, 0.01) : 1
  const latitudeHeight = bounds ? Math.max(bounds.lamax - bounds.lamin, 0.01) : 1
  const latitudeScale = bounds ? Math.max(Math.cos(((bounds.lamin + bounds.lamax) / 2) * Math.PI / 180), 0.1) : 1
  const areaSqNm = longitudeWidth * latitudeHeight * latitudeScale * 60 * 60
  const densityPer10kSqNm = aircraft.length / areaSqNm * 10_000
  const congestion = densityPer10kSqNm < 2 ? "Low" : densityPer10kSqNm < 6 ? "Moderate" : "High"
  const nearby = selected
    ? REFERENCE_AIRPORTS.map((airport) => ({ ...airport, distance: distanceNm(selected, airport) })).sort((a, b) => a.distance - b.distance).slice(0, 3)
    : REFERENCE_AIRPORTS.slice(0, 3).map((airport) => ({ ...airport, distance: null }))

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-l border-border/40 bg-card/70 p-4 backdrop-blur-xl lg:w-[360px]">
      <section className="mb-5 space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Database className="h-4 w-4 text-primary" /> Data Sources</h2>
        <div className="rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs">
          <div className="flex justify-between"><span>OpenSky Network</span><span className={apiConnected ? "text-emerald-400" : "text-muted-foreground"}>{loading ? "Connecting..." : apiConnected ? "Connected" : "Unavailable"}</span></div>
          <div className="mt-2 flex justify-between text-muted-foreground">
            <span>Open-Meteo</span>
            <span className={weather ? "text-emerald-400" : "text-muted-foreground"}>{weatherLoading ? "Connecting..." : weather ? "Connected" : "Unavailable"}</span>
          </div>
          <div className="mt-2 flex justify-between text-muted-foreground"><span>Enterprise</span><span>Not connected</span></div>
        </div>
      </section>
      <section className="mb-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><CloudRain className="h-4 w-4 text-primary" /> Weather</h2>
          <button
            onClick={onRefreshWeather}
            disabled={weatherLoading || !onRefreshWeather}
            className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${weatherLoading ? "animate-spin" : ""}`} /> Refresh Weather
          </button>
        </div>
        <div className="rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{weatherRegion?.label ?? "Current view"}</span>
            <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${riskClass(weather?.riskLevel)}`}>
              {weatherLoading ? "Loading" : weather?.riskLevel ?? "Unavailable"}
            </span>
          </div>
          {weatherError && <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">{weatherError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Temp" value={weatherLoading && !weather ? "Loading" : displayNumber(weather?.temperature ?? null, " C")} />
            <Metric label="Wind" value={weatherLoading && !weather ? "Loading" : displayNumber(weather?.windSpeed ?? null, " km/h")} />
            <Metric label="Clouds" value={weatherLoading && !weather ? "Loading" : displayNumber(weather?.cloudCover ?? null, "%")} />
            <Metric label="Precip" value={weatherLoading && !weather ? "Loading" : displayNumber(weather?.precipitation ?? null, " mm")} />
          </div>
          <div className="mt-3 flex justify-between gap-3 text-[11px] text-muted-foreground">
            <span>Source: Open-Meteo</span>
            {weather?.fetched_at && <span>Last updated at {new Date(weather.fetched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
      </section>
      <section className="mb-5 space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Activity className="h-4 w-4 text-primary" /> Live Airspace Summary</h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="In View" value={String(aircraft.length)} />
          <Metric label="Congestion" value={congestion} />
          <Metric label="Avg Altitude" value={displayNumber(averageAltitude, " ft")} />
          <Metric label="Avg Speed" value={displayNumber(averageSpeed, " kt")} />
        </div>
        <p className="text-[11px] text-muted-foreground">{densityPer10kSqNm.toFixed(1)} aircraft per 10,000 sq nm in viewport</p>
        <p className={`rounded-lg px-3 py-2 text-xs ${anomalies ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>
          {anomalies ? `${anomalies} simple anomaly flag${anomalies === 1 ? "" : "s"} detected` : "No rule-based anomalies detected"}
        </p>
      </section>
      <section className="mb-5 space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Plane className="h-4 w-4 text-primary" /> Selected Aircraft</h2>
        {selected ? (
          <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
            <p className="text-base font-semibold text-foreground">{selected.callsign || "Unknown callsign"}</p>
            <Detail label="ICAO24" value={selected.icao24.toUpperCase()} />
            <Detail label="Origin" value={selected.origin_country || "Unavailable"} />
            <Detail label="Altitude" value={displayNumber(selected.altitude_ft, " ft")} />
            <Detail label="Speed" value={displayNumber(selected.speed_kts, " kt")} />
            <Detail label="Heading" value={displayNumber(selected.heading, " deg")} />
            <Detail label="Vertical rate" value={displayNumber(selected.vertical_rate, " m/s")} />
            <Detail label="Last seen" value={selected.last_seen ? new Date(selected.last_seen).toLocaleTimeString() : "Unavailable"} />
            <Detail label="Source" value={selected.source === "demo" ? "Sample data" : "OpenSky"} />
          </div>
        ) : <p className="rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs text-muted-foreground">Select an aircraft marker for live details.</p>}
      </section>
      <section className="mb-5 space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><MapPin className="h-4 w-4 text-primary" /> Nearby Airports</h2>
        <p className="text-[11px] text-muted-foreground">Reference airport locations only. Operational data not connected.</p>
        {nearby.map((airport) => (
          <div key={airport.code} className="rounded-lg border border-border/30 bg-secondary/20 p-2 text-xs">
            <span className="font-semibold text-primary">{airport.code}</span> <span className="text-muted-foreground">{airport.name}</span>
            {airport.distance != null && <span className="float-right text-muted-foreground">{airport.distance} nm</span>}
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Sparkles className="h-4 w-4 text-accent" /> AI Suggested Questions</h2>
        {["Show airports with high traffic in this view", "Summarize live airspace anomalies"].map((question) => (
          <Link key={question} href={`/?q=${encodeURIComponent(question)}`} className="block rounded-lg bg-secondary/30 p-2 text-xs text-muted-foreground hover:text-foreground">{question}</Link>
        ))}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Radio className="h-3 w-3" /> Enterprise source not connected. Weather from Open-Meteo.</p>
      </section>
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/30 bg-secondary/20 p-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2 text-muted-foreground"><span>{label}</span><span className="text-right text-foreground">{value}</span></div>
}
