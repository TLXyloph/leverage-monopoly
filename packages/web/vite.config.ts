import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

/**
 * One bundle, three shells. `/admin`, `/p/:token` and `/table` are client-routed, so the
 * dev server and the Fastify static handler both fall back to `index.html`.
 *
 * The API and the WebSocket are proxied in development so the client can use relative
 * URLs everywhere and never needs to know whether it is talking to Vite or to Fastify.
 */
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5178,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5177', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:5177', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
