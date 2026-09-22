import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vite is only ever the dev server / bundler for the Tauri webview. The Rust
// side owns the database and every PDF, so there is no proxy or API layer here.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/legacy/**'] },
  },
  build: { target: 'chrome110', sourcemap: false },
})
