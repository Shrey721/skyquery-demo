"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, Cloud, MapPin, Plane, X } from "lucide-react";
import Globe from "react-globe.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Airport = {
  code: string;
  name: string;
  fullName: string;
  country: string;
  lat: number;
  lng: number;
  onTime: number;
  delayed: number;
  weatherRisk: "Low" | "Moderate" | "Elevated";
  status: "Stable" | "Flow Control" | "Monitoring";
};

type Route = {
  from: Airport["code"];
  to: Airport["code"];
};

type ArcDatum = Route & {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  altitude: number;
  dash: number;
};

type MarkerDatum =
  | (Airport & { markerType: "airport" })
  | {
      markerType: "aircraft";
      id: string;
      lat: number;
      lng: number;
      heading: number;
    };

const EARTH_NIGHT_TEXTURE = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg";
const EARTH_BUMP_TEXTURE = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

const airports: Airport[] = [
  {
    code: "ATL",
    name: "Hartsfield-Jackson Atlanta",
    fullName: "Hartsfield-Jackson Atlanta International Airport",
    country: "United States",
    lat: 33.64,
    lng: -84.43,
    onTime: 82,
    delayed: 245,
    weatherRisk: "Moderate",
    status: "Stable",
  },
  {
    code: "JFK",
    name: "New York JFK",
    fullName: "John F. Kennedy International Airport",
    country: "United States",
    lat: 40.64,
    lng: -73.78,
    onTime: 78,
    delayed: 311,
    weatherRisk: "Elevated",
    status: "Flow Control",
  },
  {
    code: "LHR",
    name: "London Heathrow",
    fullName: "London Heathrow Airport",
    country: "United Kingdom",
    lat: 51.47,
    lng: -0.46,
    onTime: 84,
    delayed: 188,
    weatherRisk: "Low",
    status: "Stable",
  },
  {
    code: "DEL",
    name: "Delhi Indira Gandhi",
    fullName: "Indira Gandhi International Airport",
    country: "India",
    lat: 28.56,
    lng: 77.1,
    onTime: 80,
    delayed: 219,
    weatherRisk: "Moderate",
    status: "Monitoring",
  },
  {
    code: "DXB",
    name: "Dubai International",
    fullName: "Dubai International Airport",
    country: "United Arab Emirates",
    lat: 25.25,
    lng: 55.36,
    onTime: 87,
    delayed: 141,
    weatherRisk: "Low",
    status: "Stable",
  },
  {
    code: "SIN",
    name: "Singapore Changi",
    fullName: "Singapore Changi Airport",
    country: "Singapore",
    lat: 1.36,
    lng: 103.99,
    onTime: 91,
    delayed: 96,
    weatherRisk: "Low",
    status: "Stable",
  },
  {
    code: "HKG",
    name: "Hong Kong International",
    fullName: "Hong Kong International Airport",
    country: "Hong Kong",
    lat: 22.31,
    lng: 113.91,
    onTime: 83,
    delayed: 172,
    weatherRisk: "Moderate",
    status: "Monitoring",
  },
  {
    code: "SYD",
    name: "Sydney Kingsford Smith",
    fullName: "Sydney Kingsford Smith Airport",
    country: "Australia",
    lat: -33.95,
    lng: 151.18,
    onTime: 86,
    delayed: 128,
    weatherRisk: "Low",
    status: "Stable",
  },
];

const routes: Route[] = [
  { from: "ATL", to: "JFK" },
  { from: "JFK", to: "LHR" },
  { from: "LHR", to: "DXB" },
  { from: "DXB", to: "DEL" },
  { from: "DEL", to: "SIN" },
  { from: "SIN", to: "HKG" },
  { from: "HKG", to: "SYD" },
  { from: "DXB", to: "SIN" },
  { from: "ATL", to: "LHR" },
];

function interpolateLng(from: number, to: number, progress: number) {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return from + delta * progress;
}

