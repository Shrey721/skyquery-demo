function requireApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL || ""
  if (!value.trim()) {
    throw new Error("Missing frontend API configuration. Set NEXT_PUBLIC_API_BASE_URL in .env.")
  }
  return value.replace(/\/+$/, "")
}

const apiBaseUrl = requireApiBaseUrl()

export const frontendConfig = {
  appEnv: process.env.VITE_APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || "development",
  apiBaseUrl,
  apiV1BaseUrl: `${apiBaseUrl}/api/v1`,
} as const
