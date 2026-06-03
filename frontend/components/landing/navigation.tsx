"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Compass, Github, LogOut, Menu, MessageSquare, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkyQueryLogo } from "@/components/skyquery-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser, logoutUser } from "@/lib/api";

const navTabs = [
  { name: "Chat", href: "/", icon: MessageSquare },
  { name: "Discover", href: "/discover", icon: Search },
  { name: "Product Tour", href: "/product-tour", icon: Compass },
];

interface NavigationProps {
  user?: any;
  onUserChange?: (user: any) => void;
  onProtectedNavigate?: (href: string) => void;
}

export function Navigation({ user: userProp, onUserChange, onProtectedNavigate }: NavigationProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [localUser, setLocalUser] = useState<any>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const user = userProp !== undefined ? userProp : localUser;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (userProp !== undefined) return;
    getCurrentUser().then(setLocalUser);
  }, [userProp]);

  const beginGithubLogin = () => {
    sessionStorage.setItem("skyquery_connection_back_to", "/product-tour");
    window.location.href = "/";
  };

  const startChat = () => {
    if (onProtectedNavigate) {
      onProtectedNavigate("/");
      return;
    }
    window.location.href = "/";
  };

  const handleLogout = async () => {
    await logoutUser();
    localStorage.removeItem("skyquery_session_id");
    setLocalUser(null);
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
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "glass-strong py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo - Increased size */}
          <motion.a
            href="/product-tour"
            className="flex items-center gap-2 group"
            whileHover={{ scale: 1.02 }}
          >
            <SkyQueryLogo size="md" />
          </motion.a>

          <div className="hidden md:flex items-center">
            <div className="flex items-center rounded-full bg-[#1a1f25] p-1">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = tab.href === "/product-tour";
                return (
                  <button
                    key={tab.name}
                    onClick={() => handleNavClick(tab.href)}
                    className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-[#0d1117] text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 rounded-full border border-[oklch(0.7_0.15_195)]"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <Icon className={`h-4 w-4 relative z-10 ${isActive ? "text-[oklch(0.7_0.15_195)]" : ""}`} />
                    <span className="relative z-10">{tab.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setAvatarMenuOpen((open) => !open)}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-secondary/60 text-xs font-semibold text-muted-foreground transition-all hover:ring-2 hover:ring-primary/50"
                  aria-label="Open user menu"
                >
                  <img src={user.avatar_url || "https://github.com/ghost.png"} alt={user.username || "GitHub user"} className="h-full w-full object-cover" />
                </button>
                {avatarMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAvatarMenuOpen(false)} />
                    <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
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
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={beginGithubLogin}
                  className="bg-foreground px-5 text-background transition hover:bg-foreground/90"
                >
                  <Github className="mr-2 h-4 w-4" />
                  Login with GitHub
                </Button>
              </>
            )}
            <ThemeToggle />
            <Button
              onClick={startChat}
              className="bg-gradient-to-r from-[oklch(0.7_0.15_195)] to-[oklch(0.6_0.2_300)] text-white border-0 glow-cyan hover:opacity-90 transition-opacity"
            >
              Start Chat
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-lg glass md:hidden"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-4 rounded-xl glass-strong p-4 md:hidden"
          >
            <div className="flex flex-col gap-2">
              {/* Mobile Tab Selector - No default selected */}
              <div className="flex items-center rounded-full bg-[#1a1f25] p-1 mb-2">
                {navTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = tab.href === "/product-tour";
                  return (
                    <button
                      key={tab.name}
                      onClick={() => handleNavClick(tab.href)}
                      className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "bg-[#0d1117] text-white border border-[oklch(0.7_0.15_195)]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? "text-[oklch(0.7_0.15_195)]" : ""}`} />
                      <span>{tab.name}</span>
                    </button>
                  );
                })}
              </div>
              {!user && (
                <div className="grid gap-2">
                  <Button
                    onClick={beginGithubLogin}
                    className="bg-foreground text-background transition hover:bg-foreground/90"
                  >
                    <Github className="mr-2 h-4 w-4" />
                    Login with GitHub
                  </Button>
                </div>
              )}
              {user && (
                <Button variant="outline" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              )}
              <Button
                onClick={startChat}
                className="mt-2 w-full bg-gradient-to-r from-[oklch(0.7_0.15_195)] to-[oklch(0.6_0.2_300)] text-white border-0"
              >
                Start Chat
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}
