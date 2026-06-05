"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const PremiumAviationGlobe = dynamic(
  () => import("./premium-aviation-globe").then((module) => module.PremiumAviationGlobe),
  {
    ssr: false,
    loading: () => (
      <div className="relative mx-auto aspect-square max-w-[760px]">
        <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_34%_28%,oklch(0.17_0.045_225),oklch(0.058_0.024_245)_52%,oklch(0.024_0.012_252)_73%)] shadow-[inset_-46px_-26px_96px_rgba(0,0,0,0.9)]" />
        <div className="absolute inset-[7%] rounded-full border border-primary/25 shadow-[0_0_36px_rgba(35,181,211,0.18)]" />
      </div>
    ),
  }
);

interface GlobalAviationSectionProps {
  onOpenDiscover?: () => void;
}

export function GlobalAviationSection({ onOpenDiscover }: GlobalAviationSectionProps) {
  return (
    <section className="relative overflow-hidden py-28" id="airspace">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[oklch(0.055_0.02_240)] to-background" />
        <div className="absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.16_0.08_205_/0.24),transparent_62%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-14 text-center"
          initial={{ opacity: 0, y: 20 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl md:text-5xl">
            From One Airport to the <span className="text-gradient-sky">Entire World</span>
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Enterprise aviation intelligence with live operational context across the globe. Drag the globe or click an airport to inspect route performance.
          </p>
        </motion.div>

        <PremiumAviationGlobe />

        <motion.div
          className="mt-14 flex flex-col items-center gap-8"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.2 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { label: "Global Airports", value: "15,000+" },
              { label: "Daily Flights", value: "100K+" },
            ].map((stat, index) => (
              <motion.div
                className="glass rounded-xl border border-border/30 px-8 py-4 text-center"
                initial={{ opacity: 0, y: 20 }}
                key={stat.label}
                transition={{ delay: 0.3 + index * 0.08 }}
                viewport={{ once: true }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                <p className="tabular-nums text-2xl font-bold text-primary">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            viewport={{ once: true }}
          >
            <Button
              size="lg"
              onClick={onOpenDiscover}
              className="group bg-gradient-to-r from-primary to-[oklch(0.65_0.12_210)] text-white border-0 px-8 glow-cyan hover:opacity-90 transition-opacity"
            >
              <Search className="mr-2 h-4 w-4" />
              Open Discover
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
