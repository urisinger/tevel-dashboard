import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api/ws/': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws\//, '/api/ws/')
      },
      '/api/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  root: 'frontend',
  plugins: [react()],
})
