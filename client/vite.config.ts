/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Only the pure logic is covered: money parsing and formatting, and the
  // translation lookup. Those are where a silent wrong number or a wrong plural
  // could reach the database, and neither needs a rendered component.
  //
  // jsdom rather than node because i18n/locale.ts resolves the language when it
  // is imported, which reads localStorage, navigator and document.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  server: {
    // Exposed on the network so the app can be opened on a phone for testing.
    // Note that browsers only grant camera access on a secure origin, so
    // barcode scanning needs https (or localhost) - over a plain http:// LAN
    // address the scan page will explain that instead of failing silently.
    host: true,

    // In production one Worker serves both the SPA and the API, so /api is
    // same-origin. Proxying it here makes development identical: the client
    // always calls a relative /api path, and the auth cookie behaves the same
    // way locally as it does deployed. `wrangler dev` serves the Worker on 8787.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
})
