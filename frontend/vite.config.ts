import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/*.sqlite', '**/*.sqlite-*'] },
    proxy: { '/api/assistant': process.env.FIAVEL_API_TARGET || 'http://127.0.0.1:8787', '/api/reviews': process.env.FIAVEL_API_TARGET || 'http://127.0.0.1:8787' },
  },
})
