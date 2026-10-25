import { Client, Errors, contract, rpc, scValToNative, type Claim, type Lease } from 'lease-vault-client'
import type { Snapshot } from '@agents/rules'
import { NETWORK } from './config'
import type { Wallet } from './wallets'

/** Reads and writes LeaseVault. Every read is a simulation; every write is signed by a wallet. */

const server = new rpc.Server(NETWORK.rpcUrl)

const reader = new Client({
  contractId: NETWORK.leaseVault,
  networkPassphrase: NETWORK.passphrase,
  rpcUrl: NETWORK.rpcUrl,
  publicKey: NETWORK.readerAccount,
})

export function signerFor(wallet: Wallet): Client {
  const { signTransaction, signAuthEntry } = contract.basicNodeSigner(wallet.sign, NETWORK.passphrase)
  return new Client({
    contractId: NETWORK.leaseVault,
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.rpcUrl,
    publicKey: wallet.address,
    signTransaction,
    signAuthEntry,
  })
}

export async function leaseCount(): Promise<number> {
  return Number((await reader.lease_count()).result)
}

export async function getLease(id: bigint): Promise<Lease> {
  return (await reader.get_lease({ id })).result
}

/** Everything the rule engine needs about one lease. */
export async function snapshotOf(id: bigint, lease?: Lease): Promise<Snapshot> {
  const [l, claim, value, risk] = await Promise.all([
    lease ? Promise.resolve(lease) : getLease(id),
    reader.get_claim({ id }).then((t) => (t.result ?? undefined) as Claim | undefined),
    reader.guarantee_value({ id }).then((t) => t.result),
    reader.blend_at_risk({ id }).then((t) => t.result),
  ])
  return { id, lease: l, claim, now: Math.floor(Date.now() / 1000), guaranteeValue: value, blendAtRisk: risk, ...(await v2State(id)) }
}

/**
 * Investment proposal and ratings, from the functions added in LeaseVault v2.
 * On a deployment that predates them the simulation fails: v2 is then false and
 * the app hides those features instead of showing made-up data.
 */
async function v2State(id: bigint): Promise<Pick<Snapshot, 'proposal' | 'ratings' | 'v2'>> {
  try {
    const [proposal, ratings] = await Promise.all([
      reader.get_yield_proposal({ id }).then((t) => t.result ?? undefined),
      reader.get_ratings({ id }).then((t) => t.result),
    ])
    return { proposal, ratings, v2: true }
  } catch {
    return { v2: false }
  }
}

export interface Reputation {
  count: number
  /** Average score out of 5, or null before any rating. */
  average: number | null
}

/** Scores an address received across all leases, or null on a pre-v2 deployment. */
export async function reputationOf(address: string): Promise<Reputation | null> {
  try {
    const r = (await reader.get_reputation({ who: address })).result
    return { count: r.count, average: r.count ? r.total / r.count : null }
  } catch {
    return null
  }
}

export interface ChainEvent {
  key: string
  name: string
  leaseId: bigint
  at: string
  tx: string
  data: Record<string, unknown>
}

/** Contract events, oldest first. The RPC keeps about a week of them. */
export async function contractEvents(): Promise<ChainEvent[]> {
  const latest = await server.getLatestLedger()
  const filters = [{ type: 'contract' as const, contractIds: [NETWORK.leaseVault] }]
  let res = await server.getEvents({ startLedger: Math.max(latest.sequence - 17_000, 1), filters, limit: 500 })
  const events = [...res.events]
  for (let page = 0; page < 20 && res.cursor; page++) {
    const next = await server.getEvents({ cursor: res.cursor, filters, limit: 500 })
    if (next.cursor === res.cursor) break
    events.push(...next.events)
    res = next
    if (next.events.length === 0) break
  }
  return events.map((e) => {
    const value = scValToNative(e.value)
    return {
      key: e.id,
      name: String(scValToNative(e.topic[0])),
      leaseId: BigInt(scValToNative(e.topic[1]) as bigint),
      at: e.ledgerClosedAt,
      tx: e.txHash,
      data: (typeof value === 'object' && value !== null ? value : { value }) as Record<string, unknown>,
    }
  })
}

/** "Error(Contract, #3)" → "WrongStatus". */
export function contractError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  const m = /Error\(Contract, #(\d+)\)/.exec(message)
  if (m) return (Errors as Record<number, { message: string }>)[Number(m[1])]?.message ?? `error #${m[1]}`
  return message.split('\n')[0].slice(0, 160)
}

const PLAIN: Record<string, string> = {
  LeaseNotFound: 'This lease does not exist on this contract.',
  InvalidTerms: 'These terms are not valid (the guarantee must be at least one month of rent).',
  WrongStatus: 'The lease is not at the right stage for this action.',
  NotAParty: 'Only the tenant or the landlord of this lease can do that.',
  DeadlinePassed: 'The deadline for this action has passed.',
  TooEarly: 'Too early: the deadline has not passed yet.',
  HashMismatch: 'The inventory hash differs from the one the other party signed.',
  InvalidAmount: 'This amount is outside what the lease allows.',
  NothingDue: 'Nothing is due.',
  BlendIsSafe: 'The Blend position is healthy: only the parties can end the option.',
  SameParty: 'The tenant must be a different account from the landlord and the arbiter.',
  AlreadyConfirmed: 'You already confirmed this.',
  AlreadyRated: 'You already rated this lease.',
  InvalidScore: 'A rating is a whole number from 1 to 5.',
}

export const plainError = (e: unknown) => {
  const name = contractError(e)
  return PLAIN[name] ?? name
}

/** Signs and submits one contract call. Returns the transaction hash. */
export async function invoke(wallet: Wallet, fn: string, args: Record<string, unknown>): Promise<{ hash: string; result: unknown }> {
  const client = signerFor(wallet) as unknown as Record<string, (a: unknown) => Promise<contract.AssembledTransaction<unknown>>>
  const tx = await client[fn](args)
  if (tx.simulation && rpc.Api.isSimulationError(tx.simulation)) throw new Error(tx.simulation.error)
  const sent = await tx.signAndSend()
  return { hash: sent.sendTransactionResponse?.hash ?? '', result: sent.result }
}

export async function sha256(data: string | ArrayBuffer): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}
