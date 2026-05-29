import { frontendConfig } from "./config"
import type { MapBounds } from "./public-flights-api"
import {
  WEATHER_CACHE_TTL_MS,
  roundedWeatherRegion,
  weatherCacheKey,
} from "./weather-refresh-policy.mjs"
import { localLocationLookup, locationLabel } from "./location-search.mjs"

export type AviationRiskLevel = "Low" | "Medium" | "High"

export interface WeatherIntelligence {
  source?: "open-meteo"
  latitude?: number
  longitude?: number
  temperature: number | null
  windSpeed: number | null
  windDirection: number | null
  cloudCover: number | null
  precipitation: number | null
  visibility: number | null
  riskLevel: AviationRiskLevel
  fetched_at?: string
  cached?: boolean
  stale?: boolean
  message?: string
}

export interface WeatherRegion {
  label: string
  latitude: number
  longitude: number
}

const memoryCache = new Map<string, { expiresAt: number; response: WeatherIntelligence }>()
const pendingRequests = new Map<string, Promise<WeatherIntelligence>>()
const WEATHER_STALE_MESSAGE = "Weather temporarily unavailable. Showing cached data."

export function regionFromBounds(bounds: MapBounds | null): WeatherRegion | null {
  if (!bounds) return null
  return {
    label: "Current view",
    latitude: (bounds.lamin + bounds.lamax) / 2,
    longitude: (bounds.lomin + bounds.lomax) / 2,
  }
}

export function regionFromSearch(search: string): WeatherRegion | null {
  const location = localLocationLookup(search)
  if (!location) return null
  return {
    label: locationLabel(location),
    latitude: location.latitude,
    longitude: location.longitude,
  }
}

export async function fetchWeather(region: WeatherRegion, signal?: AbortSignal, options: { forceRefresh?: boolean } = {}): Promise<WeatherIntelligence> {
  const roundedRegion = roundedWeatherRegion(region)
  const key = weatherCacheKey(roundedRegion)
  const cached = memoryCache.get(key)
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached.response, cached: true }
  }
  const pendingKey = `${key}:${options.forceRefresh ? "force" : "cached"}`
  const pending = pendingRequests.get(pendingKey)
  if (pending) return pending

  const search = new URLSearchParams({
    lat: String(roundedRegion.latitude),
    lon: String(roundedRegion.longitude),
  })
  if (options.forceRefresh) search.set("force_refresh", "true")

  const request = fetch(`${frontendConfig.apiBaseUrl}/api/weather?${search}`, { signal })
    .then(async (response) => {
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = typeof payload?.detail === "string" ? payload.detail : "Weather data unavailable."
        throw new Error(message)
      }
      const result = payload as WeatherIntelligence
      memoryCache.set(key, { expiresAt: Date.now() + WEATHER_CACHE_TTL_MS, response: result })
      return result
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error
      if (cached) {
        return {
          ...cached.response,
          cached: true,
          stale: true,
          message: WEATHER_STALE_MESSAGE,
        }
      }
      throw error
    })
    .finally(() => {
      pendingRequests.delete(pendingKey)
    })

  pendingRequests.set(pendingKey, request)
  return request
}
