"use client"

import { useState } from "react"
import { Activity, ChevronDown, CloudRain, Database, MapPin, Plane, Radar, Radio, RefreshCw, Sparkles, X } from "lucide-react"
import type { LiveAircraft, MapBounds } from "@/lib/public-flights-api"
import type { WeatherIntelligence, WeatherRegion } from "@/lib/weather-api"
import type { NearbyAirport } from "@/lib/nearby-airports-api"
import type { DiscoverEnterpriseAirportSummary, DiscoverEnterpriseResponse } from "@/lib/discover-enterprise-api"
import type { AirspaceConflictPair, AirspaceScanResult } from "@/lib/airspace-scanner"

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
  if (risk === "Critical") return "bg-red-600/20 text-red-200"
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
  selectedAircraftList,
  selectedAirportList,
  onRemoveSelectedAircraft,
  onRemoveSelectedAirport,
  scannerActive,
  scannerResult,
  scannerLastUpdated,
  scannerDataStatus,
  nearbyAirports,
  nearbyAirportsContext,
  nearbyAirportsLoading = false,
  nearbyAirportsError,
  nearbyAirportsLabel,
  nearbyAirportsSource,
  onRefreshWeather,
  onSuggestedQuestion,
  enterprise,
  enterpriseLoading = false,
  activeEnterpriseAirportCode,
  onSelectEnterpriseAirport,
  selectedCloseCallIds,
  onSelectCloseCall,
  selectedAirportCodes,
  onSelectNearbyAirport,
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
  selectedAircraftList?: LiveAircraft[]
  selectedAirportList?: NearbyAirport[]
  onRemoveSelectedAircraft?: (aircraftId: string) => void
  onRemoveSelectedAirport?: (airportCode: string) => void
  scannerActive?: boolean
  scannerResult?: AirspaceScanResult | null
  scannerLastUpdated?: string | null
  scannerDataStatus?: "live" | "cached" | "stale" | "demo" | null
  nearbyAirports?: NearbyAirport[]
  nearbyAirportsContext?: "selected_aircraft" | "search_area" | "current_view" | null
  nearbyAirportsLoading?: boolean
  nearbyAirportsError?: string | null
  nearbyAirportsLabel?: string | null
  nearbyAirportsSource?: string | null
  onRefreshWeather?: () => void
  onSuggestedQuestion?: (question: string) => void
  enterprise?: DiscoverEnterpriseResponse | null
  enterpriseLoading?: boolean
  activeEnterpriseAirportCode?: string | null
  onSelectEnterpriseAirport?: (airportCode: string) => void
  selectedCloseCallIds?: string[]
  onSelectCloseCall?: (pair: AirspaceConflictPair) => void
  selectedAirportCodes?: string[]
  onSelectNearbyAirport?: (airport: NearbyAirport) => void
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
    <aside className="flex h-full w-full shrink-0 flex-col overflow-y-auto border-l border-border/40 bg-card/70 p-4 backdrop-blur-xl">
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
                {enterprise?.selectedAirports?.length ? <p className="rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary">{enterprise.selectedAirports.length} enterprise airport{enterprise.selectedAirports.length === 1 ? "" : "s"} found</p> : null}
                {activeEnterpriseAirportCode && <p className="text-[11px] text-muted-foreground">Viewing context for {activeEnterpriseAirportCode}</p>}
                {enterprise?.message && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">{enterprise.message}</p>}
                {enterprise?.sourceTables.map((table) => <p key={table} className="break-all text-[11px] text-muted-foreground">Source: {table}</p>)}
                {enterprise?.comparison && enterprise.airportSummaries?.length ? <EnterpriseComparisonTable summaries={enterprise.airportSummaries} /> : null}
                {enterprise?.airportSummaries?.length ? (
                  <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
                    {enterprise.airportSummaries.map((summary) => <EnterpriseAirportSummary key={summary.airportCode} summary={summary} selected={summary.airportCode === activeEnterpriseAirportCode} onSelect={onSelectEnterpriseAirport} />)}
                  </div>
                ) : enterprise?.rows.slice(0, 5).map((row, index) => (
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
      {scannerActive && (
        <section className="mb-5 space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Radar className="h-4 w-4 text-primary" /> Airspace Scanner</h2>
          <div className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Aircraft scanned" value={String(scannerResult?.aircraftScanned ?? 0)} />
              <Metric label="Risk pairs found" value={String(scannerResult?.pairs.length ?? 0)} />
            </div>
            <p className="rounded-lg bg-background/30 px-3 py-2 text-[11px] text-muted-foreground">
              Based on the latest loaded OpenSky snapshot{scannerLastUpdated ? ` from ${new Date(scannerLastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}. Scanner does not refresh live data automatically.
            </p>
            {scannerDataStatus === "stale" && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">Live provider rate-limited. Scanner can still analyze the last loaded snapshot.</p>
            )}
            {scannerResult?.capped && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">Large snapshot capped for browser performance.</p>}
            <div className="rounded-lg border border-border/30 bg-background/20 p-2">
              <Detail label="Critical" value={String(scannerResult?.riskCounts.Critical ?? 0)} />
              <Detail label="High" value={String(scannerResult?.riskCounts.High ?? 0)} />
              <Detail label="Medium" value={String(scannerResult?.riskCounts.Medium ?? 0)} />
              <Detail label="Low" value={String(scannerResult?.riskCounts.Low ?? 0)} />
            </div>
            {scannerResult?.pairs.length ? (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {scannerResult.pairs.slice(0, 12).map((pair) => (
                  <ScannerPairCard key={pair.id} pair={pair} selected={selectedCloseCallIds?.includes(pair.id)} onSelect={onSelectCloseCall} />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-border/30 bg-background/20 p-2 text-muted-foreground">
                {scannerResult?.message ?? "No close-call proximity risks detected in the current snapshot."}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">This is a proximity screen from public feeds with weather context, not real ATC conflict prediction.</p>
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
        {selectedAircraftList?.length ? (
          <div className="space-y-2">
            {selectedAircraftList.map((flight) => (
              <SelectedAircraftCard key={aircraftSelectionId(flight)} flight={flight} onRemove={onRemoveSelectedAircraft} />
            ))}
          </div>
        ) : selected ? (
          <SelectedAircraftCard flight={selected} onRemove={onRemoveSelectedAircraft} />
        ) : <p className="rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs text-muted-foreground">Select an aircraft marker for live details.</p>}
      </section>
      {selectedAirportList?.length ? (
        <section className="mb-5 space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><MapPin className="h-4 w-4 text-primary" /> Selected Airports</h2>
          <div className="space-y-2">
            {selectedAirportList.map((airport) => (
              <SelectedAirportCard key={airportIdentifier(airport)} airport={airport} onRemove={onRemoveSelectedAirport} />
            ))}
          </div>
        </section>
      ) : null}
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
        {nearbyAirportsLoading && (
          <p className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-xs text-primary">
            {nearbyAirportsContext === "selected_aircraft" ? "Loading nearby airports for selected aircraft..." : "Loading nearby airports..."}
          </p>
        )}
        {nearbyAirportsError && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-200">{nearbyAirportsError}</p>
        )}
        {nearbyAirports && nearbyAirports.length > 0 ? (
          <div className={`${airportsOpen ? "max-h-72 overflow-y-auto pr-1" : ""} space-y-2`}>
            {nearbyAirports.slice(0, airportsOpen ? 10 : 5).map((airport) => (
              <div
                key={`${airport.ident}-${airport.distanceNm}`}
                role={onSelectNearbyAirport ? "button" : undefined}
                tabIndex={onSelectNearbyAirport ? 0 : undefined}
                onClick={() => onSelectNearbyAirport?.(airport)}
                onKeyDown={(event) => {
                  if (!onSelectNearbyAirport || (event.key !== "Enter" && event.key !== " ")) return
                  event.preventDefault()
                  onSelectNearbyAirport(airport)
                }}
                className={`rounded-lg border p-2 text-xs transition ${selectedAirportCardClass(airportMatchesCode(airport, selectedAirportCodes), Boolean(onSelectNearbyAirport))}`}
              >
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
          <button
            key={question}
            type="button"
            onClick={() => onSuggestedQuestion?.(question)}
            className="block w-full rounded-lg bg-secondary/30 p-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            {question}
          </button>
        ))}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Radio className="h-3 w-3" /> Enterprise intelligence uses selected Trino context. Weather from Open-Meteo.</p>
      </section>
    </aside>
  )
}

function ScannerPairCard({ pair, selected = false, onSelect }: { pair: AirspaceConflictPair; selected?: boolean; onSelect?: (pair: AirspaceConflictPair) => void }) {
  const labelA = pair.aircraftA.callsign || pair.aircraftA.icao24.toUpperCase()
  const labelB = pair.aircraftB.callsign || pair.aircraftB.icao24.toUpperCase()
  const weatherFactor = pair.weatherContext.unavailable
    ? "Weather context unavailable. Scanner is using aircraft separation only."
    : pair.weatherContext.factors.length
      ? pair.weatherContext.factors.join(", ")
      : "No adverse weather factor detected"
  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(pair)}
      onKeyDown={(event) => {
        if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return
        event.preventDefault()
        onSelect(pair)
      }}
      className={`rounded-lg border p-2 transition ${selected ? "border-cyan-300/70 bg-cyan-400/10 ring-1 ring-cyan-300/30" : "border-border/30 bg-background/20"} ${onSelect ? selected ? "cursor-pointer hover:border-cyan-200/80 hover:bg-cyan-400/15" : "cursor-pointer hover:border-primary/50 hover:bg-background/30" : ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{labelA} / {labelB}</p>
          <p className="text-[11px] text-muted-foreground">{pair.nearestAirport?.code ? `Nearest: ${pair.nearestAirport.code}` : "Nearest airport unavailable"}</p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${riskClass(pair.weatherAdjustedRisk)}`}>{pair.weatherAdjustedRisk}</span>
      </div>
      <Detail label="Distance" value={`${pair.horizontalKm.toFixed(1)} km`} />
      <Detail label="Vertical separation" value={`${Math.round(pair.verticalFt).toLocaleString()} ft`} />
      <Detail label="Altitude A" value={displayNumber(pair.altitudeA, " ft")} />
      <Detail label="Altitude B" value={displayNumber(pair.altitudeB, " ft")} />
      <Detail label="Speed A" value={displayNumber(pair.aircraftA.speed_kts, " kt")} />
      <Detail label="Speed B" value={displayNumber(pair.aircraftB.speed_kts, " kt")} />
      <Detail label="Heading A" value={displayNumber(pair.aircraftA.heading, " deg")} />
      <Detail label="Heading B" value={displayNumber(pair.aircraftB.heading, " deg")} />
      <Detail label="Base proximity risk" value={pair.baseRisk} />
      <Detail label="Weather factor" value={weatherFactor} />
      <Detail label="Weather-adjusted risk" value={pair.weatherAdjustedRisk} />
    </div>
  )
}

function SelectedAircraftCard({ flight, onRemove }: { flight: LiveAircraft; onRemove?: (aircraftId: string) => void }) {
  const aircraftId = aircraftSelectionId(flight)
  return (
    <div className="space-y-2 rounded-xl border border-cyan-300/45 bg-cyan-400/10 p-3 text-xs ring-1 ring-cyan-300/20 transition hover:border-cyan-200/70 hover:bg-cyan-400/15">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-foreground">{flight.callsign || "Unknown callsign"}</p>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(aircraftId)}
            className="rounded-md border border-border/40 bg-background/40 p-1 text-muted-foreground transition hover:text-foreground"
            aria-label={`Remove ${flight.callsign || flight.icao24} selection`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <Detail label="ICAO24" value={flight.icao24.toUpperCase()} />
      <Detail label="Origin" value={flight.origin_country || "Unavailable"} />
      <Detail label="Altitude" value={displayNumber(flight.altitude_ft, " ft")} />
      <Detail label="Speed" value={displayNumber(flight.speed_kts, " kt")} />
      <Detail label="Heading" value={displayNumber(flight.heading, " deg")} />
      <Detail label="Vertical rate" value={displayNumber(flight.vertical_rate, " m/s")} />
      <Detail label="Last seen" value={flight.last_seen ? new Date(flight.last_seen).toLocaleTimeString() : "Unavailable"} />
      <Detail label="Source" value={flight.source === "demo" ? "Sample data" : "OpenSky"} />
    </div>
  )
}

function SelectedAirportCard({ airport, onRemove }: { airport: NearbyAirport; onRemove?: (airportCode: string) => void }) {
  const airportId = airportIdentifier(airport)
  return (
    <div className="rounded-xl border border-amber-300/45 bg-amber-400/10 p-3 text-xs ring-1 ring-amber-300/20 transition hover:border-amber-200/70 hover:bg-amber-400/15">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-200">{airport.code || airport.ident}</p>
          <p className="text-muted-foreground">{airport.name}</p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(airportId)}
            className="rounded-md border border-border/40 bg-background/40 p-1 text-muted-foreground transition hover:text-foreground"
            aria-label={`Remove ${airport.code || airport.ident} selection`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <Detail label="Ident" value={airport.ident || "Unavailable"} />
      <Detail label="City" value={airport.city || "Unavailable"} />
      <Detail label="Country" value={airport.country || "Unavailable"} />
      <Detail label="Type" value={airport.type || "Unavailable"} />
      <Detail label="Distance" value={`${Math.round(airport.distanceNm)} nm`} />
    </div>
  )
}

function airportMatchesCode(airport: NearbyAirport, codes?: string[]) {
  const normalized = new Set((codes ?? []).map((code) => code.trim().toUpperCase()))
  if (!normalized.size) return false
  return [airport.code, airport.iataCode, airport.icaoCode, airport.ident]
    .some((candidate) => candidate && normalized.has(candidate.trim().toUpperCase()))
}

function selectedAirportCardClass(selected: boolean, clickable: boolean) {
  if (selected) {
    return `border-amber-300/70 bg-amber-400/10 ring-1 ring-amber-300/30 ${clickable ? "cursor-pointer hover:border-amber-200/80 hover:bg-amber-400/15" : ""}`
  }
  return `border-border/30 bg-secondary/20 ${clickable ? "cursor-pointer hover:border-primary/50 hover:bg-secondary/30" : ""}`
}

function aircraftSelectionId(flight: LiveAircraft) {
  const icao24 = flight.icao24?.trim().toLowerCase()
  if (icao24) return `icao24:${icao24}`
  const callsign = flight.callsign?.trim().toLowerCase()
  return callsign ? `callsign:${callsign}` : ""
}

function airportIdentifier(airport: NearbyAirport) {
  return (airport.code || airport.iataCode || airport.icaoCode || airport.ident || "").trim().toUpperCase()
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/30 bg-secondary/20 p-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2 text-muted-foreground"><span>{label}</span><span className="text-right text-foreground">{value}</span></div>
}

function EnterpriseComparisonTable({ summaries }: { summaries: DiscoverEnterpriseAirportSummary[] }) {
  return (
    <div className="max-h-48 overflow-auto rounded-lg border border-border/30">
      <table className="min-w-[520px] text-[10px]">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr>{["Airport", "Risk", "On-Time", "Delay Rate", "Avg Dep Delay", "Cancelled"].map((heading) => <th key={heading} className="px-2 py-1 text-left font-medium">{heading}</th>)}</tr>
        </thead>
        <tbody>
          {summaries.map((summary) => (
            <tr key={summary.airportCode} className="border-t border-border/20">
              <td className="px-2 py-1 font-semibold text-primary">{summary.airportCode}</td>
              <td className="px-2 py-1">{summary.risk}</td>
              <td className="px-2 py-1">{formatPercent(summary.rates.onTimePercentage)}</td>
              <td className="px-2 py-1">{formatPercent(summary.rates.delayRate)}</td>
              <td className="px-2 py-1">{formatMinutes(summary.averages.departureDelay)}</td>
              <td className="px-2 py-1">{formatMetric(summary.totals.cancelledFlights)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EnterpriseAirportSummary({ summary, selected = false, onSelect }: { summary: DiscoverEnterpriseAirportSummary; selected?: boolean; onSelect?: (airportCode: string) => void }) {
  const [dailyOpen, setDailyOpen] = useState(false)
  const flightTrend = dailyTrend(summary.dailyRecords, "flights")
  const delayTrend = dailyTrend(summary.dailyRecords, "delayed")
  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(summary.airportCode)}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onSelect) onSelect(summary.airportCode)
      }}
      className={`rounded-lg border p-3 transition ${selected ? "border-primary/70 bg-primary/10 ring-1 ring-primary/30" : "border-border/40 bg-background/20"} ${onSelect ? "cursor-pointer hover:border-primary/50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-primary">{summary.airportCode}</span>
        <div className="flex flex-wrap justify-end gap-1 text-[10px]">
          <span className={`rounded px-1.5 py-0.5 ${riskClass(summary.risk)}`}>{summary.risk} Risk</span>
          <TrendBadge label="Traffic" trend={flightTrend} />
          <TrendBadge label="Delays" trend={delayTrend} />
        </div>
      </div>
      <div className="my-2 grid grid-cols-2 gap-1.5">
        <KpiChip label="On-Time" value={formatPercent(summary.rates.onTimePercentage)} />
        <KpiChip label="Delay Rate" value={formatPercent(summary.rates.delayRate)} />
        <KpiChip label="Avg Dep Delay" value={formatMinutes(summary.averages.departureDelay)} />
        <KpiChip label="Cancelled" value={formatMetric(summary.totals.cancelledFlights)} />
      </div>
      <div className="space-y-1">
        <Detail label="Date Range" value={displayDateRange(summary.dateRange.start, summary.dateRange.end)} />
        <Detail label="Records" value={`${summary.recordCount} day${summary.recordCount === 1 ? "" : "s"}`} />
      </div>
      <div className="my-2 border-t border-border/30" />
      <div className="space-y-1">
        <Detail label="Total Flights" value={formatMetric(summary.totals.totalFlights)} />
        <Detail label="Delayed Flights" value={formatMetric(summary.totals.delayedFlights)} />
        <Detail label="Delay Rate" value={formatPercent(summary.rates.delayRate)} />
        <Detail label="Cancelled" value={formatMetric(summary.totals.cancelledFlights)} />
        <Detail label="Cancellation Rate" value={formatPercent(summary.rates.cancellationRate)} />
      </div>
      <div className="my-2 border-t border-border/30" />
      <div className="space-y-1">
        <Detail label="Avg Departure Delay" value={formatMinutes(summary.averages.departureDelay)} />
        <Detail label="Avg Arrival Delay" value={formatMinutes(summary.averages.arrivalDelay)} />
        <Detail label="On-Time" value={formatPercent(summary.rates.onTimePercentage)} />
        <Detail label="Weather Delays" value={formatMetric(summary.totals.weatherDelays)} />
        <Detail label="Maintenance Delays" value={formatMetric(summary.totals.maintenanceDelays)} />
      </div>
      {summary.dailyRecords.length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <SparklineCard label="Flights" values={summary.dailyRecords.map((record) => record.flights)} />
          <SparklineCard label="Delayed" values={summary.dailyRecords.map((record) => record.delayed)} />
        </div>
      )}
      <p className="mt-3 rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] text-primary">{analystSummary(summary)}</p>
      <button
        onClick={(event) => {
          event.stopPropagation()
          setDailyOpen((open) => !open)
        }}
        className="mt-3 flex w-full items-center justify-between rounded-md border border-border/30 bg-secondary/20 px-2 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        Daily Records
        <ChevronDown className={`h-3.5 w-3.5 transition ${dailyOpen ? "rotate-180" : ""}`} />
      </button>
      {dailyOpen && (
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border/30">
          <table className="min-w-[620px] text-[10px]">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>{["Date", "Flights", "Delayed", "Cancelled", "Dep Delay", "Arr Delay", "On-Time %"].map((heading) => <th key={heading} className="px-2 py-1 text-left font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {summary.dailyRecords.map((record, index) => (
                <tr key={`${record.date}-${index}`} className="border-t border-border/20">
                  <td className="px-2 py-1">{formatDate(record.date)}</td>
                  <td className="px-2 py-1">{formatMetric(record.flights)}</td>
                  <td className="px-2 py-1">{formatMetric(record.delayed)}</td>
                  <td className="px-2 py-1">{formatMetric(record.cancelled)}</td>
                  <td className="px-2 py-1">{record.departureDelay.toFixed(1)}</td>
                  <td className="px-2 py-1">{record.arrivalDelay.toFixed(1)}</td>
                  <td className="px-2 py-1">{formatPercent(record.onTimePercentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type TrendDirection = "increasing" | "decreasing" | "stable"

function KpiChip({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border/30 bg-secondary/20 px-2 py-1"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-[11px] font-semibold text-foreground">{value}</p></div>
}

function TrendBadge({ label, trend }: { label: string; trend: TrendDirection }) {
  const arrow = trend === "increasing" ? "\u2191" : trend === "decreasing" ? "\u2193" : "\u2192"
  return <span className="rounded bg-secondary/30 px-1.5 py-0.5 text-muted-foreground">{arrow} {label}</span>
}

function SparklineCard({ label, values }: { label: string; values: number[] }) {
  const width = 92
  const height = 22
  const points = sparklinePoints(values, width, height)
  return (
    <div className="rounded-md border border-border/30 bg-secondary/20 px-2 py-1">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label} Trend</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-5 w-full" aria-label={`${label} trend sparkline`}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
      </svg>
    </div>
  )
}

function dailyTrend(records: DiscoverEnterpriseAirportSummary["dailyRecords"], key: "flights" | "delayed"): TrendDirection {
  if (records.length < 2) return "stable"
  const chronological = [...records].sort((left, right) => String(left.date ?? "").localeCompare(String(right.date ?? "")))
  const first = chronological[0][key]
  const last = chronological[chronological.length - 1][key]
  return last > first ? "increasing" : last < first ? "decreasing" : "stable"
}

function sparklinePoints(values: number[], width: number, height: number) {
  if (!values.length) return ""
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index / (values.length - 1) * width
    const y = height - (value - min) / spread * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
}

function analystSummary(summary: DiscoverEnterpriseAirportSummary) {
  return `${summary.airportCode} processed ${formatMetric(summary.totals.totalFlights)} flights across ${summary.recordCount} day${summary.recordCount === 1 ? "" : "s"}. ${formatPercent(summary.rates.delayRate)} were delayed with an average departure delay of ${formatMinutes(summary.averages.departureDelay)}. On-time performance is ${formatPercent(summary.rates.onTimePercentage)}.`
}

function formatMetric(value: number) {
  return Number(value).toLocaleString()
}

function formatPercent(value: number | null) {
  return value == null ? "Unavailable" : `${Number(value).toFixed(1)}%`
}

function formatMinutes(value: number | null) {
  return value == null ? "Unavailable" : `${Number(value).toFixed(1)} min`
}

function formatDate(value: string | null) {
  if (!value) return "Unavailable"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { month: "short", day: "numeric" })
}

function displayDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "Unavailable"
  return start === end ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`
}

function metricLabel(metric: string) {
  return metric.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())
}

function airportContextLabel(context?: "selected_aircraft" | "search_area" | "current_view" | null, label?: string | null) {
  if (context === "selected_aircraft") return label ? `Nearest airports to selected aircraft ${label}` : "Nearest airports to selected aircraft"
  if (context === "current_view") return "Airports in current view"
  if (label) return `Nearby airports for ${label}`
  return "Nearby airports for current area"
}
