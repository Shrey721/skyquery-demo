"use client";

import { useState, useCallback, useMemo } from "react";
import { TopNavigation } from "@/components/discover/top-navigation";
import { FilterBar } from "@/components/discover/filter-bar";
import { AviationMap, Aircraft, MapBounds, ScannerConflict } from "@/components/discover/aviation-map";
import { OperationalPanel } from "@/components/discover/operational-panel";
import { ReplayTimeline } from "@/components/discover/replay-timeline";

export default function DiscoverPage() {
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>(["Live Airspace"]);
  const [showReplay, setShowReplay] = useState(false);
  const [aircraftInView, setAircraftInView] = useState(0);
  const [aircraftSnapshot, setAircraftSnapshot] = useState<Aircraft[]>([]);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  const handleFilterToggle = (filter: string) => {
    if (filter === "Replay") {
      setShowReplay(!showReplay);
    } else if (filter === "Airspace Scanner") {
      setActiveFilters((prev) => {
        const enabled = prev.includes(filter);
        if (enabled) return prev.filter((f) => f !== filter);
        return Array.from(new Set([...prev, "Live Airspace", filter]));
      });
    } else {
      setActiveFilters((prev) =>
        prev.includes(filter)
          ? prev.filter((f) => f !== filter)
          : [...prev, filter]
      );
    }
  };

  const handleAircraftListUpdate = useCallback((aircraft: Aircraft[]) => {
    setAircraftInView(aircraft.length);
    setAircraftSnapshot(aircraft);
  }, []);

  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
  }, []);

  const scannerConflicts = useMemo(() => {
    if (!activeFilters.includes("Airspace Scanner")) return [];
    return scanScannerConflicts(aircraftSnapshot);
  }, [activeFilters, aircraftSnapshot]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TopNavigation />
      <FilterBar
        activeFilters={activeFilters}
        onFilterToggle={handleFilterToggle}
        showReplay={showReplay}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main Map Area */}
        <div className="flex-1 relative">
          <AviationMap
            onAircraftSelect={setSelectedAircraft}
            selectedAircraft={selectedAircraft}
            activeFilters={activeFilters}
            onBoundsChange={handleBoundsChange}
            onAircraftListUpdate={handleAircraftListUpdate}
            scannerConflicts={scannerConflicts}
          />
        </div>

        {/* Right Operational Panel */}
        <OperationalPanel
          selectedAircraft={selectedAircraft}
          onClose={() => setSelectedAircraft(null)}
          aircraftInView={aircraftInView}
          mapBounds={mapBounds}
          activeFilters={activeFilters}
          scannerConflicts={scannerConflicts}
        />
      </div>

      {/* Bottom Replay Timeline */}
      {showReplay && <ReplayTimeline onClose={() => setShowReplay(false)} />}
    </div>
  );
}

function scanScannerConflicts(aircraft: Aircraft[]): ScannerConflict[] {
  const pairs: ScannerConflict[] = [];
  for (let left = 0; left < aircraft.length; left += 1) {
    for (let right = left + 1; right < aircraft.length; right += 1) {
      const aircraftA = aircraft[left];
      const aircraftB = aircraft[right];
      const horizontalKm = haversineKm(aircraftA.lat, aircraftA.lng, aircraftB.lat, aircraftB.lng);
      const verticalFt = Math.abs(aircraftA.altitude - aircraftB.altitude);
      const baseRisk = scannerRisk(horizontalKm, verticalFt);
      if (!baseRisk) continue;
      const weatherAdjustedRisk = baseRisk === "Low" ? "Medium" : baseRisk === "Medium" ? "High" : "Critical";
      pairs.push({
        id: [aircraftA.id, aircraftB.id].sort().join(":"),
        aircraftA,
        aircraftB,
        horizontalKm,
        verticalFt,
        baseRisk,
        weatherAdjustedRisk,
        weatherFactor: "Light rain / weather context demo",
        nearestAirport: "ATL",
      });
    }
  }
  return pairs.sort((left, right) => riskRank(right.weatherAdjustedRisk) - riskRank(left.weatherAdjustedRisk) || left.horizontalKm - right.horizontalKm);
}

function scannerRisk(horizontalKm: number, verticalFt: number): ScannerConflict["baseRisk"] | null {
  if (horizontalKm <= 5 && verticalFt <= 1000) return "Critical";
  if (horizontalKm <= 10 && verticalFt <= 1500) return "High";
  if (horizontalKm <= 20 && verticalFt <= 2500) return "Medium";
  if (horizontalKm <= 35 && verticalFt <= 4000) return "Low";
  return null;
}

function riskRank(risk: ScannerConflict["weatherAdjustedRisk"]) {
  return { Low: 0, Medium: 1, High: 2, Critical: 3 }[risk];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLon = (lon2 - lon1) * radians;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
