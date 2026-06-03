"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Send, ArrowRight, Mic, Paperclip, X } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useVoiceInput } from "@/hooks/use-voice-input"



export function generateSuggestionsFromMetadata(schemaMetadata: any): string[][] {
  const defaultSuggestions = [
    ["List available tables", "Show available columns", "Preview rows from a selected table"],
    ["Count rows by a category", "Summarize a numeric field", "Show recent records"],
    ["Compare two fields", "Group rows by a field", "Map rows with coordinates"],
  ];

  if (!schemaMetadata || !schemaMetadata.tables || schemaMetadata.tables.length === 0) {
    return defaultSuggestions;
  }

  try {
    const tables = schemaMetadata.tables;
    const generated: string[] = [];

    // Let's get table names
    const tableNames = tables.map((t: any) => (typeof t === "string" ? t : t.name || t.table_name || "")).filter(Boolean);

    // Dynamic generation based on columns if available
    tables.forEach((t: any) => {
      const tName = typeof t === "string" ? t : t.name || t.table_name || "";
      if (!tName) return;

      const cols = Array.isArray(t.columns) ? t.columns.map((c: any) => (typeof c === "string" ? c : c.name || c.column_name || "")) : [];

      if (tName.toLowerCase().includes("flight")) {
        generated.push(`Show flight count grouped by status`);
        if (cols.includes("airline") || cols.includes("carrier")) {
          generated.push(`Compare flights by airline`);
        }
        if (cols.includes("origin") || cols.includes("destination")) {
          generated.push(`Show flights grouped by destination`);
        }
      } else if (tName.toLowerCase().includes("airport")) {
        if (cols.includes("elevation_ft") || cols.includes("elevation")) {
          generated.push(`Show airports sorted by elevation`);
        } else {
          generated.push(`Show records from ${tName}`);
        }
      } else if (tName.toLowerCase().includes("weather")) {
        generated.push(`Show weather observations by airport`);
      } else if (tName.toLowerCase().includes("radar") || tName.toLowerCase().includes("track")) {
        generated.push(`Compare radar track altitude by flight`);
      } else {
        // Generic table / column matching!
        generated.push(`Show total records in ${tName}`);
        if (cols.length > 0) {
          const firstCol = cols[0];
          generated.push(`Find unique ${firstCol} in ${tName}`);
          if (cols.length > 1) {
            const secondCol = cols[1];
            generated.push(`Group ${tName} by ${secondCol} showing counts`);
          }
        }
      }
    });

    // Make sure we have enough unique suggestions, otherwise fill up with defaults
    const uniqueGenerated = Array.from(new Set(generated));
    while (uniqueGenerated.length < 9) {
      // Pick random default suggestion that's not already in uniqueGenerated
      const flatDefaults = defaultSuggestions.flat();
      const randDefault = flatDefaults[Math.floor(Math.random() * flatDefaults.length)];
      if (!uniqueGenerated.includes(randDefault)) {
        uniqueGenerated.push(randDefault);
      }
    }

    // Chunk uniqueGenerated into 3 groups of 3
    const chunked: string[][] = [];
    for (let i = 0; i < uniqueGenerated.length; i += 3) {
      if (chunked.length < 3) {
        chunked.push(uniqueGenerated.slice(i, i + 3));
      }
    }
    return chunked;
  } catch (e) {
    console.error("Error generating suggestions from metadata:", e);
    return defaultSuggestions;
  }
}

interface LandingHeroProps {
  schemaMetadata?: any
  onSubmit: (query: string, attachedCSV?: { name: string; headers: string[]; rows: any[] } | null) => void
  onTypingChange?: (isTyping: boolean) => void
  sessions?: any[]
  onSelectSession?: (sessionId: string) => void
}

