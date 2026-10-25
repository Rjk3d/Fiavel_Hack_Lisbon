import type { Lease } from 'lease-vault-client'
import type { FundingProof } from '@escrow/domain'

export const UNIT = 10_000_000n
export const FUND_FEE_CAP = 100_000_000n // Explicit 10 XLM transaction-fee ceiling, not a quoted fee.
export const QUOTE_MS = 30_000
export interface AssetId { code: string; issuer?: string }
export const assetKey = (asset: AssetId) => {
  if (asset.issuer) return `${asset.code}:${asset.issuer}`
  if (asset.code !== 'XLM') throw new Error('Unsupported asset: only XLM is native on Stellar. External-chain assets require a separate integration.')
  return 'native'
}
export function units(value: string): bigint {
  if (!/^\d+(?:\.\d{1,7})?$/.test(value)) throw new Error('Invalid non-negative 7-decimal amount.')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(7, '0'))
}
export function decimal(value: bigint): string {
  if (value < 0n) throw new Error('Negative payment amount.')
  return `${value / UNIT}.${(value % UNIT).toString().padStart(7, '0')}`
}
export const ceilBps = (amount: bigint, bps: number) => (amount * BigInt(10000 + bps) + 9999n) / 10000n
export function totalFor(lease: Lease, acceptYield: boolean): bigint {
  const t = lease.terms
  if (t.rent <= 0n || t.deposit < t.rent) throw new Error('Invalid lease amounts.')
  return t.rent + t.deposit + (acceptYield && t.yield_offered ? t.deposit * BigInt(t.buffer_bps) / 10000n : 0n)
}
export function assertCanFund(lease: Lease, payer: string, now: number) {
  if (lease.status.tag !== 'Created') throw new Error('This lease is no longer awaiting funding. Refresh its on-chain state.')
  if (payer === lease.landlord || payer === lease.terms.arbiter) throw new Error('The landlord and arbiter cannot fund as tenant.')
  if (now > Number(lease.created_at + lease.terms.move_in_window)) throw new Error('The funding deadline has passed. Converted USDC remains in your own wallet.')
}
export interface Scope { network: string; vault: string; token: string; payer: string; leaseId: string; provider?: 'leasevault' | 'trustless_work' }
// Preserve every legacy payment key. New providers have an explicit namespace.
export const scopeKey = (s: Scope) => [s.network, s.vault, s.token, s.payer, s.leaseId, ...(s.provider && s.provider !== 'leasevault' ? [s.provider] : [])].join('|')
export interface WalletAsset { asset: AssetId; balance: bigint; spendable: bigint; authorized: boolean; reason?: string }
export interface SupportedAsset { asset: WalletAsset; supported: boolean; reason?: string }
export interface WalletState { assets: WalletAsset[]; usdcCapacity: bigint; hasUSDC: boolean; usdcAuthorized: boolean; xlmSpendable: bigint; fee: bigint; ledgerTime: number }
export interface Path { input: AssetId; inputAmount: bigint; outputAmount: bigint; path: AssetId[] }
export interface Quote {
  scope: Scope; kind: 'direct' | 'path'; input: AssetId; required: bigint; receive: bigint; expected: bigint; maximum: bigint
  path: AssetId[]; expires: number; slippageBps: number; fee: bigint; acceptYield: boolean; createdAt: string
}
export function bestPath(paths: Path[], input: AssetId, required: bigint): Path | undefined {
  return paths.filter(path => assetKey(path.input) === assetKey(input) && path.outputAmount === required && path.inputAmount > 0n && path.path.length <= 5)
    .sort((a, b) => a.inputAmount < b.inputAmount ? -1 : a.inputAmount > b.inputAmount ? 1 : 0)[0]
}
export function validateSpend(state: WalletState, quote: Quote) {
  const source = state.assets.find(item => assetKey(item.asset) === assetKey(quote.input))
  if (!state.hasUSDC) throw new Error('Create the configured USDC trustline before funding. Use the existing test-funds setup or your wallet.')
  if (!state.usdcAuthorized) throw new Error('The escrow USDC trustline is not authorized by its issuer.')
  if (!source?.authorized) throw new Error('The source trustline is missing or not authorized.')
  const feeBudget = FUND_FEE_CAP + (quote.kind === 'path' ? quote.fee : 0n)
  if (state.xlmSpendable < feeBudget) throw new Error('Insufficient spendable XLM for account reserves and the funding fee budget.')
  const available = source.spendable - (assetKey(source.asset) === 'native' ? feeBudget : 0n)
  if (available < quote.maximum) throw new Error(`Insufficient spendable ${source.asset.code}, including liabilities, reserves and fee budget.`)
  if (quote.kind === 'path' && state.usdcCapacity < quote.receive) throw new Error('The destination USDC trustline limit is too low for the exact receive amount.')
}
export function assertQuote(quote: Quote, scope: Scope, lease: Lease, now: number) {
  return assertQuoteRequirements(quote, scope, { amount: totalFor(lease, quote.acceptYield), revision: lease.created_at.toString() }, now)
}
export function assertQuoteRequirements(quote: Quote, scope: Scope, required: { amount: bigint; revision: string }, now: number) {
  if (scopeKey(quote.scope) !== scopeKey(scope)) throw new Error('Quote belongs to another wallet, lease, asset or network.')
  if (quote.expires <= now) throw new Error('Quote expired. Request a fresh quote.')
  if (quote.slippageBps < 0 || quote.slippageBps > 100 || !Number.isInteger(quote.slippageBps)) throw new Error('Slippage must be between 0 and 1%.')
  if (quote.required !== required.amount || quote.createdAt !== required.revision) throw new Error('Lease terms changed. Review a new quote.')
  if (quote.expected <= 0n || quote.maximum < quote.expected || quote.maximum > ceilBps(quote.expected, quote.slippageBps) || quote.fee <= 0n) throw new Error('Invalid quoted spend or fee limits.')
  if (quote.kind === 'direct' && (quote.expected !== quote.required || quote.maximum !== quote.required || quote.receive !== 0n)) throw new Error('Invalid direct USDC quote.')
  if (quote.kind === 'path' && (quote.receive <= 0n || quote.receive > quote.required || quote.path.length > 5)) throw new Error('Invalid exact-output conversion quote.')
}
export type Stage = 'reviewed' | 'swap-pending' | 'swap-confirmed' | 'fund-pending' | 'funded' | 'swap-failed' | 'fund-failed'
export interface TxReference { hash: string; xdr: string; expires: number }
export interface Attempt { version: 1; scope: Scope; required: string; receive: string; source: AssetId; sourceMax: string; acceptYield: boolean; createdAt: string; stage: Stage; swap?: TxReference; fund?: TxReference; error?: string }
export interface AttemptStore { load(scope: Scope): Attempt | null; save(attempt: Attempt): void }
export interface TransactionStatus { state: 'pending' | 'failed' | 'confirmed' }
export interface FundingPorts {
  scope: Scope
  targetAsset: AssetId
  lease?(): Promise<Lease>
  requirements?(acceptYield: boolean): Promise<{ amount: bigint; revision: string }>
  beforeStart?(quote: Quote): void
  persistAttempt?(attempt: Attempt): void
  fundingProof?(attempt: Attempt): Promise<FundingProof | null>
  wallet(): Promise<WalletState>
  paths(input: AssetId, required: bigint): Promise<Path[]>
  checkNetwork(): Promise<void>
  prepareSwap(quote: Quote): Promise<TxReference>
  prepareFunding(attempt: Attempt): Promise<TxReference>
  submit(tx: TxReference, kind: 'swap' | 'fund'): Promise<void>
  status(tx: TxReference, kind: 'swap' | 'fund', attempt: Attempt): Promise<TransactionStatus>
  verify(attempt: Attempt): Promise<boolean>
  now(): number
}
