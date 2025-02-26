import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080', // Your WebSocket backend
        ws: true, // Enable WebSocket proxying
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
})
