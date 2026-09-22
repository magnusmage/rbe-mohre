/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional base URL of the RBE backend API; empty means same-origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
