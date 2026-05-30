"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { ChevronLeft, MessageSquare, RefreshCw, Search, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { SkyQueryLogo } from "@/components/skyquery-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { DiscoverFilters } from "./discover-filters"
import { IntelligencePanel } from "./intelligence-panel"
import { fetchPublicFlights, type LiveAircraft, type MapBounds } from "@/lib/public-flights-api"
import { fetchWeather, regionFromBounds, regionFromSearch, type WeatherIntelligence, type WeatherRegion } from "@/lib/weather-api"
import { isAllowedWeatherFetchReason } from "@/lib/weather-refresh-policy.mjs"
import { boundsAroundLocation, resolveLocationQuery } from "@/lib/location-search.mjs"
import { buildWeatherImpactAssessment, parseDiscoverQuery, requestedWeatherMetricSummary, shouldMarkFlightsImpacted, weatherImpactSummary } from "@/lib/discover-query-intent.mjs"
import { fetchAirportsInBounds, fetchNearbyAirports, type NearbyAirport } from "@/lib/nearby-airports-api"
import { fetchDiscoverEnterprise, fetchDiscoverEnterpriseCandidates, type DiscoverEnterpriseResponse } from "@/lib/discover-enterprise-api"

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
  const [fitLocations, setFitLocations] = useState<{ locations: Array<{ latitude: number; longitude: number }>; nonce: number } | null>(null)
  const [submittedSearchRegion, setSubmittedSearchRegion] = useState<WeatherRegion | null>(null)
  const [nearbyAirports, setNearbyAirports] = useState<NearbyAirport[]>([])
  const [nearbyAirportsContext, setNearbyAirportsContext] = useState<"selected_aircraft" | "search_area" | "current_view" | null>(null)
  const [nearbyAirportsError, setNearbyAirportsError] = useState<string | null>(null)
  const [nearbyAirportsLabel, setNearbyAirportsLabel] = useState<string | null>(null)
  const [nearbyAirportsSource, setNearbyAirportsSource] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [showOnGround, setShowOnGround] = useState(false)
  const [showAirports, setShowAirports] = useState(false)
  const [enterprise, setEnterprise] = useState<DiscoverEnterpriseResponse | null>(null)
  const [enterpriseLoading, setEnterpriseLoading] = useState(false)
  const [activeEnterpriseAirportCode, setActiveEnterpriseAirportCode] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const [resizingSidebar, setResizingSidebar] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedInitialBoundsRef = useRef(false)
  const requestIdRef = useRef(0)
  const weatherRequestIdRef = useRef(0)
  const weatherRef = useRef<WeatherIntelligence | null>(null)
  const focusNonceRef = useRef(0)
  const airportsRequestIdRef = useRef(0)
  const enterpriseRequestIdRef = useRef(0)

  const loadNearbyAirports = useCallback(async (
    latitude: number,
    longitude: number,
    context: "selected_aircraft" | "search_area",
    label?: string | null,
  ) => {
    const requestId = airportsRequestIdRef.current + 1
    airportsRequestIdRef.current = requestId
    setNearbyAirportsContext(context)
    setNearbyAirportsLabel(context === "search_area" ? label ?? null : null)
    setNearbyAirportsError(null)
    try {
      const response = await fetchNearbyAirports(latitude, longitude, 10)
      if (requestId !== airportsRequestIdRef.current) return
      setNearbyAirports(response.airports)
      setNearbyAirportsSource(response.source)
      return response
    } catch {
      if (requestId !== airportsRequestIdRef.current) return
      setNearbyAirportsError("Nearby airport data unavailable.")
      return null
    }
  }, [])

  const loadAirportsInCurrentView = useCallback(async (visibleBounds: MapBounds) => {
    const requestId = airportsRequestIdRef.current + 1
    airportsRequestIdRef.current = requestId
    setNearbyAirportsContext("current_view")
    setNearbyAirportsLabel(null)
    setNearbyAirportsError(null)
    try {
      const response = await fetchAirportsInBounds(visibleBounds, 100)
      if (requestId !== airportsRequestIdRef.current) return
      setNearbyAirports(response.airports)
      setNearbyAirportsSource(response.source)
    } catch {
      if (requestId !== airportsRequestIdRef.current) return
      setNearbyAirportsError("Nearby airport data unavailable.")
    }
  }, [])

  const loadFlights = useCallback(async (visibleBounds: MapBounds, options: { forceRefresh?: boolean; reason?: "initial_load" | "manual_refresh" | "search_submit" | "enterprise_airport_select" } = {}) => {
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

  const switchEnterpriseAirport = useCallback(async (airport: NearbyAirport, enterpriseAirportCode = airport.code) => {
    const intent = parseDiscoverQuery(search)
    const region = { label: `${airport.code} - ${airport.name}`, latitude: airport.lat, longitude: airport.lon }
    const airportBounds = boundsAroundLocation({ latitude: airport.lat, longitude: airport.lon })
    setActiveEnterpriseAirportCode(enterpriseAirportCode)
    setSubmittedSearchRegion(region)
    setFitLocations(null)
    focusNonceRef.current += 1
    setFocusLocation({ latitude: airport.lat, longitude: airport.lon, zoom: 8, nonce: focusNonceRef.current })
    setBounds(airportBounds)
    setShowAirports(true)
    setError(null)
    setWeatherSummary(null)
    setWeatherImpactAssessment(null)
    const [flightResponse, weatherResponse] = await Promise.all([
      loadFlights(airportBounds, { forceRefresh: true, reason: "enterprise_airport_select" }),
      fetchWeatherForLocation("enterprise_airport_select", region),
      loadNearbyAirports(airport.lat, airport.lon, "search_area", region.label),
    ])
    if (flightResponse && weatherResponse && intent.impactMode) {
      const impacted = shouldMarkFlightsImpacted(intent, weatherResponse)
      const markedAircraft = flightResponse.aircraft.map((flight) => ({ ...flight, weather_impacted: impacted }))
      setAircraft(markedAircraft)
      setWeatherImpactAssessment(buildWeatherImpactAssessment(intent, weatherResponse, markedAircraft.length))
      setWeatherSummary(weatherImpactSummary(intent, weatherResponse, impacted ? markedAircraft.length : 0))
    } else if (weatherResponse) {
      setWeatherSummary(requestedWeatherMetricSummary(intent, weatherResponse, flightResponse?.aircraft.length ?? 0))
    }
  }, [fetchWeatherForLocation, loadFlights, loadNearbyAirports, search])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setSubmittedSearchRegion(null)
  }, [])

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem("skyquery_discover_sidebar_width"))
    if (Number.isFinite(savedWidth) && savedWidth >= 320 && savedWidth <= 640) setSidebarWidth(savedWidth)
  }, [])

  useEffect(() => {
    if (!resizingSidebar) return
    const handleMouseMove = (event: MouseEvent) => {
      setSidebarWidth(Math.max(320, Math.min(640, window.innerWidth - event.clientX)))
    }
    const handleMouseUp = () => {
      setResizingSidebar(false)
      window.localStorage.setItem("skyquery_discover_sidebar_width", String(sidebarWidth))
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [resizingSidebar, sidebarWidth])

  const submitSearch = useCallback(() => {
    async function runSearch() {
      try {
        const intent = parseDiscoverQuery(search)
        const enterpriseRequestId = enterpriseRequestIdRef.current + 1
        enterpriseRequestIdRef.current = enterpriseRequestId
        setEnterprise(null)
        setEnterpriseLoading(false)
        setActiveEnterpriseAirportCode(null)
        setFitLocations(null)
        if (intent.selectedAircraftAirportMode) {
          setShowAirports(true)
          if (!selected) {
            setError("Select an aircraft marker before asking for airports around selected aircraft.")
            return
          }
          setError(null)
          setWeatherSummary(null)
          setWeatherImpactAssessment(null)
          focusNonceRef.current += 1
          setFocusLocation({
            latitude: selected.latitude,
            longitude: selected.longitude,
            zoom: 9,
            nonce: focusNonceRef.current,
          })
          loadNearbyAirports(selected.latitude, selected.longitude, "selected_aircraft")
          return
        }
        let enterpriseCandidates: DiscoverEnterpriseResponse | null = null
        let location = null
        if (intent.enterpriseFirst) {
          setEnterpriseLoading(true)
          try {
            enterpriseCandidates = await fetchDiscoverEnterpriseCandidates(search)
            if (enterpriseRequestId !== enterpriseRequestIdRef.current) return
            setEnterprise(enterpriseCandidates)
            const selectedAirport = enterpriseCandidates.selectedAirports?.[0]
            if (!selectedAirport) {
              setError(enterpriseCandidates.message || "No high-risk airports found in the selected enterprise data.")
              return
            }
            setActiveEnterpriseAirportCode(enterpriseCandidates.airportSummaries?.[0]?.airportCode ?? selectedAirport.code)
            if (enterpriseCandidates.comparison && (enterpriseCandidates.selectedAirports?.length ?? 0) > 1) {
              focusNonceRef.current += 1
              setFitLocations({
                locations: enterpriseCandidates.selectedAirports!.map((airport) => ({ latitude: airport.lat, longitude: airport.lon })),
                nonce: focusNonceRef.current,
              })
            }
            location = {
              label: `${selectedAirport.code} - ${selectedAirport.name}`,
              name: selectedAirport.name,
              country: selectedAirport.country,
              latitude: selectedAirport.lat,
              longitude: selectedAirport.lon,
              source: "enterprise",
            }
          } catch {
            if (enterpriseRequestId !== enterpriseRequestIdRef.current) return
            const unavailable = {
              queryPlan: intent.queryPlan,
              available: false,
              message: "Enterprise data is unavailable. This query requires Trino performance data.",
              sourceTables: [],
              rows: [],
              matchedAirportsCount: 0,
            }
            setEnterprise(unavailable)
            setError(unavailable.message)
            return
          } finally {
            if (enterpriseRequestId === enterpriseRequestIdRef.current) setEnterpriseLoading(false)
          }
        } else {
          location = await resolveLocationQuery(search)
        }
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
        if (!enterpriseCandidates?.comparison) {
          focusNonceRef.current += 1
          setFocusLocation({
            latitude: location.latitude,
            longitude: location.longitude,
            zoom: 8,
            nonce: focusNonceRef.current,
          })
        }
        setBounds(searchBounds)
        setError(null)
        setWeatherSummary(null)
        setWeatherImpactAssessment(null)
        if (intent.fetchAirports) setShowAirports(true)
        const airportPromise = intent.fetchAirports || showAirports
          ? loadNearbyAirports(location.latitude, location.longitude, "search_area", location.label)
          : Promise.resolve(null)
        const flightPromise = intent.fetchFlights
          ? loadFlights(searchBounds, { forceRefresh: true, reason: "search_submit" })
          : Promise.resolve(null)
        const weatherPromise = intent.fetchWeather
          ? fetchWeatherForLocation("search_submit", region)
          : Promise.resolve(null)
        if (intent.queryPlan.needsTrino && !enterpriseCandidates) setEnterpriseLoading(true)
        const [flightResponse, weatherResponse, airportResponse] = await Promise.all([
          flightPromise,
          weatherPromise,
          airportPromise,
        ])
        if (intent.queryPlan.needsTrino && !enterpriseCandidates) {
          try {
            const enterpriseResponse = await fetchDiscoverEnterprise(search, location.label, airportResponse?.airports ?? [])
            if (enterpriseRequestId !== enterpriseRequestIdRef.current) return
            setEnterprise(enterpriseResponse)
          } catch {
            if (enterpriseRequestId !== enterpriseRequestIdRef.current) return
            setEnterprise({
              queryPlan: intent.queryPlan,
              available: false,
              message: "Enterprise data is unavailable. Live public feeds are still available, but delay/performance metrics require Trino.",
              sourceTables: [],
              rows: [],
              matchedAirportsCount: 0,
            })
          } finally {
            if (enterpriseRequestId === enterpriseRequestIdRef.current) setEnterpriseLoading(false)
          }
        }
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
  }, [fetchWeatherForLocation, loadFlights, loadNearbyAirports, search, selected, showAirports])

  const toggleAirports = useCallback(() => {
    setShowAirports((enabled) => {
      const next = !enabled
      if (next) {
        if (selected) {
          loadNearbyAirports(selected.latitude, selected.longitude, "selected_aircraft")
        } else if (submittedSearchRegion) {
          loadNearbyAirports(submittedSearchRegion.latitude, submittedSearchRegion.longitude, "search_area", submittedSearchRegion.label)
        } else if (bounds) {
          loadAirportsInCurrentView(bounds)
        }
      }
      return next
    })
  }, [bounds, loadAirportsInCurrentView, loadNearbyAirports, selected, submittedSearchRegion])

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
    enterpriseRequestIdRef.current += 1
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

  const mapAirports = useMemo(() => {
    const merged = [...(enterprise?.selectedAirports ?? []), ...nearbyAirports]
    return merged.filter((airport, index) => merged.findIndex((candidate) => candidate.ident === airport.ident) === index)
  }, [enterprise?.selectedAirports, nearbyAirports])

  const handleEnterpriseAirportSelect = useCallback((airportCode: string) => {
    const airport = enterprise?.selectedAirports?.find((candidate) =>
      [candidate.code, candidate.iataCode, candidate.icaoCode, candidate.ident].some((code) => code?.toUpperCase() === airportCode.toUpperCase())
    )
    if (airport) switchEnterpriseAirport(airport, airportCode)
  }, [enterprise?.selectedAirports, switchEnterpriseAirport])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-[1000] flex items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <Link href="/" aria-label="SkyQuery home" className="rounded-lg transition-opacity hover:opacity-80">
          <SkyQueryLogo size="sm" />
        </Link>
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
      <DiscoverFilters search={search} onSearchChange={handleSearchChange} onSearchSubmit={submitSearch} showOnGround={showOnGround} onToggleOnGround={() => setShowOnGround((value) => !value)} showAirports={showAirports} onToggleAirports={toggleAirports} />
      <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[420px] flex-1">
          <AviationMap aircraft={filteredAircraft} selectedAircraft={selected} onSelectAircraft={setSelected} onBoundsChange={handleBoundsChange} focusLocation={focusLocation} fitLocations={fitLocations} airports={mapAirports} showAirports={showAirports} />
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
        <div
          className={`relative shrink-0 overflow-hidden transition-[width] duration-200 ${sidebarOpen ? "w-full lg:w-[var(--discover-sidebar-width)]" : "w-0"}`}
          style={{ "--discover-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
        >
          {sidebarOpen && (
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                setResizingSidebar(true)
              }}
              aria-label="Resize intelligence panel"
              className="absolute inset-y-0 left-0 z-20 hidden w-2 cursor-col-resize border-l border-transparent transition hover:border-primary/50 hover:bg-primary/10 lg:block"
            />
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Collapse intelligence panel"
            className="absolute right-2 top-2 z-30 rounded-md border border-border/40 bg-card/90 p-1 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
            nearbyAirportsLabel={nearbyAirportsLabel}
            nearbyAirportsSource={nearbyAirportsSource}
            onRefreshWeather={refreshWeather}
            enterprise={enterprise}
            enterpriseLoading={enterpriseLoading}
            activeEnterpriseAirportCode={activeEnterpriseAirportCode}
            onSelectEnterpriseAirport={handleEnterpriseAirportSelect}
          />
        </div>
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open intelligence panel"
            className="absolute right-0 top-3 z-[600] rounded-l-lg border border-r-0 border-border/50 bg-card/95 p-2 text-muted-foreground shadow-lg backdrop-blur transition hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
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
