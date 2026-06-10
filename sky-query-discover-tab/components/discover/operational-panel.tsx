"use client";

import { useState } from "react";
import {
  X,
  Plane,
  Activity,
  AlertTriangle,
  Building2,
  Sparkles,
  ChevronRight,
  Compass,
  Gauge,
  ArrowUp,
  ArrowDown,
  Globe,
  Clock,
  Wind,
  Eye,
  CloudRain,
  ThermometerSun,
  Radio,
  Database,
  RefreshCw,
  Send,
  MapPin,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Radar,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Aircraft, MapBounds, ScannerConflict } from "./aviation-map";

interface OperationalPanelProps {
  selectedAircraft: Aircraft | null;
  onClose: () => void;
  aircraftInView: number;
  mapBounds: MapBounds | null;
  activeFilters: string[];
  scannerConflicts?: ScannerConflict[];
  selectedCloseCallId?: string | null;
  onScannerConflictSelect?: (pair: ScannerConflict) => void;
  selectedAirportCode?: string | null;
  onNearbyAirportSelect?: (airport: NearbyAirportCard) => void;
}

// Data source status types
type DataSourceStatus = "connected" | "limited" | "disconnected" | "refreshing";

interface DataSource {
  name: string;
  status: DataSourceStatus;
  lastUpdate: string;
  latency?: number;
}

// Mock data sources
const dataSources: DataSource[] = [
  { name: "OpenSky Network", status: "connected", lastUpdate: "2s ago", latency: 45 },
  { name: "Weather API", status: "connected", lastUpdate: "5m ago", latency: 120 },
  { name: "Enterprise Warehouse", status: "limited", lastUpdate: "12m ago" },
  { name: "ADS-B Exchange", status: "connected", lastUpdate: "1s ago", latency: 32 },
];

// Nearby airports with realistic data
interface NearbyAirportCard {
  code: string;
  name: string;
  distance: number;
  weather: string;
  pressure: "Low" | "Medium" | "High";
  delays: number;
  lat: number;
  lng: number;
}

const nearbyAirports: NearbyAirportCard[] = [
  { code: "JFK", name: "John F. Kennedy Intl", distance: 12.4, weather: "Cloudy, 18°C", pressure: "Medium", delays: 15, lat: 40.6413, lng: -73.7781 },
  { code: "EWR", name: "Newark Liberty Intl", distance: 28.7, weather: "Overcast, 17°C", pressure: "High", delays: 32, lat: 40.6895, lng: -74.1745 },
  { code: "LGA", name: "LaGuardia", distance: 18.2, weather: "Cloudy, 18°C", pressure: "Low", delays: 8, lat: 40.7769, lng: -73.8740 },
];

// Weather impact data
const weatherImpact = {
  windSpeed: 24,
  windDirection: 270,
  visibility: 8.5,
  ceiling: 3500,
  precipitation: "Light Rain",
  stormSeverity: "None",
  operationalRisk: "Low",
};

// Enterprise correlation data
const enterpriseCorrelation = {
  matchingAirport: "JFK",
  internalDelays: 12,
  incidentSeverity: "Medium",
  affectedRoutes: ["JFK-LAX", "JFK-ORD", "JFK-MIA"],
  lastUpdate: "8 minutes ago",
  connected: true,
};

// AI suggested questions
const suggestedQuestions = [
  "What is causing delays at JFK right now?",
  "Show me congestion trends for the last 6 hours",
  "Are there any weather-related reroutes in this region?",
  "Compare current traffic to historical baseline",
  "Which routes have the highest delay correlation?",
];

