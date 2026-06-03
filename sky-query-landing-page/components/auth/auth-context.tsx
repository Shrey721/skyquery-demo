"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  pendingAction: "chat" | null;
  setPendingAction: (action: "chat" | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock user for demo purposes - in production this would come from GitHub OAuth
const MOCK_USER: User = {
  id: "1",
  name: "Alex Chen",
  email: "alex@example.com",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alex",
  username: "alexchen",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<"chat" | null>(null);

  const signIn = useCallback(async () => {
    setIsLoading(true);
    
    // Simulate GitHub OAuth delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // In production, this would redirect to GitHub OAuth
    // For demo, we just set the mock user
    setUser(MOCK_USER);
    setIsLoading(false);
    setShowAuthModal(false);
    
    // Store in localStorage to persist across page refreshes
    localStorage.setItem("skyquery_user", JSON.stringify(MOCK_USER));
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    localStorage.removeItem("skyquery_user");
  }, []);

  // Check for existing session on mount
  useState(() => {
    if (typeof window !== "undefined") {
      const storedUser = localStorage.getItem("skyquery_user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem("skyquery_user");
        }
      }
    }
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signOut,
        showAuthModal,
        setShowAuthModal,
        pendingAction,
        setPendingAction,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
