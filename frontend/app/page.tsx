"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Link from "next/link"
import { Compass, MessageSquare, PanelLeft, LogOut, Search } from "lucide-react"
import { AnimatedWave } from "@/components/animated-wave"
import { LandingHero } from "@/components/landing-hero"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatWorkspace } from "@/components/chat-workspace"
import { classifyGeoNavigationIntent } from "@/components/result-visualizer"
import { ChatInputBar } from "@/components/chat-input-bar"
import { ThinkingTransition } from "@/components/thinking-transition"
import { executeQuery, getCurrentUser, getGithubLoginUrl, logoutUser, getActiveConnection, getMetadataSchema, testConnection, fullConnect, discoverMetadata, disconnectConnection, discoverSources, saveSelectedSources, refreshSelectedContext, getChatHistory, saveChatHistory } from "@/lib/api"
import { SkyQueryLogo } from "@/components/skyquery-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { AuthGate } from "@/components/auth-gate"
import { ConnectionSetup } from "@/components/connection-setup"
import type { MockResponse } from "@/lib/mock-data"
import { frontendConfig } from "@/lib/config"

type QueryContext = {
  action_type?: string
  action_label?: string
  previous_question?: string
  previous_result_intent?: any
  previous_sql?: string
  previous_columns?: string[]
  previous_rows?: any[]
  metadata_context?: any
}


export interface ChatMessage {
  id: string
  query: string
  response: MockResponse | null
  navigation?: {
    target: "live_airspace" | "geo_map"
    assistantMessage: string
  } | null
  timestamp: string
  isLoading: boolean
  attachedCSV?: { name: string; headers: string[]; rows: any[] } | null
  queryContext?: QueryContext | null
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
}

type AppPhase = "loading" | "auth" | "connection" | "landing" | "thinking" | "workspace"

function isMetadataContext(context?: QueryContext | null): boolean {
  const intent = context?.previous_result_intent
  const category = typeof intent === "string" ? intent : intent?.category
  return category === "metadata"
}

function validateQuery(query: string, schemaMetadata: any, queryContext?: QueryContext | null): boolean {
  const trimmed = query.trim();
  return trimmed.length >= 3 || isMetadataContext(queryContext);
}

