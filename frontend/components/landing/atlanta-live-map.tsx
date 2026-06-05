"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

interface PlaneState {
  callsign: string;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
}

export function AtlantaLiveMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const aircraftMarkersRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);

  // Mock aircraft positions & movement vector
  const [aircraft, setAircraft] = useState<PlaneState[]>([
    { callsign: "DL882", lat: 33.75, lon: -84.25, speed: 280, heading: 240 },
    { callsign: "UA1405", lat: 33.52, lon: -84.62, speed: 250, heading: 60 },
    { callsign: "AA451", lat: 33.81, lon: -84.55, speed: 310, heading: 135 },
    { callsign: "DL291", lat: 33.48, lon: -84.21, speed: 190, heading: 315 },
  ]);

  // Handle leaflet initialization
  useEffect(() => {
    let cancelled = false;
    async function initMap() {
      if (!containerRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      leafletRef.current = L.default ?? L;

      // Initialize map centered on ATL
      const map = leafletRef.current.map(containerRef.current, {
        center: [33.6407, -84.4277],
        zoom: 9,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      // Dark theme tiles
      leafletRef.current.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 }
      ).addTo(map);

      // Add 100nm radius circle around ATL
      // 100 nm = 185,200 meters (roughly ~1.67 degrees radius in bounding box)
      const circle = leafletRef.current.circle([33.6407, -84.4277], {
        radius: 120000, // Reduced slightly to fit nicely inside container aspect ratio
        color: "rgba(34,211,238,0.4)",
        weight: 1.5,
        dashArray: "5, 5",
        fillColor: "#0891b2",
        fillOpacity: 0.03,
      }).addTo(map);
      circleRef.current = circle;

      // Add ATL Airport Marker
      const atlIcon = leafletRef.current.divIcon({
        html: `
          <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/30">
            <div class="absolute inset-0 rounded-full bg-cyan-500 animate-pulse opacity-30"></div>
            <div class="relative flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)] text-white font-bold text-[9px]">ATL</div>
          </div>
        `,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      leafletRef.current.marker([33.6407, -84.4277], { icon: atlIcon }).addTo(map);

      // Fit map to bounds with padding
      map.fitBounds(circle.getBounds(), { padding: [10, 10] });
    }

    initMap();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update plane positions
  useEffect(() => {
    const timer = setInterval(() => {
      setAircraft((prev) =>
        prev.map((plane) => {
          // Calculate heading vector
          const rad = (plane.heading * Math.PI) / 180;
          // Very small lat/lon change per tick (~0.0025 degrees per tick)
          let nextLat = plane.lat + Math.cos(rad) * 0.002;
          let nextLon = plane.lon + Math.sin(rad) * 0.002;

          // Check distance from ATL, if too far wrap around or reverse heading
          const dist = Math.sqrt(Math.pow(nextLat - 33.6407, 2) + Math.pow(nextLon - -84.4277, 2));
          let nextHeading = plane.heading;
          if (dist > 0.6) {
            // Turn back towards ATL
            nextHeading = (plane.heading + 180) % 360;
          }

          return {
            ...plane,
            lat: nextLat,
            lon: nextLon,
            heading: nextHeading,
          };
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Update plane markers on Leaflet map
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    // Clear old markers
    aircraftMarkersRef.current.forEach((m) => m.remove());
    aircraftMarkersRef.current = [];

    // Create new markers
    aircraftMarkersRef.current = aircraft.map((plane) => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
          style="transform:rotate(${plane.heading}deg); filter: drop-shadow(0 0 4px #22d3ee)">
          <path fill="#22d3ee" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"/>
        </svg>`;
      const icon = L.divIcon({
        html: svg,
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      return L.marker([plane.lat, plane.lon], { icon }).addTo(map);
    });
  }, [aircraft]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-[#070b0e]"
      style={{ minHeight: "100%", width: "100%" }}
    />
  );
}
