"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, Cloud, MapPin, Plane, X } from "lucide-react";
import Globe from "react-globe.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Airport = {
  code: string;
  name: string;
  fullName: string;
  location: string;
  lat: number;
  lng: number;
  onTime: number;
  delayed: number;
  weatherRisk: "Low" | "Moderate" | "High";
  status: "Stable" | "Congested" | "Watch" | "Excellent";
};

type Route = {
  from: Airport["code"];
  to: Airport["code"];
};

type Flight = Route & {
  flight: string;
  aircraft: string;
  status: "En Route";
  altitude: string;
  speed: string;
  eta: string;
};

type ArcDatum = Route & {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  altitude: number;
  dash: number;
};

type AircraftMarker = {
  markerType: "aircraft";
  id: string;
  flight: Flight;
  lat: number;
  lng: number;
  heading: number;
};

type HoverTarget = "airport" | "flight";

type ScreenMarker =
  | {
      markerType: "airport";
      airport: Airport;
      x: number;
      y: number;
      visible: boolean;
    }
  | {
      markerType: "aircraft";
      flight: Flight;
      heading: number;
      x: number;
      y: number;
      visible: boolean;
    };

const EARTH_NIGHT_TEXTURE = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg";
const EARTH_BUMP_TEXTURE = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

const airports: Airport[] = [
  {
    code: "ATL",
    name: "Hartsfield-Jackson Atlanta",
    fullName: "Hartsfield-Jackson Atlanta International Airport",
    location: "Atlanta, USA",
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
    location: "New York, USA",
    lat: 40.64,
    lng: -73.78,
    onTime: 79,
    delayed: 188,
    weatherRisk: "Low",
    status: "Stable",
  },
  {
    code: "LHR",
    name: "London Heathrow",
    fullName: "Heathrow Airport",
    location: "London, UK",
    lat: 51.47,
    lng: -0.46,
    onTime: 76,
    delayed: 210,
    weatherRisk: "Moderate",
    status: "Congested",
  },
  {
    code: "DEL",
    name: "Delhi Indira Gandhi",
    fullName: "Indira Gandhi International Airport",
    location: "Delhi, India",
    lat: 28.56,
    lng: 77.1,
    onTime: 73,
    delayed: 265,
    weatherRisk: "High",
    status: "Watch",
  },
  {
    code: "DXB",
    name: "Dubai International",
    fullName: "Dubai International Airport",
    location: "Dubai, UAE",
    lat: 25.25,
    lng: 55.36,
    onTime: 84,
    delayed: 142,
    weatherRisk: "Low",
    status: "Stable",
  },
  {
    code: "SIN",
    name: "Singapore Changi",
    fullName: "Singapore Changi Airport",
    location: "Singapore",
    lat: 1.36,
    lng: 103.99,
    onTime: 88,
    delayed: 96,
    weatherRisk: "Low",
    status: "Excellent",
  },
  {
    code: "HKG",
    name: "Hong Kong International",
    fullName: "Hong Kong International Airport",
    location: "Hong Kong",
    lat: 22.31,
    lng: 113.91,
    onTime: 81,
    delayed: 132,
    weatherRisk: "Moderate",
    status: "Stable",
  },
  {
    code: "SYD",
    name: "Sydney Kingsford Smith",
    fullName: "Sydney Kingsford Smith Airport",
    location: "Sydney, Australia",
    lat: -33.95,
    lng: 151.18,
    onTime: 80,
    delayed: 118,
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
  { from: "DEL", to: "HKG" },
  { from: "SIN", to: "HKG" },
  { from: "SIN", to: "SYD" },
  { from: "HKG", to: "SYD" },
  { from: "DXB", to: "SIN" },
  { from: "DXB", to: "JFK" },
  { from: "ATL", to: "LHR" },
];

const flights: Flight[] = [
  {
    flight: "BA112",
    from: "JFK",
    to: "LHR",
    aircraft: "Boeing 777-300ER",
    status: "En Route",
    altitude: "37,000 ft",
    speed: "905 km/h",
    eta: "3h 40m",
  },
  {
    flight: "AI302",
    from: "DEL",
    to: "HKG",
    aircraft: "Boeing 787-8",
    status: "En Route",
    altitude: "35,000 ft",
    speed: "870 km/h",
    eta: "2h 55m",
  },
  {
    flight: "EK215",
    from: "DXB",
    to: "JFK",
    aircraft: "Airbus A380",
    status: "En Route",
    altitude: "39,000 ft",
    speed: "920 km/h",
    eta: "8h 20m",
  },
  {
    flight: "SQ421",
    from: "DEL",
    to: "SIN",
    aircraft: "Airbus A350",
    status: "En Route",
    altitude: "36,000 ft",
    speed: "890 km/h",
    eta: "2h 15m",
  },
  {
    flight: "QF82",
    from: "SIN",
    to: "SYD",
    aircraft: "Airbus A330-300",
    status: "En Route",
    altitude: "38,000 ft",
    speed: "895 km/h",
    eta: "5h 05m",
  },
];

function getBearing(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const startLat = (fromLat * Math.PI) / 180;
  const endLat = (toLat * Math.PI) / 180;
  const deltaLng = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);

  return (Math.atan2(y, x) * 180) / Math.PI;
}

