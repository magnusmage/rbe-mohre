export const env = {
  /**
   * Backend base URL without a trailing slash. Empty means same-origin:
   * the control plane serves this build itself, and the dev server
   * proxies API paths to it (vite.config.ts), so no value is needed.
   * Set VITE_API_BASE_URL only to point the UI at a different backend.
   */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
} as const;
