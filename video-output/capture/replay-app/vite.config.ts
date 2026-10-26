import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const front = here('../../../front')

// The real front/ app, with only its two chain modules swapped for the replay.
export default defineConfig({
  root: front,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^(\.\.?\/)+(stellar\/)?vault$/, replacement: here('./vault.ts') },
      { find: /^(\.\.?\/)+(stellar\/)?wallets$/, replacement: here('./wallets.ts') },
      { find: '@real-vault', replacement: `${front}/src/stellar/vault.ts` },
      { find: '@real-wallets', replacement: `${front}/src/stellar/wallets.ts` },
      { find: /^lease-vault-client$/, replacement: `${front}/node_modules/lease-vault-client` },
      { find: '@agents', replacement: here('../../../agents/src') },
      { find: '@deployments', replacement: here('../../../deployments') },
    ],
  },
  server: { port: 5195, strictPort: true, fs: { allow: [here('../../..')] } },
  optimizeDeps: { include: ['lease-vault-client'] },
})
