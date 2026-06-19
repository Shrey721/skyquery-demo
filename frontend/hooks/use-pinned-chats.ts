"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

const PINNED_CHATS_STORAGE_KEY = "skyquery_pinned_chats"

type PinnedChatsStorage = {
  pinnedChatIds: string[]
}

function parsePinnedChats(value: string | null): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value) as Partial<PinnedChatsStorage>
    if (!Array.isArray(parsed.pinnedChatIds)) return []

    return parsed.pinnedChatIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0
    )
  } catch {
    return []
  }
}

export function usePinnedChats() {
  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    setPinnedChatIds(parsePinnedChats(localStorage.getItem(PINNED_CHATS_STORAGE_KEY)))
    setHasLoaded(true)
  }, [])

  useEffect(() => {
    if (!hasLoaded) return

    const payload: PinnedChatsStorage = { pinnedChatIds }
    localStorage.setItem(PINNED_CHATS_STORAGE_KEY, JSON.stringify(payload))
  }, [hasLoaded, pinnedChatIds])

  const pinnedChatIdSet = useMemo(
    () => new Set(pinnedChatIds),
    [pinnedChatIds]
  )

  const isPinned = useCallback(
    (chatId: string) => pinnedChatIdSet.has(chatId),
    [pinnedChatIdSet]
  )

  const togglePinned = useCallback((chatId: string) => {
    setPinnedChatIds((current) => {
      if (current.includes(chatId)) {
        return current.filter((id) => id !== chatId)
      }

      return [chatId, ...current]
    })
  }, [])

  return {
    pinnedChatIds,
    isPinned,
    togglePinned,
  }
}
