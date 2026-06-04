import { MockResponse } from "./mock-data";

import { frontendConfig } from "./config";

const API_BASE_URL = frontendConfig.apiV1BaseUrl;
const QUERY_BASE_URL = frontendConfig.apiBaseUrl;

async function fetchWithHandler(url: string, options: RequestInit = {}) {
  let sessionId = null;
  if (typeof window !== "undefined") {
    sessionId = window.localStorage.getItem("skyquery_session_id");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (sessionId) {
    headers["Authorization"] = `Bearer ${sessionId}`;
    headers["X-Session-ID"] = sessionId;
  }

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail;
    if (detail && typeof detail === "object") {
      const error: any = new Error(detail.message || `HTTP Error ${response.status}`);
      error.steps = detail.steps || [];
      error.schemas = detail.schemas || [];
      throw error;
    }
    const errorMsg = detail || `HTTP Error ${response.status}`;
    throw new Error(errorMsg);
  }
  return data;
}

export async function executeQuery(
  question: string,
  sessionId?: string,
  csvContext?: { name: string; headers: string[]; rows: any[] } | null,
  queryContext?: any,
  signal?: AbortSignal,
  requestId?: string
): Promise<MockResponse> {
  const body: any = { question, session_id: sessionId, request_id: requestId };
  if (queryContext) {
    body.query_context = queryContext;
  }
  if (csvContext) {
    body.csvContext = {
      name: csvContext.name,
      headers: csvContext.headers,
      rowCount: csvContext.rows.length,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const activeSessionId = sessionId || (typeof window !== "undefined" ? window.localStorage.getItem("skyquery_session_id") : null);
  if (activeSessionId) {
    headers["Authorization"] = `Bearer ${activeSessionId}`;
    headers["X-Session-ID"] = activeSessionId;
  }

  const response = await fetch(`${QUERY_BASE_URL}/query`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === "string" ? detail : detail?.message;
    const error: any = new Error(message || detail?.user_message || `API error: ${response.status} ${response.statusText}`);
    if (detail && typeof detail === "object") {
      Object.assign(error, detail);
    }
    throw error;
  }

  return adaptBackendResponse(data);
}

// --- Auth API ---
export async function getCurrentUser() {
  try {
    return await fetchWithHandler(`${API_BASE_URL}/auth/me`);
  } catch (e: any) {
    return null;
  }
}

export async function logoutUser() {
  return fetchWithHandler(`${API_BASE_URL}/auth/logout`, { method: "POST" });
}

export function getGithubLoginUrl(returnTo?: string) {
  const url = new URL(`${API_BASE_URL}/auth/github/login`);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  return url.toString();
}

// --- Account-scoped chat history API ---
export async function getChatHistory() {
  return fetchWithHandler(`${API_BASE_URL}/history/chat-history`);
}

export async function saveChatHistory(payload: { sessions: any[]; currentSessionId: string | null }) {
  return fetchWithHandler(`${API_BASE_URL}/history/chat-history`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// --- Connection API ---
export async function getActiveConnection() {
  try {
    return await fetchWithHandler(`${API_BASE_URL}/connections/active-connection`);
  } catch (e: any) {
    return null;
  }
}

export async function testConnection(params: any) {
  return fetchWithHandler(`${API_BASE_URL}/connections/test-connection`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function saveConnection(params: any) {
  return fetchWithHandler(`${API_BASE_URL}/connections/save-connection`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function fullConnect(params: any) {
  return fetchWithHandler(`${API_BASE_URL}/connections/connect`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function disconnectConnection() {
  return fetchWithHandler(`${API_BASE_URL}/connections/disconnect`, {
    method: "POST",
  });
}

// --- Metadata API ---
export async function getMetadataSchema() {
  try {
    return await fetchWithHandler(`${API_BASE_URL}/metadata/schema`);
  } catch (e: any) {
    return null;
  }
}

export async function discoverMetadata() {
  return refreshSelectedContext();
}

export async function discoverSources() {
  return fetchWithHandler(`${API_BASE_URL}/metadata/discover-sources`);
}

export async function saveSelectedSources(payload: { selected_sources: Array<{ catalog: string; schema: string; tables: string[] }> }) {
  return fetchWithHandler(`${API_BASE_URL}/metadata/selected-sources`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSelectedSources() {
  try {
    return await fetchWithHandler(`${API_BASE_URL}/metadata/selected-sources`);
  } catch (e: any) {
    return null;
  }
}

export async function refreshSelectedContext() {
  return fetchWithHandler(`${API_BASE_URL}/metadata/refresh-selected-context`, {
    method: "POST",
  });
}

function adaptBackendResponse(backendData: any): MockResponse {
  if (backendData?.error_type === "connector_connection_failed") {
    const generatedSql = backendData?.generated_sql || backendData?.sql || "";
    return {
      summary: backendData.user_message || "The SQL was generated correctly, but SkyQuery could not reach the connected data source.",
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
      rows: [],
      executionError: backendData.user_message,
      errorType: backendData.error_type,
      source: backendData.source || backendData.catalog,
      suggestedFixes: [
        "Check Trino container",
        "Check Postgres container",
        "Verify connector credentials",
        "Retry query",
      ],
      result_intent: backendData?.result_intent || null,
      rendering: backendData?.rendering || null,
    };
  }

  const rows: any[] = backendData?.execution?.rows || backendData?.execution?.preview || [];
  const tableHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
  const tableRows = rows.map((row) => ({
    cells: tableHeaders.map((header) => String(row[header])),
  }));
  const rendering = backendData?.rendering || backendData?.execution?.rendering || null;
  const resultIntent = backendData?.result_intent || backendData?.metadata?.result_intent || null;

  let summaryText = "Query execution successful.";
  if (typeof backendData?.summary === "string") {
    summaryText = backendData.summary;
  } else if (backendData?.summary?.text) {
    summaryText = backendData.summary.text;
  } else if (backendData?.summary?.response) {
    summaryText = backendData.summary.response;
  }

  return {
    summary: summaryText,
    kpis: [
      { label: "Status", value: "Success", sub: "Backend execution" },
      { label: "Rows", value: String(rows.length), sub: "Returned" },
    ],
    chartTitle: "Result Data",
    chartBars: [],
    tableHeaders,
    tableRows,
    sql: backendData?.sql || "-- No SQL returned",
    followUps: rendering?.followup_chips || rendering?.followups || ["How can I refine this?", "Export as CSV"],
    rowCount: rows.length,
    resultType: rendering?.chart_default_active ? "chart" : "rows",
    rows,
    result_intent: resultIntent,
    rendering,
    requestId: backendData?.requestId,
  };
}
