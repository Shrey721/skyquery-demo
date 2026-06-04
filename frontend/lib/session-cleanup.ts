export const ACTIVE_CONNECTION_SESSION_KEY = "skyquery_active_connection_session_id"

const CONNECTION_STORAGE_KEYWORDS = [
  "trino",
  "starburst",
  "connection",
  "metadata",
  "schema",
  "catalog",
  "table",
  "tables",
  "datasource",
  "data_source",
  "selected_source",
  "selected_sources",
  "enterprise",
]

const PRESERVED_STORAGE_KEYS = new Set(["skyquery_session_id", "theme"])

function clearMatchingStorageKeys(storage: Storage) {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key) keys.push(key)
  }

  keys.forEach((key) => {
    const normalized = key.toLowerCase()
    if (PRESERVED_STORAGE_KEYS.has(key) || normalized.includes("theme")) return
    if (key === ACTIVE_CONNECTION_SESSION_KEY || CONNECTION_STORAGE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      storage.removeItem(key)
    }
  })
}

export function getStoredAuthSessionId() {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem("skyquery_session_id")
}

export function getActiveConnectionSessionId() {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACTIVE_CONNECTION_SESSION_KEY)
}

export function markActiveConnectionForSession(sessionId = getStoredAuthSessionId()) {
  if (typeof window === "undefined" || !sessionId) return null
  window.localStorage.setItem(ACTIVE_CONNECTION_SESSION_KEY, sessionId)
  return sessionId
}

export function clearConnectionSessionStorage() {
  if (typeof window === "undefined") return
  clearMatchingStorageKeys(window.localStorage)
  clearMatchingStorageKeys(window.sessionStorage)
  window.localStorage.removeItem(ACTIVE_CONNECTION_SESSION_KEY)
  window.sessionStorage.removeItem("just_authorized_github")
  window.sessionStorage.removeItem("skyquery_auth_message")
}
