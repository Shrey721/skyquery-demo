import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
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
  const [isInView, setIsInView] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Mock aircraft positions & movement vector
  const aircraftRef = useRef<PlaneState[]>([
    { callsign: "DL882", lat: 33.75, lon: -84.25, speed: 280, heading: 240 },
    { callsign: "UA1405", lat: 33.52, lon: -84.62, speed: 250, heading: 60 },
    { callsign: "AA451", lat: 33.81, lon: -84.55, speed: 310, heading: 135 },
    { callsign: "DL291", lat: 33.48, lon: -84.21, speed: 190, heading: 315 },
  ]);

  // Handle intersection observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Handle leaflet initialization
  useEffect(() => {
    let cancelled = false;
    async function initMap() {
      if (!containerRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const Leaflet = L.default ?? L;
      leafletRef.current = Leaflet;

      // Initialize map centered on ATL
      const map = Leaflet.map(containerRef.current, {
        center: [33.6407, -84.4277],
        zoom: 9,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      // Dark theme tiles
      Leaflet.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 }
      ).addTo(map);

      // Add 100nm radius circle around ATL
      const circle = Leaflet.circle([33.6407, -84.4277], {
        radius: 120000, // Reduced slightly to fit nicely inside container aspect ratio
        color: "rgba(34,211,238,0.4)",
        weight: 1.5,
        dashArray: "5, 5",
        fillColor: "#0891b2",
        fillOpacity: 0.03,
      }).addTo(map);
      circleRef.current = circle;

      // Add ATL Airport Marker
      const atlIcon = Leaflet.divIcon({
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
      Leaflet.marker([33.6407, -84.4277], { icon: atlIcon }).addTo(map);

      // Add static or dynamic aircraft markers once
      aircraftMarkersRef.current = aircraftRef.current.map((plane) => {
        const svg = `
          <svg data-plane-svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
            style="transform:rotate(${plane.heading}deg); filter: drop-shadow(0 0 4px #22d3ee); will-change: transform;">
            <path fill="#22d3ee" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"/>
          </svg>`;
        const icon = Leaflet.divIcon({
          html: svg,
          className: "",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        return Leaflet.marker([plane.lat, plane.lon], { icon }).addTo(map);
      });

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

  // Update plane positions loop (paused if offscreen or reduced motion is true)
  useEffect(() => {
    if (!isInView || shouldReduceMotion) return;

    const timer = setInterval(() => {
      const L = leafletRef.current;
      if (!L || !mapRef.current || !aircraftMarkersRef.current.length) return;

      aircraftRef.current = aircraftRef.current.map((plane, idx) => {
        const rad = (plane.heading * Math.PI) / 180;
        let nextLat = plane.lat + Math.cos(rad) * 0.002;
        let nextLon = plane.lon + Math.sin(rad) * 0.002;

        const dist = Math.sqrt(Math.pow(nextLat - 33.6407, 2) + Math.pow(nextLon - -84.4277, 2));
        let nextHeading = plane.heading;
        if (dist > 0.6) {
          nextHeading = (plane.heading + 180) % 360;
        }

        const marker = aircraftMarkersRef.current[idx];
        if (marker) {
          marker.setLatLng([nextLat, nextLon]);
          const svgEl = marker.getElement()?.querySelector("[data-plane-svg]") as SVGElement | null;
          if (svgEl) {
            svgEl.style.transform = `rotate(${nextHeading}deg)`;
          }
        }

        return {
          ...plane,
          lat: nextLat,
          lon: nextLon,
          heading: nextHeading,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isInView, shouldReduceMotion]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-[#070b0e]"
      style={{ minHeight: "100%", width: "100%" }}
    />
  );
}
