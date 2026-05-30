import { frontendConfig } from "./config"
import type { NearbyAirport } from "./nearby-airports-api"

export interface DiscoverEnterpriseRow {
  airportCode: string
  metrics: Record<string, unknown>
  risk: string | null
  raw: Record<string, unknown>
}

export interface DiscoverEnterpriseDailyRecord {
  date: string | null
  flights: number
  delayed: number
  cancelled: number
  departureDelay: number
  arrivalDelay: number
  onTimePercentage: number
}

export interface DiscoverEnterpriseAirportSummary {
  airportCode: string
  risk: "High" | "Medium" | "Low"
  dateRange: { start: string | null; end: string | null }
  recordCount: number
  totals: {
    totalFlights: number
    delayedFlights: number
    cancelledFlights: number
    weatherDelays: number
    maintenanceDelays: number
  }
  rates: {
    delayRate: number
    cancellationRate: number
    onTimePercentage: number | null
  }
  averages: {
    departureDelay: number | null
    arrivalDelay: number | null
  }
  insight: string
  dailyRecords: DiscoverEnterpriseDailyRecord[]
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
    enterpriseFilter?: string | null
    enterpriseFirst?: boolean
    locationGeocodingSkippedReason?: string | null
    comparison?: boolean
  }
  available: boolean
  enterpriseConnected?: boolean
  message?: string
  sourceTables: string[]
  rows: DiscoverEnterpriseRow[]
  airportSummaries?: DiscoverEnterpriseAirportSummary[]
  matchedAirportsCount: number
  matchedAirports?: number
  honestyNote?: string
  interpretedEnterpriseFilter?: string | null
  selectedAirports?: NearbyAirport[]
  comparison?: boolean
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

export async function fetchDiscoverEnterpriseCandidates(question: string): Promise<DiscoverEnterpriseResponse> {
  const response = await fetch(`${frontendConfig.apiBaseUrl}/api/discover/enterprise-candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "Enterprise data is unavailable.")
  }
  return payload as DiscoverEnterpriseResponse
}
