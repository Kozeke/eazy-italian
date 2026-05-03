// Vite environment variables available in frontend runtime.
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /** Frontend origin for share links, e.g. http://localhost:3000 (not the API port). */
  readonly VITE_APP_ORIGIN?: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

