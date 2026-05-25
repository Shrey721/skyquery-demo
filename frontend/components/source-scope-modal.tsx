"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ChevronDown, ChevronRight, Database, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface DiscoveredSchema {
  schema: string
  tables: string[]
}

export interface DiscoveredCatalog {
  catalog: string
  schemas: DiscoveredSchema[]
}

export interface SelectedSource {
  catalog: string
  schema: string
  tables: string[]
}

interface SourceScopeModalProps {
  open: boolean
  onCancel: () => void
  onSave: (payload: { selected_sources: SelectedSource[] }) => Promise<void>
  discoverSources: () => Promise<{ sources: DiscoveredCatalog[]; discovery_errors?: string[] }>
}

type CheckState = "checked" | "unchecked" | "indeterminate"

function tableKey(catalog: string, schema: string, table: string) {
  return `${catalog}.${schema}.${table}`
}

function NativeCheckbox({ state, onChange, label }: { state: CheckState; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate"
  }, [state])

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === "checked"}
      onChange={onChange}
      className="h-4 w-4 rounded border-border/70 bg-secondary/40 accent-[#00a381]"
    />
  )
}

export function SourceScopeModal({ open, onCancel, onSave, discoverSources }: SourceScopeModalProps) {
  const [sources, setSources] = useState<DiscoveredCatalog[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedCatalogs, setExpandedCatalogs] = useState<Set<string>>(new Set())
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [discoveryErrors, setDiscoveryErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open) return

    let active = true
    setLoading(true)
    setSaving(false)
    setError("")
    setDiscoveryErrors([])
    setSources([])
    setSelected(new Set())

    discoverSources()
      .then((res) => {
        if (!active) return
        const discovered = res.sources || []
        const allTables = new Set<string>()
        const allCatalogs = new Set<string>()
        const allSchemas = new Set<string>()

        discovered.forEach((catalog) => {
          allCatalogs.add(catalog.catalog)
          catalog.schemas.forEach((schema) => {
            allSchemas.add(`${catalog.catalog}.${schema.schema}`)
            schema.tables.forEach((table) => allTables.add(tableKey(catalog.catalog, schema.schema, table)))
          })
        })

        setSources(discovered)
        setSelected(allTables)
        setExpandedCatalogs(allCatalogs)
        setExpandedSchemas(allSchemas)
        setDiscoveryErrors(res.discovery_errors || [])
      })
      .catch((e: any) => {
        if (active) setError(e?.message || "Trino discovery failed")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, discoverSources])

  const allTableKeys = useMemo(() => {
    const keys: string[] = []
    sources.forEach((catalog) => {
      catalog.schemas.forEach((schema) => {
        schema.tables.forEach((table) => keys.push(tableKey(catalog.catalog, schema.schema, table)))
      })
    })
    return keys
  }, [sources])

  const selectedCount = selected.size
  const totalCount = allTableKeys.length
  const canSave = selectedCount > 0 && !saving && !loading

  const filteredSources = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sources

    return sources
      .map((catalog) => {
        const catalogMatches = catalog.catalog.toLowerCase().includes(q)
        const schemas = catalog.schemas
          .map((schema) => {
            const schemaMatches = schema.schema.toLowerCase().includes(q)
            const tables = schema.tables.filter(
              (table) => catalogMatches || schemaMatches || table.toLowerCase().includes(q),
            )
            return schemaMatches || tables.length > 0 ? { ...schema, tables: schemaMatches ? schema.tables : tables } : null
          })
          .filter(Boolean) as DiscoveredSchema[]

        return catalogMatches || schemas.length > 0 ? { ...catalog, schemas: catalogMatches ? catalog.schemas : schemas } : null
      })
      .filter(Boolean) as DiscoveredCatalog[]
  }, [sources, search])

  const stateForKeys = (keys: string[]): CheckState => {
    if (keys.length === 0) return "unchecked"
    const count = keys.filter((key) => selected.has(key)).length
    if (count === 0) return "unchecked"
    if (count === keys.length) return "checked"
    return "indeterminate"
  }

  const toggleKeys = (keys: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = keys.length > 0 && keys.every((key) => next.has(key))
      keys.forEach((key) => {
        if (allSelected) next.delete(key)
        else next.add(key)
      })
      return next
    })
  }

  const buildPayload = (): SelectedSource[] => {
    return sources.flatMap((catalog) =>
      catalog.schemas.flatMap((schema) => {
        const tables = schema.tables.filter((table) => selected.has(tableKey(catalog.catalog, schema.schema, table)))
        return tables.length > 0 ? [{ catalog: catalog.catalog, schema: schema.schema, tables }] : []
      }),
    )
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError("")
    try {
      await onSave({ selected_sources: buildPayload() })
    } catch (e: any) {
      setError(e?.message || "Failed to save selected data sources")
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/30 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-[#00a381]" />
              <h2 className="text-lg font-semibold text-foreground">Choose data sources for AI context</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{selectedCount} of {totalCount} tables selected</p>
          </div>
          <button onClick={onCancel} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border/30 px-6 py-4">
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalogs, schemas, or tables"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-[#00a381]" />
              Discovering Trino catalogs, schemas, and tables...
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="rounded-lg border border-border/40 bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
              No matching tables found.
            </div>
          ) : (
            <div className="space-y-3">
              {discoveryErrors.length > 0 && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-300">
                  {discoveryErrors.length} non-fatal discovery issue{discoveryErrors.length === 1 ? "" : "s"}. Accessible sources are shown below.
                </div>
              )}

              {filteredSources.map((catalog) => {
                const catalogKeys = catalog.schemas.flatMap((schema) => schema.tables.map((table) => tableKey(catalog.catalog, schema.schema, table)))
                const catalogExpanded = expandedCatalogs.has(catalog.catalog)

                return (
                  <div key={catalog.catalog} className="rounded-lg border border-border/40 bg-secondary/15">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        onClick={() => setExpandedCatalogs((prev) => {
                          const next = new Set(prev)
                          if (next.has(catalog.catalog)) next.delete(catalog.catalog)
                          else next.add(catalog.catalog)
                          return next
                        })}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={`${catalogExpanded ? "Collapse" : "Expand"} ${catalog.catalog}`}
                      >
                        {catalogExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <NativeCheckbox state={stateForKeys(catalogKeys)} onChange={() => toggleKeys(catalogKeys)} label={`Select catalog ${catalog.catalog}`} />
                      <span className="text-sm font-medium text-foreground">{catalog.catalog}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{catalogKeys.filter((key) => selected.has(key)).length}/{catalogKeys.length}</span>
                    </div>

                    {catalogExpanded && (
                      <div className="space-y-2 border-t border-border/30 px-4 py-3">
                        {catalog.schemas.map((schema) => {
                          const schemaId = `${catalog.catalog}.${schema.schema}`
                          const schemaKeys = schema.tables.map((table) => tableKey(catalog.catalog, schema.schema, table))
                          const schemaExpanded = expandedSchemas.has(schemaId)

                          return (
                            <div key={schemaId} className="ml-5 rounded-md border border-border/30 bg-background/30">
                              <div className="flex items-center gap-2 px-3 py-2">
                                <button
                                  onClick={() => setExpandedSchemas((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(schemaId)) next.delete(schemaId)
                                    else next.add(schemaId)
                                    return next
                                  })}
                                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                  aria-label={`${schemaExpanded ? "Collapse" : "Expand"} ${schemaId}`}
                                >
                                  {schemaExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                                <NativeCheckbox state={stateForKeys(schemaKeys)} onChange={() => toggleKeys(schemaKeys)} label={`Select schema ${schemaId}`} />
                                <span className="text-sm text-foreground">{schema.schema}</span>
                                <span className="ml-auto text-[11px] text-muted-foreground">{schemaKeys.filter((key) => selected.has(key)).length}/{schemaKeys.length}</span>
                              </div>

                              {schemaExpanded && (
                                <div className="grid grid-cols-1 gap-1 border-t border-border/20 px-4 py-2 sm:grid-cols-2">
                                  {schema.tables.map((table) => {
                                    const key = tableKey(catalog.catalog, schema.schema, table)
                                    return (
                                      <label key={key} className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary/40 hover:text-foreground">
                                        <input
                                          type="checkbox"
                                          checked={selected.has(key)}
                                          onChange={() => toggleKeys([key])}
                                          className="h-3.5 w-3.5 shrink-0 rounded border-border/70 bg-secondary/40 accent-[#00a381]"
                                        />
                                        <span className="truncate" title={key}>{table}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border/30 px-6 py-4">
          <p className="text-xs text-muted-foreground">
            {selectedCount === 0 ? "Select at least one table to continue." : "Only selected tables will be sent to the AI schema context."}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={!canSave} className="bg-[#00a381] hover:bg-[#008f70]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save selection
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
