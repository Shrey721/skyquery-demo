"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export function FinalCTA({ onStartChat }: { onStartChat?: () => void }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative py-32 overflow-hidden">
      {/* Premium Animated Background */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Animated gradient orbs */}
        <motion.div
          animate={
            shouldReduceMotion
              ? {}
              : { scale: [1, 1.15, 1], opacity: [0.08, 0.14, 0.08], x: [0, 25, 0], y: [0, -15, 0] }
          }
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[20%] top-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, oklch(0.5 0.12 200 / 0.4), transparent 60%)" }}
        />
        <motion.div
          animate={
            shouldReduceMotion
              ? {}
              : { scale: [1.1, 1, 1.1], opacity: [0.08, 0.14, 0.08], x: [0, -25, 0], y: [0, 15, 0] }
          }
          transition={{ duration: 12, repeat: Infinity, delay: 3, ease: "easeInOut" }}
          className="absolute right-[20%] top-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, oklch(0.4 0.1 210 / 0.35), transparent 60%)" }}
        />
        
        {/* Floating particles */}
        {!shouldReduceMotion && [...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-primary"
            style={{
              left: `${12 + (i * 5.5)}%`,
              top: `${25 + (i % 5) * 12}%`,
            }}
            animate={{
              y: [0, -25, 0],
              opacity: [0.2, 0.6, 0.2],
              scale: [1, 1.3, 1],
            }}
            transition={{
              duration: 4 + (i % 3),
              repeat: Infinity,
              delay: i * 0.25,
              ease: "easeInOut",
            }}
          />
        ))}
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.6 0.1 200) 1px, transparent 1px), linear-gradient(90deg, oklch(0.6 0.1 200) 1px, transparent 1px)`,
            backgroundSize: '70px 70px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          {/* Animated Logo Icon */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center justify-center mb-8"
          >
            <div className="relative">
              <motion.div
                animate={
                  shouldReduceMotion
                    ? {}
                    : { scale: [1, 1.25, 1], opacity: [0.25, 0.45, 0.25] }
                }
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-2xl blur-2xl"
                style={{ background: "linear-gradient(135deg, oklch(0.5 0.12 200), oklch(0.45 0.1 210))" }}
              />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.1_210)] glow-cyan overflow-hidden">
                <Image
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-X7ohEq5zMv1hCY6v7Br2Mp0TAU6yhF.png"
                  alt="SkyQuery"
                  width={70}
                  height={70}
                  className="h-12 w-auto object-contain brightness-0 invert"
                  style={{ width: "auto" }}
                />
              </div>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-bold sm:text-4xl md:text-5xl lg:text-6xl mb-6"
          >
            <span className="text-balance">Ready to Explore Your</span>
            <br />
            <span className="text-gradient-sky text-balance">Aviation Data?</span>
          </motion.h2>

          {/* Supporting text */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg text-muted-foreground mb-10 leading-relaxed"
          >
            Join leading aviation teams using SkyQuery to transform their enterprise data into actionable intelligence.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              size="lg"
              onClick={onStartChat}
              className="group bg-gradient-to-r from-primary to-[oklch(0.6_0.1_210)] text-white border-0 px-8 py-6 text-lg glow-cyan hover:opacity-90 transition-opacity"
            >
              Start Chat
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-green-500" />
              <span>SOC 2 Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-primary" />
              <span>Enterprise Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-accent" />
              <span>24/7 Support</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
