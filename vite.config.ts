import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''), // optional
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        rewrite: path => '/ws',
      },
    },
  },
  root: 'frontend',
  plugins: [react()],
})
