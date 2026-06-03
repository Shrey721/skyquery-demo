"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Github, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-context";
import { useRouter } from "next/navigation";

export function AuthModal() {
  const { 
    showAuthModal, 
    setShowAuthModal, 
    signIn, 
    isLoading, 
    isAuthenticated,
    pendingAction,
    setPendingAction
  } = useAuth();
  const router = useRouter();

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        setShowAuthModal(false);
        setPendingAction(null);
      }
    };
    
    if (showAuthModal) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [showAuthModal, isLoading, setShowAuthModal, setPendingAction]);

  // Handle successful authentication with pending action
  useEffect(() => {
    if (isAuthenticated && pendingAction === "chat") {
      // Navigate to chat after successful auth
      router.push("/chat");
      setPendingAction(null);
    }
  }, [isAuthenticated, pendingAction, router, setPendingAction]);

  const handleSignIn = useCallback(async () => {
    await signIn();
  }, [signIn]);

  const handleClose = useCallback(() => {
    if (!isLoading) {
      setShowAuthModal(false);
      setPendingAction(null);
    }
  }, [isLoading, setShowAuthModal, setPendingAction]);

  return (
    <AnimatePresence>
      {showAuthModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 z-[101] w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4"
          >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a1014]/95 backdrop-blur-xl shadow-2xl">
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
              
              {/* Close button */}
              <button
                onClick={handleClose}
                disabled={isLoading}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/60 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative px-8 py-10">
                {/* Logo/Icon */}
                <div className="mb-6 flex justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                    <svg 
                      viewBox="0 0 24 24" 
                      className="h-7 w-7 text-primary"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                </div>

                {/* Title */}
                <div className="mb-8 text-center">
                  <h2 className="text-xl font-semibold text-white">
                    Welcome to SkyQuery
                  </h2>
                  <p className="mt-2 text-sm text-white/50 leading-relaxed">
                    Sign in to access aviation intelligence and enterprise analytics.
                  </p>
                </div>

                {/* Sign in button */}
                <Button
                  onClick={handleSignIn}
                  disabled={isLoading}
                  className="relative w-full h-12 bg-white text-[#0a0a0a] hover:bg-white/90 font-medium text-sm transition-all"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Github className="mr-2 h-4 w-4" />
                      Continue with GitHub
                    </>
                  )}
                </Button>

                {/* Security note */}
                <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-white/30">
                  <Shield className="h-3 w-3" />
                  <span>Secure authentication powered by GitHub</span>
                </div>
              </div>

              {/* Bottom accent */}
              <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
