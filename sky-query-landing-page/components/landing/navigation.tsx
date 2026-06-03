"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

const navTabs = [
  { name: "Chat", href: "#chat", icon: MessageSquare },
  { name: "Discover", href: "#discover", icon: Search },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
            href="#"
            className="flex items-center gap-2 group"
            whileHover={{ scale: 1.02 }}
          >
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-X7ohEq5zMv1hCY6v7Br2Mp0TAU6yhF.png"
              alt="SkyQuery Logo"
              width={160}
              height={44}
              className="h-11 w-auto"
              priority
            />
          </motion.a>

          {/* Center Navigation Tabs - No default selected */}
          <div className="hidden md:flex items-center">
            <div className="flex items-center rounded-full bg-[#1a1f25] p-1">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.name;
                return (
                  <button
                    key={tab.name}
                    onClick={() => setActiveTab(tab.name)}
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

          {/* CTA Button */}
          <div className="hidden items-center gap-4 md:flex">
            <Button
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
                  const isActive = activeTab === tab.name;
                  return (
                    <button
                      key={tab.name}
                      onClick={() => setActiveTab(tab.name)}
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
              <Button
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