export function LandingHero({
  schemaMetadata,
  onSubmit,
  onTypingChange,
  sessions = [],
  onSelectSession,
}: LandingHeroProps) {
  const [query, setQuery] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chipSet, setChipSet] = useState(0)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })
  const [chipsVisible, setChipsVisible] = useState(false)
  const [attachedCSV, setAttachedCSV] = useState<{ name: string; headers: string[]; rows: any[] } | null>(null)
  const { voiceState, toggleVoiceInput } = useVoiceInput(query, setQuery)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim())
        if (lines.length === 0) {
          alert("CSV file is empty")
          return
        }

        const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""))
        const rows = lines.slice(1).map(line => {
          const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""))
          const rowObj: any = {}
          headers.forEach((header, index) => {
            rowObj[header] = values[index] || ""
          })
          return rowObj
        })

        setAttachedCSV({
          name: file.name,
          headers,
          rows
        })
      } catch (err) {
        console.error("Error parsing CSV:", err)
        alert("Failed to parse CSV file. Ensure it is a valid comma-separated list.")
      }
    }
    reader.readAsText(file)
  }

  const [allSuggestions, setAllSuggestions] = useState<string[][]>([
    ["List available tables", "Show available columns", "Preview rows from a selected table"],
    ["Count rows by a category", "Summarize a numeric field", "Show recent records"],
    ["Compare two fields", "Group rows by a field", "Map rows with coordinates"],
  ]);
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (schemaMetadata) {
      const generated = generateSuggestionsFromMetadata(schemaMetadata);
      setAllSuggestions(generated);
    }
  }, [schemaMetadata]);

  // Rotate suggestion chips every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setChipSet((prev) => (prev + 1) % allSuggestions.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [allSuggestions.length])

  // Fade in chips when user scrolls near input area
  useEffect(() => {
    const timer = setTimeout(() => setChipsVisible(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  // Track mouse for title parallax
  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    })
  }, [])

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [handleMouseMove])

  // Notify parent of typing state
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    onTypingChange?.(true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      onTypingChange?.(false)
    }, 600)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setIsSubmitting(true)
      onTypingChange?.(false)
      // Brief glow pulse before submitting
      setTimeout(() => {
        onSubmit(query.trim(), attachedCSV)
      }, 300)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion)
    setIsSubmitting(true)
    onTypingChange?.(false)
    setTimeout(() => {
      onSubmit(suggestion, attachedCSV)
    }, 300)
  }

  // Smooth gradient shift based on mouse position - no movement, just color shift
  const gradientAngle = 90 + (mousePos.x - 0.5) * 20
  const cyanStop = 15 + mousePos.x * 25
  const purpleStop = 55 + mousePos.x * 15
  const enterpriseMid = 35 + mousePos.y * 25

  const currentChips = allSuggestions[chipSet]

  const isTyping = query.length > 0 && isFocused

  return (
    <motion.div
      ref={containerRef}
      className="relative z-10 flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.98 }}
      transition={{ duration: 0.5 }}
    >
      {/* CSS for rotating glow animation */}
      <style jsx global>{`
        @property --glow-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes rotateGlow {
          from { --glow-angle: 0deg; }
          to { --glow-angle: 360deg; }
        .search-glow-ring {
          animation: rotateGlow 3s linear infinite;
          background: conic-gradient(
            from var(--glow-angle),
            var(--chart-1) 0%,
            var(--chart-2) 25%,
            var(--chart-3) 50%,
            var(--chart-2) 75%,
            var(--chart-1) 100%
          );
        }
        .dark .search-glow-ring {
          background: conic-gradient(
            from var(--glow-angle),
            #22d3ee 0%,
            #a855f7 25%,
            #ec4899 50%,
            #a855f7 75%,
            #22d3ee 100%
          );
        }
        .search-glow-ring.typing {
          animation-duration: 1.8s;
        }
        @keyframes submitPulse {
          0% { opacity: 0.8; filter: blur(2px); transform: scale(1); }
          50% { opacity: 1; filter: blur(6px); transform: scale(1.02); }
          100% { opacity: 0; filter: blur(8px); transform: scale(1.04); }
        }
        .search-submit-pulse {
          animation: submitPulse 0.4s ease-out forwards;
        }
      `}</style>
      {/* Interactive title with parallax */}
      <motion.h1
        className="mb-3 select-none text-center text-5xl font-light tracking-tight text-foreground md:text-7xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage: `linear-gradient(${gradientAngle}deg, var(--chart-1) ${cyanStop}%, var(--chart-2) ${purpleStop}%)`,
            transition: "background-image 0.3s ease",
          }}
        >
          Sky
        </span>
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage: `linear-gradient(${gradientAngle}deg, #94a3b8 0%, #a8b8d0 30%, #b4bcd8 55%, #c4b5d6 100%)`,
            transition: "background-image 0.3s ease",
          }}
        >Query </span>
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage: `linear-gradient(${gradientAngle}deg, var(--foreground) 0%, var(--chart-2) ${enterpriseMid}%, var(--foreground) 100%)`,
            transition: "background-image 0.3s ease",
          }}
        >
          Enterprise
        </span>
      </motion.h1>

      <motion.p
        className="mb-10 text-center text-lg text-muted-foreground md:text-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        Natural Language Analytics on Starburst
      </motion.p>

      {/* Gemini-style search bar */}
      <motion.form
        onSubmit={handleSubmit}
        className="relative w-full max-w-2xl flex flex-col gap-2.5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        layout
        layoutId="search-bar"
      >
        {attachedCSV && (
          <div className="flex items-center gap-2 self-start rounded-full border border-primary/35 bg-primary/10 px-3.5 py-1 text-xs text-primary backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[200px] font-medium text-foreground">{attachedCSV.name}</span>
            <span className="text-[10px] text-muted-foreground">({attachedCSV.rows.length} rows)</span>
            <button
              type="button"
              onClick={() => setAttachedCSV(null)}
              className="ml-1 rounded-full p-0.5 hover:bg-primary/20 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="group relative w-full">
          {/* Calm default border */}
          <div
            className="absolute -inset-[1px] rounded-full border transition-all duration-500"
            style={{
              borderColor: isFocused || isSubmitting
                ? "transparent"
                : query
                  ? "rgba(34, 211, 238, 0.12)"
                  : "rgba(255, 255, 255, 0.06)",
            }}
          />
          {/* Animated rotating glow ring on focus */}
          {(isFocused || isSubmitting) && (
            <div
              className={`search-glow-ring absolute -inset-[1.5px] rounded-full ${isTyping ? "typing" : ""} ${isSubmitting ? "search-submit-pulse" : ""}`}
              style={{
                opacity: isSubmitting ? 1 : isTyping ? 0.85 : 0.5,
                filter: isSubmitting ? "blur(3px)" : isTyping ? "blur(1px)" : "blur(0px)",
                transition: "opacity 0.4s ease, filter 0.4s ease",
                mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                maskComposite: "exclude",
                WebkitMaskComposite: "xor",
                padding: "1.5px",
              }}
            />
          )}
          <div className="relative flex items-center rounded-full border border-transparent bg-secondary/80 backdrop-blur-xl">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Ask anything about your data..."
              className="flex-1 rounded-full bg-transparent px-6 py-4 text-foreground placeholder:text-zinc-600 focus:outline-none"
              aria-label="Query input"
            />
            
            <label className="mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors" title="Attach CSV File">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={voiceState === "unsupported"}
              className={`mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                voiceState === "listening" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              aria-label={voiceState === "listening" ? "Stop listening" : "Start voice input"}
              aria-pressed={voiceState === "listening"}
              title={voiceState === "unsupported" ? "Voice input is unavailable in this browser" : voiceState === "listening" ? "Stop listening" : "Start voice input"}
            >
              <Mic className="h-4 w-4" />
            </button>

            <button
              type="submit"
              disabled={!query.trim()}
              className="mr-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 hover:brightness-110 disabled:opacity-20 disabled:hover:scale-100"
              aria-label="Submit query"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {voiceState === "listening" && (
            <span className="absolute -bottom-5 left-6 text-[11px] text-primary" role="status" aria-live="polite">
              Listening...
            </span>
          )}
        </div>
      </motion.form>

      {/* Rotating animated suggestion chips */}
      <div className="mt-8 min-h-[48px] w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {chipsVisible && (
            <motion.div
              key={chipSet}
              className="flex flex-wrap justify-center gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
            >
              {currentChips.map((suggestion, i) => (
                <motion.button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="group flex items-center gap-1.5 rounded-full border border-border/30 bg-secondary/30 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all hover:border-primary/30 hover:bg-secondary/50"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                >
                  {suggestion}
                  <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recent Queries Grid on Landing */}
      {sessions && sessions.length > 0 && (
        <motion.div
          className="mt-28 w-full max-w-2xl text-center space-y-3 opacity-50 hover:opacity-100 transition-opacity duration-300"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Continue Recent Analysis
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sessions.slice(0, 4).map((s: any) => {
              const title = s.title || (s.messages[0]?.query ?? "New Query");
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectSession?.(s.id)}
                  className="flex items-center justify-between rounded-xl border border-border/30 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/20 p-3.5 text-left text-xs transition-all cursor-pointer group"
                >
                  <div className="flex flex-col gap-0.5 truncate pr-2">
                    <span className="font-medium text-foreground truncate">{title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {s.messages.length} queries &#183; {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Subtle bottom helper text */}
      <motion.p
        className="absolute bottom-8 text-center text-xs text-muted-foreground/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.5 }}
      >
        Powered by natural language SQL generation across connected enterprise data
      </motion.p>
    </motion.div>
  )
}
