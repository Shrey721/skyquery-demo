"use client"

import { useTheme } from "next-themes"
import { Sun, Moon, Monitor } from "lucide-react"
import { useEffect, useState, useRef } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (!mounted) {
    return (
      <div className="h-7 w-7 rounded-md bg-secondary/40" aria-hidden />
    )
  }

  const options = [
    { key: "dark", label: "Dark", icon: Moon },
    { key: "light", label: "Light", icon: Sun },
    { key: "system", label: "System", icon: Monitor },
  ] as const

  const current = options.find((o) => o.key === theme) ?? options[0]
  const Icon = current.icon

  return (
    <div ref={ref} className="relative z-[1100]">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`Theme: ${current.label}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[1200] mt-1.5 w-32 overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg backdrop-blur-xl">
          {options.map((opt) => {
            const OptIcon = opt.icon
            const active = theme === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => {
                  setTheme(opt.key)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  active
                    ? "bg-secondary/60 text-foreground"
                    : "text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
                }`}
              >
                <OptIcon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
