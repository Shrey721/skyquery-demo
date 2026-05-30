"use client"

import Link from "next/link"
import { useState } from "react"
import { Activity, ChevronDown, CloudRain, Database, MapPin, Plane, Radio, RefreshCw, Sparkles } from "lucide-react"
import type { LiveAircraft, MapBounds } from "@/lib/public-flights-api"
import type { WeatherIntelligence, WeatherRegion } from "@/lib/weather-api"
import type { NearbyAirport } from "@/lib/nearby-airports-api"
import type { DiscoverEnterpriseResponse } from "@/lib/discover-enterprise-api"

function displayNumber(value: number | null, unit = "") {
  return value == null ? "Unavailable" : `${Math.round(value).toLocaleString()}${unit}`
}

function displayDecimal(value: number | null | undefined, unit = "") {
  return value == null ? "Unavailable" : `${Number(value).toFixed(1)}${unit}`
}

function displayVisibility(value: number | null | undefined) {
  return value == null ? "Unavailable" : `${(value / 1000).toFixed(1)} km`
}

function displayWind(weather?: WeatherIntelligence | null) {
  if (!weather?.windSpeed && weather?.windSpeed !== 0) return "Unavailable"
  const direction = weather.windDirection == null ? "" : ` ${Math.round(weather.windDirection)} deg`
  const gusts = weather.windGusts == null ? "" : `, gust ${Math.round(weather.windGusts)}`
  return `${Math.round(weather.windSpeed)} km/h${direction}${gusts}`
}

