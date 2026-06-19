"use client"

import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import type { ChatSession } from "@/app/page"

interface PinnedChatsSectionProps {
  sessions: ChatSession[]
  isExpanded: boolean
  onToggleExpanded: () => void
  renderSession: (session: ChatSession) => ReactNode
}

export function PinnedChatsSection({
  sessions,
  isExpanded,
  onToggleExpanded,
  renderSession,
}: PinnedChatsSectionProps) {
  if (sessions.length === 0) return null

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-center gap-1 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/35 transition-colors hover:text-sidebar-foreground/50"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
        Pinned Chats
        <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-sidebar-foreground/25">
          ({sessions.length})
        </span>
      </button>

      {isExpanded && sessions.map(renderSession)}
    </div>
  )
}
