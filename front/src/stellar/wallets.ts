import { Horizon, Keypair, TransactionBuilder } from 'lease-vault-client'
import { NETWORK } from './config'

/**
 * Testnet demo wallets: one keypair per role, created in the browser and kept in
 * localStorage. They only ever hold testnet assets. The `Wallet` interface is what
 * the app uses, so passkey smart accounts can replace this without touching screens.
 */
export type LiveRole = 'tenant' | 'landlord' | 'arbiter'
export const ROLES: LiveRole[] = ['tenant', 'landlord', 'arbiter']

export interface Wallet {
  role: LiveRole
  address: string
  sign: Keypair
}

export interface Balances {
  exists: boolean
  xlm: number
  usdc: bigint
  hasTrustline: boolean
}

const KEY = (role: LiveRole) => `fiavel.wallet.${NETWORK.leaseVault}.${role}`
const horizon = new Horizon.Server(NETWORK.horizonUrl)

export function loadWallet(role: LiveRole): Wallet {
  let secret: string | null = null
  try {
    secret = localStorage.getItem(KEY(role))
  } catch {
    /* storage blocked: a fresh wallet for this session only */
  }
  const kp = secret ? Keypair.fromSecret(secret) : Keypair.random()
  if (!secret) {
    try {
      localStorage.setItem(KEY(role), kp.secret())
    } catch {
      /* not persisted */
    }
  }
  return { role, address: kp.publicKey(), sign: kp }
}

export async function balances(address: string): Promise<Balances> {
  try {
    const acc = await horizon.loadAccount(address)
    let xlm = 0
    let usdc = 0n
    let hasTrustline = false
    for (const b of acc.balances) {
      if (b.asset_type === 'native') xlm = Number(b.balance)
      else if ('asset_code' in b && b.asset_code === NETWORK.usdcCode && b.asset_issuer === NETWORK.usdcIssuer) {
        hasTrustline = true
        usdc = toStroops(b.balance)
      }
    }
    return { exists: true, xlm, usdc, hasTrustline }
  } catch {
    return { exists: false, xlm: 0, usdc: 0n, hasTrustline: false }
  }
}

function toStroops(amount: string): bigint {
  const [whole, frac = ''] = amount.split('.')
  return BigInt(whole) * 10_000_000n + BigInt((frac + '0000000').slice(0, 7))
}

/** XLM from Friendbot, then Blend's test USDC (the asset the lending pool accepts). */
export async function fund(wallet: Wallet, onStep?: (s: string) => void): Promise<void> {
  const before = await balances(wallet.address)
  if (!before.exists || before.xlm < 50) {
    onStep?.('Getting test XLM from Friendbot…')
    const r = await fetch(`${NETWORK.friendbotUrl}/?addr=${wallet.address}`)
    if (!r.ok && before.exists === false) throw new Error('Friendbot could not fund the account')
  }
  const now = await balances(wallet.address)
  if (now.usdc < 1_000n * 10_000_000n / 2n) {
    onStep?.('Getting test USDC from the Blend faucet…')
    const res = await fetch(`${NETWORK.blendFaucetUrl}?userId=${wallet.address}`)
    if (!res.ok) throw new Error(`Blend faucet answered ${res.status}`)
    const xdr = (await res.text()).trim().replace(/^"|"$/g, '')
    const tx = TransactionBuilder.fromXDR(xdr, NETWORK.passphrase)
    tx.sign(wallet.sign)
    await horizon.submitTransaction(tx)
  }
}
