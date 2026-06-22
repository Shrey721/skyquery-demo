import { useCallback, useEffect, useRef, useState } from "react"

interface UseResizablePanelOptions {
  containerRef: React.RefObject<HTMLElement | null>
  minSize: number
  topMinSize: number
  initialSize: number
  storageKey: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export function useResizablePanel({
  containerRef,
  minSize,
  topMinSize,
  initialSize,
  storageKey,
}: UseResizablePanelOptions) {
  const [size, setSize] = useState(initialSize)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({
    y: 0,
    size: initialSize,
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    const saved = window.localStorage.getItem(storageKey)
    if (saved) {
      const parsed = Number(saved)
      if (!Number.isNaN(parsed)) {
        setSize(parsed)
      }
    }
  }, [storageKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(storageKey, String(size))
  }, [size, storageKey])

  const updateSize = useCallback(
    (nextSize: number) => {
      const container = containerRef.current
      if (!container) return

      const containerHeight = container.getBoundingClientRect().height || 0
      const maxSize = Math.max(minSize, containerHeight - topMinSize)
      const next = clamp(nextSize, minSize, maxSize)
      setSize(next)
    },
    [containerRef, minSize, topMinSize]
  )

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault()
      if (!containerRef.current) return

      dragStartRef.current = {
        y: event.clientY,
        size,
      }
      setIsDragging(true)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientY - dragStartRef.current.y
        updateSize(dragStartRef.current.size - delta)
      }

      const handlePointerUp = () => {
        setIsDragging(false)
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
    },
    [containerRef, size, updateSize]
  )

  return {
    size,
    isDragging,
    startResize,
  }
}
