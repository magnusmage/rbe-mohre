/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the RBE backend API, e.g. https://api.example.com*/
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
