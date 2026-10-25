import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { assist, clientFromEnv, STATUS } from './server/assistant'
import { inspect } from './server/inventory'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Serves the AI routes in dev and preview, like the Vercel functions do in production. */
function aiApi(env: Record<string, string>): Plugin {
  const client = clientFromEnv(env)
  const routes: Record<string, (body: unknown) => Promise<{ ok: boolean; error?: string }>> = {
    '/api/assistant': (body) => assist(body, client),
    '/api/inventory': (body) => inspect(body, client),
  }
  const route: Connect.NextHandleFunction = (req, res, next) => {
    const handle = routes[req.url ?? '']
    if (!handle || req.method !== 'POST') return next()
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', async () => {
      let body: unknown = null
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        /* invalid below */
      }
      const out = await handle(body)
      res.statusCode = out.ok ? 200 : STATUS[out.error ?? 'invalid']
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(out))
    })
  }
  return {
    name: 'fiavel-ai-api',
    configureServer: (server) => void server.middlewares.use(route),
    configurePreviewServer: (server) => void server.middlewares.use(route),
  }
}

export default defineConfig(({ mode }) => ({
  // ANTHROPIC_API_KEY from front/.env.local (or the shell); never exposed to the browser.
  plugins: [react(), aiApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>)],
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
