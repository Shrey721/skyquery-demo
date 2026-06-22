import { cn } from "@/lib/utils"

interface ResizableDividerProps {
  isDragging?: boolean
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function ResizableDivider({
  isDragging = false,
  onPointerDown,
}: ResizableDividerProps) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className={cn(
        "group relative z-10 h-3 w-full cursor-ns-resize border-y border-sidebar-border/40 bg-transparent transition-colors duration-150",
        isDragging && "bg-sidebar-accent/60",
        !isDragging && "hover:bg-sidebar-accent/30"
      )}
    >
      <div className="absolute left-1/2 top-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sidebar-foreground/10 transition-colors duration-150 group-hover:bg-sidebar-foreground/30" />
    </div>
  )
}
