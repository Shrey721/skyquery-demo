"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { ChevronLeft, Compass, LogOut, MessageSquare, RefreshCw, Search, X } from "lucide-react"
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
import { scanAirspaceConflicts, type AirspaceConflictPair } from "@/lib/airspace-scanner"
import { logoutUser } from "@/lib/api"
import {
  clearAuthSession,
  getCachedAuthUser,
  refreshAuthSession,
  subscribeToAuthState,
} from "@/lib/auth-session"
import { clearConnectionSessionStorage } from "@/lib/session-cleanup"

const AviationMap = dynamic(() => import("./aviation-map").then((module) => module.AviationMap), { ssr: false })

function NavControlsPlaceholder() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <div className="h-7 w-7 rounded-md border border-border/20 bg-secondary/25" />
      <div className="h-7 w-7 rounded-full border border-border/20 bg-secondary/25" />
    </div>
  )
}

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
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerRegion, setScannerRegion] = useState<WeatherRegion | null>(null)
  const [scannerBounds, setScannerBounds] = useState<MapBounds | null>(null)
  const [selectedCloseCallIds, setSelectedCloseCallIds] = useState<string[]>([])
  const [selectedAircraftIds, setSelectedAircraftIds] = useState<string[]>([])
  const [selectedAirportCodes, setSelectedAirportCodes] = useState<string[]>([])
  const [focusMessage, setFocusMessage] = useState<string | null>(null)
  const [enterprise, setEnterprise] = useState<DiscoverEnterpriseResponse | null>(null)
  const [enterpriseLoading, setEnterpriseLoading] = useState(false)
  const [activeEnterpriseAirportCode, setActiveEnterpriseAirportCode] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const [resizingSidebar, setResizingSidebar] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authReady, setAuthReady] = useState(false)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
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

  const clearMapSelection = useCallback(() => {
    setSelected(null)
    setSelectedAircraftIds([])
    setSelectedCloseCallIds([])
    setSelectedAirportCodes([])
    setActiveEnterpriseAirportCode(null)
    setFocusMessage(null)
  }, [])

  const switchEnterpriseAirport = useCallback(async (airport: NearbyAirport, enterpriseAirportCode = airport.code) => {
    const intent = parseDiscoverQuery(search)
    const region = { label: `${airport.code} - ${airport.name}`, latitude: airport.lat, longitude: airport.lon }
    const airportBounds = boundsAroundLocation({ latitude: airport.lat, longitude: airport.lon })
    setActiveEnterpriseAirportCode(enterpriseAirportCode)
    setSelectedAirportCodes(uniqueIds([airportCodeForSelection(airport) ?? enterpriseAirportCode]))
    setSelectedCloseCallIds([])
    setSelectedAircraftIds([])
    setFocusMessage(null)
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
        setSelectedAirportCodes([])
        setSelectedCloseCallIds([])
        setSelectedAircraftIds([])
        setFocusMessage(null)
        setFitLocations(null)
        setScannerActive(false)
        setScannerRegion(null)
        setScannerBounds(null)
        if (intent.scannerMode) {
          setScannerActive(true)
          setError(null)
          setWeatherSummary(null)
          setWeatherImpactAssessment(null)
          const location = await resolveLocationQuery(search)
          if (location) {
            const region = {
              label: location.label,
              latitude: location.latitude,
              longitude: location.longitude,
            }
            const searchBounds = boundsAroundLocation(location)
            setScannerRegion(region)
            setScannerBounds(searchBounds)
            setSubmittedSearchRegion(region)
            setBounds(searchBounds)
            setShowAirports(true)
            focusNonceRef.current += 1
            setFocusLocation({
              latitude: location.latitude,
              longitude: location.longitude,
              zoom: 8,
              nonce: focusNonceRef.current,
            })
            loadNearbyAirports(location.latitude, location.longitude, "search_area", location.label)
          } else {
            setScannerBounds(bounds)
            setScannerRegion(null)
          }
          return
        }
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
        const enterpriseFallbackQueryPlan = {
          ...intent.queryPlan,
          contextSources: intent.queryPlan.contextSources.filter((source): source is string => Boolean(source)),
        }
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
              queryPlan: enterpriseFallbackQueryPlan,
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
              queryPlan: enterpriseFallbackQueryPlan,
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearMapSelection()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [clearMapSelection])

  useEffect(() => {
    let cancelled = false
    const cachedUser = getCachedAuthUser()
    if (cachedUser) setUser(cachedUser)

    refreshAuthSession().then((nextUser) => {
      if (cancelled) return
      setUser(nextUser)
      setAuthReady(true)
    }).catch(() => {
      if (!cancelled) setAuthReady(true)
    })

    const unsubscribeAuthState = subscribeToAuthState((nextUser) => {
      if (cancelled) return
      setUser(nextUser)
      setAuthReady(true)
    })

    return () => {
      cancelled = true
      unsubscribeAuthState()
    }
  }, [])

  const handleLogout = useCallback(async () => {
    await logoutUser()
    clearConnectionSessionStorage()
    clearAuthSession()
    window.location.href = "/"
  }, [])

  const searchRegion = useMemo(() => regionFromSearch(search) ?? submittedSearchRegion, [search, submittedSearchRegion])

  const filteredAircraft = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return aircraft.filter((flight) => {
      if (!showOnGround && flight.on_ground) return false
      if (scannerActive) {
        if (scannerRegion) {
          return distanceNm(flight.latitude, flight.longitude, scannerRegion.latitude, scannerRegion.longitude) <= 180
        }
        if (scannerBounds) {
          return flight.latitude >= scannerBounds.lamin &&
            flight.latitude <= scannerBounds.lamax &&
            flight.longitude >= scannerBounds.lomin &&
            flight.longitude <= scannerBounds.lomax
        }
        return true
      }
      if (searchRegion) {
        return distanceNm(flight.latitude, flight.longitude, searchRegion.latitude, searchRegion.longitude) <= 180
      }
      return !needle ||
        flight.callsign.toLowerCase().includes(needle) ||
        flight.icao24.toLowerCase().includes(needle) ||
        flight.origin_country.toLowerCase().includes(needle)
    })
  }, [aircraft, scannerActive, scannerBounds, scannerRegion, search, searchRegion, showOnGround])

  const mapAirports = useMemo(() => {
    const merged = [...(enterprise?.selectedAirports ?? []), ...nearbyAirports]
    return merged.filter((airport, index) => merged.findIndex((candidate) => candidate.ident === airport.ident) === index)
  }, [enterprise?.selectedAirports, nearbyAirports])

  const scannerResult = useMemo(() => {
    if (!scannerActive) return null
    return scanAirspaceConflicts(aircraft.filter((flight) => showOnGround || !flight.on_ground), mapAirports, {
      bounds: scannerBounds ?? bounds,
      center: scannerRegion ? { latitude: scannerRegion.latitude, longitude: scannerRegion.longitude } : null,
      radiusKm: scannerRegion ? 200 : undefined,
      weather,
    })
  }, [aircraft, bounds, mapAirports, scannerActive, scannerBounds, scannerRegion, showOnGround, weather])

  const selectedCloseCallAircraftIds = useMemo(() => {
    if (!scannerResult?.pairs.length) return []
    return selectedCloseCallIds.flatMap((pairId) => {
      const pair = scannerResult.pairs.find((candidate) => candidate.id === pairId)
      return pair ? [aircraftSelectionId(pair.aircraftA), aircraftSelectionId(pair.aircraftB)].filter(Boolean) : []
    })
  }, [scannerResult?.pairs, selectedCloseCallIds])

  const visibleSelectedAircraftIds = useMemo(() => {
    return uniqueIds([...selectedAircraftIds, ...selectedCloseCallAircraftIds])
  }, [selectedAircraftIds, selectedCloseCallAircraftIds])

  const selectedAircraftList = useMemo(() => {
    return visibleSelectedAircraftIds.flatMap((id) => {
      const flight = aircraft.find((candidate) => aircraftSelectionId(candidate) === id)
      return flight ? [flight] : []
    })
  }, [aircraft, visibleSelectedAircraftIds])

  const selectedAirportList = useMemo(() => {
    const selectedCodes = new Set(selectedAirportCodes.map(normalizeAirportCode))
    return mapAirports.filter((airport) => airportCodesForSelection(airport).some((code) => selectedCodes.has(normalizeAirportCode(code))))
  }, [mapAirports, selectedAirportCodes])

  const handleEnterpriseAirportSelect = useCallback((airportCode: string) => {
    const airport = enterprise?.selectedAirports?.find((candidate) =>
      [candidate.code, candidate.iataCode, candidate.icaoCode, candidate.ident].some((code) => code?.toUpperCase() === airportCode.toUpperCase())
    )
    if (airport) switchEnterpriseAirport(airport, airportCode)
  }, [enterprise?.selectedAirports, switchEnterpriseAirport])

  const handleAircraftSelect = useCallback((flight: LiveAircraft) => {
    const id = aircraftSelectionId(flight)
    const wasSelected = selectedAircraftIds.includes(id)
    setSelected(wasSelected ? null : flight)
    setSelectedAircraftIds((current) => toggleId(current, id))
    setFocusMessage(null)
  }, [selectedAircraftIds])

  const removeSelectedAircraft = useCallback((aircraftId: string) => {
    setSelectedAircraftIds((current) => current.filter((id) => id !== aircraftId))
    setSelectedCloseCallIds((current) => current.filter((pairId) => {
      const pair = scannerResult?.pairs.find((candidate) => candidate.id === pairId)
      if (!pair) return true
      return ![aircraftSelectionId(pair.aircraftA), aircraftSelectionId(pair.aircraftB)].includes(aircraftId)
    }))
    setSelected((current) => current && aircraftSelectionId(current) === aircraftId ? null : current)
  }, [scannerResult?.pairs])

  const findLoadedAircraft = useCallback((candidate: LiveAircraft) => {
    const candidateIcao = normalizeIdentifier(candidate.icao24)
    const candidateCallsign = normalizeIdentifier(candidate.callsign)
    return aircraft.find((flight) => {
      const flightIcao = normalizeIdentifier(flight.icao24)
      if (candidateIcao && flightIcao && candidateIcao === flightIcao) return true
      const flightCallsign = normalizeIdentifier(flight.callsign)
      return Boolean(candidateCallsign && flightCallsign && candidateCallsign === flightCallsign)
    }) ?? candidate
  }, [aircraft])

  const handleCloseCallSelect = useCallback((pair: AirspaceConflictPair) => {
    const flightA = findLoadedAircraft(pair.aircraftA)
    const flightB = findLoadedAircraft(pair.aircraftB)
    const selecting = !selectedCloseCallIds.includes(pair.id)
    const positions = [flightA, flightB]
      .filter(hasAircraftCoordinates)
      .map((flight) => ({ latitude: flight.latitude, longitude: flight.longitude }))

    setSelectedCloseCallIds((current) => toggleId(current, pair.id))
    setFocusMessage(null)

    if (!selecting) return

    if (positions.length >= 2) {
      focusNonceRef.current += 1
      setFocusLocation(null)
      setFitLocations({ locations: positions, nonce: focusNonceRef.current })
      return
    }

    if (positions.length === 1) {
      focusNonceRef.current += 1
      setFitLocations(null)
      setFocusLocation({ ...positions[0], zoom: 10, nonce: focusNonceRef.current })
      return
    }

    setFocusMessage("Live position unavailable for this pair.")
  }, [findLoadedAircraft, selectedCloseCallIds])

  const handleNearbyAirportSelect = useCallback((airport: NearbyAirport) => {
    const airportCode = airportCodeForSelection(airport)
    if (!airportCode) return
    const selecting = !selectedAirportCodes.map(normalizeAirportCode).includes(normalizeAirportCode(airportCode))
    if (!Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return
    setSelectedAirportCodes((current) => toggleAirportCode(current, airportCode))
    setFocusMessage(null)
    setShowAirports(true)
    if (selecting) {
      focusNonceRef.current += 1
      setFitLocations(null)
      setFocusLocation({ latitude: airport.lat, longitude: airport.lon, zoom: 9, nonce: focusNonceRef.current })
    }
  }, [selectedAirportCodes])

  const removeSelectedAirport = useCallback((airportCode: string) => {
    setSelectedAirportCodes((current) => current.filter((code) => normalizeAirportCode(code) !== normalizeAirportCode(airportCode)))
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-[1000] flex items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl transition-all duration-300">
        <Link href="/" aria-label="SkyQuery home" className="rounded-lg transition-opacity hover:opacity-80">
          <SkyQueryLogo size="sm" />
        </Link>
        <nav className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-lg border border-border/30 bg-secondary/20 p-1">
          <Link href="/" className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            <MessageSquare className="h-4 w-4" /> Chat
          </Link>
          <span className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">
            <Search className="h-4 w-4" /> Discover
          </span>
          <Link href="/product-tour" className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            <Compass className="h-4 w-4" /> Product Tour
          </Link>
        </nav>
        <div className="flex w-[190px] shrink-0 items-center justify-end gap-3">
          {!authReady ? (
            <NavControlsPlaceholder />
          ) : (
            <div className="nav-controls-ready flex items-center gap-3">
              <ThemeToggle />
              {user && (
            <div className="relative">
              <button
                onClick={() => setAvatarMenuOpen((open) => !open)}
                className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-secondary/60 text-xs font-semibold text-muted-foreground transition-all hover:ring-2 hover:ring-primary/50"
                aria-label="Open user menu"
              >
                <img src={user.avatar_url || "https://github.com/ghost.png"} alt={user.username || "GitHub user"} className="h-full w-full object-cover" />
              </button>
              {avatarMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[1000]" onClick={() => setAvatarMenuOpen(false)} />
                  <div className="absolute right-0 z-[1001] mt-2 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
                    <div className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                      Signed in as
                      <div className="mt-0.5 truncate font-normal text-foreground">{user.username}</div>
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
              )}
            </div>
          )}
        </div>
      </header>
      <DiscoverFilters search={search} onSearchChange={handleSearchChange} onSearchSubmit={submitSearch} showOnGround={showOnGround} onToggleOnGround={() => setShowOnGround((value) => !value)} showAirports={showAirports} onToggleAirports={toggleAirports} />
      <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[420px] flex-1">
          <AviationMap aircraft={filteredAircraft} selectedAircraft={selected} selectedAircraftIds={visibleSelectedAircraftIds} selectedAirportCodes={selectedAirportCodes} onSelectAircraft={handleAircraftSelect} onSelectAirport={handleNearbyAirportSelect} onClearSelection={clearMapSelection} onBoundsChange={handleBoundsChange} focusLocation={focusLocation} fitLocations={fitLocations} airports={mapAirports} showAirports={showAirports} scannerMode={scannerActive} scannerConflicts={scannerResult?.pairs ?? []} />
          <div className="absolute left-4 top-4 z-[500] rounded-xl border border-border/40 bg-card/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> {dataStatus === "demo" ? "SAMPLE AIRSPACE" : "LIVE OPEN SKY"}</div>
            <p className="mt-1 text-muted-foreground">{loading ? "Loading live aircraft..." : `${filteredAircraft.length} aircraft in current view`}</p>
            {lastUpdated && <p className="text-[10px] text-muted-foreground">Last updated at {new Date(lastUpdated).toLocaleTimeString()}</p>}
            {dataStatus === "demo" && <p className="text-[10px] text-amber-300">Sample data, not live traffic</p>}
            <button
              onClick={() => bounds && loadFlights(bounds, { forceRefresh: true, reason: "manual_refresh" })}
              disabled={loading || !bounds}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2 py-1 text-[11px] text-foreground transition hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh Live Airspace
            </button>
          </div>
          {!loading && error && <MapMessage text={error} error />}
          {focusMessage && <MapMessage text={focusMessage} />}
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
            selectedAircraftList={selectedAircraftList}
            selectedAirportList={selectedAirportList}
            onRemoveSelectedAircraft={removeSelectedAircraft}
            onRemoveSelectedAirport={removeSelectedAirport}
            scannerActive={scannerActive}
            scannerResult={scannerResult}
            scannerLastUpdated={lastUpdated}
            scannerDataStatus={dataStatus}
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
            selectedCloseCallIds={selectedCloseCallIds}
            onSelectCloseCall={handleCloseCallSelect}
            selectedAirportCodes={selectedAirportCodes}
            onSelectNearbyAirport={handleNearbyAirportSelect}
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

function normalizeIdentifier(value?: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

function aircraftSelectionId(flight: LiveAircraft) {
  const icao24 = normalizeIdentifier(flight.icao24)
  if (icao24) return `icao24:${icao24}`
  const callsign = normalizeIdentifier(flight.callsign)
  return callsign ? `callsign:${callsign}` : ""
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function toggleId(values: string[], id: string) {
  if (!id) return values
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]
}

function hasAircraftCoordinates(flight: LiveAircraft) {
  return Number.isFinite(flight.latitude) && Number.isFinite(flight.longitude)
}

function airportCodeForSelection(airport: NearbyAirport) {
  return airport.code || airport.iataCode || airport.icaoCode || airport.ident || null
}

function airportCodesForSelection(airport: NearbyAirport) {
  return [airport.code, airport.iataCode, airport.icaoCode, airport.ident].filter((code): code is string => Boolean(code))
}

function normalizeAirportCode(value?: string | null) {
  return value?.trim().toUpperCase() ?? ""
}

function toggleAirportCode(values: string[], code: string) {
  const normalized = normalizeAirportCode(code)
  if (!normalized) return values
  return values.some((value) => normalizeAirportCode(value) === normalized)
    ? values.filter((value) => normalizeAirportCode(value) !== normalized)
    : [...values, code]
}
