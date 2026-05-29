import { frontendConfig } from "./config"

export interface MapBounds {
  lamin: number
  lomin: number
  lamax: number
  lomax: number
}

export interface LiveAircraft {
  source: "opensky" | "demo"
  icao24: string
  callsign: string
  origin_country: string
  longitude: number
  latitude: number
  altitude_m: number | null
  altitude_ft: number | null
  velocity_ms: number | null
  speed_kts: number | null
  heading: number | null
  vertical_rate: number | null
  last_seen: string | null
  on_ground: boolean
  weather_impacted?: boolean
}

export interface LiveFlightsResponse {
  source: "opensky" | "demo"
  aircraft: LiveAircraft[]
  bounds: MapBounds | null
  fetched_at: string
  cached: boolean
  stale?: boolean
  data_status?: "live" | "cached" | "stale" | "demo"
  message?: string
  retry_after_seconds?: number
}

const CACHE_TTL_MS = 90_000
const memoryCache = new Map<string, { expiresAt: number; response: LiveFlightsResponse }>()
const pendingRequests = new Map<string, Promise<LiveFlightsResponse>>()
let lastSuccessfulResponse: LiveFlightsResponse | null = null

function cacheKey(bounds: MapBounds) {
  return [
    bounds.lamin.toFixed(2),
    bounds.lomin.toFixed(2),
    bounds.lamax.toFixed(2),
    bounds.lomax.toFixed(2),
  ].join(":")
}

function demoFlights(bounds: MapBounds | null): LiveFlightsResponse {
  const fetchedAt = new Date().toISOString()
  return {
    source: "demo",
    bounds,
    fetched_at: fetchedAt,
    cached: false,
    stale: false,
    data_status: "demo",
    message: "Live flight data is temporarily rate-limited. Showing sample data.",
    aircraft: [
      {
        source: "demo",
        icao24: "demo01",
        callsign: "DEMO101",
        origin_country: "Sample",
        longitude: 77.1,
        latitude: 28.56,
        altitude_m: 10363,
        altitude_ft: 34000,
        velocity_ms: 230,
        speed_kts: 447,
        heading: 225,
        vertical_rate: 0,
        last_seen: fetchedAt,
        on_ground: false,
      },
      {
        source: "demo",
        icao24: "demo02",
        callsign: "DEMO202",
        origin_country: "Sample",
        longitude: 72.86,
        latitude: 19.09,
        altitude_m: 9144,
        altitude_ft: 30000,
        velocity_ms: 215,
        speed_kts: 418,
        heading: 45,
        vertical_rate: -2,
        last_seen: fetchedAt,
        on_ground: false,
      },
    ],
  }
}

export async function fetchPublicFlights(bounds: MapBounds, signal?: AbortSignal, options: { forceRefresh?: boolean } = {}): Promise<LiveFlightsResponse> {
  const key = cacheKey(bounds)
  if (!options.forceRefresh) {
    const cached = memoryCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.response, cached: true, data_status: cached.response.data_status === "demo" ? "demo" : "cached" }
    }
    const pending = pendingRequests.get(key)
    if (pending) return pending
  }

  const search = new URLSearchParams({
    lamin: String(Number(bounds.lamin.toFixed(4))),
    lomin: String(Number(bounds.lomin.toFixed(4))),
    lamax: String(Number(bounds.lamax.toFixed(4))),
    lomax: String(Number(bounds.lomax.toFixed(4))),
  })
  if (options.forceRefresh) search.set("force_refresh", "true")

  const request = fetch(`${frontendConfig.apiBaseUrl}/api/public/flights/live?${search}`, { signal })
    .then(async (response) => {
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = typeof payload?.detail === "string" ? payload.detail : "Public flight API unavailable."
        if (lastSuccessfulResponse) {
          return {
            ...lastSuccessfulResponse,
            cached: true,
            stale: true,
            data_status: "stale" as const,
            message: "Live flight data is temporarily rate-limited. Showing last cached data.",
          }
        }
        throw new Error(message)
      }
      const result = payload as LiveFlightsResponse
      memoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, response: result })
      if (result.data_status !== "demo") lastSuccessfulResponse = result
      return result
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error
      if (lastSuccessfulResponse) {
        return {
          ...lastSuccessfulResponse,
          cached: true,
          stale: true,
          data_status: "stale" as const,
          message: "Live flight data is temporarily rate-limited. Showing last cached data.",
        }
      }
      return demoFlights(bounds)
    })
    .finally(() => {
      pendingRequests.delete(key)
    })

  pendingRequests.set(key, request)
  return request
}
