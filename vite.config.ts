import type { Server } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function multiplayer(): Plugin {
  return {
    name: 'multiplayer',
    configureServer(server) {
      const httpServer = server.httpServer
      if (!httpServer) return
      const marked = httpServer as Server & { __duel?: boolean }
      if (marked.__duel) return
      marked.__duel = true
      void server.ssrLoadModule('/server/listen.ts').then((mod) => {
        const attach = mod.attachMultiplayer as (http: Server) => void
        attach(httpServer as Server)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), multiplayer()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5741,
    strictPort: true,
  },
  preview: {
    port: 5741,
  },
})