function makeAirportMarker(airport: Airport, onSelect: (airport: Airport) => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", `Show ${airport.code} airport intelligence`);
  element.className = "group pointer-events-auto relative flex -translate-x-1/2 -translate-y-1/2 items-center justify-center";
  element.innerHTML = `
    <span class="absolute h-8 w-8 rounded-full bg-cyan-400/15 shadow-[0_0_26px_rgba(34,211,238,0.42)] transition-transform group-hover:scale-125"></span>
    <span class="relative h-3 w-3 rounded-full border border-cyan-100/80 bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.85)]"></span>
    <span class="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">${airport.code}</span>
  `;
  element.onclick = (event) => {
    event.stopPropagation();
    onSelect(airport);
  };
  return element;
}

function makeAircraftMarker(heading: number) {
  const element = document.createElement("div");
  element.className = "pointer-events-none -translate-x-1/2 -translate-y-1/2 text-cyan-200 drop-shadow-[0_0_10px_rgba(125,233,255,0.9)]";
  element.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="transform: rotate(${heading + 45}deg)">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" />
    </svg>
  `;
  return element;
}

function AirportCard({
  airport,
  onClose,
}: {
  airport: Airport;
  onClose: () => void;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="absolute right-4 top-6 z-30 w-[min(22rem,calc(100%-2rem))] rounded-2xl border border-primary/20 bg-[oklch(0.08_0.02_240_/0.86)] p-5 text-left shadow-2xl shadow-primary/10 backdrop-blur-xl sm:right-8 sm:top-10"
      exit={{ opacity: 0, x: 12 }}
      initial={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.18 }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary shadow-[0_0_14px_rgba(34,211,238,0.85)]" />
            <h3 className="text-2xl font-bold text-foreground">{airport.code}</h3>
          </div>
          <p className="text-base font-medium text-foreground">{airport.fullName}</p>
          <p className="text-sm text-muted-foreground">{airport.country}</p>
        </div>
        <button
          aria-label="Close airport card"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/30 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 border-t border-border/30 pt-4">
        {[
          { icon: Activity, label: "On-Time Performance", value: `${airport.onTime}%`, valueClass: "text-primary" },
          { icon: Plane, label: "Delayed Flights", value: airport.delayed, valueClass: "text-red-300" },
          { icon: Cloud, label: "Weather Risk", value: airport.weatherRisk, valueClass: "text-amber-300" },
          { icon: MapPin, label: "Operational Status", value: airport.status, valueClass: "text-emerald-300" },
        ].map((metric) => (
          <div className="flex items-center justify-between gap-4 text-sm" key={metric.label}>
            <div className="flex items-center gap-2 text-muted-foreground">
              <metric.icon className="h-4 w-4" />
              {metric.label}
            </div>
            <span className={`font-semibold ${metric.valueClass}`}>{metric.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border/30 pt-4 text-xs text-muted-foreground">
        <span>Source</span>
        <span className="text-primary">enterprise.airport_performance</span>
      </div>
    </motion.div>
  );
}

export function PremiumAviationGlobe() {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [isInView, setIsInView] = useState(true);
  const [size, setSize] = useState(720);
  const [progress, setProgress] = useState(0);
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(airports[1]);

  const airportByCode = useMemo(() => new Map(airports.map((airport) => [airport.code, airport])), []);

  const arcData = useMemo<ArcDatum[]>(
    () =>
      routes
        .map((route, index) => {
          const from = airportByCode.get(route.from);
          const to = airportByCode.get(route.to);
          if (!from || !to) return null;
          return {
            ...route,
            startLat: from.lat,
            startLng: from.lng,
            endLat: to.lat,
            endLng: to.lng,
            altitude: index % 3 === 0 ? 0.23 : 0.16,
            dash: index * 0.08,
          };
        })
        .filter((route): route is ArcDatum => Boolean(route)),
    [airportByCode]
  );

  const aircraftData = useMemo(() => {
    if (shouldReduceMotion) return [];

    return routes.slice(1, 5).map((route, index) => {
      const from = airportByCode.get(route.from);
      const to = airportByCode.get(route.to);
      if (!from || !to) return null;
      const routeProgress = (progress + index * 0.21) % 1;
      const lat = from.lat + (to.lat - from.lat) * routeProgress;
      const lng = interpolateLng(from.lng, to.lng, routeProgress);
      const heading = Math.atan2(to.lat - from.lat, to.lng - from.lng) * (180 / Math.PI);
      return {
        markerType: "aircraft" as const,
        id: `${route.from}-${route.to}`,
        lat,
        lng,
        heading,
      };
    }).filter((marker): marker is Extract<MarkerDatum, { markerType: "aircraft" }> => Boolean(marker));
  }, [airportByCode, progress, shouldReduceMotion]);

  const htmlElementsData = useMemo<MarkerDatum[]>(
    () => [
      ...airports.map((airport) => ({ ...airport, markerType: "airport" as const })),
      ...aircraftData,
    ],
    [aircraftData]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.min(760, entry.contentRect.width));
      setSize(width);
    });
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (!controls) return;

    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.45;
    controls.autoRotate = Boolean(isInView && !shouldReduceMotion);
    controls.autoRotateSpeed = 0.35;
  }, [isInView, shouldReduceMotion]);

  useEffect(() => {
    globeRef.current?.pointOfView?.({ lat: 21, lng: 48, altitude: 1.72 }, 0);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion || !isInView) return;

    let frame = 0;
    let previous = performance.now();

    const animate = (time: number) => {
      const delta = Math.min(time - previous, 48);
      previous = time;
      setProgress((current) => (current + delta * 0.000035) % 1);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isInView, shouldReduceMotion]);

  const renderHtmlElement = useCallback(
    (datum: object) => {
      const marker = datum as MarkerDatum;
      if (marker.markerType === "aircraft") {
        return makeAircraftMarker(marker.heading);
      }

      return makeAirportMarker(marker, setSelectedAirport);
    },
    []
  );

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[760px] overflow-visible"
      onClick={() => setSelectedAirport(null)}
      ref={containerRef}
    >
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.18),transparent_61%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-[6%] rounded-full border border-primary/30 shadow-[0_0_44px_rgba(35,181,211,0.32),0_0_100px_rgba(45,112,255,0.18)]" />

      <Globe
        ref={globeRef}
        width={size}
        height={size}
        backgroundColor="rgba(0,0,0,0)"
        rendererConfig={{
          alpha: true,
          antialias: !shouldReduceMotion && size > 520,
          powerPreference: "high-performance",
        }}
        globeImageUrl={EARTH_NIGHT_TEXTURE}
        bumpImageUrl={size > 520 ? EARTH_BUMP_TEXTURE : undefined}
        atmosphereColor="rgba(75, 180, 255, 0.85)"
        atmosphereAltitude={0.17}
        arcsData={arcData}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor={() => ["rgba(20, 184, 216, 0.08)", "rgba(125, 233, 255, 0.86)"]}
        arcAltitude="altitude"
        arcStroke={0.45}
        arcDashLength={0.34}
        arcDashGap={0.72}
        arcDashInitialGap="dash"
        arcDashAnimateTime={shouldReduceMotion ? 0 : 6500}
        htmlElementsData={htmlElementsData}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={(datum: object) => ((datum as MarkerDatum).markerType === "aircraft" ? 0.055 : 0.035)}
        htmlElement={renderHtmlElement}
        htmlElementVisibilityModifier={(element: HTMLElement, isVisible: boolean) => {
          element.style.opacity = isVisible ? "1" : "0";
          element.style.pointerEvents = isVisible ? "auto" : "none";
        }}
      />

      <AnimatePresence>
        {selectedAirport && <AirportCard airport={selectedAirport} onClose={() => setSelectedAirport(null)} />}
      </AnimatePresence>

      <div className="pointer-events-none absolute bottom-[5%] left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/30 bg-background/60 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Drag to rotate
        </span>
        <span className="h-4 w-px bg-border/60" />
        <span>Scroll disabled for smoothness</span>
      </div>
    </div>
  );
}
