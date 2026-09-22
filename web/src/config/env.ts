function requireEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and set it.`);
  }
  return value.trim();
}

export const env = {
  /** Backend base URL without a trailing slash. */
  apiBaseUrl: requireEnv('VITE_API_BASE_URL').replace(/\/+$/, ''),
} as const;
