"use client";

import { motion, useInView, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  Database,
  MessageSquare,
  Map,
  BarChart3,
  Plane,
  MapPin,
  CheckCircle2,
  TrendingUp,
  Send,
  Cloud,
  AlertTriangle,
  Activity,
  Zap,
  FileText,
  Shield,
  Target,
  Layers,
} from "lucide-react";

// ============================================================================
// STEP 1: CONNECT ENTERPRISE DATA
// ============================================================================

const dataSources = [
  { name: "Trino", icon: Database, color: "#22d3ee" },
  { name: "Starburst", icon: Layers, color: "#38bdf8" },
  { name: "PostgreSQL", icon: Database, color: "#60a5fa" },
  { name: "Snowflake", icon: Database, color: "#818cf8" },
  { name: "Iceberg", icon: Layers, color: "#a78bfa" },
];

function Step1Demo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { amount: 0.1 });
  const [phase, setPhase] = useState(0);
  const [connectedSources, setConnectedSources] = useState<number[]>([]);
  const [showDataFlow, setShowDataFlow] = useState(false);

  // Animation loop
  useEffect(() => {
    if (!isInView) return;

    const runAnimation = () => {
      setPhase(0);
      setConnectedSources([]);
      setShowDataFlow(false);

      // Phase 1-5: Connect sources one by one
      dataSources.forEach((_, index) => {
        setTimeout(() => {
          setConnectedSources((prev) => [...prev, index]);
        }, 600 + index * 700);
      });

      // Phase 6: Show data flow
      setTimeout(() => {
        setShowDataFlow(true);
      }, 600 + dataSources.length * 700 + 500);
    };

    runAnimation();
    const interval = setInterval(runAnimation, 10000);
    return () => clearInterval(interval);
  }, [isInView]);

  return (
    <div ref={containerRef} className="relative h-full min-h-[400px] flex items-center justify-center p-6">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `
              linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Data sources on the left */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        {dataSources.map((source, index) => {
          const isConnected = connectedSources.includes(index);
          const Icon = source.icon;

          return (
            <motion.div
              key={source.name}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
              className="relative"
            >
              <div
                className={`relative z-10 flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-500 ${
                  isConnected
                    ? "bg-[#1a2e3d] border border-cyan-500/40"
                    : "bg-[#0d1a24] border border-white/5"
                }`}
                style={{
                  boxShadow: isConnected
                    ? `0 0 20px ${source.color}30`
                    : "none",
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-500"
                  style={{
                    backgroundColor: isConnected
                      ? `${source.color}20`
                      : "rgba(255,255,255,0.05)",
                  }}
                >
                  <Icon
                    className="h-4 w-4 transition-colors duration-500"
                    style={{ color: isConnected ? source.color : "#64748b" }}
                  />
                </div>
                <span className="text-sm font-medium text-white/90 min-w-[80px]">
                  {source.name}
                </span>
                <AnimatePresence>
                  {isConnected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Connection line */}
              {isConnected && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="absolute left-[calc(100%-8px)] top-1/2 h-[1.5px] -translate-y-1/2 origin-left z-0 pointer-events-none"
                  style={{
                    width: `${140 - index * 10}px`,
                    background: `linear-gradient(to right, ${source.color}, transparent)`,
                    opacity: 0.7,
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Central SkyQuery Hub */}
      <motion.div
        className="absolute right-12 top-1/2 -translate-y-1/2"
        animate={showDataFlow ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="relative">
          {/* Outer glow ring */}
          <motion.div
            className="absolute -inset-6 rounded-full"
            animate={{
              boxShadow: showDataFlow
                ? [
                    "0 0 30px rgba(34, 211, 238, 0.3)",
                    "0 0 50px rgba(34, 211, 238, 0.5)",
                    "0 0 30px rgba(34, 211, 238, 0.3)",
                  ]
                : "0 0 20px rgba(34, 211, 238, 0.2)",
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />

          {/* Inner pulsing ring */}
          {showDataFlow && (
            <motion.div
              className="absolute -inset-4 rounded-full border-2 border-cyan-400/30"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}

          {/* Main hub */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
            <Plane className="h-9 w-9 text-white" />
          </div>

          {/* Connected badge */}
          <AnimatePresence>
            {showDataFlow && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap"
              >
                <div className="flex items-center gap-2 rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1.5">
                  <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-medium text-green-400">
                    All Sources Connected
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Data flow particles */}
      {showDataFlow && (
        <>
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-cyan-400 z-[5]"
              initial={{ left: "35%", top: `${25 + i * 8}%`, opacity: 0 }}
              animate={{
                left: ["35%", "70%"],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.5,
                delay: i * 0.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ============================================================================
// STEP 2: ASK QUESTIONS NATURALLY
// ============================================================================

function Step2Demo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { amount: 0.1 });
  const query = "Show ATL airport performance";
  const [typedText, setTypedText] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "typing" | "sending" | "loading" | "sql" | "results"
  >("idle");

  useEffect(() => {
    if (!isInView) return;

    let typeInterval: any;
    let t1: any, t2: any, t3: any, t4: any, t5: any;

    const runAnimation = () => {
      setTypedText("");
      setPhase("idle");
      if (typeInterval) clearInterval(typeInterval);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);

      // Start typing
      t1 = setTimeout(() => {
        setPhase("typing");
        let i = 0;
        typeInterval = setInterval(() => {
          if (i < query.length) {
            setTypedText(query.slice(0, i + 1));
            i++;
          } else {
            clearInterval(typeInterval);
          }
        }, 60);
      }, 500);

      // Send query
      t2 = setTimeout(() => setPhase("sending"), 2500);
      t3 = setTimeout(() => setPhase("loading"), 2800);
      t4 = setTimeout(() => setPhase("sql"), 4000);
      t5 = setTimeout(() => setPhase("results"), 5500);
    };

    runAnimation();
    const interval = setInterval(runAnimation, 12000);
    return () => {
      clearInterval(interval);
      if (typeInterval) clearInterval(typeInterval);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [isInView]);

  return (
    <div ref={containerRef} className="relative h-full min-h-[400px] flex flex-col p-6">
      {/* Chat interface */}
      <div className="flex-1 flex flex-col rounded-2xl bg-[#0a141c] border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20">
            <MessageSquare className="h-4 w-4 text-cyan-400" />
          </div>
          <span className="text-sm font-medium text-white/90">SkyQuery Chat</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-xs text-green-400">Online</span>
          </div>
        </div>

        {/* Chat body */}
        <div className="flex-1 p-4 space-y-4 overflow-hidden">
          {/* User message */}
          <AnimatePresence>
            {(phase === "typing" || phase !== "idle") && typedText && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end"
              >
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-cyan-600 px-4 py-2.5">
                  <p className="text-sm text-white">
                    {typedText}
                    {phase === "typing" && (
                      <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="inline-block w-0.5 h-4 bg-white ml-0.5 align-middle"
                      />
                    )}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading indicator */}
          <AnimatePresence>
            {phase === "loading" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20">
                  <Plane className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="rounded-2xl rounded-bl-sm bg-[#1a2836] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <motion.div
                      className="h-2 w-2 rounded-full bg-cyan-400"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                    />
                    <motion.div
                      className="h-2 w-2 rounded-full bg-cyan-400"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div
                      className="h-2 w-2 rounded-full bg-cyan-400"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SQL Preview */}
          <AnimatePresence>
            {(phase === "sql" || phase === "results") && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 shrink-0">
                  <Plane className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="rounded-xl bg-[#0d1820] border border-white/5 p-3 font-mono text-xs overflow-x-auto">
                    <span className="text-cyan-400">SELECT</span>{" "}
                    <span className="text-white/80">delay_rate, on_time_pct, total_flights</span>
                    <br />
                    <span className="text-cyan-400">FROM</span>{" "}
                    <span className="text-white/80">aviation.airport_metrics</span>
                    <br />
                    <span className="text-cyan-400">WHERE</span>{" "}
                    <span className="text-white/80">airport_code =</span>{" "}
                    <span className="text-amber-400">&apos;ATL&apos;</span>
                  </div>

                  {/* Results */}
                  <AnimatePresence>
                    {phase === "results" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 p-4"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className="h-4 w-4 text-cyan-400" />
                          <span className="font-semibold text-white">
                            ATL Performance Today
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3 }}
                            className="rounded-lg bg-black/30 p-3 text-center"
                          >
                            <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1">
                              On-Time
                            </p>
                            <p className="text-xl font-bold text-green-400">87.6%</p>
                          </motion.div>
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.4 }}
                            className="rounded-lg bg-black/30 p-3 text-center"
                          >
                            <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1">
                              Delay Rate
                            </p>
                            <p className="text-xl font-bold text-amber-400">12.4%</p>
                          </motion.div>
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 }}
                            className="rounded-lg bg-black/30 p-3 text-center"
                          >
                            <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1">
                              Flights
                            </p>
                            <p className="text-xl font-bold text-cyan-400">2,847</p>
                          </motion.div>
                        </div>

                        {/* Source trace badge */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.6 }}
                          className="mt-3 flex items-center gap-2"
                        >
                          <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                            <Shield className="h-3 w-3 text-green-400" />
                            <span className="text-[10px] text-white/60">
                              Source: enterprise.flight_data
                            </span>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 rounded-xl bg-[#1a2836] px-4 py-3">
            <input
              type="text"
              placeholder="Ask anything about your aviation data..."
              className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
              readOnly
            />
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-white">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 3: DISCOVER LIVE AVIATION CONTEXT
// ============================================================================

type AirportStatus = "normal" | "weather" | "delay";

const airports: {
  code: string;
  city: string;
  lat: number;
  lng: number;
  status: AirportStatus;
  detail: string;
}[] = [
  { code: "SEA", city: "Seattle", lat: 47.4502, lng: -122.3088, status: "normal", detail: "Normal flow" },
  { code: "SFO", city: "San Francisco", lat: 37.6213, lng: -122.379, status: "weather", detail: "Coastal ceiling" },
  { code: "LAX", city: "Los Angeles", lat: 33.9416, lng: -118.4085, status: "normal", detail: "Normal flow" },
  { code: "DEN", city: "Denver", lat: 39.8561, lng: -104.6737, status: "normal", detail: "Normal flow" },
  { code: "DFW", city: "Dallas-Fort Worth", lat: 32.8998, lng: -97.0403, status: "delay", detail: "Delay impacted" },
  { code: "ORD", city: "Chicago", lat: 41.9742, lng: -87.9073, status: "normal", detail: "Normal flow" },
  { code: "ATL", city: "Atlanta", lat: 33.6407, lng: -84.4277, status: "normal", detail: "Normal flow" },
  { code: "MIA", city: "Miami", lat: 25.7959, lng: -80.287, status: "normal", detail: "Normal flow" },
  { code: "JFK", city: "New York", lat: 40.6413, lng: -73.7781, status: "weather", detail: "Weather impacted" },
  { code: "BOS", city: "Boston", lat: 42.3656, lng: -71.0096, status: "normal", detail: "Normal flow" },
];

const routeNetwork = [
  { id: 1, flight: "SKY421", from: "LAX", to: "JFK", status: "normal" as AirportStatus, eta: "3h 42m" },
  { id: 2, flight: "SEA118", from: "SEA", to: "ORD", status: "normal" as AirportStatus, eta: "2h 18m" },
  { id: 3, flight: "SFO302", from: "SFO", to: "ATL", status: "weather" as AirportStatus, eta: "3h 05m" },
  { id: 4, flight: "OPS744", from: "DFW", to: "MIA", status: "delay" as AirportStatus, eta: "1h 36m" },
  { id: 5, flight: "BOS128", from: "BOS", to: "ATL", status: "normal" as AirportStatus, eta: "1h 54m" },
];

function statusColor(status: AirportStatus) {
  if (status === "weather") return "#fbbf24";
  if (status === "delay") return "#f87171";
  return "#22d3ee";
}

function statusLabel(status: AirportStatus) {
  if (status === "weather") return "Weather impacted";
  if (status === "delay") return "Delay impacted";
  return "Normal";
}

function airportByCode(code: string) {
  return airports.find((airport) => airport.code === code) ?? airports[0];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function interpolateLatLng(route: (typeof routeNetwork)[number], progress: number) {
  const from = airportByCode(route.from);
  const to = airportByCode(route.to);
  const bow = Math.min(6, Math.max(2.4, Math.abs(from.lng - to.lng) * 0.12));
  const t = progress;
  const lat = from.lat + (to.lat - from.lat) * t + Math.sin(Math.PI * t) * bow;
  const lng = from.lng + (to.lng - from.lng) * t;

  return { lat, lng };
}

function routeHeading(map: any, route: (typeof routeNetwork)[number], progress: number) {
  const current = interpolateLatLng(route, progress);
  const next = interpolateLatLng(route, Math.min(progress + 0.005, 1));
  const dLng = next.lng - current.lng;
  const dLat = next.lat - current.lat;
  return Math.atan2(dLng, dLat) * (180 / Math.PI);
}

function smoothHeading(previous: number | undefined, next: number) {
  if (previous === undefined) return next;
  const delta = ((next - previous + 540) % 360) - 180;
  return previous + delta * 0.22;
}

function routePoints(route: (typeof routeNetwork)[number]) {
  return Array.from({ length: 42 }, (_, index) => {
    const point = interpolateLatLng(route, index / 41);
    return [point.lat, point.lng] as [number, number];
  });
}

function airportIconHtml(airport: (typeof airports)[number]) {
  const color = statusColor(airport.status);
  return `
    <span style="position:relative;display:flex;height:28px;width:28px;align-items:center;justify-content:center;">
      <span style="position:absolute;height:22px;width:22px;border-radius:999px;border:1px solid ${color};opacity:.32;box-shadow:0 0 18px ${color};"></span>
      <span style="height:8px;width:8px;border-radius:999px;background:${color};box-shadow:0 0 14px ${color};"></span>
      <span style="position:absolute;top:21px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:700;color:rgba(255,255,255,.68);letter-spacing:.04em;">${airport.code}</span>
    </span>
  `;
}

function planeIconHtml(heading: number, status: AirportStatus) {
  const color = statusColor(status);
  return `
    <svg data-tour-plane-icon xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      style="transform:rotate(${heading}deg);filter:drop-shadow(0 0 4px ${color});">
      <path fill="${color}" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L14 19v-5.5L21 16z"/>
    </svg>
  `;
}

function Step3Demo() {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const aircraftElementsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const aircraftIconElementsRef = useRef<Array<SVGSVGElement | null>>([]);
  const aircraftMarkersRef = useRef<Array<{ marker: any; iconElement: SVGElement | null }>>([]);
  const previousHeadingRef = useRef<Array<number | undefined>>([]);
  const progressRef = useRef([0, 0.22, 0.48, 0.7, 0.86]);
  const refreshMapSizeRef = useRef<(() => void) | null>(null);
  const [pinnedFlightId, setPinnedFlightId] = useState<number | null>(null);
  
  const isInView = useInView(mapHostRef, { amount: 0.1 });
  const shouldReduceMotion = useReducedMotion();

  const isInViewRef = useRef(false);
  const shouldReduceMotionRef = useRef(shouldReduceMotion);

  useEffect(() => {
    isInViewRef.current = isInView;
  }, [isInView]);

  useEffect(() => {
    shouldReduceMotionRef.current = shouldReduceMotion;
  }, [shouldReduceMotion]);

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;

    async function initializeMap() {
      if (!mapHostRef.current || mapRef.current) return;
      const imported = await import("leaflet");
      if (cancelled || !mapHostRef.current) return;

      const L = imported.default ?? imported;
      leafletRef.current = L;

      const map = L.map(mapHostRef.current, {
        attributionControl: false,
        center: [38.5, -96],
        doubleClickZoom: false,
        dragging: false,
        keyboard: false,
        scrollWheelZoom: false,
        touchZoom: false,
        zoom: 4,
        zoomControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 18,
        subdomains: "abcd",
      }).addTo(map);

      map.createPane("tourRoutes");
      map.getPane("tourRoutes")!.style.zIndex = "410";
      map.createPane("tourAirports");
      map.getPane("tourAirports")!.style.zIndex = "430";
      map.createPane("tourAircraft");
      map.getPane("tourAircraft")!.style.zIndex = "450";

      routeNetwork.forEach((route) => {
        const color = statusColor(route.status);
        L.polyline(routePoints(route), {
          color,
          dashArray: route.status === "normal" ? "3 7" : "4 6",
          opacity: route.status === "normal" ? 0.34 : 0.56,
          pane: map.getPane("tourRoutes") ? "tourRoutes" : undefined,
          weight: route.status === "normal" ? 1.2 : 1.6,
        }).addTo(map);
      });

      airports.forEach((airport) => {
        const color = statusColor(airport.status);
        L.marker([airport.lat, airport.lng], {
          icon: L.divIcon({
            className: "skyquery-tour-airport-marker",
            html: airportIconHtml(airport),
            iconAnchor: [14, 14],
            iconSize: [28, 28],
          }),
          keyboard: false,
          pane: map.getPane("tourAirports") ? "tourAirports" : undefined,
          riseOnHover: true,
        })
          .bindTooltip(
            `<div class="discover-airport-tooltip"><strong>${escapeHtml(airport.code)}</strong><span>${escapeHtml(airport.city)}</span><span style="color:${color}">${statusLabel(airport.status)}</span></div>`,
            { className: "discover-airport-tooltip-shell", direction: "top", offset: [0, -12], opacity: 0.96, sticky: true }
          )
          .bindPopup(
            `<div class="discover-airport-popup"><strong>${escapeHtml(airport.code)}</strong><span>${escapeHtml(airport.city)}</span><span style="color:${color}">${statusLabel(airport.status)}</span><span>${escapeHtml(airport.detail)}</span></div>`,
            { className: "discover-airport-popup-shell" }
          )
          .addTo(map);
      });

      aircraftMarkersRef.current = routeNetwork.map((route, index) => {
        const point = interpolateLatLng(route, progressRef.current[index] ?? 0);
        const heading = routeHeading(map, route, progressRef.current[index] ?? 0);
        const color = statusColor(route.status);
        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: "skyquery-tour-aircraft-marker",
            html: planeIconHtml(heading, route.status),
            iconAnchor: [11, 11],
            iconSize: [22, 22],
          }),
          keyboard: false,
          pane: map.getPane("tourAircraft") ? "tourAircraft" : undefined,
          riseOnHover: true,
        })
          .bindTooltip(
            `<div class="discover-airport-tooltip"><strong>${escapeHtml(route.flight)}</strong><span>${route.from} → ${route.to}</span><span style="color:${color}">${statusLabel(route.status)}</span><span>ETA ${escapeHtml(route.eta)}</span></div>`,
            { className: "discover-airport-tooltip-shell", direction: "top", offset: [0, -12], opacity: 0.96, sticky: true }
          )
          .bindPopup(
            `<div class="discover-airport-popup"><strong>${escapeHtml(route.flight)}</strong><span>${route.from} → ${route.to}</span><span style="color:${color}">${statusLabel(route.status)}</span><span>ETA ${escapeHtml(route.eta)}</span></div>`,
            { className: "discover-airport-popup-shell" }
          )
          .addTo(map);
        return {
          marker,
          iconElement: marker.getElement()?.querySelector("[data-tour-plane-icon]") as SVGElement | null,
        };
      });
      // Fit map bounds

      const bounds = L.latLngBounds(airports.map((airport) => [airport.lat, airport.lng]));
      map.fitBounds(bounds, { padding: [42, 42] });
      mapRef.current = map;
      const refreshMapSize = () => map.invalidateSize({ pan: false });
      refreshMapSizeRef.current = refreshMapSize;
      window.addEventListener("resize", refreshMapSize);

      const animate = () => {
        if (isInViewRef.current && !shouldReduceMotionRef.current) {
          aircraftMarkersRef.current.forEach((aircraft, index) => {
            const route = routeNetwork[index];
            progressRef.current[index] = (progressRef.current[index] + 0.0017 + index * 0.00012) % 1;
            const point = interpolateLatLng(route, progressRef.current[index]);
            const heading = routeHeading(map, route, progressRef.current[index]);
            aircraft.marker.setLatLng([point.lat, point.lng]);
            const iconElement =
              aircraft.iconElement ??
              (aircraft.marker.getElement()?.querySelector("[data-tour-plane-icon]") as SVGElement | null);
            aircraft.iconElement = iconElement;
            if (iconElement) iconElement.style.transform = `rotate(${heading}deg)`;
          });
        }
        animationFrame = requestAnimationFrame(animate);
      };

      animationFrame = requestAnimationFrame(animate);
    }

    initializeMap();

    return () => {
      cancelled = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (refreshMapSizeRef.current) {
        window.removeEventListener("resize", refreshMapSizeRef.current);
        refreshMapSizeRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
      aircraftMarkersRef.current = [];
    };
  }, []);

  return (
    <div className="relative h-full min-h-[400px] rounded-2xl bg-[#050a10] border border-white/10 overflow-hidden">
      <div ref={mapHostRef} className="absolute inset-0" aria-label="US aviation operations map" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,transparent_38%,rgba(5,10,16,0.38)_88%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34, 211, 238, 0.11) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.11) 1px, transparent 1px)
          `,
          backgroundSize: "36px 36px",
        }}
      />
      <motion.div
        animate={{ opacity: [0.18, 0.34, 0.18], scale: [0.92, 1.04, 0.92] }}
        className="pointer-events-none absolute left-[6%] top-[32%] h-24 w-28 rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(251, 191, 36, 0.28) 0%, transparent 70%)" }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        animate={{ opacity: [0.16, 0.3, 0.16], scale: [0.94, 1.06, 0.94] }}
        className="pointer-events-none absolute right-[11%] top-[28%] h-28 w-32 rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(251, 191, 36, 0.3) 0%, transparent 72%)" }}
        transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
      <motion.div
        animate={{ opacity: [0.12, 0.24, 0.12], scale: [0.95, 1.05, 0.95] }}
        className="pointer-events-none absolute left-[43%] top-[56%] h-24 w-28 rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(248, 113, 113, 0.24) 0%, transparent 72%)" }}
        transition={{ duration: 4.1, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4">
        {[
          { label: "Normal", color: statusColor("normal") },
          { label: "Weather", color: statusColor("weather") },
          { label: "Delay", color: statusColor("delay") },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[9px] text-white/50">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Live indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
        <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] font-medium text-green-400">LIVE</span>
      </div>

      {/* Stats panel */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-4 right-4 rounded-lg bg-[#0d1820]/90 border border-white/10 p-3"
      >
        <p className="text-[9px] text-white/50 uppercase tracking-wider mb-2">
          Network Status
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-white/70">Active Flights</span>
            <span className="text-[10px] font-semibold text-cyan-400">4,847</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-white/70">Avg Delay</span>
            <span className="text-[10px] font-semibold text-amber-400">14 min</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// STEP 4: GET ENTERPRISE INTELLIGENCE
// ============================================================================

function Step4Demo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { amount: 0.1 });
  const [phase, setPhase] = useState(0);
  const [chartProgress, setChartProgress] = useState(0);
  const [riskScore, setRiskScore] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    let chartInterval: any;
    let scoreInterval: any;
    let t1: any, t2: any, t3: any, t4: any, t5: any;

    const runAnimation = () => {
      setPhase(0);
      setChartProgress(0);
      setRiskScore(0);
      if (chartInterval) clearInterval(chartInterval);
      if (scoreInterval) clearInterval(scoreInterval);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);

      // Phase 1: Start analysis
      t1 = setTimeout(() => setPhase(1), 500);

      // Phase 2: Animate chart
      t2 = setTimeout(() => {
        setPhase(2);
        let progress = 0;
        chartInterval = setInterval(() => {
          progress += 3;
          setChartProgress(Math.min(progress, 100));
          if (progress >= 100) clearInterval(chartInterval);
        }, 30);
      }, 1500);

      // Phase 3: Show cards
      t3 = setTimeout(() => setPhase(3), 3500);

      // Phase 4: Update risk score
      t4 = setTimeout(() => {
        setPhase(4);
        let score = 0;
        scoreInterval = setInterval(() => {
          score += 2;
          setRiskScore(Math.min(score, 72));
          if (score >= 72) clearInterval(scoreInterval);
        }, 30);
      }, 4500);

      // Phase 5: Show insights
      t5 = setTimeout(() => setPhase(5), 6000);
    };

    runAnimation();
    const interval = setInterval(runAnimation, 14000);
    return () => {
      clearInterval(interval);
      if (chartInterval) clearInterval(chartInterval);
      if (scoreInterval) clearInterval(scoreInterval);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [isInView]);

  // Real aviation performance data for the trend line
  const trendData = [
    { month: "Jan", onTime: 82, delayed: 12, cancelled: 6 },
    { month: "Feb", onTime: 78, delayed: 15, cancelled: 7 },
    { month: "Mar", onTime: 85, delayed: 10, cancelled: 5 },
    { month: "Apr", onTime: 88, delayed: 8, cancelled: 4 },
    { month: "May", onTime: 91, delayed: 6, cancelled: 3 },
    { month: "Jun", onTime: 89, delayed: 7, cancelled: 4 },
    { month: "Jul", onTime: 86, delayed: 9, cancelled: 5 },
    { month: "Aug", onTime: 92, delayed: 5, cancelled: 3 },
  ];

  // Fixed pixel coordinate system – avoids preserveAspectRatio="none" distortion
  const SVG_W = 480;
  const SVG_H = 130;
  const PAD = { top: 22, bottom: 10, left: 4, right: 20 };
  const plotW = SVG_W - PAD.left - PAD.right;
  const plotH = SVG_H - PAD.top - PAD.bottom;
  const maxValue = 100;
  // chartHeight kept for grid-line helper (pixel height of the rendered SVG div)
  const chartHeight = 150;

  const ptX = (i: number) => PAD.left + (i / (trendData.length - 1)) * plotW;
  const ptY = (val: number) => PAD.top + (1 - val / maxValue) * plotH;

  // Generate smooth bezier path through visible data points
  const generatePath = (data: number[], progress: number) => {
    const visibleCount = Math.ceil((data.length * progress) / 100);
    const points = data.slice(0, visibleCount);
    if (points.length < 2) return "";
    let path = `M ${ptX(0)} ${ptY(points[0])}`;
    for (let i = 1; i < points.length; i++) {
      const x0 = ptX(i - 1), y0 = ptY(points[i - 1]);
      const x1 = ptX(i),     y1 = ptY(points[i]);
      const cpx = (x0 + x1) / 2;
      path += ` C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
    }
    return path;
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-[450px] p-5 space-y-4">
      {/* Analysis header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 border border-purple-500/30">
            <TrendingUp className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-white block">
              On-Time Performance Trend
            </span>
            <span className="text-[10px] text-white/40">Last 8 months analysis</span>
          </div>
        </div>
        {phase >= 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"
          >
            {phase < 5 ? (
              <>
                <motion.div
                  className="h-2 w-2 rounded-full bg-purple-400"
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                <span className="text-[10px] text-purple-400 font-medium">Live Analysis</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-green-400" />
                <span className="text-[10px] text-green-400 font-medium">Complete</span>
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* Main chart area */}
      <div className="rounded-xl border border-white/10 relative" style={{ background: "linear-gradient(180deg, #1a1130 0%, #0d0a1f 60%, #06050f 100%)" }}>

        {/* Y-axis labels – positioned over the chart */}
        <div className="absolute left-2 flex flex-col justify-between text-[9px] text-white/30 pointer-events-none z-10"
          style={{ top: 12, height: chartHeight }}>
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        {/* Chart SVG – fixed pixel viewBox, no aspect distortion */}
        <div className="relative ml-8 mr-1 mt-3 mb-0" style={{ height: chartHeight }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            height={chartHeight}
            style={{ overflow: "visible" }}
          >
            <defs>
              <linearGradient id="lineGradientV2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#22d3ee" />
                <stop offset="45%"  stopColor="#a78bfa" />
                <stop offset="75%"  stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <linearGradient id="areaGradientV2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.4" />
                <stop offset="60%"  stopColor="#4c1d95" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#1e1040" stopOpacity="0" />
              </linearGradient>
              {/* Subtle glow on the line only – low blur */}
              <filter id="lineGlowV2" x="-2%" y="-80%" width="104%" height="260%">
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Horizontal grid lines */}
            {[0, 25, 50, 75, 100].map((v) => (
              <line
                key={v}
                x1={PAD.left} x2={SVG_W - PAD.right}
                y1={ptY(v)}   y2={ptY(v)}
                stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"
              />
            ))}

            {/* Area fill */}
            {phase >= 2 && (() => {
              const visibleCount = Math.ceil((trendData.length * chartProgress) / 100);
              const lastI = Math.max(0, visibleCount - 1);
              const areaPath = `${generatePath(trendData.map(d => d.onTime), chartProgress)} L ${ptX(lastI)} ${ptY(0)} L ${ptX(0)} ${ptY(0)} Z`;
              return (
                <motion.path
                  d={areaPath}
                  fill="url(#areaGradientV2)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8 }}
                />
              );
            })()}

            {/* Soft glow behind the line */}
            {phase >= 2 && (
              <motion.path
                d={generatePath(trendData.map(d => d.onTime), chartProgress)}
                fill="none"
                stroke="#a78bfa"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.28 }}
                transition={{ duration: 2, ease: "easeOut" }}
                style={{ filter: "blur(3px)" }}
              />
            )}

            {/* Main trend line */}
            {phase >= 2 && (
              <motion.path
                d={generatePath(trendData.map(d => d.onTime), chartProgress)}
                fill="none"
                stroke="url(#lineGradientV2)"
                strokeWidth="1.5"
                strokeLinecap="round"
                filter="url(#lineGlowV2)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
            )}

            {/* Data points – properly sized in pixel space */}
            {phase >= 2 && trendData.slice(0, Math.ceil((trendData.length * chartProgress) / 100)).map((data, i) => {
              const cx = ptX(i);
              const cy = ptY(data.onTime);
              return (
                <motion.g key={i}>
                  {/* Animated pulse halo */}
                  <motion.circle
                    cx={cx} cy={cy} r={7}
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="0.8"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: [0, 0.4, 0], scale: [0.8, 1.5, 1.9] }}
                    transition={{ delay: i * 0.15 + 0.7, duration: 2, repeat: Infinity, repeatDelay: 2.5 }}
                  />
                  {/* Hollow ring */}
                  <motion.circle
                    cx={cx} cy={cy} r={4}
                    fill="rgba(13,10,31,0.92)"
                    stroke="#a78bfa"
                    strokeWidth="1.2"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.12 + 0.3, type: "spring", stiffness: 320 }}
                  />
                  {/* Centre dot */}
                  <motion.circle
                    cx={cx} cy={cy} r={1.5}
                    fill="#c4b5fd"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.12 + 0.5 }}
                  />
                </motion.g>
              );
            })}

            {/* Value badge on last visible point */}
            {phase >= 3 && (() => {
              const lastIdx = trendData.length - 1;
              const bx = ptX(lastIdx);
              const by = ptY(trendData[lastIdx].onTime);
              return (
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                  <rect x={bx - 16} y={by - 26} width="32" height="16" rx="4" fill="#7c3aed" />
                  <text x={bx} y={by - 14} textAnchor="middle" fill="white" fontSize="7.5" fontWeight="bold">
                    {trendData[lastIdx].onTime}%
                  </text>
                </motion.g>
              );
            })()}
          </svg>

          {/* X-axis labels – aligned to SVG column positions */}
          <div className="flex justify-between mt-1" style={{ paddingLeft: PAD.left, paddingRight: PAD.right }}>
            {trendData.map((data, i) => (
              <motion.span
                key={data.month}
                className="text-[9px] text-white/35"
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 2 && i < Math.ceil((trendData.length * chartProgress) / 100) ? 1 : 0 }}
                transition={{ delay: i * 0.1 }}
              >
                {data.month}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-3 pb-3 pt-2 border-t border-white/5 mt-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-px rounded" style={{ background: "linear-gradient(90deg, #22d3ee, #a78bfa)" }} />
            <span className="text-[10px] text-white/50">On-Time Rate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-green-400" />
            <span className="text-[10px] text-green-400">+10% YoY</span>
          </div>
        </div>
      </div>


      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <AnimatePresence>
          {phase >= 3 && (
            <>
              {[
                { label: "Avg On-Time", value: "86.4%", trend: "+5.2%", color: "cyan", icon: Activity },
                { label: "Peak Month", value: "Aug", trend: "92%", color: "purple", icon: TrendingUp },
                { label: "Improved", value: "6/8", trend: "months", color: "green", icon: CheckCircle2 },
                { label: "Confidence", value: "94%", trend: "high", color: "amber", icon: Target },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-lg bg-[#060d14] border border-white/10 p-2.5"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <stat.icon className={`h-3 w-3 text-${stat.color}-400`} style={{ color: stat.color === 'cyan' ? '#22d3ee' : stat.color === 'purple' ? '#a78bfa' : stat.color === 'green' ? '#4ade80' : '#fbbf24' }} />
                    <span className="text-[9px] text-white/40 truncate">{stat.label}</span>
                  </div>
                  <p className="text-base font-bold text-white">{stat.value}</p>
                  <span className="text-[9px] text-white/30">{stat.trend}</span>
                </motion.div>
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Source trace footer */}
      <AnimatePresence>
        {phase >= 5 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between pt-2 border-t border-white/5"
          >
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-green-400" />
              <span className="text-[10px] text-white/40">
                Data: flight_ops.performance_metrics, aviation.schedule_data
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-3 w-3 text-green-400" />
              <span className="text-[9px] text-green-400 font-medium">Verified</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// STEP CONFIG & INFO COMPONENT
// ============================================================================

const steps = [
  {
    number: "01",
    title: "Connect Enterprise Data",
    description:
      "Seamlessly integrate your existing data infrastructure. SkyQuery connects to Trino, Starburst, PostgreSQL, Snowflake, and more without moving your data.",
    benefits: [
      "Direct SQL access to existing systems",
      "Real-time data synchronization",
      "Zero data movement required",
      "Enterprise-grade security",
    ],
    color: "#22d3ee",
    icon: Database,
  },
  {
    number: "02",
    title: "Ask Questions Naturally",
    description:
      "No SQL required. Ask questions in plain English and get instant, accurate answers from your enterprise data with full query transparency.",
    benefits: [
      "Natural language to SQL generation",
      "Full query transparency",
      "Context-aware responses",
      "Source traceability",
    ],
    color: "#38bdf8",
    icon: MessageSquare,
  },
  {
    number: "03",
    title: "Discover Live Aviation Context",
    description:
      "Real-time visibility into operational context. Monitor weather patterns, track delays, and understand conditions across your entire network.",
    benefits: [
      "Real-time weather overlays",
      "Operational risk indicators",
      "Network-wide visibility",
      "Predictive alerts",
    ],
    color: "#34d399",
    icon: Map,
  },
  {
    number: "04",
    title: "Get Enterprise Intelligence",
    description:
      "Transform complex aviation data into actionable insights with interactive visualizations. Track trends, identify patterns, and make data-driven decisions.",
    benefits: [
      "Interactive dashboards",
      "Historical trend analysis",
      "Predictive insights",
      "Automated reporting",
    ],
    color: "#a78bfa",
    icon: BarChart3,
  },
];

function StepInfo({ step, isActive }: { step: (typeof steps)[0]; isActive: boolean }) {
  const Icon = step.icon;

  return (
    <div className="h-full flex flex-col justify-center py-8 lg:py-12">
      {/* Step badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm mb-4 w-fit"
        style={{
          backgroundColor: `${step.color}15`,
          color: step.color,
        }}
      >
        <span className="font-mono text-xs font-semibold">{step.number}</span>
        <span className="font-medium">
          {step.number === "01"
            ? "Connect"
            : step.number === "02"
            ? "Query"
            : step.number === "03"
            ? "Discover"
            : "Analyze"}
        </span>
      </motion.div>

      {/* Title */}
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 text-balance"
      >
        {step.title}
      </motion.h3>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
        className="text-white/60 text-base lg:text-lg mb-6 leading-relaxed"
      >
        {step.description}
      </motion.p>

      {/* Benefits list */}
      <motion.ul
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        {step.benefits.map((benefit, i) => (
          <li key={i} className="flex items-center gap-3 text-white/70 text-sm">
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full shrink-0"
              style={{ backgroundColor: `${step.color}20` }}
            >
              <Icon className="h-3 w-3" style={{ color: step.color }} />
            </div>
            {benefit}
          </li>
        ))}
      </motion.ul>

      {/* Progress indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4 }}
        className="mt-8 flex items-center gap-2"
      >
        {steps.map((s, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: s.number === step.number ? 32 : 8,
              backgroundColor:
                s.number === step.number ? step.color : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}

// ============================================================================
// MAIN WALKTHROUGH SECTION
// ============================================================================

function WalkthroughStep({
  step,
  DemoComponent,
  reverse = false,
}: {
  step: (typeof steps)[0];
  DemoComponent: React.ComponentType;
  reverse?: boolean;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, margin: "-20%" });

  return (
    <section
      ref={ref}
      className="relative min-h-screen py-16 lg:py-24"
      style={{
        background: `linear-gradient(to bottom, 
          rgba(5, 10, 20, 1) 0%, 
          rgba(8, 15, 25, 1) 50%, 
          rgba(5, 10, 20, 1) 100%
        )`,
      }}
    >
      {/* Subtle top border glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 opacity-30"
        style={{
          background: `linear-gradient(to right, transparent, ${step.color}, transparent)`,
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={`grid gap-8 lg:gap-16 lg:grid-cols-2 items-center ${
            reverse ? "lg:grid-flow-dense" : ""
          }`}
        >
          {/* Info column */}
          <div className={reverse ? "lg:col-start-2" : ""}>
            <StepInfo step={step} isActive={isInView} />
          </div>

          {/* Demo column */}
          <div className={reverse ? "lg:col-start-1" : ""}>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative rounded-2xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(145deg, rgba(15, 25, 35, 0.9) 0%, rgba(8, 15, 25, 0.95) 100%)",
                border: `1px solid ${step.color}20`,
                boxShadow: `0 0 60px ${step.color}10, inset 0 0 30px rgba(0,0,0,0.3)`,
              }}
            >
              {/* Corner accents */}
              <div
                className="absolute top-0 left-0 w-16 h-px"
                style={{ background: `linear-gradient(to right, ${step.color}50, transparent)` }}
              />
              <div
                className="absolute top-0 left-0 w-px h-16"
                style={{ background: `linear-gradient(to bottom, ${step.color}50, transparent)` }}
              />
              <div
                className="absolute bottom-0 right-0 w-16 h-px"
                style={{ background: `linear-gradient(to left, ${step.color}50, transparent)` }}
              />
              <div
                className="absolute bottom-0 right-0 w-px h-16"
                style={{ background: `linear-gradient(to top, ${step.color}50, transparent)` }}
              />

              <DemoComponent />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GuidedWalkthrough() {
  return (
    <div id="discover" className="relative">
      {/* Section header */}
      <section className="relative py-20 lg:py-28 overflow-hidden bg-[#050a14]">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `
                radial-gradient(circle at 30% 40%, rgba(34, 211, 238, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 70% 60%, rgba(167, 139, 250, 0.1) 0%, transparent 50%)
              `,
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-4 py-1.5 text-sm text-cyan-400 mb-6"
          >
            <Zap className="h-4 w-4" />
            <span className="font-medium">How It Works</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 text-balance"
          >
            From Data to Intelligence in{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
              Four Simple Steps
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/60 max-w-2xl mx-auto"
          >
            See how SkyQuery transforms your aviation data workflow with an
            intuitive, AI-powered approach to enterprise intelligence.
          </motion.p>
        </div>
      </section>

      {/* Step sections */}
      <WalkthroughStep step={steps[0]} DemoComponent={Step1Demo} />
      <WalkthroughStep step={steps[1]} DemoComponent={Step2Demo} reverse />
      <WalkthroughStep step={steps[2]} DemoComponent={Step3Demo} />
      <WalkthroughStep step={steps[3]} DemoComponent={Step4Demo} reverse />
    </div>
  );
}