export function OperationalPanel({
  selectedAircraft,
  onClose,
  aircraftInView,
  mapBounds,
  activeFilters,
  scannerConflicts = [],
  selectedCloseCallId = null,
  onScannerConflictSelect,
  selectedAirportCode = null,
  onNearbyAirportSelect,
}: OperationalPanelProps) {
  const [aiQuestion, setAiQuestion] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);

  // Calculate live summary metrics
  const avgAltitude = 32500; // Would calculate from actual aircraft data
  const avgSpeed = 465;
  const congestionScore = Math.min(100, Math.round(aircraftInView * 5.5));
  const anomalyCount = Math.floor(aircraftInView * 0.1);

  const handleAskAI = () => {
    if (!aiQuestion.trim()) return;
    setIsAskingAI(true);
    // In production, this would call the SkyQuery chat/query system
    setTimeout(() => {
      setIsAskingAI(false);
      setAiQuestion("");
    }, 1500);
  };

  const getStatusIcon = (status: DataSourceStatus) => {
    switch (status) {
      case "connected": return <CheckCircle2 className="w-3 h-3 text-green-400" />;
      case "limited": return <AlertCircle className="w-3 h-3 text-amber-400" />;
      case "disconnected": return <WifiOff className="w-3 h-3 text-red-400" />;
      case "refreshing": return <Loader2 className="w-3 h-3 text-primary animate-spin" />;
    }
  };

  const getStatusColor = (status: DataSourceStatus) => {
    switch (status) {
      case "connected": return "text-green-400";
      case "limited": return "text-amber-400";
      case "disconnected": return "text-red-400";
      case "refreshing": return "text-primary";
    }
  };

  return (
    <div className="w-[380px] border-l border-border/30 bg-background/80 backdrop-blur-xl flex flex-col">
      {/* Data Source Status Strip */}
      <div className="px-3 py-2 border-b border-border/30 bg-secondary/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Data Sources</span>
          <button className="p-1 rounded hover:bg-secondary/50 transition-colors" title="Refresh all">
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {dataSources.map((source) => (
            <div key={source.name} className="flex items-center gap-1.5" title={`${source.name}: ${source.status} - ${source.lastUpdate}`}>
              {getStatusIcon(source.status)}
              <span className={`text-[10px] ${getStatusColor(source.status)}`}>
                {source.name.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Live Airspace Summary */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Live Airspace Summary
              </h2>
              <span className="relative flex h-2 w-2 ml-auto">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            </div>
            
            {aircraftInView === 0 ? (
              <div className="glass-panel rounded-lg p-4 text-center">
                <Plane className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No live aircraft found in this region</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Try panning or zooming the map</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="glass-panel rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Plane className="w-3 h-3 text-primary" />
                    <span className="text-[10px] text-muted-foreground">Aircraft in View</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{aircraftInView}</p>
                </div>
                <div className="glass-panel rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowUp className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] text-muted-foreground">Avg Altitude</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{(avgAltitude / 1000).toFixed(1)}k<span className="text-xs font-normal text-muted-foreground ml-0.5">ft</span></p>
                </div>
                <div className="glass-panel rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gauge className="w-3 h-3 text-green-400" />
                    <span className="text-[10px] text-muted-foreground">Avg Speed</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{avgSpeed}<span className="text-xs font-normal text-muted-foreground ml-0.5">kts</span></p>
                </div>
                <div className="glass-panel rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Activity className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-muted-foreground">Congestion</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <p className={`text-lg font-bold ${congestionScore > 70 ? "text-red-400" : congestionScore > 40 ? "text-amber-400" : "text-green-400"}`}>
                      {congestionScore}
                    </p>
                    <span className="text-xs text-muted-foreground">/100</span>
                  </div>
                </div>
                <div className="glass-panel rounded-lg p-2.5 col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      <span className="text-[10px] text-muted-foreground">Anomalies Detected</span>
                    </div>
                    <p className={`text-sm font-bold ${anomalyCount > 0 ? "text-red-400" : "text-green-400"}`}>
                      {anomalyCount}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {activeFilters.includes("Airspace Scanner") && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Radar className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Airspace Scanner
                </h2>
              </div>
              <div className="glass-panel rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/30 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Aircraft scanned</p>
                    <p className="text-lg font-bold text-foreground">{aircraftInView}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Risk pairs found</p>
                    <p className="text-lg font-bold text-foreground">{scannerConflicts.length}</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Based on the latest loaded aircraft snapshot. Manual refresh remains the only way to fetch new live airspace data.</p>
                <div className="rounded-lg bg-secondary/30 p-2 text-xs space-y-1">
                  <ScannerCount label="Critical" risk="Critical" scannerConflicts={scannerConflicts} />
                  <ScannerCount label="High" risk="High" scannerConflicts={scannerConflicts} />
                  <ScannerCount label="Medium" risk="Medium" scannerConflicts={scannerConflicts} />
                  <ScannerCount label="Low" risk="Low" scannerConflicts={scannerConflicts} />
                </div>
                {scannerConflicts.length ? (
                  <div className="space-y-2">
                    {scannerConflicts.slice(0, 5).map((pair) => (
                      <div
                        key={pair.id}
                        role={onScannerConflictSelect ? "button" : undefined}
                        tabIndex={onScannerConflictSelect ? 0 : undefined}
                        onClick={() => onScannerConflictSelect?.(pair)}
                        onKeyDown={(event) => {
                          if (!onScannerConflictSelect || (event.key !== "Enter" && event.key !== " ")) return;
                          event.preventDefault();
                          onScannerConflictSelect(pair);
                        }}
                        className={`rounded-lg p-2 text-xs transition ${pair.id === selectedCloseCallId ? "bg-primary/10 ring-1 ring-primary/40" : "bg-secondary/30"} ${onScannerConflictSelect ? "cursor-pointer hover:bg-secondary/50" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{pair.aircraftA.callsign} / {pair.aircraftB.callsign}</span>
                          <span className={pair.weatherAdjustedRisk === "Critical" ? "text-red-400" : pair.weatherAdjustedRisk === "High" ? "text-orange-400" : pair.weatherAdjustedRisk === "Medium" ? "text-amber-400" : "text-sky-400"}>{pair.weatherAdjustedRisk}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{pair.horizontalKm.toFixed(1)} km / {Math.round(pair.verticalFt).toLocaleString()} ft vertical</p>
                        <p className="mt-1 text-muted-foreground">Base proximity risk: {pair.baseRisk}</p>
                        <p className="mt-1 text-muted-foreground">Weather factor: {pair.weatherFactor}</p>
                        <p className="mt-1 text-muted-foreground">Nearest airport: {pair.nearestAirport ?? "Unavailable"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-secondary/30 p-2 text-xs text-muted-foreground">No close-call proximity risks detected in the current snapshot.</p>
                )}
                <p className="text-[11px] text-muted-foreground">This is a proximity screen from public/demo feeds, not real ATC conflict prediction.</p>
              </div>
            </section>
          )}

          {/* Selected Aircraft */}
          {selectedAircraft && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plane className="w-4 h-4 text-primary" />
                  <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Selected Aircraft
                  </h2>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-secondary/50 transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="glass-panel rounded-lg p-3 space-y-3 glow-cyan">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-bold text-primary">{selectedAircraft.callsign}</p>
                    <p className="text-xs text-muted-foreground font-mono">ICAO24: {selectedAircraft.icao24}</p>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedAircraft.onGround ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}>
                    {selectedAircraft.onGround ? "On Ground" : "Airborne"}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/30">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <ArrowUp className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">ALT</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{selectedAircraft.altitude.toLocaleString()}<span className="text-[10px] font-normal ml-0.5">ft</span></p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Gauge className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">SPD</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{selectedAircraft.speed}<span className="text-[10px] font-normal ml-0.5">kts</span></p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Compass className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">HDG</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{selectedAircraft.heading}°</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ArrowUp className={`w-3 h-3 ${selectedAircraft.verticalRate > 0 ? "text-green-400" : selectedAircraft.verticalRate < 0 ? "text-red-400 rotate-180" : "text-muted-foreground"}`} />
                      Vertical Rate
                    </span>
                    <span className={`font-medium ${selectedAircraft.verticalRate > 0 ? "text-green-400" : selectedAircraft.verticalRate < 0 ? "text-red-400" : "text-foreground"}`}>
                      {selectedAircraft.verticalRate > 0 ? "+" : ""}{selectedAircraft.verticalRate} ft/min
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Globe className="w-3 h-3" />
                      Origin Country
                    </span>
                    <span className="text-foreground">{selectedAircraft.originCountry}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Last Seen
                    </span>
                    <span className="text-foreground">{Math.round((Date.now() - selectedAircraft.lastSeen) / 1000)}s ago</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Radio className="w-3 h-3" />
                      Data Source
                    </span>
                    <span className="text-foreground capitalize">{selectedAircraft.dataSource}</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Nearby Airports */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-400" />
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Nearby Airports
              </h2>
            </div>
            <div className="space-y-2">
              {nearbyAirports.map((airport) => (
                <div
                  key={airport.code}
                  role={onNearbyAirportSelect ? "button" : undefined}
                  tabIndex={onNearbyAirportSelect ? 0 : undefined}
                  onClick={() => onNearbyAirportSelect?.(airport)}
                  onKeyDown={(event) => {
                    if (!onNearbyAirportSelect || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    onNearbyAirportSelect(airport);
                  }}
                  className={`glass-panel rounded-lg p-2.5 transition ${airport.code === selectedAirportCode ? "bg-primary/10 ring-1 ring-primary/50" : ""} ${onNearbyAirportSelect ? "cursor-pointer hover:bg-secondary/40" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">{airport.code}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">{airport.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{airport.distance} nm</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{airport.weather}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        airport.pressure === "High" ? "bg-red-500/20 text-red-400" :
                        airport.pressure === "Medium" ? "bg-amber-500/20 text-amber-400" :
                        "bg-green-500/20 text-green-400"
                      }`}>
                        {airport.pressure} traffic
                      </span>
                      {airport.delays > 0 && (
                        <span className="text-amber-400">{airport.delays}m delay</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Weather Impact */}
          {activeFilters.includes("Weather") && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Weather Impact
                </h2>
              </div>
              <div className="glass-panel rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Wind</p>
                      <p className="text-xs font-medium text-foreground">{weatherImpact.windSpeed} kts @ {weatherImpact.windDirection}°</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Visibility</p>
                      <p className="text-xs font-medium text-foreground">{weatherImpact.visibility} sm</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowDown className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Ceiling</p>
                      <p className="text-xs font-medium text-foreground">{weatherImpact.ceiling.toLocaleString()} ft</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CloudRain className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Precipitation</p>
                      <p className="text-xs font-medium text-foreground">{weatherImpact.precipitation}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <span className="text-xs text-muted-foreground">Operational Risk</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    weatherImpact.operationalRisk === "High" ? "bg-red-500/20 text-red-400" :
                    weatherImpact.operationalRisk === "Medium" ? "bg-amber-500/20 text-amber-400" :
                    "bg-green-500/20 text-green-400"
                  }`}>
                    {weatherImpact.operationalRisk}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Enterprise Correlation */}
          {activeFilters.includes("Enterprise Events") && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-accent" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Enterprise Correlation
                </h2>
              </div>
              {enterpriseCorrelation.connected ? (
                <div className="glass-panel rounded-lg p-3 space-y-2.5 border-l-2 border-l-accent">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Matching Airport</span>
                    <span className="text-xs font-bold text-primary">{enterpriseCorrelation.matchingAirport}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Internal Delay Count</span>
                    <span className="text-xs font-medium text-amber-400">{enterpriseCorrelation.internalDelays}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Incident Severity</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      enterpriseCorrelation.incidentSeverity === "High" ? "bg-red-500/20 text-red-400" :
                      enterpriseCorrelation.incidentSeverity === "Medium" ? "bg-amber-500/20 text-amber-400" :
                      "bg-green-500/20 text-green-400"
                    }`}>
                      {enterpriseCorrelation.incidentSeverity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Affected Routes</span>
                    <span className="text-xs text-foreground">{enterpriseCorrelation.affectedRoutes.length} routes</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {enterpriseCorrelation.affectedRoutes.map((route) => (
                      <span key={route} className="px-1.5 py-0.5 rounded bg-secondary/50 text-[10px] text-muted-foreground">
                        {route}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 pt-1 text-[10px] text-muted-foreground">
                    <Database className="w-3 h-3" />
                    Last enterprise update: {enterpriseCorrelation.lastUpdate}
                  </div>
                </div>
              ) : (
                <div className="glass-panel rounded-lg p-4 text-center border-l-2 border-l-muted-foreground/30">
                  <Database className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-muted-foreground">Enterprise source not connected</p>
                  <button className="mt-2 text-[10px] text-primary hover:underline">Configure connection</button>
                </div>
              )}
            </section>
          )}

          {/* AI Suggested Questions */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                AI Suggested Questions
              </h2>
            </div>
            <div className="space-y-1.5">
              {suggestedQuestions.slice(0, 4).map((question, index) => (
                <button
                  key={index}
                  onClick={() => setAiQuestion(question)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 text-xs text-foreground transition-colors flex items-center gap-2 group"
                >
                  <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="truncate">{question}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>

      {/* Ask AI Input */}
      <div className="p-3 border-t border-border/30 space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Sparkles className="w-3 h-3 text-accent" />
          <span>Ask AI about this region</span>
        </div>
        <div className="relative">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAskAI()}
            placeholder="Ask about traffic, delays, weather impact..."
            className="w-full pl-3 pr-10 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            disabled={isAskingAI}
          />
          <button
            onClick={handleAskAI}
            disabled={!aiQuestion.trim() || isAskingAI}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isAskingAI ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Context: {aircraftInView} aircraft • {activeFilters.length} filters active
        </p>
      </div>
    </div>
  );
}

function ScannerCount({
  label,
  risk,
  scannerConflicts,
}: {
  label: string;
  risk: ScannerConflict["weatherAdjustedRisk"];
  scannerConflicts: ScannerConflict[];
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{scannerConflicts.filter((pair) => pair.weatherAdjustedRisk === risk).length}</span>
    </div>
  );
}
