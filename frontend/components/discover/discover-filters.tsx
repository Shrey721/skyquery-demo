"use client"

import { Activity, Plane, Search } from "lucide-react"

interface DiscoverFiltersProps {
  search: string
  onSearchChange: (search: string) => void
  showOnGround: boolean
  onToggleOnGround: () => void
}

export function DiscoverFilters({ search, onSearchChange, showOnGround, onToggleOnGround }: DiscoverFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/30 bg-background/70 px-4 py-3 backdrop-blur-lg">
      <div className="relative min-w-[260px] flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search callsign, ICAO24, country..."
          className="w-full rounded-lg border border-border/50 bg-secondary/40 py-2 pl-10 pr-3 text-sm outline-none transition focus:border-primary/50"
        />
      </div>
      <span className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
        <Plane className="h-3.5 w-3.5" /> Live Airspace
      </span>
      <span className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
        <Activity className="h-3.5 w-3.5" /> Congestion
      </span>
      <button
        onClick={onToggleOnGround}
        className={`rounded-lg border px-3 py-2 text-xs transition ${showOnGround ? "border-primary/30 bg-primary/10 text-primary" : "border-border/40 bg-secondary/30 text-muted-foreground"}`}
      >
        Include on-ground aircraft
      </button>
      <span className="text-xs text-muted-foreground">Weather data unavailable</span>
    </div>
  )
}
