"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Database, X, CheckCircle2, AlertCircle } from "lucide-react"
import { SourceScopeModal, type SelectedSource } from "@/components/source-scope-modal"

interface ConnectionSetupProps {
  initialConnection?: any
  onTest: (params: any) => Promise<any>
  onConnect: (params: any) => Promise<any>
  onDiscoverSources: () => Promise<any>
  onSaveSelectedSources: (payload: { selected_sources: SelectedSource[] }) => Promise<any>
  onRefreshSelectedContext: () => Promise<any>
  onComplete: () => void
}

export function ConnectionSetup({
  initialConnection,
  onTest,
  onConnect,
  onDiscoverSources,
  onSaveSelectedSources,
  onRefreshSelectedContext,
  onComplete,
}: ConnectionSetupProps) {
  const [host, setHost] = useState(initialConnection?.host || "")
  const [port, setPort] = useState<number | string>(initialConnection?.port || "")
  const [catalog, setCatalog] = useState(initialConnection?.catalog || initialConnection?.default_catalog || "")
  const [schema, setSchema] = useState(initialConnection?.schema_name || initialConnection?.default_schema || "")
  const [username, setUsername] = useState(initialConnection?.username || "")
  const [password, setPassword] = useState(initialConnection?.password || "")
  const [ssl, setSsl] = useState(initialConnection?.ssl ?? initialConnection?.ssl_enabled ?? false)
  const [status, setStatus] = useState<"idle" | "testing" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [isTested, setIsTested] = useState(false)
  const [showScopeModal, setShowScopeModal] = useState(false)

  const handleInputChange = (setter: any) => (e: any) => {
    setter(e.target.type === "checkbox" ? e.target.checked : e.target.value)
    setIsTested(false)
    if (status !== "idle") {
      setStatus("idle")
      setMessage("")
    }
  }

  const getParams = () => ({
    host,
    port: Number(port),
    catalog,
    schema,
    username,
    password: password || undefined,
    ssl,
  })

  const handleTest = async () => {
    setStatus("testing")
    setMessage("Testing connection...")
    try {
      await onTest(getParams())
      setStatus("success")
      setMessage("Connection test successful!")
      setIsTested(true)
    } catch (e: any) {
      setStatus("error")
      setMessage(e.message || "Connection failed")
      setIsTested(false)
    }
  }

  const handleSaveAndDiscover = async () => {
    if (!isTested) return
    setStatus("testing")
    setMessage("Saving connection...")
    try {
      await onConnect(getParams())
      setStatus("success")
      setMessage("Connection saved. Choose data sources for AI context.")
      setShowScopeModal(true)
    } catch (e: any) {
      setStatus("error")
      setMessage(e.message || "Failed to save connection")
    }
  }

  return (
    <motion.div
      className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-lg rounded-xl border border-border/50 bg-card p-8 shadow-2xl backdrop-blur-2xl"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-8 flex items-center justify-between border-b border-border/20 pb-4">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-[#00a381]" />
            <h2 className="text-lg font-semibold tracking-wide text-foreground">Starburst / Trino Connection</h2>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-border/200">Host</label>
              <input
                type="text"
                value={host}
                onChange={handleInputChange(setHost)}
                className="w-full rounded-lg border border-border/50 bg-secondary/30 px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 focus:border-[#00a381] focus:bg-secondary/50 focus:outline-none transition-colors"
                placeholder="Trino coordinator host"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-border/200">Port</label>
              <input
                type="number"
                value={port}
                onChange={handleInputChange(setPort)}
                className="w-full rounded-lg border border-border/50 bg-secondary/30 px-3.5 py-2.5 text-sm text-foreground focus:border-[#00a381] focus:bg-secondary/50 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-border/200">Catalog <span className="text-[10px] lowercase text-muted-foreground/70">optional scope</span></label>
              <input
                type="text"
                value={catalog}
                onChange={handleInputChange(setCatalog)}
                className="w-full rounded-lg border border-border/50 bg-secondary/30 px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 focus:border-[#00a381] focus:bg-secondary/50 focus:outline-none transition-colors"
                placeholder="Limit metadata to catalog"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-border/200">Schema <span className="text-[10px] lowercase text-muted-foreground/70">optional scope</span></label>
              <input
                type="text"
                value={schema}
                onChange={handleInputChange(setSchema)}
                className="w-full rounded-lg border border-border/50 bg-secondary/30 px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 focus:border-[#00a381] focus:bg-secondary/50 focus:outline-none transition-colors"
                placeholder="Limit metadata to schema"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-border/200">Username</label>
              <input
                type="text"
                value={username}
                onChange={handleInputChange(setUsername)}
                className="w-full rounded-lg border border-border/50 bg-secondary/30 px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 focus:border-[#00a381] focus:bg-secondary/50 focus:outline-none transition-colors"
                placeholder="Username"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-border/200">Password / Token</label>
                <span className="text-[10px] text-muted-foreground/80 lowercase">optional</span>
              </div>
              <input
                type="password"
                value={password}
                onChange={handleInputChange(setPassword)}
                className="w-full rounded-lg border border-border/50 bg-secondary/30 px-3.5 py-2.5 text-sm text-foreground focus:border-[#00a381] focus:bg-secondary/50 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer group text-sm text-muted-foreground hover:text-foreground select-none">
              <input
                type="checkbox"
                checked={ssl}
                onChange={handleInputChange(setSsl)}
                className="h-3.5 w-3.5 rounded border-muted-foreground/50 bg-secondary/30 text-[#00a381] focus:ring-[#00a381] focus:ring-offset-0 focus:outline-none cursor-pointer transition-colors"
              />
              Use SSL / TLS
            </label>
          </div>
        </div>

        {message && (
          <motion.div
            className={`mt-6 flex items-start gap-2.5 rounded-lg p-3.5 text-xs border ${
              status === "error"
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : status === "success"
                  ? "bg-[#00a381]/10 border-[#00a381]/20 text-[#00a381]"
                  : "bg-secondary/30 border-border/50 text-muted-foreground"
            }`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {status === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : status === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <Database className="h-4 w-4 shrink-0 mt-0.5 animate-pulse" />
            )}
            <div>{message}</div>
          </motion.div>
        )}

        <div className="mt-8 flex justify-end gap-4 border-t border-border/20 pt-6">
          <button
            onClick={handleTest}
            disabled={status === "testing"}
            className="rounded-lg border border-muted-foreground/50 bg-transparent px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus:outline-none"
          >
            Test Connection
          </button>
          <button
            onClick={handleSaveAndDiscover}
            disabled={!isTested || status === "testing"}
            className="rounded-lg bg-[#00a381] px-5 py-2.5 text-sm font-medium text-foreground hover:bg-[#008f70] disabled:bg-secondary/80 disabled:text-muted-foreground/50 transition-colors focus:outline-none"
          >
            Connect & Save
          </button>
        </div>
      </motion.div>

      <SourceScopeModal
        open={showScopeModal}
        discoverSources={onDiscoverSources}
        onCancel={() => {
          setShowScopeModal(false)
          setMessage("Connection saved. Choose data sources before querying.")
        }}
        onSave={async (payload) => {
          setStatus("testing")
          setMessage("Saving selected data sources...")
          await onSaveSelectedSources(payload)
          setMessage("Building selected AI schema context...")
          await onRefreshSelectedContext()
          setStatus("success")
          setMessage("Selected AI context saved successfully!")
          setShowScopeModal(false)
          setTimeout(onComplete, 600)
        }}
      />
    </motion.div>
  )
}
