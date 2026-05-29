const WEATHER_TERMS = /\b(weather|temperature|wind|rain|cloud|visibility|aviation weather|weather risk|risk)\b/i
const FLIGHT_TERMS = /\b(flights?|aircraft|planes?|airspace|traffic)\b/i
const IMPACT_TERMS = /\b(affected|storm|high wind|rain|aviation risk)\b/i

export function parseDiscoverQuery(query) {
  const text = query.trim().toLowerCase()
  const asksImpact = IMPACT_TERMS.test(text)
  const mentionsFlights = FLIGHT_TERMS.test(text)
  const mentionsWeather = WEATHER_TERMS.test(text)
  const requestedMetric = /\btemperature\b/.test(text)
    ? "temperature"
    : /\bvisibility\b/.test(text)
      ? "visibility"
      : /\bwind\b/.test(text)
        ? "wind"
        : /\brain\b/.test(text)
          ? "rain"
          : /\bcloud\b/.test(text)
            ? "cloudCover"
            : /\brisk\b/.test(text)
              ? "risk"
              : "weather"
  const impactType = /\bstorm\b/.test(text)
    ? "storm"
    : /\bhigh wind\b|\bwind\b/.test(text) && /\b(affected|high wind|in high wind)\b/.test(text)
      ? "wind"
      : /\brain\b/.test(text)
        ? "rain"
        : /\baviation risk\b|\brisk\b/.test(text)
          ? "risk"
          : null

  return {
    fetchFlights: true,
    fetchWeather: true,
    impactType,
    requestedMetric,
    isWeatherOnly: mentionsWeather && !mentionsFlights && !asksImpact,
  }
}

export function requestedWeatherMetricSummary(intent, weather, flightCount) {
  if (!weather) return null
  const flights = `${flightCount} flight${flightCount === 1 ? "" : "s"} in this area.`
  if (intent.requestedMetric === "temperature") {
    return `Temperature is ${Math.round(weather.temperature ?? 0)} C. ${flights}`
  }
  if (intent.requestedMetric === "visibility") {
    const visibility = weather.visibility == null ? "unavailable" : `${(weather.visibility / 1000).toFixed(1)} km`
    return `Visibility is ${visibility}${weather.visibilityStatus ? ` (${weather.visibilityStatus})` : ""}. ${flights}`
  }
  if (intent.requestedMetric === "wind") {
    return `Wind is ${Math.round(weather.windSpeed ?? 0)} km/h${weather.windGusts == null ? "" : `, gusting ${Math.round(weather.windGusts)} km/h`}. ${flights}`
  }
  if (intent.requestedMetric === "rain") {
    return `Precipitation is ${(weather.precipitation ?? 0).toFixed(1)} mm${weather.precipitationStatus ? ` (${weather.precipitationStatus})` : ""}. ${flights}`
  }
  if (intent.requestedMetric === "cloudCover") {
    return `Cloud cover is ${Math.round(weather.cloudCover ?? 0)}%. ${flights}`
  }
  if (intent.requestedMetric === "risk") {
    return `Operational risk is ${weather.operationalRisk ?? weather.riskLevel ?? "Unavailable"}. ${flights}`
  }
  if (intent.isWeatherOnly) {
    return `Weather updated. ${flights}`
  }
  return null
}

export function isStormLike(weather) {
  const code = weather?.weatherCode
  return code === 95 || code === 96 || code === 99 ||
    (weather?.precipitationStatus === "Heavy" && (weather?.windStatus === "High" || (weather?.cloudCover ?? 0) > 85))
}

export function weatherImpactSummary(intent, weather, impactedCount) {
  if (intent.impactType === "rain") {
    return impactedCount
      ? `${impactedCount} flights flagged for area-level rain impact.`
      : "No significant rain impact detected."
  }
  if (intent.impactType === "storm") {
    return impactedCount
      ? `${impactedCount} flights flagged near storm-like area conditions.`
      : "No storm-like conditions detected near this area."
  }
  if (intent.impactType === "wind") {
    return impactedCount
      ? `${impactedCount} flights flagged for high wind conditions.`
      : "No high-wind flight impact detected."
  }
  if (intent.impactType === "risk") {
    return weather?.operationalRisk
      ? `Aviation weather risk is ${weather.operationalRisk}.`
      : null
  }
  return null
}

export function shouldMarkFlightsImpacted(intent, weather) {
  if (!weather || !intent.impactType) return false
  if (intent.impactType === "rain") {
    return weather.precipitationStatus === "Moderate" || weather.precipitationStatus === "Heavy" || (weather.rain ?? 0) >= 2
  }
  if (intent.impactType === "storm") {
    return isStormLike(weather)
  }
  if (intent.impactType === "wind") {
    return weather.windStatus === "High" || (weather.windSpeed ?? 0) > 45 || (weather.windGusts ?? 0) > 60
  }
  return false
}
