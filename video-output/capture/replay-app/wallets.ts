// Replay of front/src/stellar/wallets.ts: same local wallets, balances from the replayed lease.
export * from '@real-wallets'
import type { Balances, LiveRole } from '@real-wallets'
import { balanceOf } from './replay-data'
import keys from '../keys.json'

export async function balances(address: string): Promise<Balances> {
  const role = (Object.entries(keys).find(([, v]) => v.address === address)?.[0] ?? 'arbiter') as LiveRole
  return { exists: true, xlm: 10_000, usdc: balanceOf(role), hasTrustline: true }
}
export async function fund(): Promise<void> {}

import { Keypair } from 'lease-vault-client'
import { Buffer } from 'buffer'
import { NETWORK } from '../../../front/src/stellar/config'
import type { Wallet } from '@real-wallets'

/** Same storage key as the app; the capture stores a seed (`SEED:<hex>`) instead of a secret. */
export function loadWallet(role: LiveRole): Wallet {
  const raw = localStorage.getItem(`fiavel.wallet.${NETWORK.leaseVault}.${role}`) ?? ''
  const kp = raw.startsWith('SEED:') ? Keypair.fromRawEd25519Seed(Buffer.from(raw.slice(5), 'hex')) : Keypair.random()
  return { role, address: kp.publicKey(), sign: kp }
}
