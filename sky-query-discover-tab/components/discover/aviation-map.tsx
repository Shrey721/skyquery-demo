"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Plus, Minus, Locate, Maximize2, Layers, Info } from "lucide-react";

export interface Aircraft {
  id: string;
  callsign: string;
  icao24: string;
  lat: number;
  lng: number;
  heading: number;
  altitude: number;
  speed: number;
  verticalRate: number;
  originCountry: string;
  lastSeen: number;
  onGround: boolean;
  dataSource: "opensky" | "adsb" | "enterprise";
}

export interface Airport {
  code: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  type: "large" | "medium" | "small";
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ScannerConflict {
  id: string;
  aircraftA: Aircraft;
  aircraftB: Aircraft;
  horizontalKm: number;
  verticalFt: number;
  baseRisk: "Low" | "Medium" | "High" | "Critical";
  weatherAdjustedRisk: "Low" | "Medium" | "High" | "Critical";
  weatherFactor: string;
  nearestAirport?: string;
}

interface AviationMapProps {
  onAircraftSelect: (aircraft: Aircraft | null) => void;
  selectedAircraft: Aircraft | null;
  activeFilters: string[];
  onBoundsChange?: (bounds: MapBounds) => void;
  onAircraftListUpdate?: (aircraft: Aircraft[]) => void;
  scannerConflicts?: ScannerConflict[];
}

// Mock aircraft data structured like OpenSky API response
const mockAircraft: Aircraft[] = [
  { id: "1", callsign: "UAL1234", icao24: "a1b2c3", lat: 40.7128, lng: -74.006, heading: 45, altitude: 35000, speed: 485, verticalRate: 0, originCountry: "United States", lastSeen: Date.now() - 2000, onGround: false, dataSource: "opensky" },
  { id: "2", callsign: "AAL567", icao24: "a4b5c6", lat: 34.0522, lng: -118.2437, heading: 270, altitude: 28000, speed: 450, verticalRate: -500, originCountry: "United States", lastSeen: Date.now() - 3000, onGround: false, dataSource: "opensky" },
  { id: "3", callsign: "DAL890", icao24: "a7b8c9", lat: 33.7490, lng: -84.3880, heading: 180, altitude: 32000, speed: 470, verticalRate: 200, originCountry: "United States", lastSeen: Date.now() - 1500, onGround: false, dataSource: "opensky" },
  { id: "4", callsign: "SWA456", icao24: "d1e2f3", lat: 29.7604, lng: -95.3698, heading: 315, altitude: 25000, speed: 420, verticalRate: 1200, originCountry: "United States", lastSeen: Date.now() - 4000, onGround: false, dataSource: "opensky" },
  { id: "5", callsign: "JBU789", icao24: "d4e5f6", lat: 42.3601, lng: -71.0589, heading: 90, altitude: 30000, speed: 460, verticalRate: 0, originCountry: "United States", lastSeen: Date.now() - 2500, onGround: false, dataSource: "opensky" },
  { id: "6", callsign: "UAL555", icao24: "g1h2i3", lat: 37.7749, lng: -122.4194, heading: 120, altitude: 38000, speed: 495, verticalRate: -200, originCountry: "United States", lastSeen: Date.now() - 1000, onGround: false, dataSource: "opensky" },
  { id: "7", callsign: "AAL333", icao24: "g4h5i6", lat: 41.8781, lng: -87.6298, heading: 200, altitude: 33000, speed: 475, verticalRate: 0, originCountry: "United States", lastSeen: Date.now() - 3500, onGround: false, dataSource: "opensky" },
  { id: "8", callsign: "DAL111", icao24: "j1k2l3", lat: 25.7617, lng: -80.1918, heading: 350, altitude: 27000, speed: 440, verticalRate: 800, originCountry: "United States", lastSeen: Date.now() - 2000, onGround: false, dataSource: "opensky" },
  { id: "9", callsign: "FDX901", icao24: "j4k5l6", lat: 35.2271, lng: -80.8431, heading: 60, altitude: 40000, speed: 510, verticalRate: 0, originCountry: "United States", lastSeen: Date.now() - 1500, onGround: false, dataSource: "opensky" },
  { id: "10", callsign: "UPS802", icao24: "m1n2o3", lat: 38.2527, lng: -85.7585, heading: 280, altitude: 42000, speed: 520, verticalRate: -100, originCountry: "United States", lastSeen: Date.now() - 3000, onGround: false, dataSource: "opensky" },
  { id: "11", callsign: "SWA234", icao24: "m4n5o6", lat: 32.7767, lng: -96.7970, heading: 45, altitude: 31000, speed: 455, verticalRate: 500, originCountry: "United States", lastSeen: Date.now() - 2500, onGround: false, dataSource: "opensky" },
  { id: "12", callsign: "JBU456", icao24: "p1q2r3", lat: 47.6062, lng: -122.3321, heading: 180, altitude: 36000, speed: 480, verticalRate: 0, originCountry: "United States", lastSeen: Date.now() - 4500, onGround: false, dataSource: "opensky" },
  { id: "13", callsign: "AAL789", icao24: "p4q5r6", lat: 39.7392, lng: -104.9903, heading: 90, altitude: 34000, speed: 465, verticalRate: -300, originCountry: "United States", lastSeen: Date.now() - 1000, onGround: false, dataSource: "opensky" },
  { id: "14", callsign: "DAL456", icao24: "s1t2u3", lat: 36.1627, lng: -86.7816, heading: 270, altitude: 29000, speed: 445, verticalRate: 0, originCountry: "United States", lastSeen: Date.now() - 2000, onGround: false, dataSource: "opensky" },
  { id: "15", callsign: "UAL789", icao24: "s4t5u6", lat: 33.4484, lng: -112.0740, heading: 315, altitude: 37000, speed: 490, verticalRate: 100, originCountry: "United States", lastSeen: Date.now() - 3500, onGround: false, dataSource: "opensky" },
  { id: "16", callsign: "ENY4521", icao24: "v1w2x3", lat: 39.8561, lng: -104.6737, heading: 180, altitude: 8500, speed: 180, verticalRate: -1500, originCountry: "United States", lastSeen: Date.now() - 500, onGround: false, dataSource: "adsb" },
  { id: "17", callsign: "SKW5432", icao24: "v4w5x6", lat: 33.9416, lng: -118.4085, heading: 270, altitude: 5000, speed: 160, verticalRate: -1200, originCountry: "United States", lastSeen: Date.now() - 800, onGround: false, dataSource: "adsb" },
  { id: "18", callsign: "N172SP", icao24: "y1z2a3", lat: 41.9742, lng: -87.9073, heading: 90, altitude: 3500, speed: 120, verticalRate: 500, originCountry: "United States", lastSeen: Date.now() - 1200, onGround: false, dataSource: "adsb" },
  { id: "19", callsign: "DAL457", icao24: "scan01", lat: 33.7520, lng: -84.3920, heading: 175, altitude: 32600, speed: 468, verticalRate: -100, originCountry: "United States", lastSeen: Date.now() - 1100, onGround: false, dataSource: "opensky" },
];

// Major US airports
const airports: Airport[] = [
  { code: "JFK", name: "John F. Kennedy International", lat: 40.6413, lng: -73.7781, country: "United States", type: "large" },
  { code: "LAX", name: "Los Angeles International", lat: 33.9416, lng: -118.4085, country: "United States", type: "large" },
  { code: "ORD", name: "O'Hare International", lat: 41.9742, lng: -87.9073, country: "United States", type: "large" },
  { code: "ATL", name: "Hartsfield-Jackson Atlanta", lat: 33.6407, lng: -84.4277, country: "United States", type: "large" },
  { code: "DFW", name: "Dallas/Fort Worth International", lat: 32.8998, lng: -97.0403, country: "United States", type: "large" },
  { code: "DEN", name: "Denver International", lat: 39.8561, lng: -104.6737, country: "United States", type: "large" },
  { code: "SFO", name: "San Francisco International", lat: 37.6213, lng: -122.3790, country: "United States", type: "large" },
  { code: "SEA", name: "Seattle-Tacoma International", lat: 47.4502, lng: -122.3088, country: "United States", type: "large" },
  { code: "MIA", name: "Miami International", lat: 25.7959, lng: -80.2870, country: "United States", type: "large" },
  { code: "BOS", name: "Boston Logan International", lat: 42.3656, lng: -71.0096, country: "United States", type: "large" },
  { code: "PHX", name: "Phoenix Sky Harbor", lat: 33.4373, lng: -112.0078, country: "United States", type: "medium" },
  { code: "IAH", name: "George Bush Intercontinental", lat: 29.9902, lng: -95.3368, country: "United States", type: "medium" },
  { code: "MSP", name: "Minneapolis-Saint Paul", lat: 44.8848, lng: -93.2223, country: "United States", type: "medium" },
  { code: "DTW", name: "Detroit Metropolitan", lat: 42.2124, lng: -83.3534, country: "United States", type: "medium" },
  { code: "EWR", name: "Newark Liberty International", lat: 40.6895, lng: -74.1745, country: "United States", type: "medium" },
  { code: "LGA", name: "LaGuardia", lat: 40.7769, lng: -73.8740, country: "United States", type: "medium" },
  { code: "SAN", name: "San Diego International", lat: 32.7338, lng: -117.1933, country: "United States", type: "medium" },
  { code: "TPA", name: "Tampa International", lat: 27.9755, lng: -82.5332, country: "United States", type: "medium" },
];

// Weather zones with operational impact
const weatherZones = [
  { lat: 40.7128, lng: -74.006, radius: 150, type: "storm", severity: "high", name: "Northeast Storm System" },
  { lat: 33.9425, lng: -118.4081, radius: 80, type: "fog", severity: "medium", name: "Coastal Fog Layer" },
  { lat: 29.7604, lng: -95.3698, radius: 120, type: "thunderstorm", severity: "high", name: "Gulf Coast Convection" },
];

// Enterprise events overlay
const enterpriseEvents = [
  { lat: 33.6407, lng: -84.4277, type: "delay", severity: "high", message: "Ground Stop - ATL" },
  { lat: 41.9742, lng: -87.9073, type: "incident", severity: "medium", message: "Runway Closure - ORD 10L/28R" },
  { lat: 37.6213, lng: -122.3790, type: "delay", severity: "low", message: "Minor Delays - SFO" },
];

// Simplified continent/country outlines (more detailed)
const continentOutlines = {
  northAmerica: [
    // US East Coast
    { lat: 47, lng: -67 }, { lat: 45, lng: -67 }, { lat: 44, lng: -69 }, { lat: 43, lng: -70 },
    { lat: 42, lng: -71 }, { lat: 41, lng: -72 }, { lat: 40, lng: -74 }, { lat: 39, lng: -75 },
    { lat: 37, lng: -76 }, { lat: 35, lng: -76 }, { lat: 33, lng: -78 }, { lat: 31, lng: -81 },
    { lat: 30, lng: -81 }, { lat: 27, lng: -80 }, { lat: 25, lng: -80 }, { lat: 25, lng: -81 },
    // Florida
    { lat: 25, lng: -82 }, { lat: 27, lng: -83 }, { lat: 29, lng: -83 }, { lat: 30, lng: -84 },
    // Gulf Coast
    { lat: 30, lng: -88 }, { lat: 30, lng: -90 }, { lat: 29, lng: -94 }, { lat: 27, lng: -97 },
    { lat: 26, lng: -97 }, { lat: 26, lng: -98 }, { lat: 28, lng: -100 },
    // Mexico Border
    { lat: 29, lng: -103 }, { lat: 31, lng: -106 }, { lat: 32, lng: -114 }, { lat: 33, lng: -117 },
    // West Coast
    { lat: 34, lng: -118 }, { lat: 34, lng: -120 }, { lat: 36, lng: -122 }, { lat: 38, lng: -123 },
    { lat: 40, lng: -124 }, { lat: 42, lng: -124 }, { lat: 46, lng: -124 }, { lat: 48, lng: -123 },
    // Canada Border
    { lat: 49, lng: -123 }, { lat: 49, lng: -95 }, { lat: 49, lng: -85 }, { lat: 45, lng: -83 },
    { lat: 43, lng: -79 }, { lat: 45, lng: -75 }, { lat: 47, lng: -70 }, { lat: 47, lng: -67 },
  ],
  // State boundaries (simplified)
  stateBoundaries: [
    // California-Nevada
    [{ lat: 42, lng: -120 }, { lat: 35, lng: -120 }, { lat: 35, lng: -114 }, { lat: 42, lng: -114 }],
    // Texas
    [{ lat: 36.5, lng: -103 }, { lat: 32, lng: -103 }, { lat: 26, lng: -97 }, { lat: 30, lng: -94 }, { lat: 34, lng: -100 }],
    // Florida
    [{ lat: 31, lng: -85 }, { lat: 25, lng: -80 }, { lat: 25, lng: -82 }, { lat: 30, lng: -87 }],
  ],
};

export function AviationMap({
  onAircraftSelect,
  selectedAircraft,
  activeFilters,
  onBoundsChange,
  onAircraftListUpdate,
  scannerConflicts = [],
}: AviationMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.2);
  const [pan, setPan] = useState({ x: 50, y: -20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showLegend, setShowLegend] = useState(true);
  const animationFrameRef = useRef<number | null>(null);
  const aircraftPositionsRef = useRef<Aircraft[]>(mockAircraft);
  const flightTrailsRef = useRef<Map<string, { lat: number; lng: number }[]>>(new Map());

  // Update aircraft list for parent components
  useEffect(() => {
    onAircraftListUpdate?.(aircraftPositionsRef.current);
  }, [onAircraftListUpdate]);

  // Convert lat/lng to canvas coordinates
  const latLngToCanvas = useCallback(
    (lat: number, lng: number, width: number, height: number) => {
      const x = ((lng + 180) / 360) * width * zoom + pan.x;
      const y = ((90 - lat) / 180) * height * zoom + pan.y;
      return { x, y };
    },
    [zoom, pan]
  );

  // Calculate current map bounds
  const calculateBounds = useCallback((width: number, height: number): MapBounds => {
    const topLeft = {
      lng: ((-pan.x / zoom) / width) * 360 - 180,
      lat: 90 - ((-pan.y / zoom) / height) * 180,
    };
    const bottomRight = {
      lng: ((width - pan.x) / zoom / width) * 360 - 180,
      lat: 90 - ((height - pan.y) / zoom / height) * 180,
    };
    return {
      north: Math.min(90, Math.max(topLeft.lat, bottomRight.lat)),
      south: Math.max(-90, Math.min(topLeft.lat, bottomRight.lat)),
      east: Math.min(180, Math.max(topLeft.lng, bottomRight.lng)),
      west: Math.max(-180, Math.min(topLeft.lng, bottomRight.lng)),
    };
  }, [zoom, pan]);

  // Cluster nearby aircraft
  const clusterAircraft = useCallback((aircraft: Aircraft[], width: number, height: number) => {
    const clusterRadius = 25;
    const clusters: { center: { x: number; y: number; lat: number; lng: number }; aircraft: Aircraft[] }[] = [];
    const processed = new Set<string>();

    aircraft.forEach((ac) => {
      if (processed.has(ac.id)) return;
      
      const pos = latLngToCanvas(ac.lat, ac.lng, width, height);
      const cluster = { center: { ...pos, lat: ac.lat, lng: ac.lng }, aircraft: [ac] };
      processed.add(ac.id);

      aircraft.forEach((other) => {
        if (processed.has(other.id)) return;
        const otherPos = latLngToCanvas(other.lat, other.lng, width, height);
        const distance = Math.sqrt((pos.x - otherPos.x) ** 2 + (pos.y - otherPos.y) ** 2);
        if (distance < clusterRadius && zoom < 1.5) {
          cluster.aircraft.push(other);
          processed.add(other.id);
        }
      });

      clusters.push(cluster);
    });

    return clusters;
  }, [latLngToCanvas, zoom]);

  // Draw the map
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = container.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Dark background with subtle gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a0a14");
    bgGradient.addColorStop(1, "#080810");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "rgba(40, 50, 70, 0.25)";
    ctx.lineWidth = 1;
    const gridSize = 50 * zoom;
    for (let x = (pan.x % gridSize); x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = (pan.y % gridSize); y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw continent outlines
    ctx.strokeStyle = "rgba(60, 80, 110, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(25, 35, 55, 0.5)";
    
    // North America
    ctx.beginPath();
    continentOutlines.northAmerica.forEach((point, i) => {
      const { x, y } = latLngToCanvas(point.lat, point.lng, width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // State boundaries (faint)
    ctx.strokeStyle = "rgba(50, 65, 90, 0.3)";
    ctx.lineWidth = 0.5;
    continentOutlines.stateBoundaries.forEach((boundary) => {
      ctx.beginPath();
      boundary.forEach((point, i) => {
        const { x, y } = latLngToCanvas(point.lat, point.lng, width, height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Draw weather overlays if filter active
    if (activeFilters.includes("Weather")) {
      weatherZones.forEach((zone) => {
        const { x, y } = latLngToCanvas(zone.lat, zone.lng, width, height);
        const radius = zone.radius * zoom * 0.8;
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        if (zone.severity === "high") {
          gradient.addColorStop(0, "rgba(255, 80, 80, 0.35)");
          gradient.addColorStop(0.6, "rgba(255, 80, 80, 0.15)");
          gradient.addColorStop(1, "rgba(255, 80, 80, 0)");
        } else {
          gradient.addColorStop(0, "rgba(255, 180, 80, 0.25)");
          gradient.addColorStop(0.6, "rgba(255, 180, 80, 0.1)");
          gradient.addColorStop(1, "rgba(255, 180, 80, 0)");
        }
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Weather zone label
        if (zoom > 1) {
          ctx.font = "10px 'Geist', sans-serif";
          ctx.fillStyle = zone.severity === "high" ? "rgba(255, 120, 120, 0.8)" : "rgba(255, 200, 120, 0.8)";
          ctx.textAlign = "center";
          ctx.fillText(zone.name, x, y - radius - 5);
        }
      });
    }

    // Draw congestion heatmap if filter active
    if (activeFilters.includes("Congestion")) {
      // Calculate density based on aircraft positions
      const densityMap = new Map<string, number>();
      const gridCellSize = 50;
      
      aircraftPositionsRef.current.forEach((aircraft) => {
        const { x, y } = latLngToCanvas(aircraft.lat, aircraft.lng, width, height);
        const cellX = Math.floor(x / gridCellSize);
        const cellY = Math.floor(y / gridCellSize);
        const key = `${cellX},${cellY}`;
        densityMap.set(key, (densityMap.get(key) || 0) + 1);
      });

      densityMap.forEach((count, key) => {
        if (count >= 2) {
          const [cellX, cellY] = key.split(",").map(Number);
          const x = (cellX + 0.5) * gridCellSize;
          const y = (cellY + 0.5) * gridCellSize;
          const radius = 40 + count * 15;
          
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          const alpha = Math.min(0.4, 0.15 + count * 0.08);
          gradient.addColorStop(0, `rgba(255, 100, 50, ${alpha})`);
          gradient.addColorStop(0.5, `rgba(255, 100, 50, ${alpha * 0.5})`);
          gradient.addColorStop(1, "rgba(255, 100, 50, 0)");
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Draw enterprise events if filter active
    if (activeFilters.includes("Enterprise Events")) {
      enterpriseEvents.forEach((event) => {
        const { x, y } = latLngToCanvas(event.lat, event.lng, width, height);
        
        // Event marker ring
        ctx.strokeStyle = event.severity === "high" ? "rgba(255, 80, 120, 0.8)" : 
                         event.severity === "medium" ? "rgba(255, 180, 80, 0.8)" : "rgba(100, 200, 255, 0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Event icon
        ctx.fillStyle = event.severity === "high" ? "#ff5078" : 
                       event.severity === "medium" ? "#ffb450" : "#64c8ff";
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Event label
        if (zoom > 0.9) {
          ctx.font = "bold 10px 'Geist', sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillText(event.message, x, y + 40);
        }
      });
    }

    // Draw airports
    airports.forEach((airport) => {
      const { x, y } = latLngToCanvas(airport.lat, airport.lng, width, height);
      
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) return;

      const size = airport.type === "large" ? 8 : airport.type === "medium" ? 6 : 4;
      
      // Airport marker
      ctx.fillStyle = airport.type === "large" ? "rgba(100, 180, 255, 0.9)" : 
                     airport.type === "medium" ? "rgba(100, 180, 255, 0.6)" : "rgba(100, 180, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // Airport code label
      if (zoom > 0.8 && airport.type !== "small") {
        ctx.font = `${airport.type === "large" ? "bold " : ""}10px 'Geist', sans-serif`;
        ctx.fillStyle = "rgba(150, 200, 255, 0.8)";
        ctx.textAlign = "center";
        ctx.fillText(airport.code, x, y - size - 4);
      }
    });

    // Draw flight trails for selected aircraft
    if (activeFilters.includes("Flight Paths") && selectedAircraft) {
      const trail = flightTrailsRef.current.get(selectedAircraft.id);
      if (trail && trail.length > 1) {
        ctx.strokeStyle = "rgba(0, 212, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        trail.forEach((point, i) => {
          const { x, y } = latLngToCanvas(point.lat, point.lng, width, height);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Dotted line for projected path
        const lastPos = trail[trail.length - 1];
        const projectedLat = lastPos.lat + Math.cos((selectedAircraft.heading * Math.PI) / 180) * 5;
        const projectedLng = lastPos.lng + Math.sin((selectedAircraft.heading * Math.PI) / 180) * 8;
        
        ctx.strokeStyle = "rgba(0, 212, 255, 0.3)";
        ctx.setLineDash([6, 4]);
        const start = latLngToCanvas(lastPos.lat, lastPos.lng, width, height);
        const end = latLngToCanvas(projectedLat, projectedLng, width, height);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw aircraft with clustering
    if (activeFilters.includes("Live Airspace")) {
      const clusters = clusterAircraft(aircraftPositionsRef.current, width, height);
      
      clusters.forEach((cluster) => {
        const { x, y } = cluster.center;
        
        if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;

        if (cluster.aircraft.length > 1 && zoom < 1.5) {
          // Draw cluster
          const clusterSize = 16 + cluster.aircraft.length * 2;
          
          ctx.fillStyle = "rgba(255, 184, 0, 0.2)";
          ctx.beginPath();
          ctx.arc(x, y, clusterSize, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 184, 0, 0.6)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, clusterSize, 0, Math.PI * 2);
          ctx.stroke();

          ctx.font = "bold 12px 'Geist', sans-serif";
          ctx.fillStyle = "#ffb800";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(cluster.aircraft.length.toString(), x, y);
        } else {
          // Draw individual aircraft
          cluster.aircraft.forEach((aircraft) => {
            const pos = latLngToCanvas(aircraft.lat, aircraft.lng, width, height);
            const isSelected = selectedAircraft?.id === aircraft.id;
            const size = isSelected ? 14 : 10;

            // Glow for selected
            if (isSelected) {
              const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 35);
              glow.addColorStop(0, "rgba(0, 212, 255, 0.5)");
              glow.addColorStop(1, "rgba(0, 212, 255, 0)");
              ctx.fillStyle = glow;
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, 35, 0, Math.PI * 2);
              ctx.fill();
            }

            // Aircraft icon
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate((aircraft.heading * Math.PI) / 180);
            
            // Color based on data source and selection
            ctx.fillStyle = isSelected ? "#00d4ff" : 
                           aircraft.dataSource === "enterprise" ? "#ff80b0" : "#ffb800";
            
            ctx.beginPath();
            ctx.moveTo(0, -size);
            ctx.lineTo(-size * 0.6, size * 0.5);
            ctx.lineTo(0, size * 0.2);
            ctx.lineTo(size * 0.6, size * 0.5);
            ctx.closePath();
            ctx.fill();

            ctx.restore();

            // Callsign label
            if (zoom > 0.8 || isSelected) {
              ctx.font = `${isSelected ? "bold " : ""}10px 'Geist', sans-serif`;
              ctx.fillStyle = isSelected ? "#00d4ff" : "rgba(255, 255, 255, 0.75)";
              ctx.textAlign = "center";
              ctx.fillText(aircraft.callsign, pos.x, pos.y + size + 12);
              
              // Altitude label for selected
              if (isSelected) {
                ctx.font = "9px 'Geist', sans-serif";
                ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
                ctx.fillText(`FL${Math.round(aircraft.altitude / 100)}`, pos.x, pos.y + size + 23);
              }
            }
          });
        }
      });
    }

    if (activeFilters.includes("Airspace Scanner")) {
      scannerConflicts.forEach((pair) => {
        const color = pair.weatherAdjustedRisk === "Critical" ? "#ef4444" :
          pair.weatherAdjustedRisk === "High" ? "#f97316" :
          pair.weatherAdjustedRisk === "Medium" ? "#f59e0b" : "#38bdf8";
        const a = latLngToCanvas(pair.aircraftA.lat, pair.aircraftA.lng, width, height);
        const b = latLngToCanvas(pair.aircraftB.lat, pair.aircraftB.lng, width, height);
        ctx.strokeStyle = color;
        ctx.lineWidth = pair.weatherAdjustedRisk === "Critical" ? 3 : 2;
        ctx.setLineDash(pair.weatherAdjustedRisk === "Low" ? [5, 7] : []);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        [a, b].forEach((pos) => {
          ctx.fillStyle = "rgba(10, 10, 20, 0.9)";
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        ctx.font = "bold 10px 'Geist', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = color;
        ctx.fillText(`${pair.weatherAdjustedRisk} proximity`, midX, midY - 8);
      });
    }

    // Notify parent of bounds change
    const bounds = calculateBounds(width, height);
    onBoundsChange?.(bounds);

  }, [zoom, pan, activeFilters, selectedAircraft, latLngToCanvas, clusterAircraft, calculateBounds, onBoundsChange, scannerConflicts]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      aircraftPositionsRef.current = aircraftPositionsRef.current.map((aircraft) => {
        const newLat = aircraft.lat + Math.cos((aircraft.heading * Math.PI) / 180) * 0.0008;
        const newLng = aircraft.lng + Math.sin((aircraft.heading * Math.PI) / 180) * 0.0008;
        
        // Update flight trail
        if (selectedAircraft?.id === aircraft.id) {
          const trail = flightTrailsRef.current.get(aircraft.id) || [];
          trail.push({ lat: aircraft.lat, lng: aircraft.lng });
          if (trail.length > 50) trail.shift();
          flightTrailsRef.current.set(aircraft.id, trail);
        }
        
        return {
          ...aircraft,
          lat: newLat,
          lng: newLng,
          lastSeen: Date.now(),
        };
      });
      
      drawMap();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [drawMap, selectedAircraft]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => drawMap();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawMap]);

  // Handle click
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { width, height } = container.getBoundingClientRect();

      const clicked = { aircraft: null as Aircraft | null };
      let minDistance = Infinity;

      aircraftPositionsRef.current.forEach((aircraft) => {
        const pos = latLngToCanvas(aircraft.lat, aircraft.lng, width, height);
        const distance = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
        if (distance < 25 && distance < minDistance) {
          clicked.aircraft = aircraft;
          minDistance = distance;
        }
      });

      onAircraftSelect(clicked.aircraft);
      
      // Initialize trail for newly selected aircraft
      if (clicked.aircraft && !flightTrailsRef.current.has(clicked.aircraft.id)) {
        flightTrailsRef.current.set(clicked.aircraft.id, [{ lat: clicked.aircraft.lat, lng: clicked.aircraft.lng }]);
      }
    },
    [latLngToCanvas, onAircraftSelect]
  );

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((prev) => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  const aircraftInView = useMemo(() => aircraftPositionsRef.current.length, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Map Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          onClick={() => setZoom((prev) => Math.min(prev * 1.2, 5))}
          className="p-2 glass-panel rounded-lg text-foreground hover:bg-secondary/50 transition-colors"
          title="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((prev) => Math.max(prev * 0.8, 0.5))}
          className="p-2 glass-panel rounded-lg text-foreground hover:bg-secondary/50 transition-colors"
          title="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1.2); setPan({ x: 50, y: -20 }); }}
          className="p-2 glass-panel rounded-lg text-foreground hover:bg-secondary/50 transition-colors"
          title="Reset view"
        >
          <Locate className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowLegend(!showLegend)}
          className={`p-2 glass-panel rounded-lg transition-colors ${showLegend ? "text-primary bg-primary/10" : "text-foreground hover:bg-secondary/50"}`}
          title="Toggle legend"
        >
          <Layers className="w-4 h-4" />
        </button>
        <button className="p-2 glass-panel rounded-lg text-foreground hover:bg-secondary/50 transition-colors" title="Fullscreen">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Live Indicator & Count */}
      <div className="absolute top-4 left-4 flex items-center gap-3 px-3 py-2 glass-panel rounded-lg">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
        </span>
        <span className="text-xs font-semibold text-foreground">LIVE</span>
        <div className="w-px h-4 bg-border/50" />
        <span className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">{aircraftInView}</span> aircraft in view
        </span>
      </div>

      {/* Map Legend */}
      {showLegend && (
        <div className="absolute bottom-4 left-4 glass-panel rounded-lg p-3 space-y-2.5 min-w-[180px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Legend</span>
            <Info className="w-3 h-3 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-[#ffb800]" />
            <span className="text-xs text-muted-foreground">Aircraft (Public Feed)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-[#00d4ff]" />
            <span className="text-xs text-muted-foreground">Selected Aircraft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#64b4ff]" />
            <span className="text-xs text-muted-foreground">Airport</span>
          </div>
          {activeFilters.includes("Weather") && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-red-400/60 to-red-400/20" />
              <span className="text-xs text-muted-foreground">Weather Impact</span>
            </div>
          )}
          {activeFilters.includes("Congestion") && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-orange-400/60 to-orange-400/20" />
              <span className="text-xs text-muted-foreground">High Density</span>
            </div>
          )}
          {activeFilters.includes("Enterprise Events") && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-pink-400" />
              <span className="text-xs text-muted-foreground">Enterprise Event</span>
            </div>
          )}
          {activeFilters.includes("Airspace Scanner") && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-px bg-red-400" />
              <span className="text-xs text-muted-foreground">Scanner Conflict</span>
            </div>
          )}
        </div>
      )}

      {/* Zoom Level Indicator */}
      <div className="absolute bottom-4 right-4 glass-panel rounded-lg px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Zoom: <span className="text-foreground font-medium">{zoom.toFixed(1)}x</span></span>
      </div>
    </div>
  );
}
