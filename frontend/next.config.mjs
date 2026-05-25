import path from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

const { loadEnvConfig } = nextEnv

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
loadEnvConfig(path.resolve(frontendDir, ".."))
loadEnvConfig(frontendDir)

const apiBaseUrl = process.env.VITE_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL
const appEnv = process.env.VITE_APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || "development"

if (!apiBaseUrl) {
  throw new Error("Missing frontend API configuration. Set VITE_API_BASE_URL in .env.")
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    VITE_API_BASE_URL: apiBaseUrl,
    VITE_APP_ENV: appEnv,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ]
  },
}

export default nextConfig
