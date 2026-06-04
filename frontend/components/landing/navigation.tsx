"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Compass, Github, LogOut, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkyQueryLogo } from "@/components/skyquery-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutUser } from "@/lib/api";
import {
  PRODUCT_TOUR_OAUTH_ATTEMPT_KEY,
  PRODUCT_TOUR_OAUTH_RESET_EVENT,
  clearAuthSession,
  getCachedAuthUser,
  refreshAuthSession,
  subscribeToAuthState,
} from "@/lib/auth-session";
import { clearConnectionSessionStorage } from "@/lib/session-cleanup";

const navTabs = [
  { name: "Chat", href: "/", icon: MessageSquare },
  { name: "Discover", href: "/discover", icon: Search },
  { name: "Product Tour", href: "/product-tour", icon: Compass },
];

const PRODUCT_TOUR_RESTORE_CLASS = "skyquery-product-tour-restore";
const LEGACY_PRODUCT_TOUR_RESTORE_CLASS = "skyquery-oauth-back-safe";

function NavControlsPlaceholder() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <div className="h-7 w-7 rounded-md border border-border/20 bg-secondary/25" />
      <div className="h-7 w-7 rounded-full border border-border/20 bg-secondary/25" />
    </div>
  );
}

interface NavigationProps {
  user?: any;
  authReady?: boolean;
  onUserChange?: (user: any) => void;
  onProtectedNavigate?: (href: string) => void;
}

export function Navigation({ user: userProp, authReady = true, onUserChange, onProtectedNavigate }: NavigationProps) {
  const [mounted, setMounted] = useState(false);
  const [localUser, setLocalUser] = useState<any>(null);
  const [localAuthReady, setLocalAuthReady] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [isLoginRedirecting, setIsLoginRedirecting] = useState(false);
  const user = userProp !== undefined ? userProp : localUser;
  const effectiveAuthReady = userProp !== undefined ? authReady : localAuthReady;
  const canRenderAuthUi = mounted && effectiveAuthReady;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (userProp !== undefined) return;
    setLocalAuthReady(false);
    const cachedUser = getCachedAuthUser();
    if (cachedUser) setLocalUser(cachedUser);

    let cancelled = false;
    refreshAuthSession().then((nextUser) => {
      if (!cancelled) {
        setLocalUser(nextUser);
        setLocalAuthReady(true);
      }
    });

    const unsubscribeAuthState = subscribeToAuthState((nextUser) => {
      if (!cancelled) {
        setLocalUser(nextUser);
        setLocalAuthReady(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeAuthState();
    };
  }, [userProp]);

  useEffect(() => {
    const resetRedirectState = () => {
      setIsLoginRedirecting(false);
      setAvatarMenuOpen(false);
      document.documentElement.classList.remove(LEGACY_PRODUCT_TOUR_RESTORE_CLASS);
      document.documentElement.classList.add(PRODUCT_TOUR_RESTORE_CLASS);
      window.setTimeout(() => {
        document.documentElement.classList.remove(PRODUCT_TOUR_RESTORE_CLASS);
      }, 1200);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || sessionStorage.getItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY) === "true") {
        resetRedirectState();
      }
    };

    const handlePageHide = () => {
      if (sessionStorage.getItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY) === "true") {
        setIsLoginRedirecting(false);
        setAvatarMenuOpen(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resetRedirectState();
      }
    };

    const handleOAuthReset = () => {
      resetRedirectState();
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener(PRODUCT_TOUR_OAUTH_RESET_EVENT, handleOAuthReset);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener(PRODUCT_TOUR_OAUTH_RESET_EVENT, handleOAuthReset);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const openLoginScreen = () => {
    document.documentElement.classList.remove(LEGACY_PRODUCT_TOUR_RESTORE_CLASS, PRODUCT_TOUR_RESTORE_CLASS);
    setIsLoginRedirecting(false);
    sessionStorage.removeItem(PRODUCT_TOUR_OAUTH_ATTEMPT_KEY);
    sessionStorage.removeItem("skyquery_auth_return_to");
    sessionStorage.removeItem("skyquery_product_tour_oauth_back_reload");
    sessionStorage.setItem("skyquery_connection_back_to", "/product-tour");
    window.location.assign("/");
  };

  const handleLogout = async () => {
    await logoutUser();
    clearConnectionSessionStorage();
    clearAuthSession();
    setLocalUser(null);
    setLocalAuthReady(true);
    onUserChange?.(null);
    setAvatarMenuOpen(false);
  };

  const handleNavClick = (href: string) => {
    if (href === "/product-tour") return;
    if (onProtectedNavigate) {
      onProtectedNavigate(href);
      return;
    }
    window.location.href = href;
  };

  return (
    <header className="sticky top-0 z-[1000] flex items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl transition-all duration-300">
      <Link href="/" aria-label="SkyQuery home" className="rounded-lg transition-opacity hover:opacity-80">
        <SkyQueryLogo size="sm" />
      </Link>
      <nav className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-lg border border-border/30 bg-secondary/20 p-1">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.href === "/product-tour";
          if (isActive) {
            return (
              <span key={tab.name} className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">
                <Icon className="h-4 w-4" /> {tab.name}
              </span>
            );
          }
          return (
            <button
              key={tab.name}
              type="button"
              onClick={() => handleNavClick(tab.href)}
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon className="h-4 w-4" /> {tab.name}
            </button>
          );
        })}
      </nav>
      <div className="flex w-[190px] shrink-0 items-center justify-end gap-3">
        {!canRenderAuthUi ? (
          <NavControlsPlaceholder />
        ) : user ? (
          <div className="nav-controls-ready flex items-center gap-3">
            <ThemeToggle />
            <div className="relative">
              <button
                onClick={() => setAvatarMenuOpen((open) => !open)}
                className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-secondary/60 text-xs font-semibold text-muted-foreground transition-all hover:ring-2 hover:ring-primary/50"
                aria-label="Open user menu"
              >
                <img src={user.avatar_url || "https://github.com/ghost.png"} alt={user.username || "GitHub user"} className="h-full w-full object-cover" />
              </button>
              {avatarMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[1000]" onClick={() => setAvatarMenuOpen(false)} />
                  <div className="absolute right-0 z-[1001] mt-2 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
                    <div className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                      Signed in as
                      <div className="mt-0.5 truncate font-normal text-foreground">{user.username}</div>
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="nav-controls-ready flex items-center gap-3">
            <ThemeToggle />
              <Button
              size="sm"
              onClick={openLoginScreen}
              disabled={isLoginRedirecting}
              className="bg-foreground px-5 text-background transition hover:bg-foreground/90"
            >
              <Github className="mr-2 h-4 w-4" />
              Login with GitHub
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
