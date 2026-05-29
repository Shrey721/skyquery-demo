"use client";

import {
  Search,
  Plane,
  CloudRain,
  Building2,
  Route,
  History,
  Activity,
  Filter,
  Info,
} from "lucide-react";

interface FilterBarProps {
  activeFilters: string[];
  onFilterToggle: (filter: string) => void;
  showReplay: boolean;
}

const filters = [
  { 
    id: "Live Airspace", 
    label: "Live Airspace", 
    icon: Plane,
    description: "Live aircraft positions from public flight feeds (OpenSky, ADS-B)"
  },
  { 
    id: "Congestion", 
    label: "Congestion", 
    icon: Activity,
    description: "Calculate density heatmap from aircraft count in map bounds"
  },
  { 
    id: "Weather", 
    label: "Weather", 
    icon: CloudRain,
    description: "Airport and regional weather impact overlays from weather API"
  },
  { 
    id: "Enterprise Events", 
    label: "Enterprise Events", 
    icon: Building2,
    description: "Internal delay/incident overlays from enterprise data warehouse"
  },
  { 
    id: "Flight Paths", 
    label: "Flight Paths", 
    icon: Route,
    description: "Show recent track/trail for selected aircraft"
  },
  { 
    id: "Replay", 
    label: "Replay", 
    icon: History,
    description: "View historical cached snapshots (not real-time)"
  },
];

export function FilterBar({
  activeFilters,
  onFilterToggle,
  showReplay,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-background/60 backdrop-blur-lg">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search flights, airports, routes, regions..."
          className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 flex-1">
        {filters.map((filter) => {
          const isActive =
            filter.id === "Replay"
              ? showReplay
              : activeFilters.includes(filter.id);
          const Icon = filter.icon;

          return (
            <button
              key={filter.id}
              onClick={() => onFilterToggle(filter.id)}
              title={filter.description}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary/30 text-muted-foreground border border-transparent hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{filter.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Button */}
      <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 text-muted-foreground border border-transparent hover:bg-secondary/50 hover:text-foreground transition-all">
        <Filter className="w-4 h-4" />
        <span className="text-sm font-medium">Filters</span>
      </button>

      {/* Info indicator */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Info className="w-3 h-3" />
        <span>Hover for filter info</span>
      </div>
    </div>
  );
}
