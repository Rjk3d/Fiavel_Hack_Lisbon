import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { assist, clientFromEnv, STATUS } from './server/assistant'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Serves /api/assistant in dev and preview, like the Vercel function does in production. */
function assistantApi(env: Record<string, string>): Plugin {
  const client = clientFromEnv(env)
  const route: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/assistant' || req.method !== 'POST') return next()
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c))
    req.on('end', async () => {
      let body: unknown = null
      try {
        body = JSON.parse(raw)
      } catch {
        /* invalid below */
      }
      const out = await assist(body, client)
      res.statusCode = out.ok ? 200 : STATUS[out.error]
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(out))
    })
  }
  return {
    name: 'fiavel-assistant-api',
    configureServer: (server) => void server.middlewares.use(route),
    configurePreviewServer: (server) => void server.middlewares.use(route),
  }
}

export default defineConfig(({ mode }) => ({
  // ANTHROPIC_API_KEY from front/.env.local (or the shell); never exposed to the browser.
  plugins: [react(), assistantApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>)],
  resolve: {
    alias: {
      // The agents' rule engine is shared with the app: the UI proposes exactly what the contract accepts.
      '@agents': here('../agents/src'),
      '@deployments': here('../deployments'),
    },
  },
  server: {
    host: true,
    port: 5174,
    fs: { allow: ['..'] },
    proxy: {
      // Blend's testnet faucet only answers its own origin; the dev server relays it.
      '/blend-faucet': {
        target: 'https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/blend-faucet/, '/getAssets'),
        headers: { Origin: 'https://testnet.blend.capital' },
      },
    },
  },
  preview: { port: 5174 },
  optimizeDeps: { include: ['lease-vault-client'] },
}))
