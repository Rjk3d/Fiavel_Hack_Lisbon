import deployment from '@deployments/testnet.json'

/**
 * Network configuration, read from `deployments/testnet.json` (written by
 * scripts/deploy-testnet.sh). VITE_* variables override it for another deployment.
 */
const env = import.meta.env as Record<string, string | undefined>

export const NETWORK = {
  name: 'Stellar Testnet',
  passphrase: env.VITE_STELLAR_PASSPHRASE ?? deployment.networkPassphrase,
  rpcUrl: env.VITE_STELLAR_RPC_URL ?? deployment.rpcUrl,
  horizonUrl: env.VITE_STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
  friendbotUrl: 'https://friendbot.stellar.org',
  /** Relayed by the dev server (vite.config.ts) or a serverless function in production. */
  blendFaucetUrl: env.VITE_BLEND_FAUCET_URL ?? '/blend-faucet',
  leaseVault: env.VITE_LEASE_VAULT_ID ?? deployment.leaseVault,
  usdc: deployment.usdc,
  usdcCode: 'USDC',
  usdcIssuer: deployment.usdcClassic.split(':')[1],
  blendPool: deployment.blendPool,
  disputeBond: BigInt(deployment.disputeBond),
  /** Any funded account works as the source of read-only simulations. */
  readerAccount: deployment.accounts.coordinator,
}

const EXPLORER = 'https://stellar.expert/explorer/testnet'
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`
export const explorerAccount = (address: string) => `${EXPLORER}/account/${address}`
export const explorerContract = (id: string) => `${EXPLORER}/contract/${id}`

export const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`
