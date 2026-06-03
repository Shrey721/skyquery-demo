"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Database,
  MessageSquare,
  Radar,
  Cloud,
  BarChart3,
  FileSearch,
} from "lucide-react";

const features = [
  {
    icon: Database,
    title: "Enterprise-First Analytics",
    description:
      "Direct integration with your existing data infrastructure. No data movement required.",
    color: "oklch(0.72 0.14 200)",
  },
  {
    icon: MessageSquare,
    title: "Natural Language SQL",
    description:
      "Ask questions in plain English. SkyQuery translates to optimized SQL automatically.",
    color: "oklch(0.75 0.16 55)",
  },
  {
    icon: Radar,
    title: "Live Airspace Intelligence",
    description:
      "Real-time aircraft tracking and airspace monitoring integrated with enterprise data.",
    color: "oklch(0.65 0.15 145)",
  },
  {
    icon: Cloud,
    title: "Weather-Aware Operations",
    description:
      "Correlate operational data with live weather conditions and forecasts.",
    color: "oklch(0.7 0.12 210)",
  },
  {
    icon: BarChart3,
    title: "Airport Performance Insights",
    description:
      "Comprehensive airport analytics including delays, throughput, and efficiency metrics.",
    color: "oklch(0.7 0.15 280)",
  },
  {
    icon: FileSearch,
    title: "Explainable Source Trace",
    description:
      "Full transparency into how answers are generated with complete data lineage.",
    color: "oklch(0.65 0.12 220)",
  },
];

function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
  index,
}: {
  icon: typeof Database;
  title: string;
  description: string;
  color: string;
  index: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: shouldReduceMotion ? 0 : index * 0.08, duration: 0.5 }}
      whileHover={shouldReduceMotion ? {} : { y: -4 }}
      className="group relative"
    >
      <div className="glass rounded-2xl p-6 h-full transition-all duration-300 hover:border-[oklch(0.35_0.04_200)] card-hover">
        {/* Subtle glow on hover */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 -z-10 blur-2xl"
          style={{ background: `radial-gradient(ellipse at center, ${color}15, transparent 70%)` }}
        />

        {/* Icon container */}
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300"
          style={{ 
            backgroundColor: `${color}15`,
            boxShadow: `0 0 20px ${color}10`,
          }}
        >
          <Icon className="h-6 w-6" style={{ color }} />
        </div>

        {/* Content */}
        <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

export function FeaturesSection() {
  return (
    <section className="relative py-28" id="enterprise">
      {/* Atmospheric background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[oklch(0.06_0.015_255)] to-background" />
        {/* Subtle grid */}
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
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm text-primary mb-4">
            <span className="font-medium">Powerful Features</span>
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl mb-4">
            Everything You Need for{" "}
            <span className="text-gradient-sky">Aviation Intelligence</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-base sm:text-lg leading-relaxed">
            A complete platform for connecting, analyzing, and understanding your
            aviation operations
          </p>
        </motion.div>

        {/* Features grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} {...feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
