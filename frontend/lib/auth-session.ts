import { getCurrentUser } from "./api";

export const AUTH_SESSION_ID_KEY = "skyquery_session_id";
export const AUTH_USER_CACHE_KEY = "skyquery_auth_user";
export const AUTH_STATE_EVENT = "skyquery:auth-state";
export const PRODUCT_TOUR_OAUTH_RESET_EVENT = "skyquery:product-tour-oauth-reset";
export const PRODUCT_TOUR_OAUTH_ATTEMPT_KEY = "skyquery_product_tour_oauth_attempt";
export const PRODUCT_TOUR_OAUTH_BACK_RELOAD_KEY = "skyquery_product_tour_oauth_back_reload";

type AuthStateListener = (user: any) => void;

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

export function getStoredSessionId() {
  if (!canUseBrowserStorage()) return null;
  return window.localStorage.getItem(AUTH_SESSION_ID_KEY);
}

export function getCachedAuthUser() {
  if (!canUseBrowserStorage()) return null;

  try {
    const sessionId = getStoredSessionId();
    const cached = window.localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!sessionId || !cached) return null;

    const parsed = JSON.parse(cached);
    if (parsed?.sessionId !== sessionId) return null;
    return parsed.user || null;
  } catch {
    return null;
  }
}

export function cacheAuthUser(user: any) {
  if (!canUseBrowserStorage()) return;

  const sessionId = getStoredSessionId();
  if (!user || !sessionId) {
    window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify({ sessionId, user }));
}

export function emitAuthState(user: any) {
  if (!canUseBrowserStorage()) return;
  window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT, { detail: { user } }));
}

export function subscribeToAuthState(listener: AuthStateListener) {
  if (!canUseBrowserStorage()) return () => {};

  const handleAuthState = (event: Event) => {
    listener((event as CustomEvent<{ user: any }>).detail?.user ?? null);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_SESSION_ID_KEY || event.key === AUTH_USER_CACHE_KEY) {
      listener(getCachedAuthUser());
    }
  };

  window.addEventListener(AUTH_STATE_EVENT, handleAuthState);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(AUTH_STATE_EVENT, handleAuthState);
    window.removeEventListener("storage", handleStorage);
  };
}

export async function refreshAuthSession() {
  const user = await getCurrentUser();
  cacheAuthUser(user);
  emitAuthState(user);
  return user;
}

export function clearAuthSession() {
  if (!canUseBrowserStorage()) return;
  window.localStorage.removeItem(AUTH_SESSION_ID_KEY);
  window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
  emitAuthState(null);
}
