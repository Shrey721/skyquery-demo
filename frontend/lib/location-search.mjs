export const GEOCODING_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const GEOCODING_FAILED_CACHE_TTL_MS = 10 * 60 * 1000
export const SEARCH_RADIUS_KM = 200

const LOCAL_LOCATIONS = [
  { label: "Delhi", name: "Delhi", country: "India", latitude: 28.6139, longitude: 77.209 },
  { label: "DEL", name: "Indira Gandhi International Airport", country: "India", latitude: 28.5562, longitude: 77.1 },
  { label: "Kolkata", name: "Kolkata", country: "India", latitude: 22.5726, longitude: 88.3639 },
  { label: "CCU", name: "Netaji Subhas Chandra Bose International Airport", country: "India", latitude: 22.6547, longitude: 88.4467 },
  { label: "Mumbai", name: "Mumbai", country: "India", latitude: 19.076, longitude: 72.8777 },
  { label: "BOM", name: "Chhatrapati Shivaji Maharaj International Airport", country: "India", latitude: 19.0896, longitude: 72.8656 },
  { label: "Bengaluru", name: "Bengaluru", country: "India", latitude: 12.9716, longitude: 77.5946 },
  { label: "BLR", name: "Kempegowda International Airport", country: "India", latitude: 13.1986, longitude: 77.7066 },
  { label: "Hyderabad", name: "Hyderabad", country: "India", latitude: 17.385, longitude: 78.4867 },
  { label: "HYD", name: "Rajiv Gandhi International Airport", country: "India", latitude: 17.2403, longitude: 78.4294 },
]

const geocodeCache = new Map()
const pendingGeocodes = new Map()

export function normalizeLocationQuery(query) {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(show|find|get|list|can|you|please|live|current|weather|wether|meteo|flights|flight|fligt|fligts|aircraft|planes|airplanes|airspace|scanner|traffic|airport|airports|airpot|airpots|nearest|nearby|major|temperature|temprature|wind|speed|rain|cloud|cover|visibility|visiblity|aviation|risk|affected|storm|severe|bad|strong|low|high|over|near|around|in|at|above|for|of|the|me|and|by|delay|delays|delayed|statistics|stats|performance|performence|operational|operations|cancellation|cancellations|cancelled|on|time|historical|enterprise|throughput|kpi|poor|close|calls?|proximity|conflict|miss|altitude|vertical|separation|too|collision|between|each|other|compare|compar|comparison|versus|vs)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function localLocationLookup(query) {
  const normalized = normalizeLocationQuery(query)
  if (!normalized) return null
  return LOCAL_LOCATIONS.find((location) => {
    const label = location.label.toLowerCase()
    const name = location.name.toLowerCase()
    return label.length === 3
      ? new RegExp(`\\b${label}\\b`, "i").test(normalized)
      : normalized.includes(label) || normalized.includes(name)
  }) ?? null
}

export function locationLabel(location) {
  return [location.name || location.label, location.country].filter(Boolean).join(", ")
}

export function boundsAroundLocation(location, radiusKm = SEARCH_RADIUS_KM) {
  const latDelta = radiusKm / 111.32
  const lonScale = Math.max(Math.cos(location.latitude * Math.PI / 180), 0.15)
  const lonDelta = radiusKm / (111.32 * lonScale)
  return {
    lamin: Math.max(-90, location.latitude - latDelta),
    lomin: Math.max(-180, location.longitude - lonDelta),
    lamax: Math.min(90, location.latitude + latDelta),
    lomax: Math.min(180, location.longitude + lonDelta),
  }
}

function readCachedGeocode(key) {
  const cached = geocodeCache.get(key)
  if (!cached || cached.expiresAt <= Date.now()) {
    geocodeCache.delete(key)
    return undefined
  }
  return cached.value
}

function writeCachedGeocode(key, value, ttlMs) {
  geocodeCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function clearGeocodingCache() {
  geocodeCache.clear()
  pendingGeocodes.clear()
}

export async function resolveLocationQuery(query, options = {}) {
  const local = localLocationLookup(query)
  if (local) return { ...local, label: locationLabel(local), source: "local" }

  const normalized = normalizeLocationQuery(query)
  if (!normalized) return null

  const cached = readCachedGeocode(normalized)
  if (cached !== undefined) return cached

  const pending = pendingGeocodes.get(normalized)
  if (pending) return pending

  const fetcher = options.fetcher ?? fetch
  const request = fetcher(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({
    name: normalized,
    count: "1",
    language: "en",
    format: "json",
  })}`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Geocoding unavailable")
      const payload = await response.json()
      const result = Array.isArray(payload?.results) ? payload.results[0] : null
      if (!result || typeof result.latitude !== "number" || typeof result.longitude !== "number") {
        writeCachedGeocode(normalized, null, GEOCODING_FAILED_CACHE_TTL_MS)
        return null
      }
      const location = {
        label: [result.name, result.country].filter(Boolean).join(", "),
        name: result.name,
        country: result.country,
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone,
        source: "geocoding",
      }
      writeCachedGeocode(normalized, location, GEOCODING_CACHE_TTL_MS)
      return location
    })
    .catch(() => {
      writeCachedGeocode(normalized, null, GEOCODING_FAILED_CACHE_TTL_MS)
      return null
    })
    .finally(() => {
      pendingGeocodes.delete(normalized)
    })

  pendingGeocodes.set(normalized, request)
  return request
}
