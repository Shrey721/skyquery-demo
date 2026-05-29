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

const AviationMap = dynamic(() => import("./aviation-map").then((module) => module.AviationMap), { ssr: false })

export function DiscoverPage() {
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [aircraft, setAircraft] = useState<LiveAircraft[]>([])
  const [selected, setSelected] = useState<LiveAircraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [dataStatus, setDataStatus] = useState<"live" | "cached" | "stale" | "demo" | null>(null)
  const [search, setSearch] = useState("")
  const [showOnGround, setShowOnGround] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedInitialBoundsRef = useRef(false)
  const requestIdRef = useRef(0)

  const loadFlights = useCallback(async (visibleBounds: MapBounds, options: { forceRefresh?: boolean } = {}) => {
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
      setError(response.message ?? null)
      setSelected((current) => current && response.aircraft.find((flight) => flight.icao24 === current.icao24) || null)
    } catch (loadError: any) {
      if (requestId !== requestIdRef.current) return
      if (loadError.name !== "AbortError") {
        setError(loadError.message || "Public flight API unavailable.")
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  const handleBoundsChange = useCallback((visibleBounds: MapBounds) => {
    setBounds(visibleBounds)
    if (hasLoadedInitialBoundsRef.current) return
    hasLoadedInitialBoundsRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadFlights(visibleBounds), 450)
  }, [loadFlights])

  useEffect(() => () => {
    requestIdRef.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const filteredAircraft = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return aircraft.filter((flight) => (showOnGround || !flight.on_ground) && (!needle ||
      flight.callsign.toLowerCase().includes(needle) ||
      flight.icao24.toLowerCase().includes(needle) ||
      flight.origin_country.toLowerCase().includes(needle)))
  }, [aircraft, search, showOnGround])

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
      <DiscoverFilters search={search} onSearchChange={setSearch} showOnGround={showOnGround} onToggleOnGround={() => setShowOnGround((value) => !value)} />
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[420px] flex-1">
          <AviationMap aircraft={filteredAircraft} selectedAircraft={selected} onSelectAircraft={setSelected} onBoundsChange={handleBoundsChange} />
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
        <IntelligencePanel aircraft={filteredAircraft} selected={selected} loading={loading} apiConnected={dataStatus !== "demo" && Boolean(lastUpdated)} bounds={bounds} />
      </main>
    </div>
  )
}

function MapMessage({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={`absolute bottom-6 left-1/2 z-[500] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm backdrop-blur ${error ? "border-red-500/30 bg-red-950/80 text-red-200" : "border-border/50 bg-card/90 text-muted-foreground"}`}>{text}</div>
}
