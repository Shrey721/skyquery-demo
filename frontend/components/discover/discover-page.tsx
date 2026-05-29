"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { MessageSquare, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SkyQueryLogo } from "@/components/skyquery-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { DiscoverFilters } from "./discover-filters"
import { IntelligencePanel } from "./intelligence-panel"
import { fetchPublicFlights, type LiveAircraft, type MapBounds } from "@/lib/public-flights-api"
import { fetchWeather, regionFromBounds, regionFromSearch, type WeatherIntelligence, type WeatherRegion } from "@/lib/weather-api"
import { isAllowedWeatherFetchReason } from "@/lib/weather-refresh-policy.mjs"
import { boundsAroundLocation, resolveLocationQuery } from "@/lib/location-search.mjs"
import { buildWeatherImpactAssessment, parseDiscoverQuery, requestedWeatherMetricSummary, shouldMarkFlightsImpacted, weatherImpactSummary } from "@/lib/discover-query-intent.mjs"
import { fetchNearbyAirports, type NearbyAirport } from "@/lib/nearby-airports-api"

const AviationMap = dynamic(() => import("./aviation-map").then((module) => module.AviationMap), { ssr: false })

export function DiscoverPage() {
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [aircraft, setAircraft] = useState<LiveAircraft[]>([])
  const [selected, setSelected] = useState<LiveAircraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [dataStatus, setDataStatus] = useState<"live" | "cached" | "stale" | "demo" | null>(null)
  const [weather, setWeather] = useState<WeatherIntelligence | null>(null)
  const [weatherRegion, setWeatherRegion] = useState<WeatherRegion | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [weatherSummary, setWeatherSummary] = useState<string | null>(null)
  const [weatherImpactAssessment, setWeatherImpactAssessment] = useState<any>(null)
  const [focusLocation, setFocusLocation] = useState<{ latitude: number; longitude: number; zoom?: number; nonce: number } | null>(null)
  const [submittedSearchRegion, setSubmittedSearchRegion] = useState<WeatherRegion | null>(null)
  const [nearbyAirports, setNearbyAirports] = useState<NearbyAirport[]>([])
  const [nearbyAirportsContext, setNearbyAirportsContext] = useState<"selected_aircraft" | "search_area" | null>(null)
  const [nearbyAirportsError, setNearbyAirportsError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [showOnGround, setShowOnGround] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedInitialBoundsRef = useRef(false)
  const requestIdRef = useRef(0)
  const weatherRequestIdRef = useRef(0)
  const weatherRef = useRef<WeatherIntelligence | null>(null)
  const focusNonceRef = useRef(0)
  const airportsRequestIdRef = useRef(0)

  const loadNearbyAirports = useCallback(async (
    latitude: number,
    longitude: number,
    context: "selected_aircraft" | "search_area",
  ) => {
    const requestId = airportsRequestIdRef.current + 1
    airportsRequestIdRef.current = requestId
    setNearbyAirportsContext(context)
    setNearbyAirportsError(null)
    try {
      const response = await fetchNearbyAirports(latitude, longitude, 5)
      if (requestId !== airportsRequestIdRef.current) return
      setNearbyAirports(response.airports)
    } catch {
      if (requestId !== airportsRequestIdRef.current) return
      setNearbyAirportsError("Nearby airport data unavailable.")
    }
  }, [])

  const loadFlights = useCallback(async (visibleBounds: MapBounds, options: { forceRefresh?: boolean; reason?: "initial_load" | "manual_refresh" | "search_submit" } = {}) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    if (options.forceRefresh) setError(null)
    try {
      const response = await fetchPublicFlights(visibleBounds, undefined, options)
      if (requestId !== requestIdRef.current) return
      setAircraft(response.aircraft)
      setLastUpdated(response.fetched_at)
      setDataStatus(response.data_status ?? (response.cached ? "cached" : "live"))
      setError(response.stale ? "Live flights temporarily unavailable. Showing cached data." : response.message ?? null)
      setSelected((current) => current && response.aircraft.find((flight) => flight.icao24 === current.icao24) || null)
      return response
    } catch (loadError: any) {
      if (requestId !== requestIdRef.current) return
      if (loadError.name !== "AbortError") {
        setError(loadError.message || "Public flight API unavailable.")
      }
      return null
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  const fetchWeatherForLocation = useCallback(async (
    reason: "initial_load" | "manual_refresh" | "search_submit" | string,
    region: WeatherRegion,
  ) => {
    if (!isAllowedWeatherFetchReason(reason)) {
      console.warn("Weather fetch blocked: invalid trigger")
      return
    }
    const requestId = weatherRequestIdRef.current + 1
    weatherRequestIdRef.current = requestId
    const forceRefresh = reason === "manual_refresh"
    setWeatherRegion(region)
    setWeatherLoading(true)
    setWeatherError(null)
    try {
      const response = await fetchWeather(region, undefined, { forceRefresh })
      if (requestId !== weatherRequestIdRef.current) return
      setWeather(response)
      weatherRef.current = response
      setWeatherError(response.message ?? null)
      return response
    } catch (loadError: any) {
      if (requestId !== weatherRequestIdRef.current) return
      setWeatherError(weatherRef.current ? "Weather temporarily unavailable. Showing cached data." : loadError.message || "Weather data unavailable.")
      return weatherRef.current
    } finally {
      if (requestId === weatherRequestIdRef.current) setWeatherLoading(false)
    }
  }, [])

  const refreshWeather = useCallback(() => {
    const region = regionFromSearch(search) ?? submittedSearchRegion ?? weatherRegion ?? regionFromBounds(bounds)
    if (region) fetchWeatherForLocation("manual_refresh", region)
  }, [bounds, fetchWeatherForLocation, search, submittedSearchRegion, weatherRegion])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setSubmittedSearchRegion(null)
  }, [])

  const submitSearch = useCallback(() => {
    async function runSearch() {
      try {
        const intent = parseDiscoverQuery(search)
        const location = await resolveLocationQuery(search)
        if (!location) {
          setError("Could not resolve this location. Try a city, airport code, or country.")
          return
        }

        const region = {
          label: location.label,
          latitude: location.latitude,
          longitude: location.longitude,
        }
        const searchBounds = boundsAroundLocation(location)
        hasLoadedInitialBoundsRef.current = true
        setSubmittedSearchRegion(region)
        focusNonceRef.current += 1
        setFocusLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          zoom: 8,
          nonce: focusNonceRef.current,
        })
        setBounds(searchBounds)
        setError(null)
        setWeatherSummary(null)
        setWeatherImpactAssessment(null)
        loadNearbyAirports(location.latitude, location.longitude, "search_area")
        const [flightResponse, weatherResponse] = await Promise.all([
          loadFlights(searchBounds, { forceRefresh: true, reason: "search_submit" }),
          fetchWeatherForLocation("search_submit", region),
        ])
        if (flightResponse && weatherResponse && intent.impactMode) {
          const impacted = shouldMarkFlightsImpacted(intent, weatherResponse)
          const markedAircraft = flightResponse.aircraft.map((flight) => ({ ...flight, weather_impacted: impacted }))
          setAircraft(markedAircraft)
          setWeatherImpactAssessment(buildWeatherImpactAssessment(intent, weatherResponse, markedAircraft.length))
          setWeatherSummary(weatherImpactSummary(intent, weatherResponse, impacted ? markedAircraft.length : 0))
        } else if (weatherResponse && intent.impactMode) {
          const assessment = buildWeatherImpactAssessment(intent, weatherResponse, flightResponse?.aircraft.length ?? 0)
          setWeatherImpactAssessment(assessment)
          setWeatherSummary(assessment?.detected ? "Weather impact detected for this area." : assessment?.assessment ?? null)
        } else if (weatherResponse) {
          setWeatherSummary(requestedWeatherMetricSummary(intent, weatherResponse, flightResponse?.aircraft.length ?? 0))
        }
      } catch {
        setError("Could not resolve this location. Try a city, airport code, or country.")
      }
    }
    runSearch()
  }, [fetchWeatherForLocation, loadFlights, search])

  const handleBoundsChange = useCallback((visibleBounds: MapBounds) => {
    setBounds(visibleBounds)
    if (hasLoadedInitialBoundsRef.current) return
    hasLoadedInitialBoundsRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      loadFlights(visibleBounds)
      const region = regionFromBounds(visibleBounds)
      if (region) fetchWeatherForLocation("initial_load", region)
    }, 450)
  }, [fetchWeatherForLocation, loadFlights])

  useEffect(() => () => {
    requestIdRef.current += 1
    weatherRequestIdRef.current += 1
    airportsRequestIdRef.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  useEffect(() => {
    if (!selected) return
    loadNearbyAirports(selected.latitude, selected.longitude, "selected_aircraft")
  }, [loadNearbyAirports, selected])

  const searchRegion = useMemo(() => regionFromSearch(search) ?? submittedSearchRegion, [search, submittedSearchRegion])

  const filteredAircraft = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return aircraft.filter((flight) => {
      if (!showOnGround && flight.on_ground) return false
      if (searchRegion) {
        return distanceNm(flight.latitude, flight.longitude, searchRegion.latitude, searchRegion.longitude) <= 180
      }
      return !needle ||
        flight.callsign.toLowerCase().includes(needle) ||
        flight.icao24.toLowerCase().includes(needle) ||
        flight.origin_country.toLowerCase().includes(needle)
    })
  }, [aircraft, search, searchRegion, showOnGround])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <SkyQueryLogo size="sm" />
        <nav className="flex items-center rounded-lg border border-border/30 bg-secondary/20 p-1">
          <Link href="/" className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            <MessageSquare className="h-4 w-4" /> Chat
          </Link>
          <span className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">
            <Search className="h-4 w-4" /> Discover
          </span>
        </nav>
        <ThemeToggle />
      </header>
      <DiscoverFilters search={search} onSearchChange={handleSearchChange} onSearchSubmit={submitSearch} showOnGround={showOnGround} onToggleOnGround={() => setShowOnGround((value) => !value)} weatherConnected={Boolean(weather) && !weatherError} />
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[420px] flex-1">
          <AviationMap aircraft={filteredAircraft} selectedAircraft={selected} onSelectAircraft={setSelected} onBoundsChange={handleBoundsChange} focusLocation={focusLocation} />
          <div className="absolute left-4 top-4 z-[500] rounded-xl border border-border/40 bg-card/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> {dataStatus === "demo" ? "SAMPLE AIRSPACE" : "LIVE OPEN SKY"}</div>
            <p className="mt-1 text-muted-foreground">{loading ? "Loading live aircraft..." : `${filteredAircraft.length} aircraft in current view`}</p>
            {lastUpdated && <p className="text-[10px] text-muted-foreground">Last updated at {new Date(lastUpdated).toLocaleTimeString()}</p>}
            {dataStatus === "demo" && <p className="text-[10px] text-amber-300">Sample data, not live traffic</p>}
            <button
              onClick={() => bounds && loadFlights(bounds, { forceRefresh: true })}
              disabled={loading || !bounds}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2 py-1 text-[11px] text-foreground transition hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          {!loading && error && <MapMessage text={error} error />}
          {!loading && !error && filteredAircraft.length === 0 && <MapMessage text="No live aircraft found in this region." />}
        </div>
        <IntelligencePanel
          aircraft={filteredAircraft}
          selected={selected}
          loading={loading}
          apiConnected={dataStatus !== "demo" && Boolean(lastUpdated)}
          bounds={bounds}
          weather={weather}
          weatherRegion={weatherRegion}
          weatherLoading={weatherLoading}
          weatherError={weatherError}
          weatherSummary={weatherSummary}
          weatherImpactAssessment={weatherImpactAssessment}
          nearbyAirports={nearbyAirports}
          nearbyAirportsContext={nearbyAirportsContext}
          nearbyAirportsError={nearbyAirportsError}
          onRefreshWeather={refreshWeather}
        />
      </main>
    </div>
  )
}

function MapMessage({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={`absolute bottom-6 left-1/2 z-[500] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm backdrop-blur ${error ? "border-red-500/30 bg-red-950/80 text-red-200" : "border-border/50 bg-card/90 text-muted-foreground"}`}>{text}</div>
}

function distanceNm(latA: number, lonA: number, latB: number, lonB: number) {
  const radians = Math.PI / 180
  const dLat = (latB - latA) * radians
  const dLon = (lonB - lonA) * radians
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin(dLon / 2) ** 2
  return 3440 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
