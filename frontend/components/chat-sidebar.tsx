"use client"

import { motion } from "framer-motion"
import {
  Search,
  X,
  PenSquare,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Database,
  RefreshCw,
  LogOut,
  Settings,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ChatSession } from "@/app/page"
import { CollapsibleSchemaSection } from "@/components/collapsible-schema-section"
import { PinChatButton } from "@/components/pin-chat-button"
import { PinnedChatsSection } from "@/components/pinned-chats-section"
import { ResizableDivider } from "@/components/resizable-divider"
import { usePinnedChats } from "@/hooks/use-pinned-chats"
import { useResizablePanel } from "@/hooks/use-resizable-panel"

interface ChatSidebarProps {
  isOpen: boolean
  onClose: () => void
  sessions: ChatSession[]
  activeSessionId?: string
  onSelectSession: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onNewChat: () => void
  user: any
  onLogout: () => void
  connectionStatus: "connected" | "disconnected"
  activeCatalogSchema: string
  schemaTables: any[]
  onRefreshMetadata: () => void
  isRefreshingMetadata?: boolean
  onDisconnectDB?: () => void
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function sessionMeta(session: ChatSession): string {
  if (session.messages.length === 0) return "New session"
  const lastMsg = session.messages[session.messages.length - 1]
  const rowCount = lastMsg.response?.rowCount
  const rows = rowCount ? `${rowCount.toLocaleString()} rows` : ""
  const time = timeAgo(session.createdAt)
  return [time, rows].filter(Boolean).join(" \u00b7 ")
}

function groupSessions(sessions: ChatSession[]) {
  const groups: { label: string; sessions: ChatSession[] }[] = []
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000)

  const thisSession: ChatSession[] = []
  const yesterday: ChatSession[] = []
  const lastWeek: ChatSession[] = []
  const older: ChatSession[] = []

  sessions.forEach((s) => {
    const d = new Date(s.createdAt)
    if (d >= todayStart) thisSession.push(s)
    else if (d >= yesterdayStart) yesterday.push(s)
    else if (d >= weekStart) lastWeek.push(s)
    else older.push(s)
  })

  if (thisSession.length > 0)
    groups.push({ label: "This Session", sessions: thisSession })
  if (yesterday.length > 0)
    groups.push({ label: "Yesterday", sessions: yesterday })
  if (lastWeek.length > 0)
    groups.push({ label: "Last Week", sessions: lastWeek })
  if (older.length > 0)
    groups.push({ label: "Older Chats", sessions: older })

  return groups
}

const OLDER_THRESHOLD = 20
const INTERNAL_SCHEMA_NAMES = new Set([
  "information_schema",
  "sys",
  "mysql",
  "performance_schema",
  "system",
])
const INTERNAL_METADATA_TABLE_NAMES = new Set([
  "applicable_roles",
  "columns",
  "enabled_roles",
  "roles",
  "schemata",
  "table_privileges",
  "tables",
  "views",
])

function splitCatalogSchema(value: string) {
  const [catalog = "", schema = ""] = (value || "").split(".")
  return { catalog, schema }
}

function tableField(table: any, keys: string[], fallback = "") {
  if (typeof table === "string") return fallback
  for (const key of keys) {
    if (table?.[key]) return String(table[key])
  }
  return fallback
}

function groupSchemaTables(schemaTables: any[], activeCatalogSchema: string) {
  const fallback = splitCatalogSchema(activeCatalogSchema)
  const catalogs = new Map<string, Map<string, any[]>>()

  schemaTables.forEach((table) => {
    const tableName =
      typeof table === "string"
        ? table
        : tableField(table, ["table_name", "name", "table"])
    const catalogName = tableField(table, ["catalog", "table_catalog"], fallback.catalog) || "catalog"
    const schemaName = tableField(table, ["schema_name", "schema", "table_schema"], fallback.schema) || "schema"

    if (!tableName) return
    if (INTERNAL_SCHEMA_NAMES.has(schemaName.toLowerCase())) return
    if (INTERNAL_METADATA_TABLE_NAMES.has(tableName.toLowerCase())) return

    if (!catalogs.has(catalogName)) {
      catalogs.set(catalogName, new Map())
    }

    const schemas = catalogs.get(catalogName)!
    if (!schemas.has(schemaName)) {
      schemas.set(schemaName, [])
    }

    schemas.get(schemaName)!.push({
      raw: table,
      catalogName,
      schemaName,
      tableName,
      columns: typeof table === "string" ? [] : table.columns || [],
    })
  })

  return Array.from(catalogs.entries()).map(([catalogName, schemas]) => ({
    catalogName,
    schemas: Array.from(schemas.entries()).map(([schemaName, tables]) => ({
      schemaName,
      tables,
    })),
  }))
}

