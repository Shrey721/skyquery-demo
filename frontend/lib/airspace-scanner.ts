import type { LiveAircraft, MapBounds } from "./public-flights-api"
import type { NearbyAirport } from "./nearby-airports-api"
import type { WeatherIntelligence } from "./weather-api"

export type ScannerRiskLevel = "Low" | "Medium" | "High" | "Critical"

export interface ScannerWeatherContext {
  visibility: number | null
  windSpeed: number | null
  windGusts: number | null
  precipitation: number | null
  rain: number | null
  weatherCode: number | null
  condition: string | null
  factors: string[]
  unavailable: boolean
}

export interface AirspaceConflictPair {
  id: string
  aircraftA: LiveAircraft
  aircraftB: LiveAircraft
  horizontalKm: number
  verticalFt: number
  altitudeA: number | null
  altitudeB: number | null
  baseRisk: ScannerRiskLevel
  weatherAdjustedRisk: ScannerRiskLevel
  weatherContext: ScannerWeatherContext
  nearestAirport: NearbyAirport | null
}

export interface AirspaceScanResult {
  aircraftScanned: number
  pairs: AirspaceConflictPair[]
  capped: boolean
  riskCounts: Record<ScannerRiskLevel, number>
  message: string | null
}

export interface AirspaceScanOptions {
  bounds?: MapBounds | null
  center?: { latitude: number; longitude: number } | null
  radiusKm?: number
  maxAircraft?: number
  weather?: WeatherIntelligence | null
}

const RISK_ORDER: ScannerRiskLevel[] = ["Low", "Medium", "High", "Critical"]
const DEFAULT_MAX_AIRCRAFT = 450

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180
  const dLat = (lat2 - lat1) * radians
  const dLon = (lon2 - lon1) * radians
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function metersToFeet(meters: number | null | undefined) {
  return meters == null || !Number.isFinite(meters) ? null : meters * 3.28084
}