function generateSessionTitle(query: string): string {
  if (!query) return "New Analysis";
  let clean = query.toLowerCase().trim();

  // Strip common conversational/command prefixes
  const prefixes = [
    "show me the", "show me", "query the", "query for", "query",
    "list all", "list the", "list", "get all", "get", "find all",
    "find", "display the", "display", "please show", "please"
  ];

  for (const prefix of prefixes) {
    if (clean.startsWith(prefix + " ")) {
      clean = clean.substring(prefix.length).trim();
      break;
    }
  }

  // Strip question marks or punctuation at the end
  clean = clean.replace(/[?.,!;:]+$/, "").trim();

  if (!clean) return "New Analysis";

  // Convert to Title Case
  const words = clean.split(/\s+/);
  const titleCaseWords = words.map(word => {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  // Limit to 4 to 6 words
  const resultWords = titleCaseWords.slice(0, 6);

  let title = resultWords.join(" ");
  if (words.length > 6) {
    title += "...";
  }

  return title;
}

function buildPreviousQueryContext(session?: ChatSession | null, actionContext?: QueryContext | null): QueryContext | null {
  const previous = session?.messages?.slice().reverse().find((message) =>
    message.response && message.response.resultType !== "navigation"
  )
  if (!previous?.response && !actionContext) return null

  const response: any = previous?.response || {}
  return {
    ...(actionContext || {}),
    previous_question: actionContext?.previous_question || previous?.query,
    previous_result_intent: actionContext?.previous_result_intent || response.result_intent || response.rendering?.mode,
    previous_sql: actionContext?.previous_sql || response.sql,
    previous_columns: actionContext?.previous_columns || response.tableHeaders || [],
    previous_rows: actionContext?.previous_rows || (response.rows || []).slice(0, 25),
    metadata_context: actionContext?.metadata_context || response.rendering?.metadata_context,
  }
}

function buildBackendErrorResponse(errorMsg: string, error?: any): MockResponse {
  if (error?.error_type === "connector_connection_failed") {
    const generatedSql = error.generated_sql || error.sql || "";
    return {
      summary: error.user_message || "The SQL was generated correctly, but SkyQuery could not reach the connected data source.",
      kpis: [],
      chartTitle: "Connector unavailable",
      chartBars: [],
      tableHeaders: [],
      tableRows: [],
      sql: generatedSql,
      generatedSql,
      followUps: [],
      rowCount: 0,
      resultType: "invalid",
      executionError: error.user_message || errorMsg,
      errorType: error.error_type,
      source: error.source || error.catalog,
      suggestedFixes: [
        "Check Trino container",
        "Check Postgres container",
        "Verify connector credentials",
        "Retry query",
      ],
    }
  }

  return {
    summary: "The backend could not complete this query. Review the diagnostics below and adjust the request.",
    kpis: [],
    chartTitle: "Query Error",
    chartBars: [],
    tableHeaders: [],
    tableRows: [],
    sql: "",
    followUps: [],
    rowCount: 0,
    resultType: "invalid",
    executionError: errorMsg,
  }
}

function detectGeoNavigationTarget(query: string): "live_airspace" | "geo_map" | null {
  return classifyGeoNavigationIntent(query)
}

export default function SkyQueryApp() {
  const [phase, setPhase] = useState<AppPhase>("loading")
  const [user, setUser] = useState<any>(null)
  const [connection, setConnection] = useState<any>(null)
  const [schemaMetadata, setSchemaMetadata] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const [pendingCSV, setPendingCSV] = useState<{ name: string; headers: string[]; rows: any[] } | null>(null)
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [isOnboardingCompleting, setIsOnboardingCompleting] = useState(false)
  const [historyHydrated, setHistoryHydrated] = useState(false)
  const lastSavedHistoryKey = useRef<string>("")
  const connectionBackArmedRef = useRef(false)
  const phaseRef = useRef<AppPhase>("loading")
  const connectionRef = useRef<any>(null)
  const activeQueryRef = useRef<{
    requestId: string
    sessionId: string
    messageId: string
    controller: AbortController
    cancelled: boolean
  } | null>(null)

  const currentSession = sessions.find((s) => s.id === currentSessionId) || null
  const hasSavedActiveTrinoConnection = Boolean(connection?.is_active)
  const connectionCatalog = connection?.catalog || connection?.default_catalog || ""
  const connectionSchema = connection?.schema_name || connection?.default_schema || ""
  const activeCatalogSchema = [connectionCatalog, connectionSchema].filter(Boolean).join(".")

  const isActiveQuery = useCallback((requestId: string, messageId: string) => {
    const active = activeQueryRef.current
    return Boolean(active && active.requestId === requestId && active.messageId === messageId && !active.cancelled)
  }, [])

  const clearActiveQuery = useCallback((requestId: string) => {
    if (activeQueryRef.current?.requestId === requestId) {
      activeQueryRef.current = null
    }
  }, [])

  const stopActiveQuery = useCallback(() => {
    const active = activeQueryRef.current
    if (!active) return
    active.cancelled = true
    console.log("query_cancelled", {
      requestId: active.requestId,
      sessionId: active.sessionId,
      messageId: active.messageId,
    })
    active.controller.abort()
    console.log("request_aborted", {
      requestId: active.requestId,
      messageId: active.messageId,
    })
    setSessions((prev) =>
      prev.map((s) =>
        s.id === active.sessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === active.messageId ? { ...m, isLoading: false } : m
              ),
            }
          : s
      )
    )
    activeQueryRef.current = null
  }, [])

  useEffect(() => {
    phaseRef.current = phase
    connectionRef.current = connection
  }, [phase, connection])

  useEffect(() => {
    return () => {
      if (activeQueryRef.current) {
        activeQueryRef.current.cancelled = true
        activeQueryRef.current.controller.abort()
        console.log("request_aborted", {
          requestId: activeQueryRef.current.requestId,
          reason: "unmount",
        })
        activeQueryRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (phase !== "connection") {
      connectionBackArmedRef.current = false
      return
    }

    if (hasSavedActiveTrinoConnection) return

    const backTo = sessionStorage.getItem("skyquery_connection_back_to") || "/product-tour"
    if (!connectionBackArmedRef.current) {
      window.history.pushState({ skyqueryConnectionFlow: true }, "", window.location.href)
      connectionBackArmedRef.current = true
    }

    const handlePopState = () => {
      const latestConnection = connectionRef.current
      if (phaseRef.current === "connection" && !latestConnection?.is_active) {
        sessionStorage.removeItem("skyquery_connection_back_to")
        window.location.replace(backTo)
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [phase, hasSavedActiveTrinoConnection])

  useEffect(() => {
    if (!user || hasSavedActiveTrinoConnection) return
    if (phase === "landing" || phase === "workspace" || phase === "thinking") {
      setCurrentSessionId(null)
      setPendingQuery(null)
      setPendingCSV(null)
      setPhase("connection")
    }
  }, [hasSavedActiveTrinoConnection, phase, user])

  const leaveUnsavedConnectionFlow = useCallback(() => {
    sessionStorage.removeItem("skyquery_connection_back_to")
    setCurrentSessionId(null)
    setPendingQuery(null)
    setPendingCSV(null)
    if (!hasSavedActiveTrinoConnection) {
      window.location.replace("/product-tour")
      return
    }
    setPhase("landing")
  }, [hasSavedActiveTrinoConnection])

  // LocalStorage is only an optimistic cache; backend history is the source of truth.
  const getUserHistoryStorageKey = (account: any) => `skyquery_sessions_user_${account?.id || account?.email || account?.username || "unknown"}`

  const saveSessions = (storageKey: string, sessionsList: ChatSession[], activeSessionId: string | null) => {
    try {
      const data = {
        sessions: sessionsList,
        currentSessionId: activeSessionId
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save sessions to localStorage", e);
    }
  };

  const loadSessions = (storageKey: string, legacyUsername?: string) => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return { ...JSON.parse(stored), hasStoredChatState: true };
      }
      if (legacyUsername) {
        const legacyStored = localStorage.getItem(`skyquery_sessions_${legacyUsername}`);
        if (legacyStored) {
          console.log("[History Restore] legacy local cache hit; will migrate to account key", {
            storage_source: "localStorage_legacy",
            legacy_key: `skyquery_sessions_${legacyUsername}`,
          });
          return { ...JSON.parse(legacyStored), hasStoredChatState: true };
        }
      }
    } catch (e) {
      console.error("Failed to load sessions from localStorage", e);
    }
    return { sessions: [], currentSessionId: null, hasStoredChatState: false };
  };

  const mergeSessionLists = (backendSessions: ChatSession[] = [], localSessions: ChatSession[] = []) => {
    const merged = new Map<string, ChatSession>();
    backendSessions.forEach((session) => merged.set(session.id, session));
    localSessions.forEach((session) => {
      if (!merged.has(session.id)) merged.set(session.id, session);
    });
    return Array.from(merged.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.messages?.[0]?.timestamp || 0).getTime();
      const bTime = new Date(b.createdAt || b.messages?.[0]?.timestamp || 0).getTime();
      return bTime - aTime;
    });
  };

  const clearSessions = (storageKey: string, legacyUsername?: string) => {
    try {
      localStorage.removeItem(storageKey);
      if (legacyUsername) localStorage.removeItem(`skyquery_sessions_${legacyUsername}`);
    } catch (e) {
      console.error("Failed to clear sessions in localStorage", e);
    }
  };

  // Auto-save sessions whenever sessions, currentSessionId, or user changes
  useEffect(() => {
    if (user && historyHydrated) {
      saveSessions(getUserHistoryStorageKey(user), sessions, currentSessionId);
      const historyKey = JSON.stringify({ sessions, currentSessionId });
      if (historyKey !== lastSavedHistoryKey.current) {
        lastSavedHistoryKey.current = historyKey;
        saveChatHistory({ sessions, currentSessionId })
          .then((result) => {
            console.log("[History Sync] backend save success", {
              storage_source: result?.storage_source || "backend",
              resolved_authenticated_user_id: result?.user_id || user.id,
              conversation_count: result?.conversation_count ?? sessions.length,
            });
          })
          .catch((error) => {
            console.warn("[History Sync] backend save failed; local cache retained", {
              storage_source: "local_cache",
              resolved_authenticated_user_id: user.id,
              conversation_count: sessions.length,
              error: error?.message || String(error),
            });
          });
      }
    }
  }, [sessions, currentSessionId, user, historyHydrated]);

  // Fetch initial state
  useEffect(() => {
    // 1. Capture and process URL parameters at startup
    const urlParams = new URLSearchParams(window.location.search);
    const sharedQuery = urlParams.get("q");
    const authError = urlParams.get("auth_error");
    if (sharedQuery) {
      sessionStorage.setItem("pending_share_query", sharedQuery);
    }
    if (authError === "cancelled") {
      sessionStorage.setItem("skyquery_auth_message", "GitHub sign-in was cancelled.");
    }
    
    const urlSessionId = urlParams.get("session_id");
    if (urlSessionId) {
      console.log("[Auth Bootstrap] Captured session_id redirect:", urlSessionId);
      localStorage.setItem("skyquery_session_id", urlSessionId);
    }

    const authReturnTo = sessionStorage.getItem("skyquery_auth_return_to");
    if (urlSessionId && authReturnTo === "/product-tour") {
      sessionStorage.removeItem("skyquery_auth_return_to");
      sessionStorage.removeItem("just_authorized_github");
      window.location.replace("/product-tour");
      return;
    }

    if (sharedQuery || urlSessionId || authError) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    async function loadInitialState() {
      console.log("[Auth Bootstrap] Current Frontend URL:", window.location.href);
      console.log("[Auth Bootstrap] Backend API URL Base:", frontendConfig.apiBaseUrl);
      console.log("[Auth Bootstrap] Active localStorage session_id:", localStorage.getItem("skyquery_session_id"));
      
      try {
        const u = await getCurrentUser();
        console.log("[Auth Bootstrap] auth/me response:", u);
        
        if (!u) {
          console.log("[Auth Bootstrap] Unauthenticated session. Transitioning to AuthGate.");
          setPhase("auth");
          return;
        }
        
        console.log("[Auth Bootstrap] Session restored successfully for:", u.username);
        setUser(u);

        // Restore user sessions from backend first, with local cache as optimistic fallback/migration source.
        const localRestored = loadSessions(getUserHistoryStorageKey(u), u.username);
        console.log("[History Restore] local cache", {
          storage_source: "localStorage",
          resolved_authenticated_user_id: u.id,
          local_cache_hit: localRestored.sessions.length > 0,
          conversation_count: localRestored.sessions.length,
        });

        let restored = localRestored;
        try {
          const backendHistory = await getChatHistory();
          const backendSessions = backendHistory?.sessions || [];
          const mergedSessions = mergeSessionLists(backendSessions, localRestored.sessions);
          const currentFromBackend = backendHistory?.currentSessionId;
          const currentSessionId = localRestored.hasStoredChatState
            ? localRestored.currentSessionId || null
            : currentFromBackend || null;
          restored = { sessions: mergedSessions, currentSessionId };
          console.log("[History Restore] backend restore", {
            storage_source: backendHistory?.storage_source || "backend",
            resolved_authenticated_user_id: backendHistory?.user_id || u.id,
            fetched_conversation_count: backendSessions.length,
            merged_conversation_count: mergedSessions.length,
            backend_restore_success: true,
            local_cache_hit: localRestored.sessions.length > 0,
          });
          if (mergedSessions.length !== backendSessions.length) {
            await saveChatHistory({ sessions: mergedSessions, currentSessionId });
            console.log("[History Migration] migrated local-only chats to backend", {
              resolved_authenticated_user_id: u.id,
              migrated_count: mergedSessions.length - backendSessions.length,
            });
          }
        } catch (historyError: any) {
          console.warn("[History Restore] backend restore failed; using local cache", {
            storage_source: "localStorage",
            resolved_authenticated_user_id: u.id,
            backend_restore_success: false,
            local_cache_hit: localRestored.sessions.length > 0,
            error: historyError?.message || String(historyError),
          });
        }

        const restoredActiveSession = restored.currentSessionId
          ? restored.sessions.find((s: any) => s.id === restored.currentSessionId)
          : null;
        const restoredActiveSessionId =
          restoredActiveSession?.messages && restoredActiveSession.messages.length > 0
            ? restoredActiveSession.id
            : null;

        setSessions(restored.sessions);
        setCurrentSessionId(restoredActiveSessionId);
        lastSavedHistoryKey.current = JSON.stringify({ ...restored, currentSessionId: restoredActiveSessionId });
        setHistoryHydrated(true);

        // Check if user just completed a fresh GitHub authorization
        const justAuthorized = sessionStorage.getItem("just_authorized_github") === "true";

        const conn = await getActiveConnection();
        if (conn && conn.is_active) {
          setConnection(conn);
        }

        const meta = await getMetadataSchema();
        if (meta && meta.tables && meta.tables.length > 0) {
          setSchemaMetadata(meta);
        }

        // Force connection setup if no active connection exists, schema is missing, OR they just logged in/authorized fresh!
        if (!conn || !conn.is_active || !meta || !meta.tables || meta.tables.length === 0 || justAuthorized) {
          setPhase("connection");
          return;
        }

        // Check for pending share query!
        const pendingShare = sessionStorage.getItem("pending_share_query");
        if (pendingShare) {
          sessionStorage.removeItem("pending_share_query");
          const sessionId = `session-${Date.now()}`
          const newSession: ChatSession = {
            id: sessionId,
            title: generateSessionTitle(pendingShare),
            messages: [],
            createdAt: new Date().toISOString(),
          }
          setSessions((prev) => [newSession, ...prev])
          setCurrentSessionId(sessionId)
          setPendingQuery(pendingShare)
          setPhase("thinking")
          return;
        }

        // Determine if we should restore to workspace or landing
        let restoredPhase: AppPhase = "landing";
        if (restoredActiveSessionId) {
          restoredPhase = "workspace";
          setSidebarOpen(true);
        }

        setPhase(restoredPhase);
      } catch (e) {
        console.error("Error during initial state load:", e);
        setPhase("auth");
      }
    }
    loadInitialState();
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    localStorage.removeItem("skyquery_session_id");
    if (user) {
      clearSessions(getUserHistoryStorageKey(user), user.username);
    }
    setUser(null);
    setConnection(null);
    setSchemaMetadata(null);
    setSessions([]);
    setCurrentSessionId(null);
    setHistoryHydrated(false);
    lastSavedHistoryKey.current = "";
    setPhase("auth");
  };

  const handleRefreshMetadata = async () => {
    setIsRefreshingMetadata(true)
    try {
      const meta = await discoverMetadata();
      setSchemaMetadata(meta);
    } catch (e) {
      console.error("Failed to refresh metadata", e);
    } finally {
      setIsRefreshingMetadata(false)
    }
  };

  const handleDisconnectDB = async () => {
    try {
      await disconnectConnection();
    } catch (e) {
      console.error("Failed to disconnect DB", e);
    }
    setConnection(null);
    setSchemaMetadata(null);
    setPhase("connection");
  };

  const addMessageToSession = useCallback(
    (
      sessionId: string,
      query: string,
      attachedCSV?: { name: string; headers: string[]; rows: any[] } | null,
      actionContext?: QueryContext | null
    ) => {
      const messageId = `msg-${Date.now()}`
      const geoNavigationTarget = attachedCSV ? null : detectGeoNavigationTarget(query)
      const currentSess = sessions.find((s) => s.id === sessionId)
      if (geoNavigationTarget) {
        const navigationMessage: ChatMessage = {
          id: messageId,
          query,
          response: null,
          navigation: {
            target: geoNavigationTarget,
            assistantMessage: geoNavigationTarget === "live_airspace"
              ? "Opening Live Airspace."
              : "Opening Geo Map.",
          },
          timestamp: new Date().toISOString(),
          isLoading: false,
          attachedCSV,
          queryContext: null,
        }
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, messages: [...s.messages, navigationMessage] }
              : s
          )
        )
        console.log("geo_navigation_routed", { sessionId, messageId, target: geoNavigationTarget })
        return
      }
      const requestId = `${messageId}-${Math.random().toString(36).slice(2)}`
      if (activeQueryRef.current) {
        activeQueryRef.current.cancelled = true
        activeQueryRef.current.controller.abort()
        console.log("request_aborted", {
          requestId: activeQueryRef.current.requestId,
          reason: "superseded",
        })
      }
      const controller = new AbortController()
      activeQueryRef.current = { requestId, sessionId, messageId, controller, cancelled: false }
      console.log("query_started", { requestId, sessionId, messageId })
      const queryContext = buildPreviousQueryContext(currentSess, actionContext)
      const newMessage: ChatMessage = {
        id: messageId,
        query,
        response: null,
        timestamp: new Date().toISOString(),
        isLoading: true,
        attachedCSV,
        queryContext,
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, newMessage] }
            : s
        )
      )

      // Start API call or preview user-provided file rows locally.
      const runQuery = async () => {
        // Validation check
        const isValid = validateQuery(query, schemaMetadata, queryContext);
        if (!isValid) {
          const invalidResponse: MockResponse = {
            summary: "Please enter a more specific question about the connected data.",
            kpis: [],
            chartTitle: "Invalid Query",
            chartBars: [],
            tableHeaders: [],
            tableRows: [],
            sql: "",
            followUps: [],
            rowCount: 0,
            resultType: "invalid",
          };

          setTimeout(() => {
            if (!isActiveQuery(requestId, messageId)) {
              console.log("stale_response_ignored", { requestId, messageId, source: "validation" })
              return
            }
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === messageId
                          ? { ...m, response: invalidResponse, isLoading: false }
                          : m
                      ),
                    }
                  : s
              )
            );
            clearActiveQuery(requestId)
          }, 400);
          return;
        }

        let csvFile = attachedCSV;
        if (!csvFile && sessionId) {
          const sess = sessions.find((s) => s.id === sessionId);
          if (sess && sess.messages) {
            // Find the most recent message that had an attachedCSV
            for (let i = sess.messages.length - 1; i >= 0; i--) {
              const msg = sess.messages[i];
              if (msg.attachedCSV) {
                csvFile = msg.attachedCSV;
                break;
              }
            }
          }
        }

        const queryLower = query.toLowerCase();
        const hasCsvWord = queryLower.includes("csv") || queryLower.includes("attachment") || queryLower.includes("uploaded") || (csvFile && queryLower.includes(csvFile.name.toLowerCase().split(".")[0]));
        
        if (csvFile && hasCsvWord) {
          const headers = csvFile.headers;
          const rows = csvFile.rows;
          
          const numericCols = headers.filter(h => {
            return rows.some(r => {
              const val = Number(r[h]);
              return !isNaN(val) && String(r[h]).trim() !== "";
            });
          });
          const categoricalCols = headers.filter(h => !numericCols.includes(h));

          const fileResponse: MockResponse = {
            summary: `Successfully parsed and visualized attached dataset: ${csvFile.name}. Identified ${categoricalCols.length} categorical columns and ${numericCols.length} numeric metrics.`,
            kpis: [
              { label: "Total Rows", value: String(rows.length), sub: "Uploaded CSV rows" },
              { label: "Attributes", value: String(headers.length), sub: "Data columns" },
              { label: "Numeric Columns", value: String(numericCols.length), sub: numericCols.join(", ") || "None" },
              { label: "Categorical Columns", value: String(categoricalCols.length), sub: categoricalCols.slice(0, 2).join(", ") || "None" }
            ],
            chartTitle: `Visualizing attachment: ${csvFile.name}`,
            chartBars: rows.slice(0, 10).map((r, idx) => ({
              label: String(r[categoricalCols[0] || headers[0]] || `Row ${idx + 1}`),
              value: Number(r[numericCols[0] || headers[0]]) || 0,
              color: "primary"
            })),
            tableHeaders: headers,
            tableRows: rows.map(r => ({
              cells: headers.map(h => String(r[h] || ""))
            })),
            sql: "",
            followUps: [`Summarize ${csvFile.name}`, `Analyze data in ${csvFile.name}`],
            rowCount: rows.length,
            resultType: "chart",
            rows: rows,
            source: "Uploaded file preview"
          };

          setTimeout(() => {
            if (!isActiveQuery(requestId, messageId)) {
              console.log("stale_response_ignored", { requestId, messageId, source: "csv_preview" })
              return
            }
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === messageId
                          ? { ...m, response: fileResponse, isLoading: false }
                          : m
                      ),
                    }
                  : s
              )
            );
            clearActiveQuery(requestId)
          }, 600);
          return;
        }

        try {
          const apiResponse = await executeQuery(query, sessionId, csvFile, queryContext, controller.signal, requestId);
          if (!isActiveQuery(requestId, messageId)) {
            console.log("stale_response_ignored", { requestId, messageId, source: "api_success" })
            return
          }
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === messageId
                      ? { ...m, response: apiResponse, isLoading: false }
                      : m
                  ),
                }
                : s
              )
          );
          clearActiveQuery(requestId)
        } catch (error: any) {
          if (error?.name === "AbortError" || !isActiveQuery(requestId, messageId)) {
            console.log("stale_response_ignored", { requestId, messageId, source: "api_abort_or_stale" })
            clearActiveQuery(requestId)
            return
          }
          console.error("Backend failed:", error);
          const errorMsg = error?.message || String(error);
          
          let responseObj: any;
          if (errorMsg.includes("401") || errorMsg.toLowerCase().includes("unauthorized") || errorMsg.toLowerCase().includes("expired") || errorMsg.toLowerCase().includes("reconnect") || errorMsg.toLowerCase().includes("auth")) {
            responseObj = {
              summary: "Live Copilot session expired or unavailable. Please reconnect authentication.",
              kpis: [],
              chartTitle: "Authentication Required",
              chartBars: [],
              tableHeaders: [],
              tableRows: [],
              sql: "",
              followUps: [],
              rowCount: 0,
              resultType: "invalid",
              executionError: "Live Copilot session expired or unavailable. Please reconnect authentication."
            };
          } else {
            responseObj = buildBackendErrorResponse(errorMsg, error);
          }

          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === messageId
                      ? { ...m, response: responseObj, isLoading: false }
                      : m
                  ),
                }
                : s
              )
          );
          clearActiveQuery(requestId)
        }
      };

      runQuery();
    },
    [sessions, clearActiveQuery, isActiveQuery]
  )

  const handleRefreshQuery = useCallback(
    async (sessionId: string, messageId: string, query: string) => {
      const requestId = `${messageId}-refresh-${Math.random().toString(36).slice(2)}`
      if (activeQueryRef.current) {
        activeQueryRef.current.cancelled = true
        activeQueryRef.current.controller.abort()
        console.log("request_aborted", {
          requestId: activeQueryRef.current.requestId,
          reason: "superseded_by_refresh",
        })
      }
      const controller = new AbortController()
      activeQueryRef.current = { requestId, sessionId, messageId, controller, cancelled: false }
      console.log("query_started", { requestId, sessionId, messageId, source: "refresh" })
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === messageId ? { ...m, isLoading: true, response: null } : m
                ),
              }
            : s
        )
      );

      try {
        const currentSess = sessions.find((s) => s.id === sessionId);
        const msgObj = currentSess?.messages.find((m) => m.id === messageId);
        const attachedCSV = msgObj?.attachedCSV || null;
        const queryContext = msgObj?.queryContext || buildPreviousQueryContext(currentSess);

        const queryLower = query.toLowerCase();
        const hasCsvWord = queryLower.includes("csv") || queryLower.includes("attachment") || queryLower.includes("uploaded") || (attachedCSV && queryLower.includes(attachedCSV.name.toLowerCase().split(".")[0]));

        if (attachedCSV && hasCsvWord) {
          const headers = attachedCSV.headers;
          const rows = attachedCSV.rows;
          
          const numericCols = headers.filter(h => {
            return rows.some(r => {
              const val = Number(r[h]);
              return !isNaN(val) && String(r[h]).trim() !== "";
            });
          });
          const categoricalCols = headers.filter(h => !numericCols.includes(h));

          const fileResponse: MockResponse = {
            summary: `Successfully parsed and visualized attached dataset: ${attachedCSV.name}. Identified ${categoricalCols.length} categorical columns and ${numericCols.length} numeric metrics.`,
            kpis: [
              { label: "Total Rows", value: String(rows.length), sub: "Uploaded CSV rows" },
              { label: "Attributes", value: String(headers.length), sub: "Data columns" },
              { label: "Numeric Columns", value: String(numericCols.length), sub: numericCols.join(", ") || "None" },
              { label: "Categorical Columns", value: String(categoricalCols.length), sub: categoricalCols.slice(0, 2).join(", ") || "None" }
            ],
            chartTitle: `Visualizing attachment: ${attachedCSV.name}`,
            chartBars: rows.slice(0, 10).map((r, idx) => ({
              label: String(r[categoricalCols[0] || headers[0]] || `Row ${idx + 1}`),
              value: Number(r[numericCols[0] || headers[0]]) || 0,
              color: "primary"
            })),
            tableHeaders: headers,
            tableRows: rows.map(r => ({
              cells: headers.map(h => String(r[h] || ""))
            })),
            sql: "",
            followUps: [`Summarize ${attachedCSV.name}`, `Analyze data in ${attachedCSV.name}`],
            rowCount: rows.length,
            resultType: "chart",
            rows: rows,
            source: "Uploaded file preview"
          };

          setTimeout(() => {
            if (!isActiveQuery(requestId, messageId)) {
              console.log("stale_response_ignored", { requestId, messageId, source: "refresh_csv_preview" })
              return
            }
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === messageId
                          ? { ...m, response: fileResponse, isLoading: false }
                          : m
                      ),
                    }
                  : s
              )
            );
            clearActiveQuery(requestId)
          }, 600);
          return;
        }

        const apiResponse = await executeQuery(query, sessionId, attachedCSV, queryContext, controller.signal, requestId);
        if (!isActiveQuery(requestId, messageId)) {
          console.log("stale_response_ignored", { requestId, messageId, source: "refresh_api_success" })
          return
        }
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === messageId ? { ...m, response: apiResponse, isLoading: false } : m
                  ),
                }
            : s
          )
        );
        clearActiveQuery(requestId)
      } catch (error: any) {
        if (error?.name === "AbortError" || !isActiveQuery(requestId, messageId)) {
          console.log("stale_response_ignored", { requestId, messageId, source: "refresh_api_abort_or_stale" })
          clearActiveQuery(requestId)
          return
        }
        console.error("Backend failed:", error);
        const errorMsg = error?.message || String(error);
        
        let responseObj: any;
        if (errorMsg.includes("401") || errorMsg.toLowerCase().includes("unauthorized") || errorMsg.toLowerCase().includes("expired") || errorMsg.toLowerCase().includes("reconnect") || errorMsg.toLowerCase().includes("auth")) {
          responseObj = {
            summary: "Live Copilot session expired or unavailable. Please reconnect authentication.",
            kpis: [],
            chartTitle: "Authentication Required",
            chartBars: [],
            tableHeaders: [],
            tableRows: [],
            sql: "",
            followUps: [],
            rowCount: 0,
            resultType: "invalid",
            executionError: "Live Copilot session expired or unavailable. Please reconnect authentication."
          };
        } else {
          responseObj = buildBackendErrorResponse(errorMsg, error);
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === messageId ? { ...m, response: responseObj, isLoading: false } : m
                  ),
                }
            : s
          )
        );
        clearActiveQuery(requestId)
      }
    },
    [sessions, clearActiveQuery, isActiveQuery]
  )

  const handleQuerySubmit = useCallback(
    (query: string, attachedCSV?: { name: string; headers: string[]; rows: any[] } | null) => {
      setIsTyping(false)

      if (!user) {
        alert("Connect GitHub first")
        setPhase("auth")
        return
      }
      if (!connection) {
        alert("Connect Starburst / Trino")
        setPhase("connection")
        return
      }
      if (!schemaMetadata || !schemaMetadata.tables || schemaMetadata.tables.length === 0) {
        alert("Choose data sources for AI context before querying")
        setPhase("connection")
        return
      }

      if (phase === "landing") {
        // First query: create session, show thinking, then workspace
        const sessionId = `session-${Date.now()}`
        const newSession: ChatSession = {
          id: sessionId,
          title: generateSessionTitle(query),
          messages: [],
          createdAt: new Date().toISOString(),
        }
        setSessions((prev) => [newSession, ...prev])
        setCurrentSessionId(sessionId)
        setPendingQuery(query)
        setPendingCSV(attachedCSV || null)
        setPhase("thinking")
      } else if (phase === "workspace" && currentSessionId) {
        // Follow-up: append message to current session
        addMessageToSession(currentSessionId, query, attachedCSV)
      }
    },
    [phase, currentSessionId, addMessageToSession, user, connection, schemaMetadata]
  )

  const handleThinkingComplete = useCallback(() => {
    setPhase("workspace")
    setSidebarOpen(true)

    // Now add the first message to the session
    if (currentSessionId && pendingQuery) {
      addMessageToSession(currentSessionId, pendingQuery, pendingCSV)
      setPendingQuery(null)
      setPendingCSV(null)
    }
  }, [currentSessionId, pendingQuery, pendingCSV, addMessageToSession])

  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      setCurrentSessionId(sessionId)

      const selected = sessions.find((s) => s.id === sessionId)
      if (selected && selected.messages && selected.messages.length > 0) {
        setPhase("workspace")
      } else {
        setPhase("landing")
      }
      setSidebarOpen(true)
    },
    [sessions]
  )

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== sessionId)

        if (currentSessionId === sessionId) {
          setCurrentSessionId(null)
          setPhase("landing")
        }
        return updated
      })
    },
    [currentSessionId]
  )

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null)
    setPhase("landing")
  }, [])

  const handleFollowUp = useCallback(
    (text: string, actionContext?: QueryContext | null) => {
      if (currentSessionId) {
        addMessageToSession(currentSessionId, text, null, actionContext)
      }
    },
    [currentSessionId, addMessageToSession]
  )

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Animated wave background */}
      <AnimatedWave isTyping={isTyping} />

      {/* Thinking transition overlay */}
      <AnimatePresence>
        {phase === "thinking" && hasSavedActiveTrinoConnection && (
          <ThinkingTransition onComplete={handleThinkingComplete} />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isOnboardingCompleting ? (
          <motion.div
            key="onboarding-loading"
            className="flex h-screen flex-col items-center justify-center gap-4 bg-background z-50 relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20 opacity-75" />
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            </div>
            <h2 className="text-sm font-light tracking-widest text-muted-foreground uppercase animate-pulse">
              Validating active connection & discovering schema...
            </h2>
          </motion.div>
        ) : phase === "loading" ? (
          <motion.div
            key="loading"
            className="flex h-screen flex-col items-center justify-center gap-4 bg-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20 opacity-75" />
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            </div>
            <h2 className="text-sm font-light tracking-widest text-muted-foreground uppercase animate-pulse">
              Initializing SkyQuery...
            </h2>
          </motion.div>
        ) : phase === "auth" ? (
          <AuthGate
            key="auth"
            message={typeof window !== "undefined" ? sessionStorage.getItem("skyquery_auth_message") || undefined : undefined}
            onLogin={() => {
              sessionStorage.removeItem("skyquery_auth_message");
              sessionStorage.setItem("just_authorized_github", "true");
              window.location.href = getGithubLoginUrl();
            }}
          />
        ) : phase === "connection" || (user && !hasSavedActiveTrinoConnection && (phase === "landing" || phase === "workspace" || phase === "thinking")) ? (
          <ConnectionSetup
            key="connection"
            initialConnection={connection}
            onTest={testConnection}
            onConnect={fullConnect}
            onDiscoverSources={discoverSources}
            onSaveSelectedSources={saveSelectedSources}
            onRefreshSelectedContext={refreshSelectedContext}
            onCancel={leaveUnsavedConnectionFlow}
            onComplete={async () => {
              setIsOnboardingCompleting(true);
              try {
                // Verify active connection is saved and correct
                const conn = await getActiveConnection();
                if (!conn || !conn.is_active) {
                  alert("No active database connection found. Please enter configuration details, run Test Connection, then Connect & Save.");
                  setIsOnboardingCompleting(false);
                  setPhase("connection");
                  return;
                }
                setConnection(conn);

                // Verify selected schema metadata tables have been fetched successfully
                const meta = await getMetadataSchema();
                if (!meta || !meta.tables || meta.tables.length === 0) {
                  alert("No selected AI schema context found. Please choose data sources for AI context.");
                  setIsOnboardingCompleting(false);
                  setPhase("connection");
                  return;
                }
                setSchemaMetadata(meta);

                // Clear the fresh auth flag so it doesn't get stuck on subsequent page refreshes!
                sessionStorage.removeItem("just_authorized_github");

                // Check for pending share query!
                const pendingShare = sessionStorage.getItem("pending_share_query");
                if (pendingShare) {
                  sessionStorage.removeItem("pending_share_query");
                  const sessionId = `session-${Date.now()}`
                  const newSession: ChatSession = {
                    id: sessionId,
                    title: generateSessionTitle(pendingShare),
                    messages: [],
                    createdAt: new Date().toISOString(),
                  }
                  setSessions((prev) => [newSession, ...prev])
                  setCurrentSessionId(sessionId)
                  setPendingQuery(pendingShare)
                  setPhase("thinking");
                } else {
                  // Onboarding connection verified and completed successfully
                  setCurrentSessionId(null);
                  setPhase("landing");
                }
              } catch (error) {
                console.error("Connection onboarding verification error:", error);
                alert("An error occurred while validating the connection and loading metadata schema. Please configure again.");
                setPhase("connection");
              } finally {
                setIsOnboardingCompleting(false);
              }
            }}
          />
        ) : hasSavedActiveTrinoConnection && (phase === "landing" || phase === "workspace") ? (
          <motion.div
            key="main-app"
            className="relative z-10 flex h-screen flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {/* Top bar â€” shifts right when sidebar opens */}
            <motion.header
              className="relative z-20 flex items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl transition-all duration-300"
              style={{ marginLeft: sidebarOpen ? "288px" : "0" }}
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.05 }}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  aria-label="Toggle sidebar"
                >
                  <PanelLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    setCurrentSessionId(null)
                    setPhase("landing")
                  }}
                  className="focus:outline-none cursor-pointer"
                  title="Return to landing page"
                >
                  <SkyQueryLogo size="sm" />
                </button>
                {/* Connection badge */}
                <div className="flex items-center gap-1.5 rounded-full bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground/70 cursor-pointer" onClick={() => setPhase("connection")}>
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${connection ? "bg-[#10b981]" : "bg-red-500"} opacity-75`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${connection ? "bg-[#10b981]" : "bg-red-500"}`} />
                  </span>
                  <span className="hidden sm:inline">{connection ? `${connection.host}:${connection.port}` : "No Connection"}</span>
                  <span className="text-muted-foreground/30 hidden sm:inline">&#183;</span>
                  <span className="hidden sm:inline">{connection ? activeCatalogSchema || "Scope not selected" : "Setup needed"}</span>
                </div>
              </div>
              <nav className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-lg border border-border/30 bg-secondary/20 p-1">
                <span className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </span>
                <Link href="/discover" className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">
                  <Search className="h-4 w-4" />
                  Discover
                </Link>
                <Link href="/product-tour" className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">
                  <Compass className="h-4 w-4" />
                  Product Tour
                </Link>
              </nav>
              <div className="flex items-center gap-3">
                {/* Via GitHub Copilot label */}
                <span className="hidden text-xs text-muted-foreground/50 sm:inline">
                  via GitHub Copilot
                </span>
                {/* Appearance toggle */}
                <ThemeToggle />
                {/* User avatar */}
                {user && (
                  <div className="relative">
                    <button
                      onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                      className="flex h-7 w-7 items-center justify-center rounded-full overflow-hidden bg-secondary/60 text-xs font-semibold text-muted-foreground hover:ring-2 hover:ring-primary/50 transition-all focus:outline-none cursor-pointer"
                    >
                      <img src={user.avatar_url || "https://github.com/ghost.png"} alt={user.username} className="h-full w-full object-cover" />
                    </button>
                    {avatarMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setAvatarMenuOpen(false)}
                        />
                        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                            Signed in as
                            <div className="text-foreground truncate font-normal mt-0.5">{user.username}</div>
                          </div>
                          <div className="h-px bg-border my-1" />
                          <button
                            onClick={() => {
                              setAvatarMenuOpen(false);
                              handleLogout();
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            Logout
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.header>

            {/* Sidebar */}
            <ChatSidebar
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              sessions={sessions}
              activeSessionId={currentSessionId || undefined}
              onSelectSession={handleSessionSelect}
              onDeleteSession={handleDeleteSession}
              onNewChat={handleNewChat}
              user={user}
              onLogout={handleLogout}
              connectionStatus={connection ? "connected" : "disconnected"}
              activeCatalogSchema={connection ? activeCatalogSchema : ""}
              schemaTables={schemaMetadata?.tables || []}
              onRefreshMetadata={handleRefreshMetadata}
              isRefreshingMetadata={isRefreshingMetadata}
              onDisconnectDB={handleDisconnectDB}
            />

            {/* Main content area */}
            <div
              className="flex flex-1 flex-col overflow-hidden transition-all duration-300"
              style={{ marginLeft: sidebarOpen ? "288px" : "0" }}
            >
              {phase === "landing" || !currentSession ? (
                <div className="flex-1 overflow-y-auto">
                  <LandingHero
                    schemaMetadata={schemaMetadata}
                    onSubmit={handleQuerySubmit}
                    onTypingChange={setIsTyping}
                    sessions={sessions}
                    onSelectSession={handleSessionSelect}
                  />
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto">
                    <ChatWorkspace
                      messages={currentSession?.messages || []}
                      onFollowUp={handleFollowUp}
                      schemaMetadata={schemaMetadata}
                      sessionId={currentSessionId || ""}
                      onRefreshQuery={handleRefreshQuery}
                    />
                  </div>
                  <ChatInputBar 
                    onSubmit={handleQuerySubmit} 
                    isLoading={currentSession?.messages.some(m => m.isLoading)} 
                    onCancel={stopActiveQuery}
                  />
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}




