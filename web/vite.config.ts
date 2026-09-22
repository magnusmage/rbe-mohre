import { defineConfig } from 'vite';
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
});
