"use client";

import { useState, useCallback } from "react";
import { TopNavigation } from "@/components/discover/top-navigation";
import { FilterBar } from "@/components/discover/filter-bar";
import { AviationMap, Aircraft, MapBounds } from "@/components/discover/aviation-map";
import { OperationalPanel } from "@/components/discover/operational-panel";
import { ReplayTimeline } from "@/components/discover/replay-timeline";

export default function DiscoverPage() {
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>(["Live Airspace"]);
  const [showReplay, setShowReplay] = useState(false);
  const [aircraftInView, setAircraftInView] = useState(0);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  const handleFilterToggle = (filter: string) => {
    if (filter === "Replay") {
      setShowReplay(!showReplay);
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
  }, []);

  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
  }, []);

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
          />
        </div>

        {/* Right Operational Panel */}
        <OperationalPanel
          selectedAircraft={selectedAircraft}
          onClose={() => setSelectedAircraft(null)}
          aircraftInView={aircraftInView}
          mapBounds={mapBounds}
          activeFilters={activeFilters}
        />
      </div>

      {/* Bottom Replay Timeline */}
      {showReplay && <ReplayTimeline onClose={() => setShowReplay(false)} />}
    </div>
  );
}
