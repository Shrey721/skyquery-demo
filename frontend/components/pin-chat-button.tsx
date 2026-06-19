"use client"

import { Pin } from "lucide-react"

interface PinChatButtonProps {
  isPinned: boolean
  onToggle: () => void
}

export function PinChatButton({ isPinned, onToggle }: PinChatButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      className={`absolute right-7 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-sidebar-accent ${
        isPinned
          ? "text-primary hover:text-primary"
          : "text-sidebar-foreground/20 hover:text-sidebar-foreground/70"
      }`}
      aria-pressed={isPinned}
      aria-label={isPinned ? "Unpin chat" : "Pin chat"}
      title={isPinned ? "Unpin chat" : "Pin chat"}
    >
      <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
    </button>
  )
}
