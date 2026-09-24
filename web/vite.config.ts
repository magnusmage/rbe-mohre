import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Dev-server proxy: the UI calls same-origin paths, which the vite dev
// server forwards to the local control plane, mirroring production where
// the control plane serves the build itself.
const API_PATHS = ['/session', '/tools', '/webhooks', '/review', '/audit', '/health', '/docs', '/openapi.json'];
const API_TARGET = process.env.RBE_DEV_API ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: Object.fromEntries(API_PATHS.map((p) => [p, { target: API_TARGET, changeOrigin: true }])),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
    // Deterministic API base: tests never read the developer's .env or hit a real backend.
    env: { VITE_API_BASE_URL: 'http://api.test' },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/types/**',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
      ],
      thresholds: { statements: 80, lines: 80, functions: 80, branches: 80 },
    },
  },
});
