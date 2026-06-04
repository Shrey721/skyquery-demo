"use client";

import { MessageSquare, Search, Moon, User, Sparkles } from "lucide-react";
import Link from "next/link";

export function TopNavigation() {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Sky
            </span>
            <span className="text-foreground">Query</span>
          </span>
        </div>
      </div>

      {/* Center Navigation */}
      <nav className="flex items-center gap-1">
        <Link
          href="#"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Chat</span>
        </Link>
        <Link
          href="#"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-foreground transition-all"
        >
          <Search className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Discover</span>
        </Link>
      </nav>

      {/* Right Actions */}
      <div className="nav-controls-ready flex w-[190px] shrink-0 items-center justify-end gap-3">
        <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
          <Moon className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
      </div>
    </header>
  );
}
