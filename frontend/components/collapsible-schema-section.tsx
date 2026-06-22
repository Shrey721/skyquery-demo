import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, ChevronRight, Database, RefreshCw } from "lucide-react"

interface CollapsibleSchemaSectionProps {
  connectionStatus: "connected" | "disconnected"
  onRefreshMetadata: () => void
  isRefreshingMetadata?: boolean
  onDisconnectDB?: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  children: React.ReactNode
}

export function CollapsibleSchemaSection({
  connectionStatus,
  onRefreshMetadata,
  isRefreshingMetadata,
  onDisconnectDB,
  isCollapsed,
  onToggleCollapse,
  children,
}: CollapsibleSchemaSectionProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-t border-sidebar-border/50">
      <div className="flex items-center justify-between px-2 py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span>Database Schema</span>
        </button>

        <button
          type="button"
          onClick={onRefreshMetadata}
          disabled={isRefreshingMetadata}
          className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
          title="Refresh database schema"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingMetadata ? "animate-spin" : ""}`} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: isCollapsed ? 0 : "100%" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="flex h-full min-h-0 flex-col overflow-hidden"
          >
            {connectionStatus === "connected" ? (
              <div className="flex h-full min-h-0 flex-1 flex-col px-2 pb-3">
                <div className="mb-3 flex items-center justify-between gap-2 text-sm text-[#10b981]">
                  <div className="flex items-center gap-2 truncate">
                    <Database className="h-4 w-4 shrink-0" />
                    <span className="font-medium truncate" title="Data Catalog">Data Catalog</span>
                  </div>
                  {onDisconnectDB && (
                    <button
                      onClick={onDisconnectDB}
                      className="shrink-0 cursor-pointer text-[10px] font-medium text-red-500/80 transition-colors hover:text-red-500"
                    >
                      Disconnect DB
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {children}
                </div>
              </div>
            ) : (
              <div className="px-4 pb-3 text-center text-xs text-sidebar-foreground/40">Disconnected</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
