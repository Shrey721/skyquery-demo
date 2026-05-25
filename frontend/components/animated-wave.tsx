"use client"

import { useEffect, useRef, useCallback } from "react"

interface AnimatedWaveProps {
  isTyping?: boolean
  intensity?: number // 0-1, allows external control of wave energy
}

export function AnimatedWave({ isTyping = false, intensity = 0 }: AnimatedWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const typingRef = useRef(isTyping)
  const intensityRef = useRef(intensity)
  const energyRef = useRef(0)

  useEffect(() => {
    typingRef.current = isTyping
  }, [isTyping])

  useEffect(() => {
    intensityRef.current = intensity
  }, [intensity])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const drawWave = (
      yOffset: number,
      amplitude: number,
      frequency: number,
      speed: number,
      color1: string,
      color2: string,
      lineWidth: number,
      phase: number,
      energyMult: number
    ) => {
      ctx.beginPath()
      ctx.lineWidth = lineWidth

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
      gradient.addColorStop(0, color1)
      gradient.addColorStop(0.5, color2)
      gradient.addColorStop(1, color1)
      ctx.strokeStyle = gradient

      for (let x = 0; x <= canvas.width; x += 2) {
        const normalizedX = x / canvas.width
        const edgeFade = Math.sin(normalizedX * Math.PI)
        const ampBoost = 1 + energyMult * 0.25
        const speedBoost = speed * 0.6 + energyMult * 0.25
        const y =
          yOffset +
          Math.sin(normalizedX * frequency + time * speedBoost + phase) *
            amplitude *
            ampBoost *
            edgeFade +
          Math.sin(normalizedX * frequency * 0.5 + time * speedBoost * 0.7 + phase * 1.3) *
            amplitude *
            0.4 *
            ampBoost *
            edgeFade

        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      time += 0.003 // Slow calm base motion

      // Smoothly interpolate energy based on typing state
      const targetEnergy = typingRef.current ? 1 : intensityRef.current
      energyRef.current += (targetEnergy - energyRef.current) * 0.025 // Slower interpolation for smoother feel

      const energy = energyRef.current
      const baseY = canvas.height * 0.72

      // Cyan/teal waves
      for (let i = 0; i < 5; i++) {
        const alphaBoost = energy * 0.03
        drawWave(
          baseY + i * 3,
          25 + i * 4,
          Math.PI * 2.5,
          0.8 + i * 0.15,
          `rgba(34, 211, 238, ${0.06 + i * 0.04 + alphaBoost})`,
          `rgba(168, 85, 247, ${0.08 + i * 0.03 + alphaBoost})`,
          1.2 + i * 0.3,
          i * 0.8,
          energy
        )
      }

      // Purple/magenta waves
      for (let i = 0; i < 4; i++) {
        const alphaBoost = energy * 0.025
        drawWave(
          baseY + 10 + i * 4,
          20 + i * 5,
          Math.PI * 2,
          0.6 + i * 0.12,
          `rgba(168, 85, 247, ${0.05 + i * 0.03 + alphaBoost})`,
          `rgba(236, 72, 153, ${0.06 + i * 0.03 + alphaBoost})`,
          1 + i * 0.3,
          i * 1.2 + 2,
          energy
        )
      }

      // Red/crimson accent waves
      for (let i = 0; i < 3; i++) {
        const alphaBoost = energy * 0.02
        drawWave(
          baseY + 15 + i * 5,
          18 + i * 6,
          Math.PI * 1.8,
          0.5 + i * 0.1,
          `rgba(239, 68, 68, ${0.04 + i * 0.04 + alphaBoost})`,
          `rgba(239, 68, 68, ${0.1 + i * 0.05 + alphaBoost})`,
          1.5 + i * 0.5,
          i * 1.5 + 4,
          energy
        )
      }

      // Bright highlight wave
      drawWave(
        baseY + 5,
        30,
        Math.PI * 2.2,
        0.9,
        `rgba(34, 211, 238, ${0.15 + energy * 0.06})`,
        `rgba(168, 85, 247, ${0.12 + energy * 0.06})`,
        2,
        0,
        energy
      )

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  useEffect(() => {
    const cleanup = setupCanvas()
    return cleanup
  }, [setupCanvas])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  )
}