function interpolateRoutePoint(from: Airport, to: Airport, progress: number) {
  const startLat = (from.lat * Math.PI) / 180;
  const startLng = (from.lng * Math.PI) / 180;
  const endLat = (to.lat * Math.PI) / 180;
  const endLng = (to.lng * Math.PI) / 180;

  const angle =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((endLat - startLat) / 2) ** 2 +
          Math.cos(startLat) * Math.cos(endLat) * Math.sin((endLng - startLng) / 2) ** 2
      )
    );

  if (angle === 0) return { lat: from.lat, lng: from.lng };

  const startWeight = Math.sin((1 - progress) * angle) / Math.sin(angle);
  const endWeight = Math.sin(progress * angle) / Math.sin(angle);
  const x =
    startWeight * Math.cos(startLat) * Math.cos(startLng) +
    endWeight * Math.cos(endLat) * Math.cos(endLng);
  const y =
    startWeight * Math.cos(startLat) * Math.sin(startLng) +
    endWeight * Math.cos(endLat) * Math.sin(endLng);
  const z = startWeight * Math.sin(startLat) + endWeight * Math.sin(endLat);

  return {
    lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
    lng: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

function isFrontFacing(globe: any, lat: number, lng: number) {
  const coords = globe?.getCoords?.(lat, lng, 0);
  const camera = globe?.camera?.();
  const position = camera?.position;

  if (!coords || !position) return false;

  const markerLength = Math.hypot(coords.x, coords.y, coords.z);
  const cameraLength = Math.hypot(position.x, position.y, position.z);
  if (!markerLength || !cameraLength) return false;

  const markerX = coords.x / markerLength;
  const markerY = coords.y / markerLength;
  const markerZ = coords.z / markerLength;
  const cameraX = position.x / cameraLength;
  const cameraY = position.y / cameraLength;
  const cameraZ = position.z / cameraLength;

  return markerX * cameraX + markerY * cameraY + markerZ * cameraZ > 0.04;
}

function AirportMarkerButton({
  airport,
  isHovered,
  onHover,
  onSelect,
}: {
  airport: Airport;
  isHovered: boolean;
  onHover: (airport: Airport | null) => void;
  onSelect: (airport: Airport) => void;
}) {
  return (
    <button
      aria-label={`Show ${airport.code} airport intelligence`}
      className="group pointer-events-auto absolute z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full"
      data-airport-marker={airport.code}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(airport);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerEnter={() => onHover(airport)}
      onPointerLeave={() => onHover(null)}
      type="button"
    >
      <span className="absolute inset-0 rounded-full bg-cyan-400/0" />
      <span
        className={`absolute h-8 w-8 rounded-full bg-cyan-400/15 shadow-[0_0_26px_rgba(34,211,238,0.42)] transition-transform duration-150 ${
          isHovered ? "scale-125" : "group-hover:scale-125"
        }`}
      />
      <span className="relative h-3 w-3 rounded-full border border-cyan-100/80 bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.85)]" />
      <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
        {airport.code}
      </span>
    </button>
  );
}

function AircraftMarkerButton({
  flight,
  heading,
  isHovered,
  onHover,
  onSelect,
}: {
  flight: Flight;
  heading: number;
  isHovered: boolean;
  onHover: (flight: Flight | null) => void;
  onSelect: (flight: Flight) => void;
}) {
  return (
    <button
      aria-label={`Show ${flight.flight} flight intelligence`}
      className="pointer-events-auto absolute z-20 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-cyan-200 drop-shadow-[0_0_10px_rgba(125,233,255,0.9)] transition-transform duration-150 hover:scale-110"
      data-flight-marker={flight.flight}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(flight);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerEnter={() => onHover(flight)}
      onPointerLeave={() => onHover(null)}
      type="button"
    >
      <span className="absolute inset-0 rounded-full bg-cyan-300/0" />
      <svg
        fill="currentColor"
        height="18"
        style={{
          transform: `rotate(${heading}deg) scale(${isHovered ? 1.1 : 1})`,
          transition: "transform 150ms ease",
        }}
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" />
      </svg>
    </button>
  );
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
      data-airport-card={airport.code}
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
          <p className="text-sm text-muted-foreground">{airport.location}</p>
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

function FlightCard({
  flight,
  onClose,
}: {
  flight: Flight;
  onClose: () => void;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-16 right-4 z-30 w-[min(22rem,calc(100%-2rem))] rounded-2xl border border-primary/20 bg-[oklch(0.08_0.02_240_/0.88)] p-5 text-left shadow-2xl shadow-primary/10 backdrop-blur-xl sm:right-8"
      data-flight-card={flight.flight}
      exit={{ opacity: 0, y: 12 }}
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.18 }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            <h3 className="text-2xl font-bold text-foreground">{flight.flight}</h3>
          </div>
          <p className="text-base font-medium text-foreground">
            {flight.from} <span className="text-muted-foreground">-&gt;</span> {flight.to}
          </p>
          <p className="text-sm text-muted-foreground">{flight.aircraft}</p>
        </div>
        <button
          aria-label="Close flight card"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/30 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 border-t border-border/30 pt-4">
        {[
          { icon: Activity, label: "Status", value: flight.status, valueClass: "text-emerald-300" },
          { icon: MapPin, label: "Altitude", value: flight.altitude, valueClass: "text-primary" },
          { icon: Plane, label: "Speed", value: flight.speed, valueClass: "text-cyan-200" },
          { icon: Cloud, label: "ETA", value: flight.eta, valueClass: "text-amber-300" },
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
        <span className="text-primary">live_airspace_demo</span>
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
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [hoveredAirportCode, setHoveredAirportCode] = useState<Airport["code"] | null>(null);
  const [hoveredFlightId, setHoveredFlightId] = useState<Flight["flight"] | null>(null);
  const [screenMarkers, setScreenMarkers] = useState<ScreenMarker[]>([]);
  const hoverClearTimerRef = useRef<number | null>(null);
  const aircraftDataRef = useRef<AircraftMarker[]>([]);

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

    return flights.map((flight, index) => {
      const from = airportByCode.get(flight.from);
      const to = airportByCode.get(flight.to);
      if (!from || !to) return null;
      const routeProgress = (progress + index * 0.21) % 1;
      const nextProgress = Math.min(routeProgress + 0.012, 1);
      const point = interpolateRoutePoint(from, to, routeProgress);
      const nextPoint = interpolateRoutePoint(from, to, nextProgress);
      const heading = getBearing(point.lat, point.lng, nextPoint.lat, nextPoint.lng);
      return {
        markerType: "aircraft" as const,
        id: flight.flight,
        flight,
        lat: point.lat,
        lng: point.lng,
        heading,
      };
    }).filter((marker): marker is AircraftMarker => Boolean(marker));
  }, [airportByCode, progress, shouldReduceMotion]);

  useEffect(() => {
    aircraftDataRef.current = aircraftData;
  }, [aircraftData]);

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
    controls.autoRotate = Boolean(isInView && !shouldReduceMotion && !selectedAirport && !selectedFlight);
    controls.autoRotateSpeed = hoveredAirportCode || hoveredFlightId ? 0.12 : 0.35;
  }, [hoveredAirportCode, hoveredFlightId, isInView, selectedAirport, selectedFlight, shouldReduceMotion]);

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

  useEffect(() => {
    if (!isInView) return;

    let frame = 0;
    const projectMarkers = () => {
      const globe = globeRef.current;
      const toScreen = globe?.getScreenCoords?.bind(globe);

      if (toScreen) {
        const nextMarkers: ScreenMarker[] = [
          ...airports.map((airport) => {
            const coords = toScreen(airport.lat, airport.lng, 0.038);
            const visible =
              Boolean(coords) &&
              Number.isFinite(coords.x) &&
              Number.isFinite(coords.y) &&
              coords.x >= -32 &&
              coords.y >= -32 &&
              coords.x <= size + 32 &&
              coords.y <= size + 32 &&
              isFrontFacing(globe, airport.lat, airport.lng);

            return {
              markerType: "airport" as const,
              airport,
              x: coords?.x ?? 0,
              y: coords?.y ?? 0,
              visible,
            };
          }),
          ...aircraftDataRef.current.map((aircraft) => {
            const coords = toScreen(aircraft.lat, aircraft.lng, 0.06);
            const visible =
              Boolean(coords) &&
              Number.isFinite(coords.x) &&
              Number.isFinite(coords.y) &&
              coords.x >= -28 &&
              coords.y >= -28 &&
              coords.x <= size + 28 &&
              coords.y <= size + 28 &&
              isFrontFacing(globe, aircraft.lat, aircraft.lng);

            return {
              markerType: "aircraft" as const,
              flight: aircraft.flight,
              heading: aircraft.heading,
              x: coords?.x ?? 0,
              y: coords?.y ?? 0,
              visible,
            };
          }),
        ];

        setScreenMarkers(nextMarkers);
      }

      frame = requestAnimationFrame(projectMarkers);
    };

    frame = requestAnimationFrame(projectMarkers);
    return () => cancelAnimationFrame(frame);
  }, [isInView, size]);

  useEffect(() => {
    if (selectedAirport) {
      const marker = screenMarkers.find(
        (item) => item.markerType === "airport" && item.airport.code === selectedAirport.code
      );
      if (marker && !marker.visible) setSelectedAirport(null);
    }

    if (selectedFlight) {
      const marker = screenMarkers.find(
        (item) => item.markerType === "aircraft" && item.flight.flight === selectedFlight.flight
      );
      if (marker && !marker.visible) setSelectedFlight(null);
    }

    if (hoveredAirportCode) {
      const marker = screenMarkers.find(
        (item) => item.markerType === "airport" && item.airport.code === hoveredAirportCode
      );
      if (marker && !marker.visible) setHoveredAirportCode(null);
    }

    if (hoveredFlightId) {
      const marker = screenMarkers.find(
        (item) => item.markerType === "aircraft" && item.flight.flight === hoveredFlightId
      );
      if (marker && !marker.visible) setHoveredFlightId(null);
    }
  }, [hoveredAirportCode, hoveredFlightId, screenMarkers, selectedAirport, selectedFlight]);

  const selectAirport = useCallback((airport: Airport) => {
    setSelectedFlight(null);
    setSelectedAirport(airport);
  }, []);

  const selectFlight = useCallback((flight: Flight) => {
    setSelectedAirport(null);
    setSelectedFlight(flight);
  }, []);

  const setStableHover = useCallback((target: HoverTarget, datum: Airport | Flight | null) => {
    if (hoverClearTimerRef.current) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }

    if (target === "airport") {
      const airport = datum as Airport | null;
      if (airport) {
        setHoveredFlightId(null);
        setHoveredAirportCode(airport.code);
        return;
      }
    } else {
      const flight = datum as Flight | null;
      if (flight) {
        setHoveredAirportCode(null);
        setHoveredFlightId(flight.flight);
        return;
      }
    }

    hoverClearTimerRef.current = window.setTimeout(() => {
      setHoveredAirportCode(null);
      setHoveredFlightId(null);
      hoverClearTimerRef.current = null;
    }, 130);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const renderer = globeRef.current?.renderer?.();
    const canvas = renderer?.domElement as HTMLCanvasElement | undefined;
    const cursor = hoveredAirportCode || hoveredFlightId ? "pointer" : "";

    if (canvas) canvas.style.cursor = cursor;
    if (containerRef.current) containerRef.current.style.cursor = cursor;
  }, [hoveredAirportCode, hoveredFlightId]);

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[760px] overflow-visible"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        setSelectedAirport(null);
        setSelectedFlight(null);
      }}
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
        atmosphereColor="rgb(75, 180, 255)"
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
      />

      <div className="pointer-events-none absolute left-0 top-0 z-20" style={{ height: size, width: size }}>
        {screenMarkers.map((marker) => {
          if (marker.markerType === "airport") {
            return (
              <div
                className="absolute transition-opacity duration-150"
                key={marker.airport.code}
                style={{
                  left: marker.x,
                  opacity: marker.visible ? 1 : 0,
                  pointerEvents: marker.visible ? "auto" : "none",
                  top: marker.y,
                }}
              >
                <AirportMarkerButton
                  airport={marker.airport}
                  isHovered={hoveredAirportCode === marker.airport.code}
                  onHover={(airport) => setStableHover("airport", airport)}
                  onSelect={selectAirport}
                />
              </div>
            );
          }

          return (
            <div
              className="absolute transition-opacity duration-150"
              key={marker.flight.flight}
              style={{
                left: marker.x,
                opacity: marker.visible ? 1 : 0,
                pointerEvents: marker.visible ? "auto" : "none",
                top: marker.y,
              }}
            >
              <AircraftMarkerButton
                flight={marker.flight}
                heading={marker.heading}
                isHovered={hoveredFlightId === marker.flight.flight}
                onHover={(flight) => setStableHover("flight", flight)}
                onSelect={selectFlight}
              />
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {selectedAirport && <AirportCard airport={selectedAirport} onClose={() => setSelectedAirport(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {selectedFlight && <FlightCard flight={selectedFlight} onClose={() => setSelectedFlight(null)} />}
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