function riskClass(risk?: string) {
  if (risk === "High") return "bg-red-500/10 text-red-300"
  if (risk === "Medium") return "bg-amber-500/10 text-amber-300"
  return "bg-emerald-500/10 text-emerald-300"
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
  weatherSummary,
  weatherImpactAssessment,
  nearbyAirports,
  nearbyAirportsContext,
  nearbyAirportsError,
  nearbyAirportsLabel,
  nearbyAirportsSource,
  onRefreshWeather,
  enterprise,
  enterpriseLoading = false,
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
  weatherSummary?: string | null
  weatherImpactAssessment?: {
    impactMode: boolean
    impactTypeLabel: string
    flightsInArea: number
    impactedCount: number
    assessment: string
    contributors: string[]
    honestyLabel: string
  } | null
  nearbyAirports?: NearbyAirport[]
  nearbyAirportsContext?: "selected_aircraft" | "search_area" | "current_view" | null
  nearbyAirportsError?: string | null
  nearbyAirportsLabel?: string | null
  nearbyAirportsSource?: string | null
  onRefreshWeather?: () => void
  enterprise?: DiscoverEnterpriseResponse | null
  enterpriseLoading?: boolean
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [airportsOpen, setAirportsOpen] = useState(false)
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
          <div className="mt-2 flex justify-between text-muted-foreground"><span>Enterprise</span><span className={enterprise?.available ? "text-emerald-400" : "text-muted-foreground"}>{enterpriseLoading ? "Connecting..." : enterprise?.available ? "Connected" : "Not queried"}</span></div>
        </div>
      </section>
      {(enterpriseLoading || enterprise) && (
        <section className="mb-5 space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Database className="h-4 w-4 text-primary" /> Enterprise Intelligence</h2>
          <div className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs">
            {enterpriseLoading ? (
              <p className="text-muted-foreground">Loading selected Trino context...</p>
            ) : (
              <>
                <Detail label="Primary Source" value="Trino" />
                <Detail label="Interpretation" value={enterprise?.queryPlan.enterpriseIntent ?? enterprise?.queryPlan.intent ?? "enterprise"} />
                <Detail label="Matched Airports" value={String(enterprise?.matchedAirportsCount ?? 0)} />
                {enterprise?.message && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">{enterprise.message}</p>}
                {enterprise?.sourceTables.map((table) => <p key={table} className="break-all text-[11px] text-muted-foreground">Source: {table}</p>)}
                {enterprise?.rows.slice(0, 5).map((row, index) => (
                  <div key={`${row.airportCode}-${index}`} className="rounded-lg border border-border/30 bg-background/20 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold text-primary">{row.airportCode || "Airport"}</span>
                      {row.risk && <span className={`rounded px-1.5 py-0.5 text-[10px] ${riskClass(row.risk)}`}>{row.risk}</span>}
                    </div>
                    {Object.entries(row.metrics).map(([label, value]) => <Detail key={label} label={metricLabel(label)} value={String(value)} />)}
                  </div>
                ))}
                {enterprise?.honestyNote && <p className="text-[11px] text-muted-foreground">{enterprise.honestyNote}</p>}
                <p className="text-[11px] text-muted-foreground">Data Sources Used: Enterprise: Trino; Live Flights: OpenSky; Weather: Open-Meteo; Airports: OurAirports local dataset.</p>
              </>
            )}
          </div>
        </section>
      )}
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
              {weatherLoading ? "Loading" : weather?.operationalRisk ?? weather?.riskLevel ?? "Unavailable"}
            </span>
          </div>
          {weatherError && <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">{weatherError}</p>}
          {weatherSummary && <p className="mb-3 rounded-lg bg-primary/10 px-3 py-2 text-primary">{weatherSummary}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Operational Risk" value={weatherLoading && !weather ? "Loading" : weather?.operationalRisk ?? weather?.riskLevel ?? "Unavailable"} />
            <Metric label={`Visibility${weather?.visibilityStatus ? ` (${weather.visibilityStatus})` : ""}`} value={weatherLoading && !weather ? "Loading" : displayVisibility(weather?.visibility)} />
            <Metric label={`Wind${weather?.windStatus ? ` (${weather.windStatus})` : ""}`} value={weatherLoading && !weather ? "Loading" : displayWind(weather)} />
            <Metric label={`Precip${weather?.precipitationStatus ? ` (${weather.precipitationStatus})` : ""}`} value={weatherLoading && !weather ? "Loading" : displayDecimal(weather?.precipitation, " mm")} />
          </div>
          <button
            onClick={() => setDetailsOpen((open) => !open)}
            className="mt-3 flex w-full items-center justify-between rounded-md border border-border/30 bg-secondary/20 px-2 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Details
            <ChevronDown className={`h-3.5 w-3.5 transition ${detailsOpen ? "rotate-180" : ""}`} />
          </button>
          {detailsOpen && (
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/30 bg-background/20 p-2">
              <Detail label="Temperature" value={displayDecimal(weather?.temperature, " C")} />
              <Detail label="Feels like" value={displayDecimal(weather?.apparentTemperature, " C")} />
              <Detail label="Humidity" value={displayNumber(weather?.humidity ?? null, "%")} />
              <Detail label="Pressure MSL" value={displayDecimal(weather?.pressureMsl, " hPa")} />
              <Detail label="Surface pressure" value={displayDecimal(weather?.surfacePressure, " hPa")} />
              <Detail label="Cloud cover" value={displayNumber(weather?.cloudCover ?? null, "%")} />
              <Detail label="Wind direction" value={displayNumber(weather?.windDirection ?? null, " deg")} />
              <Detail label="Wind gusts" value={displayNumber(weather?.windGusts ?? null, " km/h")} />
              <Detail label="Visibility" value={displayVisibility(weather?.visibility)} />
              <Detail label="Precipitation" value={displayDecimal(weather?.precipitation, " mm")} />
              <Detail label="Rain" value={displayDecimal(weather?.rain, " mm")} />
              <Detail label="Showers" value={displayDecimal(weather?.showers, " mm")} />
              <Detail label="Snowfall" value={displayDecimal(weather?.snowfall, " cm")} />
              <Detail label="Condition" value={weather?.weatherCondition ?? "Unavailable"} />
              <Detail label="Weather code" value={weather?.weatherCode == null ? "Unavailable" : String(weather.weatherCode)} />
            </div>
          )}
          <div className="mt-3 flex justify-between gap-3 text-[11px] text-muted-foreground">
            <span>Source: Open-Meteo</span>
            {(weather?.lastUpdated || weather?.fetched_at) && <span>Last updated at {new Date(weather.lastUpdated || weather.fetched_at || "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
      </section>
      {weatherImpactAssessment?.impactMode && (
        <section className="mb-5 space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><CloudRain className="h-4 w-4 text-primary" /> Flight Weather Impact</h2>
          <div className="space-y-2 rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs">
            <Detail label="Impact Type" value={weatherImpactAssessment.impactTypeLabel} />
            <Detail label="Flights in Area" value={String(weatherImpactAssessment.flightsInArea)} />
            <Detail label="Weather Impacted" value={String(weatherImpactAssessment.impactedCount)} />
            <p className={`rounded-lg px-3 py-2 ${weatherImpactAssessment.impactedCount ? "bg-amber-500/10 text-amber-200" : "bg-secondary/30 text-muted-foreground"}`}>
              {weatherImpactAssessment.assessment}
            </p>
            {weatherImpactAssessment.contributors.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Reason: {weatherImpactAssessment.contributors.join(", ")}</p>
            )}
            <p className="text-[11px] text-muted-foreground">{weatherImpactAssessment.honestyLabel}</p>
          </div>
        </section>
      )}
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><MapPin className="h-4 w-4 text-primary" /> Nearby Airports</h2>
          <button
            onClick={() => setAirportsOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            {airportsOpen ? "Show 5" : "Show 10"}
            <ChevronDown className={`h-3.5 w-3.5 transition ${airportsOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">{airportContextLabel(nearbyAirportsContext, nearbyAirportsLabel)}</p>
        {nearbyAirportsSource && <p className="text-[11px] text-muted-foreground">Source: {nearbyAirportsSource}</p>}
        {nearbyAirportsError ? (
          <p className="rounded-lg border border-border/30 bg-secondary/20 p-2 text-xs text-muted-foreground">Nearby airport data unavailable.</p>
        ) : nearbyAirports && nearbyAirports.length > 0 ? (
          <div className={`${airportsOpen ? "max-h-72 overflow-y-auto pr-1" : ""} space-y-2`}>
            {nearbyAirports.slice(0, airportsOpen ? 10 : 5).map((airport) => (
              <div key={`${airport.ident}-${airport.distanceNm}`} className="rounded-lg border border-border/30 bg-secondary/20 p-2 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-primary">{airport.code}</p>
                    <p className="text-muted-foreground">{airport.name}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground">{Math.round(airport.distanceNm)} nm</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-border/30 bg-secondary/20 p-2 text-xs text-muted-foreground">Nearby airport data unavailable.</p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Sparkles className="h-4 w-4 text-accent" /> AI Suggested Questions</h2>
        {["Show airports with high traffic in this view", "Summarize live airspace anomalies"].map((question) => (
          <Link key={question} href={`/?q=${encodeURIComponent(question)}`} className="block rounded-lg bg-secondary/30 p-2 text-xs text-muted-foreground hover:text-foreground">{question}</Link>
        ))}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Radio className="h-3 w-3" /> Enterprise intelligence uses selected Trino context. Weather from Open-Meteo.</p>
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

function metricLabel(metric: string) {
  return metric.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())
}

function airportContextLabel(context?: "selected_aircraft" | "search_area" | "current_view" | null, label?: string | null) {
  if (context === "selected_aircraft") return "Nearest airports to selected aircraft"
  if (context === "current_view") return "Airports in current view"
  if (label) return `Nearby airports for ${label}`
  return "Nearby airports for current area"
}