export function findNearestAirport(lat: number, lon: number, airports: NearbyAirport[] = []) {
  let nearest: NearbyAirport | null = null
  let nearestKm = Infinity
  airports.forEach((airport) => {
    if (!Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return
    const distance = haversineKm(lat, lon, airport.lat, airport.lon)
    if (distance < nearestKm) {
      nearest = airport
      nearestKm = distance
    }
  })
  return nearest
}

export function scannerWeatherContext(weather?: WeatherIntelligence | null): ScannerWeatherContext {
  if (!weather) {
    return {
      visibility: null,
      windSpeed: null,
      windGusts: null,
      precipitation: null,
      rain: null,
      weatherCode: null,
      condition: null,
      factors: [],
      unavailable: true,
    }
  }

  const factors: string[] = []
  if ((weather.visibility ?? Infinity) < 5000 || ["Poor", "Very Poor"].includes(weather.visibilityStatus ?? "")) factors.push("low visibility")
  if ((weather.windSpeed ?? 0) >= 45 || (weather.windGusts ?? 0) >= 60 || weather.windStatus === "High") factors.push("strong wind/gusts")
  if ((weather.precipitation ?? 0) > 0 || (weather.rain ?? 0) > 0 || ["Moderate", "Heavy"].includes(weather.precipitationStatus ?? "")) factors.push("precipitation/rain")
  if ([95, 96, 99].includes(weather.weatherCode ?? -1)) factors.push("storm-like condition")

  return {
    visibility: weather.visibility ?? null,
    windSpeed: weather.windSpeed ?? null,
    windGusts: weather.windGusts ?? null,
    precipitation: weather.precipitation ?? null,
    rain: weather.rain ?? null,
    weatherCode: weather.weatherCode ?? null,
    condition: weather.weatherCondition ?? null,
    factors,
    unavailable: false,
  }
}

export function scanAirspaceConflicts(
  aircraft: LiveAircraft[],
  airports: NearbyAirport[] = [],
  options: AirspaceScanOptions = {},
): AirspaceScanResult {
  const weatherContext = scannerWeatherContext(options.weather)
  const maxAircraft = options.maxAircraft ?? DEFAULT_MAX_AIRCRAFT
  const eligible = aircraft
    .filter((flight) => Number.isFinite(flight.latitude) && Number.isFinite(flight.longitude))
    .filter((flight) => {
      if (options.bounds && (
        flight.latitude < options.bounds.lamin ||
        flight.latitude > options.bounds.lamax ||
        flight.longitude < options.bounds.lomin ||
        flight.longitude > options.bounds.lomax
      )) return false
      if (options.center && options.radiusKm) {
        return haversineKm(flight.latitude, flight.longitude, options.center.latitude, options.center.longitude) <= options.radiusKm
      }
      return true
    })

  const scopedAircraft = eligible.slice(0, maxAircraft)
  const pairs: AirspaceConflictPair[] = []
  for (let left = 0; left < scopedAircraft.length; left += 1) {
    for (let right = left + 1; right < scopedAircraft.length; right += 1) {
      const aircraftA = scopedAircraft[left]
      const aircraftB = scopedAircraft[right]
      const altitudeA = aircraftA.altitude_ft ?? metersToFeet(aircraftA.altitude_m)
      const altitudeB = aircraftB.altitude_ft ?? metersToFeet(aircraftB.altitude_m)
      if (altitudeA == null || altitudeB == null) continue
      const horizontalKm = haversineKm(aircraftA.latitude, aircraftA.longitude, aircraftB.latitude, aircraftB.longitude)
      const verticalFt = Math.abs(altitudeA - altitudeB)
      const baseRisk = proximityRisk(horizontalKm, verticalFt)
      if (!baseRisk) continue
      const weatherAdjustedRisk = weatherContext.factors.length ? increaseRisk(baseRisk) : baseRisk
      const midLat = (aircraftA.latitude + aircraftB.latitude) / 2
      const midLon = (aircraftA.longitude + aircraftB.longitude) / 2
      pairs.push({
        id: [aircraftA.icao24, aircraftB.icao24].sort().join(":"),
        aircraftA,
        aircraftB,
        horizontalKm,
        verticalFt,
        altitudeA,
        altitudeB,
        baseRisk,
        weatherAdjustedRisk,
        weatherContext,
        nearestAirport: findNearestAirport(midLat, midLon, airports),
      })
    }
  }

  pairs.sort((left, right) =>
    RISK_ORDER.indexOf(right.weatherAdjustedRisk) - RISK_ORDER.indexOf(left.weatherAdjustedRisk) ||
    left.horizontalKm - right.horizontalKm
  )

  return {
    aircraftScanned: scopedAircraft.length,
    pairs,
    capped: eligible.length > scopedAircraft.length,
    riskCounts: {
      Critical: pairs.filter((pair) => pair.weatherAdjustedRisk === "Critical").length,
      High: pairs.filter((pair) => pair.weatherAdjustedRisk === "High").length,
      Medium: pairs.filter((pair) => pair.weatherAdjustedRisk === "Medium").length,
      Low: pairs.filter((pair) => pair.weatherAdjustedRisk === "Low").length,
    },
    message: aircraft.length === 0
      ? "No live aircraft snapshot loaded. Click Refresh Live Airspace to scan."
      : pairs.length === 0
        ? "No close-call proximity risks detected in the current snapshot."
        : null,
  }
}

function proximityRisk(horizontalKm: number, verticalFt: number): ScannerRiskLevel | null {
  if (horizontalKm <= 5 && verticalFt <= 1000) return "Critical"
  if (horizontalKm <= 10 && verticalFt <= 1500) return "High"
  if (horizontalKm <= 20 && verticalFt <= 2500) return "Medium"
  if (horizontalKm <= 35 && verticalFt <= 4000) return "Low"
  return null
}

function increaseRisk(risk: ScannerRiskLevel): ScannerRiskLevel {
  const index = RISK_ORDER.indexOf(risk)
  return RISK_ORDER[Math.min(RISK_ORDER.length - 1, index + 1)]
}
