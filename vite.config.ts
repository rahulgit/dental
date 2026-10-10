import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// The Cloudflare plugin runs worker/index.ts inside `npm run dev`, so /api/*
// is proxied the same way locally as in production.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
})
