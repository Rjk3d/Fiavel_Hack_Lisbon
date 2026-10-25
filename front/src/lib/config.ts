import type { ChainInfo } from './types'

/**
 * Integration configuration. Everything is read from env vars and defaults to null:
 * the UI only shows a contract address or a transaction when one is really configured.
 *
 *   VITE_STELLAR_CONTRACT_ID   deployed Soroban contract id (testnet)
 *   VITE_STELLAR_LAST_TX       a real, verified transaction hash
 *   VITE_ASSISTANT_URL         backend AI endpoint (the demo agent is used while unset)
 */
const env = import.meta.env as Record<string, string | undefined>
const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

export const chainConfig: ChainInfo = {
  network: 'Stellar Testnet — demo configuration',
  contractId: clean(env.VITE_STELLAR_CONTRACT_ID),
  lastTxHash: clean(env.VITE_STELLAR_LAST_TX),
  explorerBase: 'https://stellar.expert/explorer/testnet',
}

/** Explorer link, built only from a configured hash on the configured network. */
export function explorerTxUrl(info: ChainInfo): string | null {
  if (!info.lastTxHash || !/^[0-9a-f]{64}$/i.test(info.lastTxHash) || !info.explorerBase) return null
  return `${info.explorerBase}/tx/${info.lastTxHash}`
}

export const assistantEndpoint = clean(env.VITE_ASSISTANT_URL)

/** Whether a real backend is connected. Drives the "Demo" labels across the app. */
export const backendConnected = false
