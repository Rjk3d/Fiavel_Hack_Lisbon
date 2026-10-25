import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here('..'), 'ESCROW_PROVIDER_MODE')
  const escrowMode = process.env.ESCROW_PROVIDER_MODE ?? env.ESCROW_PROVIDER_MODE ?? 'leasevault'
  if (!['leasevault', 'trustless_work', 'hybrid'].includes(escrowMode)) throw new Error('Invalid ESCROW_PROVIDER_MODE')
  return {
  define: { __ESCROW_PROVIDER_MODE__: JSON.stringify(escrowMode) },
  plugins: [react()],
  resolve: {
    alias: {
      // The agents' rule engine is shared with the app: the UI proposes exactly what the contract accepts.
      '@agents': here('../agents/src'),
      '@deployments': here('../deployments'),
      '@escrow': here('../packages/escrow-domain/src'),
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
  }
})
