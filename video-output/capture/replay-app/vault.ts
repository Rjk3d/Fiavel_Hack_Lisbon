// Replay of the app's chain reads (front/src/stellar/vault.ts). Writes are disabled.
export * from '@real-vault'
import type { ArbiterRecord, Snapshot } from '@agents/rules'
import type { Claim, Lease } from 'lease-vault-client'
import { events, read } from './replay-data'
import type { ChainEvent, MediatorRegistry, Reputation } from '@real-vault'

export async function ping(): Promise<number> {
  return 0
}
export async function leaseCount(): Promise<number> {
  return Number(read<bigint>('lease_count'))
}
export async function getLease(): Promise<Lease> {
  return read<Lease>('get_lease')
}
export async function snapshotOf(id: bigint, lease?: Lease): Promise<Snapshot> {
  return {
    id,
    lease: lease ?? read<Lease>('get_lease'),
    claim: (read<Claim | undefined>('get_claim') ?? undefined) as Claim | undefined,
    now: Math.floor(Date.now() / 1000),
    guaranteeValue: read<bigint>('guarantee_value'),
    blendAtRisk: read<boolean>('blend_at_risk'),
    proposal: read('get_yield_proposal') ?? undefined,
    ratings: read('get_ratings'),
    v2: true,
    v4: true,
  } as Snapshot
}
export async function arbiterRecordOf(): Promise<ArbiterRecord | null> {
  return read<ArbiterRecord>('get_arbiter_record')
}
export async function threadOf(): Promise<{ count: number; hash: Uint8Array } | null> {
  const t = read<{ count: number; hash: Uint8Array }>('get_thread')
  return { count: Number(t.count), hash: new Uint8Array(t.hash) }
}
export async function reputationOf(address: string): Promise<Reputation | null> {
  const lease = read<Lease>('get_lease')
  const who = address === lease.landlord ? 'landlord' : address === lease.tenant ? 'tenant' : null
  if (!who) return { count: 0, average: null, counterparties: 0, leaseSeconds: 0 }
  const reps = (await import('./replay-data')).step().get_reputation as Record<string, string>
  const r = read<{ count: number; total: number; counterparties: number; lease_seconds: bigint }>('get_reputation', reps[who])
  return { count: r.count, average: r.count ? r.total / r.count : null, counterparties: r.counterparties, leaseSeconds: Number(r.lease_seconds) }
}
export async function mediatorRegistry(): Promise<MediatorRegistry | null> {
  const cfg = read<{ open_registry: boolean }>('get_config')
  return { arbiters: read<string[]>('get_arbiters').map(String), open: cfg.open_registry }
}
export async function contractEvents(): Promise<ChainEvent[]> {
  return events()
}
export async function invoke(): Promise<{ hash: string; result: unknown }> {
  throw new Error('Replay: read-only')
}
