"use client";

import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { MapPin, Plane, Cloud, Activity, Calendar, Users, Trophy } from "lucide-react";

const round = (value: number, precision = 6) => Number(value.toFixed(precision));
const percent = (value: number) => `${round(value * 100, 4)}%`;

// Airport data for the interactive globe
const airports = [
  { code: "ATL", name: "Atlanta", lat: 33.64, lng: -84.43, region: "NA", country: "USA" },
  { code: "LAX", name: "Los Angeles", lat: 33.94, lng: -118.41, region: "NA", country: "USA" },
  { code: "ORD", name: "Chicago", lat: 41.98, lng: -87.90, region: "NA", country: "USA" },
  { code: "DFW", name: "Dallas", lat: 32.90, lng: -97.04, region: "NA", country: "USA" },
  { code: "JFK", name: "New York", lat: 40.64, lng: -73.78, region: "NA", country: "USA" },
  { code: "LHR", name: "London", lat: 51.47, lng: -0.46, region: "EU", country: "UK" },
  { code: "CDG", name: "Paris", lat: 49.01, lng: 2.55, region: "EU", country: "France" },
  { code: "FRA", name: "Frankfurt", lat: 50.03, lng: 8.57, region: "EU", country: "Germany" },
  { code: "DXB", name: "Dubai", lat: 25.25, lng: 55.36, region: "ME", country: "UAE" },
  { code: "SIN", name: "Singapore", lat: 1.36, lng: 103.99, region: "AS", country: "Singapore" },
  { code: "HKG", name: "Hong Kong", lat: 22.31, lng: 113.91, region: "AS", country: "China" },
  { code: "NRT", name: "Tokyo", lat: 35.76, lng: 140.39, region: "AS", country: "Japan" },
  { code: "SYD", name: "Sydney", lat: -33.95, lng: 151.18, region: "OC", country: "Australia" },
  { code: "GRU", name: "São Paulo", lat: -23.43, lng: -46.47, region: "SA", country: "Brazil" },
];

// Flight routes between airports
const flightRoutes = [
  { from: "ATL", to: "LHR" },
  { from: "LAX", to: "NRT" },
  { from: "JFK", to: "CDG" },
  { from: "DXB", to: "SIN" },
  { from: "ORD", to: "FRA" },
  { from: "HKG", to: "SYD" },
];

// Generate dotted sphere points using fibonacci sphere
function generateGlobePoints(count: number) {
  const points: { x: number; y: number; z: number; size: number }[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = phi * i;

    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;

    // Only show points on the visible hemisphere (front-facing)
    if (z > -0.25) {
      const depthFactor = (z + 0.25) / 1.25;
      points.push({
        x: round(x * 0.42 + 0.5),
        y: round(y * 0.42 + 0.5),
        z: round(z),
        size: round(0.3 + depthFactor * 0.5),
      });
    }
  }
  return points;
}

interface AirportCardData {
  code: string;
  name: string;
  country: string;
  onTime: number;
  delayed: number;
  flightsRegistered: number;
  weatherRisk: string;
  status: string;
}

