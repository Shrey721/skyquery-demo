"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
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
  const [phase, setPhase] = useState(0);
  const [connectedSources, setConnectedSources] = useState<number[]>([]);
  const [showDataFlow, setShowDataFlow] = useState(false);

  // Animation loop
  useEffect(() => {
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
  }, []);

  return (
    <div className="relative h-full min-h-[400px] flex items-center justify-center p-6">
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
  const query = "Show ATL airport performance";
  const [typedText, setTypedText] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "typing" | "sending" | "loading" | "sql" | "results"
  >("idle");

  useEffect(() => {
    const runAnimation = () => {
      setTypedText("");
      setPhase("idle");

      // Start typing
      setTimeout(() => {
        setPhase("typing");
        let i = 0;
        const typeInterval = setInterval(() => {
          if (i < query.length) {
            setTypedText(query.slice(0, i + 1));
            i++;
          } else {
            clearInterval(typeInterval);
          }
        }, 60);
      }, 500);

      // Send query
      setTimeout(() => setPhase("sending"), 2500);
      setTimeout(() => setPhase("loading"), 2800);
      setTimeout(() => setPhase("sql"), 4000);
      setTimeout(() => setPhase("results"), 5500);
    };

    runAnimation();
    const interval = setInterval(runAnimation, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-full min-h-[400px] flex flex-col p-6">
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

const airports = [
  { code: "SEA", x: 12, y: 22, status: "normal" },
  { code: "SFO", x: 10, y: 42, status: "weather" },
  { code: "LAX", x: 14, y: 52, status: "normal" },
  { code: "DEN", x: 32, y: 38, status: "normal" },
  { code: "DFW", x: 38, y: 55, status: "delay" },
  { code: "ORD", x: 52, y: 32, status: "normal" },
  { code: "ATL", x: 58, y: 48, status: "normal" },
  { code: "MIA", x: 62, y: 68, status: "normal" },
  { code: "JFK", x: 72, y: 32, status: "weather" },
  { code: "BOS", x: 76, y: 26, status: "normal" },
];

function Step3Demo() {
  const [activeAirport, setActiveAirport] = useState<string | null>(null);
  const [showWeather, setShowWeather] = useState(false);
  const [aircraftPositions, setAircraftPositions] = useState<
    { id: number; progress: number; route: number }[]
  >([]);

  useEffect(() => {
    // Initialize aircraft
    setAircraftPositions([
      { id: 1, progress: 0, route: 0 },
      { id: 2, progress: 0.3, route: 1 },
      { id: 3, progress: 0.6, route: 2 },
    ]);

    // Show weather overlay
    const weatherTimer = setTimeout(() => setShowWeather(true), 1000);

    // Cycle through airports
    let currentIndex = 0;
    const airportInterval = setInterval(() => {
      setActiveAirport(airports[currentIndex].code);
      currentIndex = (currentIndex + 1) % airports.length;
    }, 2000);

    // Animate aircraft
    const aircraftInterval = setInterval(() => {
      setAircraftPositions((prev) =>
        prev.map((a) => ({
          ...a,
          progress: (a.progress + 0.02) % 1,
        }))
      );
    }, 50);

    return () => {
      clearTimeout(weatherTimer);
      clearInterval(airportInterval);
      clearInterval(aircraftInterval);
    };
  }, []);

  const routes = [
    { from: { x: 10, y: 42 }, to: { x: 72, y: 32 } }, // SFO to JFK
    { from: { x: 14, y: 52 }, to: { x: 52, y: 32 } }, // LAX to ORD
    { from: { x: 58, y: 48 }, to: { x: 12, y: 22 } }, // ATL to SEA
  ];

  return (
    <div className="relative h-full min-h-[400px] rounded-2xl bg-[#050a10] border border-white/10 overflow-hidden">
      {/* Radar grid background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, transparent 0%, #050a10 70%),
            linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 30px 30px, 30px 30px",
        }}
      />

      {/* US map outline (simplified) */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        <path
          d="M8,25 Q15,20 25,22 T45,25 T65,22 T78,28 Q82,35 80,45 Q78,55 70,62 T55,68 T40,70 T25,65 T12,55 Q8,45 8,35 Z"
          fill="none"
          stroke="rgba(34, 211, 238, 0.15)"
          strokeWidth="0.3"
        />
      </svg>

      {/* Weather overlays */}
      <AnimatePresence>
        {showWeather && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.4, scale: 1 }}
              className="absolute rounded-full"
              style={{
                left: "65%",
                top: "25%",
                width: "15%",
                height: "20%",
                background:
                  "radial-gradient(ellipse, rgba(251, 191, 36, 0.4) 0%, transparent 70%)",
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.35, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute rounded-full"
              style={{
                left: "5%",
                top: "35%",
                width: "12%",
                height: "15%",
                background:
                  "radial-gradient(ellipse, rgba(251, 191, 36, 0.35) 0%, transparent 70%)",
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Flight routes */}
      <svg className="absolute inset-0 w-full h-full">
        {routes.map((route, i) => (
          <motion.path
            key={i}
            d={`M ${route.from.x} ${route.from.y} Q ${
              (route.from.x + route.to.x) / 2
            } ${Math.min(route.from.y, route.to.y) - 10} ${route.to.x} ${
              route.to.y
            }`}
            fill="none"
            stroke="rgba(34, 211, 238, 0.2)"
            strokeWidth="0.3"
            strokeDasharray="2 2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, delay: i * 0.3 }}
          />
        ))}
      </svg>

      {/* Aircraft */}
      {aircraftPositions.map((aircraft) => {
        const route = routes[aircraft.route];
        const t = aircraft.progress;
        const x =
          (1 - t) * (1 - t) * route.from.x +
          2 * (1 - t) * t * ((route.from.x + route.to.x) / 2) +
          t * t * route.to.x;
        const y =
          (1 - t) * (1 - t) * route.from.y +
          2 * (1 - t) * t * (Math.min(route.from.y, route.to.y) - 10) +
          t * t * route.to.y;

        return (
          <motion.div
            key={aircraft.id}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <Plane
              className="h-3 w-3 text-cyan-400"
              style={{
                transform: `rotate(${
                  Math.atan2(route.to.y - route.from.y, route.to.x - route.from.x) *
                  (180 / Math.PI)
                }deg)`,
              }}
            />
          </motion.div>
        );
      })}

      {/* Airport markers */}
      {airports.map((airport) => {
        const isActive = activeAirport === airport.code;
        const statusColor =
          airport.status === "weather"
            ? "#fbbf24"
            : airport.status === "delay"
            ? "#f87171"
            : "#22d3ee";

        return (
          <div
            key={airport.code}
            className="absolute"
            style={{
              left: `${airport.x}%`,
              top: `${airport.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* Pulse ring for active */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  left: -8,
                  top: -8,
                  border: `2px solid ${statusColor}`,
                }}
                animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}

            {/* Airport dot */}
            <motion.div
              className="rounded-full transition-all duration-300"
              style={{
                width: isActive ? 10 : 6,
                height: isActive ? 10 : 6,
                backgroundColor: statusColor,
                boxShadow: isActive ? `0 0 15px ${statusColor}` : "none",
              }}
            />

            {/* Label */}
            <span
              className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-semibold transition-all duration-300"
              style={{
                color: isActive ? statusColor : "rgba(255,255,255,0.5)",
              }}
            >
              {airport.code}
            </span>

            {/* Info popup */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute left-4 -top-2 w-28 rounded-lg bg-[#0d1820] border border-white/10 p-2 z-10"
                >
                  <p className="text-[10px] font-semibold text-white">
                    {airport.code}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <div
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: statusColor }}
                    />
                    <span
                      className="text-[8px] capitalize"
                      style={{ color: statusColor }}
                    >
                      {airport.status === "normal" ? "Operational" : airport.status}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4">
        {[
          { label: "Normal", color: "#22d3ee" },
          { label: "Weather", color: "#fbbf24" },
          { label: "Delay", color: "#f87171" },
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
  const [phase, setPhase] = useState(0);
  const [chartProgress, setChartProgress] = useState(0);
  const [riskScore, setRiskScore] = useState(0);

  useEffect(() => {
    const runAnimation = () => {
      setPhase(0);
      setChartProgress(0);
      setRiskScore(0);

      // Phase 1: Start analysis
      setTimeout(() => setPhase(1), 500);

      // Phase 2: Animate chart
      setTimeout(() => {
        setPhase(2);
        let progress = 0;
        const chartInterval = setInterval(() => {
          progress += 3;
          setChartProgress(Math.min(progress, 100));
          if (progress >= 100) clearInterval(chartInterval);
        }, 30);
      }, 1500);

      // Phase 3: Show cards
      setTimeout(() => setPhase(3), 3500);

      // Phase 4: Update risk score
      setTimeout(() => {
        setPhase(4);
        let score = 0;
        const scoreInterval = setInterval(() => {
          score += 2;
          setRiskScore(Math.min(score, 72));
          if (score >= 72) clearInterval(scoreInterval);
        }, 30);
      }, 4500);

      // Phase 5: Show insights
      setTimeout(() => setPhase(5), 6000);
    };

    runAnimation();
    const interval = setInterval(runAnimation, 14000);
    return () => clearInterval(interval);
  }, []);

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

  const maxValue = 100;
  const chartHeight = 160;
  const chartWidth = 100; // percentage

  // Generate SVG path for smooth line
  const generatePath = (data: number[], progress: number) => {
    const visiblePoints = Math.ceil((data.length * progress) / 100);
    const points = data.slice(0, visiblePoints);
    if (points.length < 2) return "";
    
    const stepX = chartWidth / (data.length - 1);
    
    let path = `M 0 ${chartHeight - (points[0] / maxValue) * chartHeight}`;
    
    for (let i = 1; i < points.length; i++) {
      const x = i * stepX;
      const y = chartHeight - (points[i] / maxValue) * chartHeight;
      const prevX = (i - 1) * stepX;
      const prevY = chartHeight - (points[i - 1] / maxValue) * chartHeight;
      
      // Bezier curve for smooth line
      const cpX1 = prevX + stepX * 0.4;
      const cpX2 = x - stepX * 0.4;
      path += ` C ${cpX1} ${prevY}, ${cpX2} ${y}, ${x} ${y}`;
    }
    
    return path;
  };

  return (
    <div className="relative h-full min-h-[450px] p-5 space-y-4">
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

      {/* Main chart area - Animated Line Graph */}
      <div className="rounded-xl bg-[#060d14] border border-white/10 p-4 relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '40px 32px'
          }}
        />

        {/* Y-axis labels */}
        <div className="absolute left-2 top-4 bottom-10 flex flex-col justify-between text-[9px] text-white/30">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        {/* Chart SVG */}
        <div className="relative ml-8 mr-2" style={{ height: chartHeight }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            {/* Gradient definitions */}
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="50%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Area fill under the line */}
            {phase >= 2 && (
              <motion.path
                d={`${generatePath(trendData.map(d => d.onTime), chartProgress)} L ${((Math.ceil((trendData.length * chartProgress) / 100) - 1) / (trendData.length - 1)) * chartWidth} ${chartHeight} L 0 ${chartHeight} Z`}
                fill="url(#areaGradient)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              />
            )}

            {/* Main trend line */}
            {phase >= 2 && (
              <motion.path
                d={generatePath(trendData.map(d => d.onTime), chartProgress)}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                filter="url(#glow)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
            )}

            {/* Data points */}
            {phase >= 2 && trendData.slice(0, Math.ceil((trendData.length * chartProgress) / 100)).map((data, i) => {
              const x = (i / (trendData.length - 1)) * chartWidth;
              const y = chartHeight - (data.onTime / maxValue) * chartHeight;
              return (
                <motion.g key={i}>
                  {/* Outer glow */}
                  <motion.circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="1"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: [0, 0.5, 0], scale: [0.5, 1.5, 2] }}
                    transition={{ 
                      delay: i * 0.15 + 0.5, 
                      duration: 1.5, 
                      repeat: Infinity,
                      repeatDelay: 3
                    }}
                  />
                  {/* Main point */}
                  <motion.circle
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#0f172a"
                    stroke="#a78bfa"
                    strokeWidth="2"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.15 + 0.3, type: "spring" }}
                  />
                </motion.g>
              );
            })}

            {/* Current value indicator */}
            {phase >= 3 && (
              <motion.g
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <rect
                  x={((trendData.length - 1) / (trendData.length - 1)) * chartWidth - 18}
                  y={chartHeight - (trendData[trendData.length - 1].onTime / maxValue) * chartHeight - 28}
                  width="36"
                  height="20"
                  rx="4"
                  fill="#a78bfa"
                />
                <text
                  x={((trendData.length - 1) / (trendData.length - 1)) * chartWidth}
                  y={chartHeight - (trendData[trendData.length - 1].onTime / maxValue) * chartHeight - 14}
                  textAnchor="middle"
                  fill="white"
                  fontSize="9"
                  fontWeight="bold"
                >
                  {trendData[trendData.length - 1].onTime}%
                </text>
              </motion.g>
            )}
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between mt-2 px-0">
            {trendData.map((data, i) => (
              <motion.span
                key={data.month}
                className="text-[9px] text-white/40"
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
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-gradient-to-r from-cyan-400 to-purple-400 rounded" />
            <span className="text-[10px] text-white/50">On-Time Rate</span>
          </div>
          <div className="flex items-center gap-2">
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
