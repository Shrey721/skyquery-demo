"use client";

import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  MessageSquare,
  ArrowRight,
  Cloud,
  Plane,
  MapPin,
  Activity,
  AlertTriangle,
  BarChart3,
  Thermometer,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import dynamic from "next/dynamic";

const AtlantaLiveMap = dynamic(
  () => import("./atlanta-live-map").then((module) => module.AtlantaLiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-[#070b0e]">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    ),
  }
);

const suggestedQuestions = [
  {
    text: "Show ATL airport performance",
    icon: BarChart3,
  },
  {
    text: "Which airports are currently at risk?",
    icon: AlertTriangle,
  },
  {
    text: "Show weather impacted airports",
    icon: Cloud,
  },
  {
    text: "Display live airspace near Atlanta",
    icon: Plane,
  },
];

const demoResponses: Record<string, React.ReactNode> = {
  "Show ATL airport performance": (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-primary/10 to-[oklch(0.65_0.1_210)]/10 p-4 border border-primary/20">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          ATL - Hartsfield-Jackson Atlanta International
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-3 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">On-Time Performance</p>
            <p className="text-2xl font-bold text-primary tabular-nums">82%</p>
            <p className="text-xs text-green-400 mt-0.5">+2.3% vs yesterday</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Active Flights</p>
            <p className="text-2xl font-bold text-accent tabular-nums">1,247</p>
            <p className="text-xs text-muted-foreground mt-0.5">43 departing</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Weather</p>
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-yellow-400" />
              <span className="text-lg font-semibold text-yellow-400">Moderate</span>
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Runway Status</p>
            <p className="text-lg font-semibold text-green-400">All Active</p>
            <p className="text-xs text-muted-foreground mt-0.5">5/5 runways</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary font-medium">
          Source: enterprise.airport_ops
        </span>
        <span className="rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
          Real-time data
        </span>
      </div>
    </div>
  ),
  "Which airports are currently at risk?": (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Analyzing operational risk across monitored airports...
      </p>
      <div className="space-y-3">
        {[
          { code: "ORD", name: "Chicago O'Hare", risk: "High", reason: "Weather delays", color: "red" },
          { code: "DEN", name: "Denver International", risk: "Medium", reason: "Ground stops", color: "yellow" },
          { code: "SFO", name: "San Francisco Intl", risk: "Medium", reason: "Fog advisory", color: "yellow" },
        ].map((airport) => (
          <div
            key={airport.code}
            className="glass rounded-xl p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  airport.color === "red" ? "bg-red-500/20" : "bg-yellow-500/20"
                }`}
              >
                <AlertTriangle
                  className={`h-5 w-5 ${
                    airport.color === "red" ? "text-red-400" : "text-yellow-400"
                  }`}
                />
              </div>
              <div>
                <p className="font-medium">{airport.code}</p>
                <p className="text-xs text-muted-foreground">{airport.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p
                className={`font-semibold ${
                  airport.color === "red" ? "text-red-400" : "text-yellow-400"
                }`}
              >
                {airport.risk} Risk
              </p>
              <p className="text-xs text-muted-foreground">{airport.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
  "Show weather impacted airports": (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-yellow-500/10 to-accent/10 p-4 border border-yellow-500/20">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-500/20">
            <Cloud className="h-3.5 w-3.5 text-yellow-400" />
          </div>
          Weather Impact Summary
        </h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted/40 p-3 border border-border/20">
            <p className="text-2xl font-bold text-red-400 tabular-nums">12</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Severe</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border/20">
            <p className="text-2xl font-bold text-yellow-400 tabular-nums">28</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Moderate</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border/20">
            <p className="text-2xl font-bold text-green-400 tabular-nums">156</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Clear</p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {[
          { code: "ORD", condition: "Thunderstorms", temp: "72°F", wind: "25 mph" },
          { code: "DFW", condition: "Heavy Rain", temp: "78°F", wind: "18 mph" },
          { code: "IAH", condition: "Fog", temp: "68°F", wind: "5 mph" },
        ].map((airport) => (
          <div
            key={airport.code}
            className="glass rounded-lg p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-primary">
                {airport.code}
              </span>
              <span className="text-sm text-muted-foreground">{airport.condition}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Thermometer className="h-3 w-3" />
                {airport.temp}
              </span>
              <span>{airport.wind}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
  "Display live airspace near Atlanta": (
    <div className="space-y-4">
      <div className="relative aspect-video rounded-xl overflow-hidden border border-border/20">
        {/* Leaflet Live Map */}
        <AtlantaLiveMap />

        {/* Live Airspace Badge - Top Left */}
        <div className="absolute top-3 left-3 z-[1010] flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur-sm px-3 py-1 border border-border/30 text-[10px] font-semibold text-cyan-400 shadow-md">
          <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Live Airspace
        </div>

        {/* Info overlay - Bottom */}
        <div className="absolute bottom-3 left-3 right-3 z-[1010] flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 rounded-full bg-background/90 backdrop-blur-sm px-3 py-1.5 border border-border/30 shadow-md">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold">47 aircraft in view</span>
          </div>
          <span className="rounded-full bg-background/90 backdrop-blur-sm px-3 py-1.5 text-xs font-semibold border border-border/30 shadow-md">100nm radius</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Departures</p>
          <p className="text-xl font-bold text-primary tabular-nums">23</p>
        </div>
        <div className="glass rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Arrivals</p>
          <p className="text-xl font-bold text-accent tabular-nums">24</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed italic bg-muted/20 p-3 rounded-xl border border-border/10">
        Live airspace around ATL shows moderate traffic with balanced arrival and departure flow.
      </p>
    </div>
  ),
};

export function InteractiveDemo() {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const handleQuestionClick = (question: string) => {
    if (selectedQuestion === question) return;
    setIsLoading(true);
    setSelectedQuestion(null);
    setTimeout(() => {
      setSelectedQuestion(question);
      setIsLoading(false);
    }, shouldReduceMotion ? 0 : 700);
  };

  return (
    <section className="relative py-28" id="chat">
      {/* Atmospheric background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[oklch(0.055_0.015_250)] to-background" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(oklch(0.5 0.06 200) 1px, transparent 1px),
              linear-gradient(90deg, oklch(0.5 0.06 200) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl mb-4">
            Try It <span className="text-gradient-sky">Yourself</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-base sm:text-lg leading-relaxed">
            Experience the power of natural language aviation analytics
          </p>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Questions Panel */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-4"
          >
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                <MessageSquare className="h-3.5 w-3.5 text-primary" />
              </div>
              Suggested Questions
            </h3>
            {suggestedQuestions.map((question, index) => (
              <motion.button
                key={question.text}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                onClick={() => handleQuestionClick(question.text)}
                className={`w-full glass rounded-xl p-4 text-left transition-all duration-300 hover:border-primary/40 group card-hover ${
                  selectedQuestion === question.text
                    ? "border-primary bg-primary/10"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-300 ${
                        selectedQuestion === question.text
                          ? "bg-primary/25"
                          : "bg-muted/50 group-hover:bg-primary/15"
                      }`}
                    >
                      <question.icon
                        className={`h-5 w-5 transition-colors duration-300 ${
                          selectedQuestion === question.text
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-primary"
                        }`}
                      />
                    </div>
                    <span className="text-sm font-medium">{question.text}</span>
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 transition-all duration-300 ${
                      selectedQuestion === question.text
                        ? "text-primary translate-x-0 opacity-100"
                        : "text-muted-foreground -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                    }`}
                  />
                </div>
              </motion.button>
            ))}
          </motion.div>

          {/* Results Panel */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="glass-strong rounded-2xl p-6 min-h-[400px]"
          >
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border/40">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                <Activity className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="font-semibold">Analysis Results</span>
            </div>

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-64"
                >
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">Analyzing your query...</p>
                </motion.div>
              ) : selectedQuestion ? (
                <motion.div
                  key={selectedQuestion}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.35 }}
                >
                  {demoResponses[selectedQuestion]}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-64 text-center"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 mb-4 border border-border/30">
                    <MessageSquare className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">
                    Select a question to see the analysis results
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
