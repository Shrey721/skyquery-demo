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
import { getCurrentUser } from "@/lib/api";

export default function ProductTourPage() {
  const [user, setUser] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) {
      localStorage.setItem("skyquery_session_id", sessionId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    getCurrentUser().then(setUser);
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
    <main className="relative h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground">
      <Navigation user={user} onUserChange={setUser} onProtectedNavigate={protectedNavigate} />
      <HeroSection onStartChat={startChat} />
      <GuidedWalkthrough />
      <FeaturesSection />
      <InteractiveDemo />
      <GlobalAviationSection />
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
