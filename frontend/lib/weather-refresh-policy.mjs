export const WEATHER_CACHE_TTL_MS = 600_000
export const WEATHER_GRID_DECIMALS = 1
export const ALLOWED_WEATHER_FETCH_REASONS = new Set(["initial_load", "manual_refresh", "search_submit"])

export function roundCoordinate(value, decimals = WEATHER_GRID_DECIMALS) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function roundedWeatherRegion(region) {
  return {
    ...region,
    latitude: roundCoordinate(region.latitude),
    longitude: roundCoordinate(region.longitude),
  }
}

export function weatherCacheKey(region) {
  const rounded = roundedWeatherRegion(region)
  return `${rounded.latitude.toFixed(WEATHER_GRID_DECIMALS)}:${rounded.longitude.toFixed(WEATHER_GRID_DECIMALS)}`
}

export function isAllowedWeatherFetchReason(reason) {
  return ALLOWED_WEATHER_FETCH_REASONS.has(reason)
}