function AirportInfoCard({
  data,
  position,
  onClose,
}: {
  data: AirportCardData;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute z-30 w-72 glass-strong rounded-xl p-4 shadow-2xl"
      style={{
        left: `${Math.min(Math.max(position.x, 15), 65)}%`,
        top: `${Math.min(Math.max(position.y - 8, 8), 55)}%`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with location badge */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider mb-1.5">
            <MapPin className="h-3 w-3" />
            {data.name}
          </span>
          <h4 className="text-lg font-bold">{data.code} Airport</h4>
          <p className="text-xs text-muted-foreground">{data.country}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm"
        >
          ×
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-muted/40 p-2.5 border border-border/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Date</span>
          </div>
          <p className="text-sm font-semibold">Jun 2, 2026</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2.5 border border-border/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Trophy className="h-3 w-3 text-accent" />
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">On-Time</span>
          </div>
          <p className="text-sm font-semibold text-primary">{data.onTime}%</p>
        </div>
      </div>

      <div className="rounded-lg bg-muted/40 p-2.5 mb-3 border border-border/20">
        <div className="flex items-center gap-1.5 mb-1">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Status</span>
        </div>
        <p className="text-sm font-semibold">{data.status} · {data.delayed} delayed</p>
      </div>

      {/* Weather & Players */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{data.flightsRegistered} flights registered</span>
      </div>

      {/* Source */}
      <div className="mt-3 pt-3 border-t border-border/30">
        <span className="text-[9px] text-muted-foreground">
          Source: <span className="text-primary">enterprise.airport_performance</span>
        </span>
      </div>
    </motion.div>
  );
}

function DottedGlobe({
  rotation,
  onAirportClick,
  selectedAirport,
}: {
  rotation: number;
  onAirportClick: (airport: typeof airports[0], x: number, y: number) => void;
  selectedAirport: string | null;
}) {
  const shouldReduceMotion = useReducedMotion();
  const globePoints = useMemo(() => generateGlobePoints(1000), []);
  const [hoveredAirport, setHoveredAirport] = useState<string | null>(null);

  // Transform airport positions based on rotation
  const transformedAirports = useMemo(() => {
    return airports.map((airport) => {
      const adjustedLng = airport.lng + rotation;
      const theta = (adjustedLng * Math.PI) / 180;
      const phi = ((90 - airport.lat) * Math.PI) / 180;

      const x = Math.sin(phi) * Math.cos(theta);
      const z = Math.sin(phi) * Math.sin(theta);
      const y = Math.cos(phi);

      // Project to 2D with depth
      const scale = 1 / (1.6 - z * 0.5);
      const projX = x * scale * 0.38 + 0.5;
      const projY = y * scale * 0.38 + 0.5;

      return {
        ...airport,
        x: round(projX),
        y: round(projY),
        z: round(z),
        visible: z > -0.15,
        scale: round(scale),
      };
    });
  }, [rotation]);

  // Transform flight routes
  const transformedRoutes = useMemo(() => {
    return flightRoutes.map((route) => {
      const fromAirport = transformedAirports.find((a) => a.code === route.from);
      const toAirport = transformedAirports.find((a) => a.code === route.to);
      return { from: fromAirport, to: toAirport };
    }).filter((r) => r.from?.visible && r.to?.visible);
  }, [transformedAirports]);

  return (
    <div className="relative w-full h-full">
      {/* Globe outer glow ring */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[88%] aspect-square">
          {/* Outer atmospheric glow */}
          <motion.div
            className="absolute inset-[-8%] rounded-full"
            style={{
              background: "radial-gradient(circle, transparent 40%, oklch(0.45 0.12 200 / 0.12) 50%, oklch(0.35 0.1 200 / 0.06) 60%, transparent 70%)",
            }}
            animate={shouldReduceMotion ? {} : { scale: [1, 1.03, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          
          {/* Inner bright ring */}
          <div
            className="absolute inset-[2%] rounded-full"
            style={{
              border: "1px solid oklch(0.5 0.12 200 / 0.25)",
              boxShadow: "0 0 40px oklch(0.5 0.12 200 / 0.15), inset 0 0 40px oklch(0.5 0.12 200 / 0.08)",
            }}
          />
        </div>
      </div>

      {/* Dotted globe surface */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        {/* Globe dots */}
        {globePoints.map((point, i) => {
          const depthOpacity = round(Math.max(0.15, (point.z + 0.25) / 1.25) * 0.7);
          return (
            <circle
              key={i}
              cx={round(point.x * 100, 4)}
              cy={round(point.y * 100, 4)}
              r={point.size}
              fill={`oklch(0.55 0.1 200 / ${depthOpacity})`}
            />
          );
        })}

        {/* Flight route curves */}
        <defs>
          <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="oklch(0.65 0.12 200)" stopOpacity="0.3" />
            <stop offset="50%" stopColor="oklch(0.7 0.14 200)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="oklch(0.65 0.12 200)" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {transformedRoutes.map((route, i) => {
          if (!route.from || !route.to) return null;
          const fromX = round(route.from.x * 100, 4);
          const fromY = round(route.from.y * 100, 4);
          const toX = round(route.to.x * 100, 4);
          const toY = round(route.to.y * 100, 4);
          const midX = round((fromX + toX) / 2, 4);
          const midY = round(Math.min(fromY, toY) - 10, 4);

          return (
            <motion.path
              key={`route-${i}`}
              d={`M${fromX},${fromY} Q${midX},${midY} ${toX},${toY}`}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="0.4"
              strokeDasharray="2 3"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.7 }}
              transition={{ duration: 2.5, delay: i * 0.4 }}
            />
          );
        })}
      </svg>

      {/* Airport markers */}
      {transformedAirports
        .filter((a) => a.visible)
        .sort((a, b) => a.z - b.z)
        .map((airport, index) => {
          const isSelected = selectedAirport === airport.code;
          const isHovered = hoveredAirport === airport.code;
          const isLargeHub = ["ATL", "LHR", "DXB", "HKG", "LAX", "JFK", "NRT"].includes(airport.code);
          const baseSize = isLargeHub ? 10 : 7;
          const size = isSelected || isHovered ? baseSize + 3 : baseSize;
          const opacity = round(Math.max(0.5, (airport.z + 0.15) / 1.15));

          return (
            <motion.div
              key={airport.code}
              className="absolute cursor-pointer"
              style={{
                left: percent(airport.x),
                top: percent(airport.y),
                transform: "translate(-50%, -50%)",
                zIndex: isSelected || isHovered ? 20 : Math.round(airport.z * 10) + 10,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity }}
              transition={{ delay: 0.8 + (index % 6) * 0.1 }}
              onMouseEnter={() => setHoveredAirport(airport.code)}
              onMouseLeave={() => setHoveredAirport(null)}
              onClick={() => onAirportClick(airport, round(airport.x * 100, 4), round(airport.y * 100, 4))}
            >
              {/* Pulse effect for large hubs */}
              {isLargeHub && !shouldReduceMotion && (
                <motion.div
                  className="absolute rounded-full bg-accent"
                  style={{ 
                    width: baseSize, 
                    height: baseSize,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                  animate={{
                    scale: [1, 2.2],
                    opacity: [0.5, 0],
                  }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: (index % 5) * 0.35 }}
                />
              )}

              {/* Airport dot */}
              <motion.div
                className="rounded-full transition-all duration-200"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: "oklch(0.75 0.16 55)",
                  boxShadow: isSelected || isHovered 
                    ? "0 0 20px oklch(0.75 0.16 55 / 0.6), 0 0 40px oklch(0.75 0.16 55 / 0.3)" 
                    : "0 0 10px oklch(0.75 0.16 55 / 0.4)",
                }}
              />

              {/* Airport label */}
              {(isLargeHub || isHovered || isSelected) && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-foreground/80 whitespace-nowrap"
                >
                  {airport.code}
                </motion.span>
              )}
            </motion.div>
          );
        })}

      {/* Animated aircraft along routes */}
      {!shouldReduceMotion &&
        transformedRoutes.slice(0, 3).map((route, i) => {
          if (!route.from || !route.to) return null;
          return (
            <AnimatedAircraft
              key={`aircraft-${i}`}
              fromX={round(route.from.x * 100, 4)}
              fromY={round(route.from.y * 100, 4)}
              toX={round(route.to.x * 100, 4)}
              toY={round(route.to.y * 100, 4)}
              duration={14 + i * 4}
              delay={i * 5}
            />
          );
        })}
    </div>
  );
}

function AnimatedAircraft({
  fromX,
  fromY,
  toX,
  toY,
  duration,
  delay,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  duration: number;
  delay: number;
}) {
  const [position, setPosition] = useState({ x: fromX, y: fromY, angle: 0, visible: false });

  useEffect(() => {
    let animationFrame: number;
    let startTime: number | null = null;

    const midX = (fromX + toX) / 2;
    const midY = Math.min(fromY, toY) - 10;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp + delay * 1000;
      const elapsed = timestamp - startTime;

      if (elapsed < 0) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }

      const totalDuration = duration * 1000;
      const t = (elapsed % totalDuration) / totalDuration;

      // Quadratic bezier
      const x = (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * midX + t * t * toX;
      const y = (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * midY + t * t * toY;

      // Calculate angle
      const dx = 2 * (1 - t) * (midX - fromX) + 2 * t * (toX - midX);
      const dy = 2 * (1 - t) * (midY - fromY) + 2 * t * (toY - midY);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      setPosition({ x, y, angle, visible: t > 0.05 && t < 0.95 });
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [fromX, fromY, toX, toY, duration, delay]);

  if (!position.visible) return null;

  return (
    <div
      className="absolute pointer-events-none z-15"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-50%, -50%) rotate(${position.angle + 90}deg)`,
      }}
    >
      <Plane className="h-3 w-3 text-primary drop-shadow-lg" />
    </div>
  );
}

export function GlobalAviationSection() {
  const shouldReduceMotion = useReducedMotion();
  const [rotation, setRotation] = useState(0);
  const [selectedAirport, setSelectedAirport] = useState<AirportCardData | null>(null);
  const [cardPosition, setCardPosition] = useState({ x: 50, y: 30 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Slow rotation animation
  useEffect(() => {
    if (shouldReduceMotion) return;

    const interval = setInterval(() => {
      setRotation((prev) => (prev + 0.12) % 360);
    }, 50);

    return () => clearInterval(interval);
  }, [shouldReduceMotion]);

  const handleAirportClick = useCallback(
    (airport: typeof airports[0], x: number, y: number) => {
      // Generate consistent data based on airport code
      const seed = airport.code.charCodeAt(0) + airport.code.charCodeAt(1) + airport.code.charCodeAt(2);
      setSelectedAirport({
        code: airport.code,
        name: airport.name,
        country: airport.country,
        onTime: 72 + (seed % 23),
        delayed: 120 + (seed % 180),
        flightsRegistered: 50 + (seed % 100),
        weatherRisk: seed % 3 === 0 ? "Low" : seed % 3 === 1 ? "Moderate" : "High",
        status: seed % 2 === 0 ? "Stable" : "Active",
      });
      setCardPosition({ x, y });
    },
    []
  );

  return (
    <section className="relative py-28 overflow-hidden" id="airspace">
      {/* Premium atmospheric background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[oklch(0.055_0.02_240)] to-background" />
        {/* Subtle radial glow behind globe */}
        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: "radial-gradient(circle, oklch(0.15 0.08 200 / 0.3) 0%, transparent 60%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl mb-4">
            From One Airport to the{" "}
            <span className="text-gradient-sky">Entire World</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-base sm:text-lg leading-relaxed">
            Enterprise aviation intelligence with live operational context across the globe. Click any airport to explore real-time performance data.
          </p>
        </motion.div>

        {/* Globe visualization */}
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative mx-auto aspect-square max-w-3xl"
          onClick={() => setSelectedAirport(null)}
        >
          <DottedGlobe
            rotation={rotation}
            onAirportClick={handleAirportClick}
            selectedAirport={selectedAirport?.code || null}
          />

          {/* Airport info card */}
          <AnimatePresence>
            {selectedAirport && (
              <AirportInfoCard
                data={selectedAirport}
                position={cardPosition}
                onClose={() => setSelectedAirport(null)}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stats */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-14 flex flex-wrap justify-center gap-6"
        >
          {[
            { label: "Global Airports", value: "15,000+" },
            { label: "Daily Flights", value: "100K+" },
            { label: "Data Points", value: "1B+" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="glass rounded-xl px-8 py-4 text-center border border-border/30"
            >
              <p className="text-2xl font-bold text-primary tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
