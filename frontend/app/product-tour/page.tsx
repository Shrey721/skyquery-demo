"use client";

import { useCallback, useEffect, useState } from "react";
import { Navigation } from "@/components/landing/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { GuidedWalkthrough } from "@/components/landing/guided-walkthrough";
import { FeaturesSection } from "@/components/landing/features-section";
import { InteractiveDemo } from "@/components/landing/interactive-demo";
import { GlobalAviationSection } from "@/components/landing/global-aviation-section";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import {
  PRODUCT_TOUR_OAUTH_ATTEMPT_KEY,
  PRODUCT_TOUR_OAUTH_BACK_RELOAD_KEY,
  PRODUCT_TOUR_OAUTH_RESET_EVENT,
  getCachedAuthUser,
  getStoredSessionId,
  refreshAuthSession,
  subscribeToAuthState,
} from "@/lib/auth-session";
import { clearConnectionSessionStorage } from "@/lib/session-cleanup";

const PRODUCT_TOUR_RESTORE_CLASS = "skyquery-product-tour-restore";
const LEGACY_PRODUCT_TOUR_RESTORE_CLASS = "skyquery-oauth-back-safe";

export default function ProductTourPage() {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: number | null = null;
    let safePaintTimer: number | null = null;

    const resetOauthPendingState = () => {
      setAuthReady(true);
      document.documentElement.classList.remove(LEGACY_PRODUCT_TOUR_RESTORE_CLASS);
      document.documentElement.classList.add(PRODUCT_TOUR_RESTORE_CLASS);
      window.dispatchEvent(new Event(PRODUCT_TOUR_OAUTH_RESET_EVENT));
      if (safePaintTimer) clearTimeout(safePaintTimer);
      safePaintTimer = window.setTimeout(() => {
        document.documentElement.classList.remove(PRODUCT_TOUR_RESTORE_CLASS);
      }, 1200);
    };

    const clearOauthAttemptState = (options: { showToast?: boolean } = {}) => {
      sessionStorage.removeItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY);
      sessionStorage.removeItem("skyquery_auth_return_to");
      resetOauthPendingState();
      const cachedUser = getCachedAuthUser();
      setUser(getStoredSessionId() ? cachedUser : null);
      setAuthReady(true);
      if (options.showToast) showCancelledToast();
    };

    const showCancelledToast = () => {
      setToastMessage("GitHub sign-in was cancelled.");
      window.setTimeout(() => setToastMessage(""), 2600);
    };

    const reloadAfterOAuthBack = () => {
      sessionStorage.removeItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY);
      sessionStorage.removeItem("skyquery_auth_return_to");
      sessionStorage.setItem(PRODUCT_TOUR_OAUTH_BACK_RELOAD_KEY, "true");
      window.dispatchEvent(new Event(PRODUCT_TOUR_OAUTH_RESET_EVENT));
      window.location.reload();
    };

    const refreshAuthState = async (options: { fromPageRestore?: boolean } = {}) => {
      const cachedUser = getCachedAuthUser();
      if (cachedUser) {
        setUser(cachedUser);
      } else if (getStoredSessionId()) {
        setAuthReady(false);
      }

      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled) setAuthReady(true);
      }, 3500);

      try {
        const currentUser = await refreshAuthSession();
        if (cancelled) return;
        setUser(currentUser);

        if (!options.fromPageRestore) {
          document.documentElement.classList.remove(LEGACY_PRODUCT_TOUR_RESTORE_CLASS, PRODUCT_TOUR_RESTORE_CLASS);
        }
      } finally {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (!cancelled) setAuthReady(true);
      }
    };

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const authError = params.get("auth_error");
    const shouldShowBackCancelledToast = sessionStorage.getItem(PRODUCT_TOUR_OAUTH_BACK_RELOAD_KEY) === "true";
    if (shouldShowBackCancelledToast) {
      sessionStorage.removeItem(PRODUCT_TOUR_OAUTH_BACK_RELOAD_KEY);
      requestAnimationFrame(() => {
        const page = document.querySelector("[data-product-tour-page]");
        page?.scrollTo({ top: 0, left: 0 });
      });
      showCancelledToast();
    }
    if (sessionId) {
      clearConnectionSessionStorage();
      sessionStorage.removeItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY);
      sessionStorage.removeItem(PRODUCT_TOUR_OAUTH_BACK_RELOAD_KEY);
      document.documentElement.classList.remove(LEGACY_PRODUCT_TOUR_RESTORE_CLASS, PRODUCT_TOUR_RESTORE_CLASS);
      localStorage.setItem("skyquery_session_id", sessionId);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authError === "cancelled") {
      clearOauthAttemptState({ showToast: true });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (sessionStorage.getItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY) === "true") {
      clearOauthAttemptState();
    }
    refreshAuthState();

    const handlePageShow = (event: PageTransitionEvent) => {
      const hadOAuthAttempt = sessionStorage.getItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY) === "true";
      if (event.persisted && hadOAuthAttempt && !getStoredSessionId()) {
        reloadAfterOAuthBack();
        return;
      }
      if (event.persisted || hadOAuthAttempt) {
        clearOauthAttemptState({ showToast: hadOAuthAttempt && !getStoredSessionId() });
      }
      refreshAuthState({ fromPageRestore: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (sessionStorage.getItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY) === "true") {
        if (!getStoredSessionId()) {
          reloadAfterOAuthBack();
          return;
        }
        clearOauthAttemptState({ showToast: !getStoredSessionId() });
      }
      refreshAuthState({ fromPageRestore: true });
    };

    const unsubscribeAuthState = subscribeToAuthState((nextUser) => {
      if (cancelled) return;
      setUser(nextUser);
      setAuthReady(true);
    });

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (safePaintTimer) clearTimeout(safePaintTimer);
      document.documentElement.classList.remove(PRODUCT_TOUR_RESTORE_CLASS);
      unsubscribeAuthState();
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const showAuthToast = useCallback(() => {
    setToastMessage("You need to connect GitHub first.");
    window.setTimeout(() => setToastMessage(""), 2600);
  }, []);

  const protectedNavigate = useCallback((href: string) => {
    if (!user) {
      showAuthToast();
      return;
    }
    if (href === "/") {
      sessionStorage.setItem("skyquery_connection_back_to", "/product-tour");
    }
    window.location.href = href;
  }, [showAuthToast, user]);

  const startChat = () => protectedNavigate("/");

  return (
    <main data-product-tour-page className="relative h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground">
      <Navigation user={user} authReady={authReady} onUserChange={setUser} onProtectedNavigate={protectedNavigate} />
      <HeroSection onStartChat={startChat} />
      <GuidedWalkthrough />
      <FeaturesSection />
      <InteractiveDemo />
      <GlobalAviationSection onOpenDiscover={() => protectedNavigate("/discover")} />
      <FinalCTA onStartChat={startChat} />
      <Footer />
      {toastMessage && (
        <div className="fixed right-4 top-24 z-[70] rounded-lg border border-primary/30 bg-popover/95 px-4 py-3 text-sm text-foreground shadow-xl backdrop-blur">
          {toastMessage}
        </div>
      )}
    </main>
  );
}
