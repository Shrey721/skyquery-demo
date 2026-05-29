"use client";

import { useState } from "react";
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  Calendar,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface ReplayTimelineProps {
  onClose: () => void;
}

export function ReplayTimeline({ onClose }: ReplayTimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState([50]);

  // Mock timeline data
  const startTime = "00:00";
  const endTime = "23:59";
  const currentDisplayTime = "12:30";

  return (
    <div className="border-t border-border/30 bg-background/90 backdrop-blur-xl p-4">
      <div className="flex items-center gap-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Date Selector */}
        <div className="flex items-center gap-2 px-3 py-2 glass-panel rounded-lg">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">May 27, 2026</span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-secondary/50 transition-colors">
            <SkipBack className="w-4 h-4 text-foreground" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-3 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-primary" />
            ) : (
              <Play className="w-5 h-5 text-primary" />
            )}
          </button>
          <button className="p-2 rounded-lg hover:bg-secondary/50 transition-colors">
            <SkipForward className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Time Display */}
        <div className="flex items-center gap-2 px-3 py-2 glass-panel rounded-lg">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-sm font-mono font-medium text-foreground">
            {currentDisplayTime}
          </span>
          <span className="text-xs text-muted-foreground">UTC</span>
        </div>

        {/* Timeline Slider */}
        <div className="flex-1 flex items-center gap-4">
          <span className="text-xs text-muted-foreground font-mono">{startTime}</span>
          <div className="flex-1 relative">
            <Slider
              value={currentTime}
              onValueChange={setCurrentTime}
              max={100}
              step={1}
              className="w-full"
            />
            {/* Event markers on timeline */}
            <div className="absolute inset-0 pointer-events-none flex items-center">
              <div
                className="absolute w-1.5 h-3 bg-amber-400 rounded-full"
                style={{ left: "23%" }}
                title="Weather event"
              />
              <div
                className="absolute w-1.5 h-3 bg-red-400 rounded-full"
                style={{ left: "45%" }}
                title="High congestion"
              />
              <div
                className="absolute w-1.5 h-3 bg-accent rounded-full"
                style={{ left: "67%" }}
                title="Anomaly detected"
              />
              <div
                className="absolute w-1.5 h-3 bg-amber-400 rounded-full"
                style={{ left: "82%" }}
                title="Delay event"
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-mono">{endTime}</span>
        </div>

        {/* Speed Control */}
        <div className="flex items-center gap-2 px-3 py-2 glass-panel rounded-lg">
          <span className="text-xs text-muted-foreground">Speed</span>
          <select className="bg-transparent text-sm font-medium text-foreground focus:outline-none cursor-pointer">
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="10">10x</option>
          </select>
        </div>
      </div>

      {/* Timeline Legend */}
      <div className="flex items-center gap-6 mt-3 ml-12">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-muted-foreground">Weather Events</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-xs text-muted-foreground">High Congestion</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-xs text-muted-foreground">Anomalies</span>
        </div>
      </div>
    </div>
  );
}
