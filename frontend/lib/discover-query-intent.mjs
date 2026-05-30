const WEATHER_TERMS = /\b(weather|temperature|wind|rain|cloud|visibility|aviation weather|weather risk|risk)\b/i
const FLIGHT_TERMS = /\b(flights?|aircraft|planes?|airspace|traffic)\b/i
const IMPACT_TERMS = /\b(affected|impacted|storm|severe weather|bad weather|rain|heavy rain|high wind|strong wind|poor visibility|low visibility|weather affected|weather impacted|affected by weather|aviation risk)\b/i
const AIRPORT_TERMS = /\b(airports?|nearest airport|nearby airports|major airports)\b/i
const ENTERPRISE_TERMS = /\b(delay|delayed|on[- ]?time|performance|cancellation|cancellations|cancelled|operations|operational|historical|enterprise|throughput|airport stats|airport statistics|kpi|congestion|risk from enterprise|high risk airports?|compare)\b/i

export function semanticEnterpriseFilter(query) {
  const text = query.trim().toLowerCase()
  if (text.includes("high risk airport") || text.includes("poor performance")) return "high_risk"
  if (text.includes("high delay") || text.includes("high-delay")) return "high_delay"
  if (text.includes("low on-time") || text.includes("low on time")) return "low_on_time"
  if (text.includes("high cancellation")) return "high_cancellation"
  return null
}

export function hasExplicitLocationScope(query) {
  const excluded = new Set(["airport", "airports", "high", "low", "poor", "risk", "delay", "delays", "performance", "cancellation"])
  return [...query.matchAll(/\b(?:near|around|over|at|in|for)\s+([a-z]{2,})\b/gi)]
    .some((match) => !excluded.has(match[1].toLowerCase()))
}

export function isComparisonQuery(query) {
  return /\b(compare|versus|vs)\b/i.test(query) || query.toLowerCase().includes(" between ")
}