export function ChatSidebar({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  user,
  onLogout,
  connectionStatus,
  activeCatalogSchema,
  schemaTables,
  onRefreshMetadata,
  isRefreshingMetadata,
  onDisconnectDB,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [olderExpanded, setOlderExpanded] = useState(true)
  const [pinnedExpanded, setPinnedExpanded] = useState(true)
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [schemaCollapsed, setSchemaCollapsed] = useState(false)
  const sidebarContentRef = useRef<HTMLDivElement>(null)
  const { pinnedChatIds, isPinned, togglePinned } = usePinnedChats()
  const { size: schemaPanelHeight, isDragging, startResize } = useResizablePanel({
    containerRef: sidebarContentRef,
    minSize: 120,
    topMinSize: 200,
    initialSize: 320,
    storageKey: "schemaPanelHeight",
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedCollapsed = window.localStorage.getItem("schemaCollapsed")
    if (storedCollapsed === "true") {
      setSchemaCollapsed(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("schemaCollapsed", String(schemaCollapsed))
  }, [schemaCollapsed])

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }))
  }

  // Filter sessions by search query — match on title
  const filtered = sessions.filter((s) => {
    if (!searchQuery) return true
    return s.title.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const grouped = groupSessions(filtered)
  const filteredSessionById = new Map(filtered.map((session) => [session.id, session]))
  const pinnedSessions = pinnedChatIds
    .map((sessionId) => filteredSessionById.get(sessionId))
    .filter((session): session is ChatSession => Boolean(session))
  const totalSessions = sessions.length
  const schemaCatalogs = groupSchemaTables(schemaTables, activeCatalogSchema)
  const visibleTableCount = schemaCatalogs.reduce(
    (count, catalog) =>
      count + catalog.schemas.reduce((schemaCount, schema) => schemaCount + schema.tables.length, 0),
    0
  )

  const renderSessionRow = (session: ChatSession) => {
    const sessionPinned = isPinned(session.id)
    const isActive = session.id === activeSessionId
    const title =
      session.title ||
      (session.messages[0]?.query ?? "New chat")
    const meta = sessionMeta(session)

    return (
      <div key={session.id} className="relative group w-full">
        <button
          onClick={() => onSelectSession(session.id)}
          className={`flex w-full flex-col rounded-lg pl-3 pr-14 py-2 text-left transition-colors ${
            isActive
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="truncate text-sm pr-1">{title}</span>
            {isActive && (
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            )}
          </div>
          <span className="mt-0.5 text-[11px] text-sidebar-foreground/30">
            {meta}
          </span>
        </button>

        <PinChatButton
          isPinned={sessionPinned}
          onToggle={() => togglePinned(session.id)}
        />

        {/* Delete Chat Session Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.confirm(`Are you sure you want to delete session "${title}"?`)) {
              onDeleteSession?.(session.id);
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-sidebar-foreground/20 hover:bg-sidebar-accent hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
          title="Delete conversation"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <motion.aside
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: isOpen ? 0 : -300, opacity: isOpen ? 1 : 0 }}
      transition={{ type: "spring", damping: 26, stiffness: 200 }}
      className="fixed left-0 top-0 z-30 flex h-screen w-72 flex-col border-r border-border bg-sidebar/95 backdrop-blur-xl shadow-lg shadow-black/5"
      aria-label="Chat history sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="New query"
        >
          <PenSquare className="h-3.5 w-3.5" />
          New Query
        </button>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={sidebarContentRef} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: 200 }}>
          {/* Search */}
          <div className="px-3 py-3">
            <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/60 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-sidebar-foreground/40" />
              <input
                type="text"
                placeholder="Search queries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none"
                aria-label="Search conversations"
              />
            </div>
          </div>

          {/* Sessions */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {grouped.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-sidebar-foreground/30">
                No queries yet
              </p>
            ) : (
              <>
                <PinnedChatsSection
                  sessions={pinnedSessions}
                  isExpanded={pinnedExpanded}
                  onToggleExpanded={() => setPinnedExpanded(!pinnedExpanded)}
                  renderSession={renderSessionRow}
                />

                {grouped.map((group) => {
                  const isOlderGroup = group.label === "Older Chats"
                  // Only make "Older Chats" collapsible when total sessions exceed threshold
                  const isCollapsible =
                    isOlderGroup && totalSessions >= OLDER_THRESHOLD

                  return (
                    <div key={group.label} className="mb-3">
                      {/* Group label */}
                      {isCollapsible ? (
                        <button
                          onClick={() => setOlderExpanded(!olderExpanded)}
                          className="flex w-full items-center gap-1 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/35 transition-colors hover:text-sidebar-foreground/50"
                        >
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${
                              olderExpanded ? "" : "-rotate-90"
                            }`}
                          />
                          {group.label}
                          <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-sidebar-foreground/25">
                            ({group.sessions.length})
                          </span>
                        </button>
                      ) : (
                        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/35">
                          {group.label}
                        </p>
                      )}

                      {/* Session items */}
                      {(!isCollapsible || olderExpanded) &&
                        group.sessions.map(renderSessionRow)}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        <ResizableDivider
          isDragging={isDragging}
          onPointerDown={startResize}
        />

        <div
          className="shrink-0 overflow-hidden"
          style={{ height: schemaCollapsed ? "auto" : schemaPanelHeight }}
        >
          <CollapsibleSchemaSection
            connectionStatus={connectionStatus}
            onRefreshMetadata={onRefreshMetadata}
            isRefreshingMetadata={isRefreshingMetadata}
            onDisconnectDB={onDisconnectDB}
            isCollapsed={schemaCollapsed}
            onToggleCollapse={() => setSchemaCollapsed((prev) => !prev)}
          >
            <div className="space-y-1 pr-1">
              {visibleTableCount > 0 ? (
                schemaCatalogs.map(({ catalogName, schemas }) => (
                  <div key={`catalog-${catalogName}`} className="space-y-1">
                    <div className="px-2 pt-1 text-[11px] font-semibold text-sidebar-foreground/70">
                      {catalogName}
                    </div>
                    {schemas.map(({ schemaName, tables }) => (
                      <div key={`schema-${catalogName}.${schemaName}`} className="ml-2 border-l border-sidebar-border/30 pl-2 space-y-0.5">
                        <div className="px-2 py-0.5 text-[10px] font-medium text-sidebar-foreground/45">
                          {schemaName}
                        </div>
                        {tables.map(({ tableName, columns, catalogName, schemaName }) => {
                          const tableKey = `table-${catalogName}.${schemaName}.${tableName}`
                          const isExpanded = !!expandedTables[tableKey]

                          return (
                            <div key={tableKey} className="space-y-0.5">
                              <button
                                onClick={() => toggleTable(tableKey)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
                                )}
                                <span className="truncate" title={`${catalogName}.${schemaName}.${tableName}`}>{tableName}</span>
                              </button>
                              {isExpanded && columns.length > 0 && (
                                <div className="ml-5 border-l border-sidebar-border/40 pl-2.5 py-0.5 space-y-0.5">
                                  {columns.map((col: any) => {
                                    const columnName = String(col.name || col.column_name || col.column || "")
                                    if (!columnName) return null
                                    const columnKey = `column-${catalogName}.${schemaName}.${tableName}.${columnName}`
                                    const dataType = String(col.data_type || col.type || "").toLowerCase()

                                    return (
                                      <div key={columnKey} className="flex items-center justify-between text-[11px] py-0.5">
                                        <span className="text-sidebar-foreground/75 truncate font-mono" title={columnName}>
                                          {columnName}
                                        </span>
                                        <span className="text-[10px] text-sidebar-foreground/40 font-mono shrink-0 ml-2">
                                          {dataType}{col.is_nullable ? "?" : ""}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="px-2 text-xs text-sidebar-foreground/40">No tables discovered</p>
              )}
            </div>
          </CollapsibleSchemaSection>
        </div>
      </div>

      {/* User Footer */}
      {user && (
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-2">
            <div className="flex items-center gap-2">
              <img src={user.avatar_url || "https://github.com/ghost.png"} alt={user.username} className="h-8 w-8 rounded-full" />
              <span className="text-sm font-medium text-sidebar-foreground">{user.username}</span>
            </div>
          </div>
          
          <div className="mt-3 flex items-center justify-between px-2 text-[11px] relative">
            <div className="relative group">
              <button
                className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-sidebar-accent/50 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-all cursor-pointer focus:outline-none select-none"
              >
                <span className={`h-2 w-2 rounded-full ${connectionStatus === "connected" ? "bg-[#10b981]" : "bg-red-500 animate-pulse"}`} />
                <span className="font-semibold text-[11px] tracking-wide">
                  {connectionStatus === "connected" ? "Connected" : "Disconnected"}
                </span>
              </button>

              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-border bg-popover/95 p-3.5 shadow-2xl backdrop-blur-md opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 z-50 space-y-2.5">
                <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">System Diagnostics</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === "connected" ? "bg-[#10b981]" : "bg-red-500 animate-pulse"}`} />
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${!!user ? "bg-[#10b981]" : "bg-red-500"}`} />
                    <span className="text-[10px] text-muted-foreground">Authenticated</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${connectionStatus === "connected" ? "bg-[#10b981]" : "bg-red-500"}`} />
                    <span className="text-[10px] text-muted-foreground">Starburst / Trino Connected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${schemaTables.length > 0 ? "bg-[#10b981]" : "bg-red-500"}`} />
                    <span className="text-[10px] text-muted-foreground">Schema Loaded</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1.5 border-t border-border/50">
                    <span className={`h-2 w-2 rounded-full ${connectionStatus === "connected" && schemaTables.length > 0 ? "bg-[#10b981]" : "bg-yellow-500 animate-pulse"}`} />
                    <span className="text-[10px] text-foreground font-semibold">
                      {connectionStatus === "connected" && schemaTables.length > 0 ? "Data source ready" : "No data source selected"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.aside>
  )
}
