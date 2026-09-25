export const env = {
  /**
   * Backend base URL without a trailing slash. Empty means same-origin:
   * the control plane serves this build itself, and the dev server
   * proxies API paths to it (vite.config.ts), so no value is needed.
   * Set VITE_API_BASE_URL only to point the UI at a different backend.
   */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
  /**
   * Bearer token for specialist endpoints (`/review/*`, `/audit/*`). Read
   * from `VITE_REVIEWER_TOKEN` at build time so the value never ships in
   * the source. Empty means "not configured": specialist screens will show
   * a configuration error rather than call the API without a token.
   *
   * This is a build-sprint stand-in for the Phase 4 SSO / JWT flow.
   */
  reviewerToken: (import.meta.env.VITE_REVIEWER_TOKEN ?? '').trim(),
} as const;
