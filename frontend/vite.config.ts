/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  // The static build is served from a sub-path on GitHub Pages, so asset URLs must be relative.
  base: mode === 'static' ? './' : '/',
  // Set here (not in a git-ignored .env file) so CI builds are always static.
  define: { 'import.meta.env.VITE_STATIC': JSON.stringify(mode === 'static' ? 'true' : 'false') },
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:8765' } },
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
}))
