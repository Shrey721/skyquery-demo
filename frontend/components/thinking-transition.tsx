"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

interface ThinkingTransitionProps {
  onComplete: () => void
}

const steps = [
  { label: "Interpreting schema...", icon: "schema" },
  { label: "Generating SQL...", icon: "sql" },
  { label: "Analyzing results...", icon: "chart" },
]

export function ThinkingTransition({ onComplete }: ThinkingTransitionProps) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []

    // Progress through steps
    timers.push(setTimeout(() => setCurrentStep(1), 350))
    timers.push(setTimeout(() => setCurrentStep(2), 700))
    timers.push(setTimeout(() => onComplete(), 1100))

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Glowing orb */}
      <motion.div
        className="mb-10 h-16 w-16 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.3) 0%, rgba(168,85,247,0.15) 50%, transparent 70%)",
          boxShadow: "0 0 60px rgba(34,211,238,0.15), 0 0 120px rgba(168,85,247,0.08)",
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Step indicators */}
      <div className="flex flex-col items-center gap-3">
        {steps.map((step, i) => (
          <motion.div
            key={step.label}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{
              opacity: i <= currentStep ? 1 : 0.2,
              x: 0,
            }}
            transition={{ duration: 0.25, delay: i * 0.1 }}
          >
            {/* Step dot */}
            <motion.div
              className="h-1.5 w-1.5 rounded-full"
              animate={{
                backgroundColor:
                  i < currentStep
                    ? "#22d3ee"
                    : i === currentStep
                      ? "#a855f7"
                      : "#1e1e30",
                scale: i === currentStep ? [1, 1.4, 1] : 1,
              }}
              transition={{
                scale: { duration: 0.6, repeat: i === currentStep ? Infinity : 0 },
              }}
            />
            <span
              className="text-sm transition-colors duration-300"
              style={{
                color:
                  i < currentStep
                    ? "#22d3ee"
                    : i === currentStep
                      ? "#e8e8e8"
                      : "#6b6b80",
              }}
            >
              {step.label}
            </span>
            {i < currentStep && (
              <motion.svg
                className="h-3.5 w-3.5 text-primary"
                viewBox="0 0 16 16"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <path
                  fill="currentColor"
                  d="M6.5 12.5l-4-4 1.4-1.4L6.5 9.7l5.6-5.6 1.4 1.4z"
                />
              </motion.svg>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
