"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Cloud, Plane, MapPin, Activity, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useCallback, useMemo } from "react";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const DEMO_ANIMATION_START_DELAY = 1800;

const ambientParticles = Array.from({ length: 12 }, (_, i) => ({
  left: `${18 + ((i * 17) % 64)}%`,
  top: `${16 + ((i * 23) % 62)}%`,
  duration: 5 + (i % 4) * 0.7,
  delay: (i % 6) * 0.45,
}));

function PremiumBackground() {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.09_0.025_200)] via-background to-background" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Deep atmospheric base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.09_0.025_200)] via-[oklch(0.07_0.02_240)] to-background" />

      {/* Soft animated ambient light - top left */}
      <motion.div
        className="absolute -left-[20%] -top-[10%] h-[600px] w-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.2 0.1 200 / 0.4) 0%, transparent 70%)",
        }}
        initial={{ x: 0, y: 0, opacity: 0.3 }}
        animate={{
          x: [0, 60, 0],
          y: [0, 40, 0],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Soft ambient light - top right */}
      <motion.div
        className="absolute -right-[15%] top-[10%] h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.15 0.08 210 / 0.35) 0%, transparent 70%)",
        }}
        initial={{ x: 0, y: 0, opacity: 0.25 }}
        animate={{
          x: [0, -50, 0],
          y: [0, 60, 0],
          opacity: [0.25, 0.4, 0.25],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />

      {/* Subtle bottom atmospheric glow */}
      <motion.div
        className="absolute bottom-[20%] left-[30%] h-[400px] w-[600px] rounded-full"
        style={{
          background: "radial-gradient(ellipse, oklch(0.12 0.06 200 / 0.25) 0%, transparent 70%)",
        }}
        initial={{ x: 0, opacity: 0.2 }}
        animate={{
          x: [0, 40, 0],
          opacity: [0.2, 0.35, 0.2],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />

      {/* Aviation radar rings */}
      <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px]">
        <motion.div
          className="absolute inset-0 rounded-full border border-primary/10"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.1], opacity: [0.25, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border border-primary/8"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 1], opacity: [0.2, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeOut", delay: 1.8 }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border border-primary/6"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: [0.3, 0.9], opacity: [0.15, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeOut", delay: 3.2 }}
        />
      </div>

      {/* Subtle grid with perspective */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.006,
          backgroundImage: `
            linear-gradient(oklch(0.6 0.08 200 / 0.35) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.6 0.08 200 / 0.35) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Soft curved flight paths */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.12]">
        <defs>
          <linearGradient id="pathGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="oklch(0.7 0.12 200)" stopOpacity="0" />
            <stop offset="50%" stopColor="oklch(0.7 0.12 200)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="oklch(0.6 0.1 210)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[
          "M-50,180 Q400,100 700,200 T1400,150",
          "M-50,350 Q500,280 900,380 T1500,300",
          "M-50,520 Q350,450 750,530 T1400,480",
        ].map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke="url(#pathGrad1)"
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1], opacity: [0, 0.5, 0] }}
            transition={{
              duration: 10,
              repeat: Infinity,
              delay: i * 3,
              ease: "easeInOut",
            }}
          />
        ))}
      </svg>

      {/* Floating airport nodes */}
      {[
        { x: "12%", y: "22%", size: 5, delay: 0 },
        { x: "78%", y: "18%", size: 4, delay: 1 },
        { x: "88%", y: "42%", size: 5, delay: 2 },
        { x: "22%", y: "68%", size: 4, delay: 3 },
        { x: "65%", y: "72%", size: 5, delay: 1.5 },
        { x: "45%", y: "25%", size: 3, delay: 2.5 },
      ].map((node, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-primary"
          style={{
            left: node.x,
            top: node.y,
            width: node.size,
            height: node.size,
          }}
          initial={{ opacity: 0.25, scale: 1 }}
          animate={{
            opacity: [0.25, 0.6, 0.25],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: node.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Subtle floating particles */}
      {ambientParticles.map((particle, i) => (
        <motion.div
          key={i}
          className="absolute h-1 w-1 rounded-full bg-primary/60"
          style={{
            left: particle.left,
            top: particle.top,
          }}
          initial={{ y: 0, opacity: 0.15 }}
          animate={{
            y: [0, -25, 0],
            opacity: [0.15, 0.4, 0.15],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function VoiceInteractionDemo() {
  const shouldReduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<
    "idle" | "cursor" | "listening" | "speaking" | "typing" | "sending" | "analyzing" | "results"
  >("idle");
  const [typedText, setTypedText] = useState("");
  const [cursorPos, setCursorPos] = useState({ x: 280, y: 200 });
  const [animationKey, setAnimationKey] = useState(0);
  const [countedMetrics, setCountedMetrics] = useState({ onTime: 0, delayed: 0 });

  const query = "Show ATL airport performance";

  const resetAnimation = useCallback(() => {
    setPhase("idle");
    setTypedText("");
    setCursorPos({ x: 280, y: 200 });
    setCountedMetrics({ onTime: 0, delayed: 0 });
    setAnimationKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion) {
      setPhase("results");
      setTypedText(query);
      setCountedMetrics({ onTime: 82, delayed: 245 });
      return;
    }

    const timeline = [
      { phase: "cursor" as const, delay: DEMO_ANIMATION_START_DELAY + 1000 },
      { phase: "listening" as const, delay: DEMO_ANIMATION_START_DELAY + 2200 },
      { phase: "speaking" as const, delay: DEMO_ANIMATION_START_DELAY + 4200 },
      { phase: "typing" as const, delay: DEMO_ANIMATION_START_DELAY + 6000 },
      { phase: "sending" as const, delay: DEMO_ANIMATION_START_DELAY + 8200 },
      { phase: "analyzing" as const, delay: DEMO_ANIMATION_START_DELAY + 8800 },
      { phase: "results" as const, delay: DEMO_ANIMATION_START_DELAY + 10500 },
    ];

    const timers: NodeJS.Timeout[] = [];

    timeline.forEach(({ phase: p, delay }) => {
      timers.push(setTimeout(() => setPhase(p), delay));
    });

    // Cursor animation to mic button
    timers.push(
      setTimeout(() => {
        setCursorPos({ x: 355, y: 52 });
      }, DEMO_ANIMATION_START_DELAY + 1200)
    );

    // Type text animation
    let charIndex = 0;
    timers.push(
      setTimeout(() => {
        const typeInterval = setInterval(() => {
          if (charIndex < query.length) {
            setTypedText(query.slice(0, charIndex + 1));
            charIndex++;
          } else {
            clearInterval(typeInterval);
          }
        }, 55);
        timers.push(typeInterval as unknown as NodeJS.Timeout);
      }, DEMO_ANIMATION_START_DELAY + 6000)
    );

    // Count up metrics animation
    timers.push(
      setTimeout(() => {
        let onTimeCount = 0;
        let delayedCount = 0;
        const countInterval = setInterval(() => {
          if (onTimeCount < 82) {
            onTimeCount += 2;
            setCountedMetrics((prev) => ({ ...prev, onTime: Math.min(onTimeCount, 82) }));
          }
          if (delayedCount < 245) {
            delayedCount += 6;
            setCountedMetrics((prev) => ({ ...prev, delayed: Math.min(delayedCount, 245) }));
          }
          if (onTimeCount >= 82 && delayedCount >= 245) {
            clearInterval(countInterval);
          }
        }, 30);
        timers.push(countInterval as unknown as NodeJS.Timeout);
      }, DEMO_ANIMATION_START_DELAY + 10800)
    );

    // Reset and loop
    timers.push(setTimeout(resetAnimation, DEMO_ANIMATION_START_DELAY + 18000));

    return () => timers.forEach(clearTimeout);
  }, [animationKey, shouldReduceMotion, resetAnimation]);

  const displayOnTime = useMemo(() => phase === "results" ? countedMetrics.onTime : 0, [phase, countedMetrics.onTime]);
  const displayDelayed = useMemo(() => phase === "results" ? countedMetrics.delayed : 0, [phase, countedMetrics.delayed]);

  return (
    <motion.div
      key={animationKey}
      variants={fadeInUp}
      initial={false}
      animate="visible"
      transition={{ duration: 0.6, delay: 0.3 }}
      className="relative mx-auto mt-8 max-w-3xl"
    >
      {/* Soft ambient glow behind panel */}
      <motion.div
        className="absolute -inset-10 -z-10 rounded-3xl"
        style={{
          background: "radial-gradient(ellipse at center, oklch(0.2 0.1 200 / 0.25) 0%, transparent 70%)",
        }}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="glass-strong rounded-2xl p-5 shadow-2xl shadow-black/30">
        {/* Window chrome - SkyQuery Enterprise header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[oklch(0.55_0.15_25)]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[oklch(0.7_0.15_85)]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[oklch(0.6_0.15_145)]" />
          </div>
          <div className="flex-1 rounded-md bg-muted/40 px-3 py-1 text-center text-xs text-muted-foreground font-medium">
            SkyQuery Enterprise
          </div>
        </div>

        {/* Input area */}
        <div className="relative mb-4 flex items-center gap-3 rounded-xl bg-muted/30 px-4 py-3 border border-border/40">
          <div className="flex-1 min-h-[24px] text-sm text-foreground">
            {typedText || (
              <span className="text-muted-foreground">Ask anything about your aviation data...</span>
            )}
            {phase === "typing" && (
              <motion.span
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
              />
            )}
          </div>

          {/* Mic button */}
          <motion.button
            className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ${
              phase === "listening" || phase === "speaking"
                ? "bg-primary text-primary-foreground glow-cyan"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
            animate={
              phase === "listening" || phase === "speaking"
                ? { scale: [1, 1.08, 1] }
                : {}
            }
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          >
            <Mic className="h-4 w-4" />
            {/* Listening pulse rings */}
            {(phase === "listening" || phase === "speaking") && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary"
                  animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border border-primary"
                  animate={{ scale: [1, 2], opacity: [0.4, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                />
              </>
            )}
          </motion.button>

          {/* Send button */}
          <motion.button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-primary to-[oklch(0.65_0.12_210)] text-white glow-cyan"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send className="h-4 w-4" />
          </motion.button>
        </div>

        {/* Voice indicator - Listening */}
        {phase === "listening" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 flex items-center justify-center gap-3 text-sm text-primary"
          >
            <motion.div className="flex gap-1 items-end">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-primary rounded-full"
                  animate={{ height: [6, 14 + i * 3, 6] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
                />
              ))}
            </motion.div>
            <span className="font-medium">Listening...</span>
          </motion.div>
        )}

        {/* Voice indicator - Speaking/Transcribing */}
        {phase === "speaking" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4 flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <span className="italic">&quot;Show ATL airport performance&quot;</span>
          </motion.div>
        )}

        {/* Analyzing state */}
        {phase === "analyzing" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-xl bg-muted/20 p-4"
          >
            <motion.div
              className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
            <span className="text-sm text-muted-foreground">Analyzing ATL airport data...</span>
          </motion.div>
        )}

        {/* Results */}
        {phase === "results" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 p-4 border border-border/30">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <span className="font-semibold">ATL - Hartsfield-Jackson Atlanta</span>
                  <p className="text-xs text-muted-foreground">International Airport</p>
                </div>
              </div>

              {/* Metrics grid with count-up */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Activity, label: "On-Time Performance", value: `${displayOnTime}%`, color: "primary", trend: "+2.3%" },
                  { icon: Plane, label: "Delayed Flights", value: displayDelayed.toString(), color: "accent", trend: "-12" },
                  { icon: Cloud, label: "Weather Risk", value: "Moderate", color: "yellow" },
                  { icon: MapPin, label: "Operational Status", value: "Stable", color: "green" },
                ].map((metric, i) => (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.1, ease: "easeOut" }}
                    className="rounded-lg bg-muted/40 p-3 border border-border/20"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <metric.icon
                        className={`h-3.5 w-3.5 ${
                          metric.color === "primary"
                            ? "text-primary"
                            : metric.color === "accent"
                            ? "text-accent"
                            : metric.color === "yellow"
                            ? "text-yellow-400"
                            : "text-green-400"
                        }`}
                      />
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{metric.label}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold tabular-nums">{metric.value}</span>
                      {metric.trend && (
                        <span
                          className={`text-xs font-medium ${
                            metric.trend.startsWith("+") ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {metric.trend}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Source trace badge */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-4 flex flex-wrap gap-2"
              >
                <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary font-medium">
                  Source: enterprise.airport_performance
                </span>
                <span className="rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
                  Updated 2m ago
                </span>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Animated cursor */}
        {!shouldReduceMotion && (phase === "cursor" || phase === "listening") && (
          <motion.div
            className="pointer-events-none absolute z-50"
            initial={{ x: 280, y: 200, opacity: 0 }}
            animate={{ x: cursorPos.x, y: cursorPos.y, opacity: 1 }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z"
                fill="white"
                stroke="black"
                strokeWidth="1.5"
              />
            </svg>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export function HeroSection({ onStartChat }: { onStartChat?: () => void }) {
  return (
    <section className="relative min-h-[85vh] overflow-hidden pt-12 pb-12 sm:pt-16 sm:pb-16 lg:pt-20 lg:pb-20">
      <PremiumBackground />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={false}
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1 } },
          }}
          className="text-center"
        >
          {/* Badge */}
          <motion.div variants={fadeInUp} className="mb-4 inline-block">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/30 backdrop-blur-sm px-4 py-1.5 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Enterprise Aviation Intelligence
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeInUp}
            className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl"
          >
            <span className="text-balance">Aviation Intelligence.</span>
            <br />
            <span className="text-gradient-sky text-balance">Powered by Your Data.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg leading-relaxed"
          >
            Connect enterprise aviation systems with live airspace, weather intelligence, and natural language analytics. Built for airport operations teams, airlines, and aviation analysts.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={fadeInUp}
            className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              size="lg"
              onClick={onStartChat}
              className="group bg-gradient-to-r from-primary to-[oklch(0.65_0.12_210)] text-white border-0 px-8 glow-cyan hover:opacity-90 transition-opacity"
            >
              Start Chat
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>
        </motion.div>

        {/* Voice Interaction Demo */}
        <VoiceInteractionDemo />
      </div>
    </section>
  );
}
