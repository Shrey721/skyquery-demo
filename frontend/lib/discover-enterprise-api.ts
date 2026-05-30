import { frontendConfig } from "./config"
import type { NearbyAirport } from "./nearby-airports-api"

export interface DiscoverEnterpriseRow {
  airportCode: string
  metrics: Record<string, unknown>
  risk: string | null
  raw: Record<string, unknown>
}

export interface DiscoverEnterpriseResponse {
  queryPlan: {
    intent: string
    primarySource: string
    contextSources: string[]
    needsTrino: boolean
    needsOpenSky: boolean
    needsWeather: boolean
    needsAirports: boolean
    enterpriseIntent?: string | null
  }
  available: boolean
  message?: string
  sourceTables: string[]
  rows: DiscoverEnterpriseRow[]
  matchedAirportsCount: number
  honestyNote?: string
}

export async function fetchDiscoverEnterprise(
  question: string,
  location: string,
  airports: NearbyAirport[],
): Promise<DiscoverEnterpriseResponse> {
  const response = await fetch(`${frontendConfig.apiBaseUrl}/api/discover/enterprise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, location, airports }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "Enterprise data is unavailable.")
  }
  return payload as DiscoverEnterpriseResponse
}