export function parseDiscoverQuery(query) {
  const text = query.trim().toLowerCase()
  const asksImpact = IMPACT_TERMS.test(text)
  const asksSelectedAircraftAirports = /\bselected aircraft\b/.test(text) && AIRPORT_TERMS.test(text)
  const mentionsFlights = FLIGHT_TERMS.test(text)
  const mentionsWeather = WEATHER_TERMS.test(text)
  const mentionsAirports = AIRPORT_TERMS.test(text)
  const needsTrino = ENTERPRISE_TERMS.test(text)
  const enterpriseFilter = semanticEnterpriseFilter(text)
  const comparison = isComparisonQuery(text)
  const enterpriseFirst = Boolean((enterpriseFilter || comparison) && !hasExplicitLocationScope(text))
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
  const impactType = /\bstorm\b|\bsevere weather\b/.test(text)
    ? "storm"
    : /\bheavy rain\b|\brain\b/.test(text)
      ? "rain"
      : /\bhigh wind\b|\bstrong wind\b/.test(text)
      ? "wind"
      : /\bpoor visibility\b|\blow visibility\b|\bvisibility\b/.test(text) && asksImpact
        ? "visibility"
        : /\bbad weather\b|\bweather affected\b|\baffected by weather\b|\baviation risk\b|\brisk\b/.test(text)
          ? "general_weather"
          : null
  const fetchFlights = needsTrino ? true : asksSelectedAircraftAirports ? false : mentionsAirports ? mentionsFlights : true
  const fetchWeather = needsTrino ? true : mentionsAirports ? (mentionsWeather || asksImpact) : true
  const fetchAirports = mentionsAirports || needsTrino
  const primarySource = needsTrino
    ? "trino"
    : mentionsWeather
      ? "openmeteo"
      : mentionsAirports
        ? "airports_csv"
        : "opensky"
  const contextSources = [
    fetchFlights && primarySource !== "opensky" ? "opensky" : null,
    fetchWeather && primarySource !== "openmeteo" ? "openmeteo" : null,
    fetchAirports && primarySource !== "airports_csv" ? "airports_csv" : null,
  ].filter(Boolean)

  return {
    fetchFlights,
    fetchWeather,
    fetchAirports,
    airportMode: fetchAirports,
    selectedAircraftAirportMode: asksSelectedAircraftAirports,
    impactMode: Boolean(impactType),
    impactType,
    requestedMetric,
    isWeatherOnly: mentionsWeather && !mentionsFlights && !asksImpact,
    queryPlan: {
      intent: needsTrino ? (mentionsFlights || mentionsWeather || mentionsAirports ? "combined" : "enterprise") : mentionsWeather ? "weather" : mentionsAirports ? "airport" : "live_airspace",
      primarySource,
      contextSources,
      needsTrino,
      needsOpenSky: fetchFlights,
      needsWeather: fetchWeather,
      needsAirports: fetchAirports,
      enterpriseFirst,
      locationGeocodingSkippedReason: enterpriseFirst ? "enterprise_first_query_without_explicit_location" : null,
      comparison,
    },
    semanticEnterpriseFilter: enterpriseFilter,
    enterpriseFirst,
    comparison,
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
    weather?.precipitationStatus === "Heavy" ||
    weather?.windStatus === "High" ||
    (weather?.windGusts ?? 0) >= 60 ||
    weather?.operationalRisk === "High"
}

export function impactTypeLabel(impactType) {
  if (impactType === "storm") return "Storm"
  if (impactType === "rain") return "Rain"
  if (impactType === "wind") return "High Wind"
  if (impactType === "visibility") return "Poor Visibility"
  if (impactType === "general_weather") return "General Weather"
  return "Weather"
}

export function detectWeatherImpact(intent, weather) {
  if (!weather || !intent.impactType) {
    return {
      detected: false,
      reason: "No weather-impact query detected.",
      contributors: [],
    }
  }

  if (intent.impactType === "storm") {
    const contributors = []
    if ([95, 96, 99].includes(weather.weatherCode)) contributors.push("thunderstorm weather code")
    if (weather.precipitationStatus === "Heavy") contributors.push("heavy precipitation")
    if (weather.windStatus === "High") contributors.push("high wind")
    if ((weather.windGusts ?? 0) >= 60) contributors.push("wind gusts >= 60 km/h")
    if (weather.operationalRisk === "High") contributors.push("high operational risk")
    return {
      detected: contributors.length > 0,
      reason: contributors.length
        ? "Storm-like area conditions detected from current Open-Meteo data."
        : "No storm-like conditions detected near this area.",
      contributors,
    }
  }

  if (intent.impactType === "rain") {
    const contributors = []
    if (weather.precipitationStatus === "Moderate" || weather.precipitationStatus === "Heavy") contributors.push(`${weather.precipitationStatus.toLowerCase()} precipitation`)
    if ((weather.rain ?? 0) > 0) contributors.push("rain reported")
    if ((weather.precipitation ?? 0) > 0) contributors.push("precipitation reported")
    return {
      detected: contributors.length > 0,
      reason: contributors.length
        ? "Rain impact detected from current Open-Meteo data."
        : "No significant rain impact detected.",
      contributors,
    }
  }

  if (intent.impactType === "wind") {
    const contributors = []
    if (weather.windStatus === "High") contributors.push("high wind status")
    if ((weather.windSpeed ?? 0) >= 45) contributors.push("wind speed >= 45 km/h")
    if ((weather.windGusts ?? 0) >= 60) contributors.push("wind gusts >= 60 km/h")
    return {
      detected: contributors.length > 0,
      reason: contributors.length
        ? "High wind/gust conditions detected near this area."
        : "No high-wind flight impact detected.",
      contributors,
    }
  }

  if (intent.impactType === "visibility") {
    const contributors = []
    if (weather.visibilityStatus === "Poor" || weather.visibilityStatus === "Very Poor") contributors.push(`${weather.visibilityStatus.toLowerCase()} visibility`)
    if ((weather.visibility ?? Infinity) < 5000) contributors.push("visibility < 5 km")
    return {
      detected: contributors.length > 0,
      reason: contributors.length
        ? "Poor visibility conditions detected near this area."
        : "No poor-visibility impact detected.",
      contributors,
    }
  }

  const contributors = []
  if (weather.operationalRisk === "Medium" || weather.operationalRisk === "High") contributors.push(`${weather.operationalRisk.toLowerCase()} operational risk`)
  return {
    detected: contributors.length > 0,
    reason: contributors.length
      ? "Area-level weather impact detected from operational risk."
      : "No significant area-level weather impact detected.",
    contributors,
  }
}

export function buildWeatherImpactAssessment(intent, weather, flightCount) {
  if (!intent.impactMode) return null
  const result = detectWeatherImpact(intent, weather)
  return {
    impactMode: true,
    impactType: intent.impactType,
    impactTypeLabel: impactTypeLabel(intent.impactType),
    flightsInArea: flightCount,
    impactedCount: result.detected ? flightCount : 0,
    detected: result.detected,
    assessment: result.reason,
    contributors: result.contributors,
    honestyLabel: "Impact assessment is area-level based on Open-Meteo conditions, not radar cell tracking.",
  }
}

export function shouldMarkFlightsImpacted(intent, weather) {
  return detectWeatherImpact(intent, weather).detected
}

export function weatherImpactSummary(intent, weather, impactedCount) {
  const assessment = buildWeatherImpactAssessment(intent, weather, impactedCount)
  if (!assessment) return null
  return assessment.detected
    ? "Weather impact detected for this area."
    : assessment.assessment
}
