import { motion } from "framer-motion"
import { Github } from "lucide-react"

export function AuthGate({ onLogin }: { onLogin: () => void }) {
  return (
    <motion.div 
      className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="rounded-2xl border border-border/40 bg-card/40 p-10 text-center backdrop-blur-xl"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h2 className="mb-2 text-3xl font-light tracking-tight text-foreground">
          Welcome to <span className="font-semibold text-primary">SkyQuery</span>
        </h2>
        <p className="mb-8 text-sm text-muted-foreground">
          Connect your GitHub account to access enterprise analytics.
        </p>
        
        <button 
          onClick={onLogin}
          className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-foreground px-8 py-3.5 text-sm font-medium text-background transition-transform hover:scale-105"
        >
          <Github className="h-5 w-5" />
          Continue with GitHub
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary to-accent opacity-0 transition-opacity group-hover:opacity-20" />
        </button>

        <a 
          href="https://github.com/logout" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-6 block text-xs text-muted-foreground underline hover:text-foreground transition-colors"
        >
          Use a different GitHub account
        </a>
      </motion.div>
    </motion.div>
  )
}
