"use client"

import { motion } from "framer-motion"
import { Send, Paperclip, X, Square } from "lucide-react"
import { useState } from "react"

interface ChatInputBarProps {
  onSubmit: (query: string, attachedCSV?: { name: string; headers: string[]; rows: any[] } | null) => void
  isLoading?: boolean
  onCancel?: () => void
}

export function ChatInputBar({ onSubmit, isLoading = false, onCancel }: ChatInputBarProps) {
  const [query, setQuery] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const [attachedCSV, setAttachedCSV] = useState<{ name: string; headers: string[]; rows: any[] } | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim() && !isLoading) {
      onSubmit(query.trim(), attachedCSV)
      setQuery("")
      setAttachedCSV(null)
    }
  }

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

  return (
    <motion.div
      className="border-t border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl"
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl flex-col gap-2.5"
      >
        {attachedCSV && (
          <div className="flex items-center gap-2 self-start rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs text-primary backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
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

        <div className="relative flex w-full items-center">
          {/* Subtle focus glow */}
          {isFocused && (
            <motion.div
              className="absolute -inset-[1px] rounded-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              style={{
                background: "linear-gradient(90deg, color-mix(in srgb, var(--chart-1) 15%, transparent), color-mix(in srgb, var(--chart-2) 10%, transparent), color-mix(in srgb, var(--chart-1) 15%, transparent))",
                filter: "blur(1px)",
              }}
            />
          )}
          <div className="relative flex w-full items-center rounded-xl border border-border/40 bg-secondary/50 backdrop-blur-sm transition-colors focus-within:border-primary/20">
            <label className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground cursor-pointer transition-colors shrink-0" title="Attach CSV File">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isLoading}
              placeholder={isLoading ? "Processing analysis..." : "Ask anything about your data..."}
              className="flex-1 bg-transparent pl-2 pr-4 py-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
              aria-label="Follow-up query"
            />

            {isLoading ? (
              <button
                type="button"
                onClick={onCancel}
                className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-secondary/70 text-muted-foreground transition-all hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                aria-label="Stop query"
                title="Stop query"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!query.trim()}
                className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/90 text-primary-foreground transition-all hover:bg-primary hover:scale-105 disabled:opacity-20 disabled:hover:scale-100 disabled:hover:bg-primary/90 shrink-0"
                aria-label="Submit follow-up"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground/50 font-normal select-none">
        SkyQuery may generate incorrect SQL. Always verify results.
      </p>
    </motion.div>
  )
}
