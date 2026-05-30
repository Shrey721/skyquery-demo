import { frontendConfig } from "./config"
import type { MapBounds } from "./public-flights-api"

export interface NearbyAirport {
  code: string
  iataCode: string | null
  icaoCode: string | null
  ident: string
  name: string
  city: string
  country: string
  type: "large_airport" | "medium_airport" | "small_airport"
  lat: number
  lon: number
  distanceNm: number
}

export interface NearbyAirportsResponse {
  airports: NearbyAirport[]
  source: string
}

export async function fetchNearbyAirports(
  latitude: number,
  longitude: number,
  limit = 5,
  signal?: AbortSignal,
): Promise<NearbyAirportsResponse> {
  const search = new URLSearchParams({
    lat: String(Number(latitude.toFixed(5))),
    lon: String(Number(longitude.toFixed(5))),
    limit: String(limit),
  })
  const response = await fetch(`${frontendConfig.apiBaseUrl}/api/airports/nearby?${search}`, { signal })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof payload?.detail === "string" ? payload.detail : "Nearby airport data unavailable."
    throw new Error(message)
  }
  return payload as NearbyAirportsResponse
}

export async function fetchAirportsInBounds(
  bounds: MapBounds,
  limit = 100,
  signal?: AbortSignal,
): Promise<NearbyAirportsResponse> {
  const search = new URLSearchParams({
    lamin: String(Number(bounds.lamin.toFixed(5))),
    lomin: String(Number(bounds.lomin.toFixed(5))),
    lamax: String(Number(bounds.lamax.toFixed(5))),
    lomax: String(Number(bounds.lomax.toFixed(5))),
    limit: String(limit),
  })
  const response = await fetch(`${frontendConfig.apiBaseUrl}/api/airports/bounds?${search}`, { signal })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof payload?.detail === "string" ? payload.detail : "Nearby airport data unavailable."
    throw new Error(message)
  }
  return payload as NearbyAirportsResponse
}
