import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api/ws/': {
        target: 'ws://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws\//, '/api/ws/')
      },
      '/api/': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  root: 'frontend',
  plugins: [solid()],
})
