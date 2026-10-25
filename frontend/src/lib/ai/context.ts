import type { Dispute, Lease, Transaction, User } from '../types'

export type Language = 'en' | 'fr'
export type Provenance = 'demo' | 'backend' | 'verified-blockchain'
export type Intent = 'payment' | 'deposit' | 'blockchain' | 'lease' | 'dispute' | 'evidence' | 'draft' | 'arbitration' | 'operations' | 'privacy' | 'safety' | 'unrelated' | 'reputation'
export interface Turn { role: 'user' | 'assistant'; text: string; intent?: Intent }
export interface EvidenceMetadata { id: string; leaseId: string; name: string; kind: string; verified: boolean; visibleTo: string[] }
export interface ClaimRecord extends Dispute { visibleTo: string[] }
export interface Snapshot {
  leases: Lease[]; payments: Transaction[]; claims: ClaimRecord[]; evidence: EvidenceMetadata[]
  simulatedPaymentIds: string[]; asOf: string; source: 'demo' | 'backend'
}
export const actionIds = ['lease', 'payments', 'disputes', 'evidence', 'draft'] as const
export type ActionId = typeof actionIds[number]
export interface RentalContext {
  reputation?: { provenance: 'demo' | 'live'; opinions: { rating: number; text: string; verifiedRental: boolean }[]; eligibility: { id: string; state: string; reason: string }[]; summary: { count: number; verifiedRentals: number; average: number | null } }
  user: Pick<User, 'id' | 'role' | 'name'>
  asOf: string; provenance: Provenance; activeLease: Lease | null; leases: Lease[]
  payments: (Transaction & { displayStatus: 'Upcoming' | 'Recorded' | 'Simulated' })[]
  claims: Omit<ClaimRecord, 'visibleTo'>[]; evidence: Omit<EvidenceMetadata, 'visibleTo' | 'leaseId'>[]
  deposit: { amount: number; status: 'recorded' | 'unavailable'; blockchain: 'unverified' }
  availableActions: ActionId[]
  documents: 'unavailable'; releaseDeadline: null; arbitrationRules: null
}

// A role selector is a demo preference, never an authentication credential.
// Live callers must supply user and snapshot from trusted server-side session/data adapters.
export function authorizedLeases(user: User, leases: Lease[]) {
  return leases.filter(lease => user.role === 'tenant' ? lease.tenant.id === user.id : user.role === 'landlord' && lease.landlord.id === user.id)
}

export function buildContext(user: User, snapshot: Snapshot, leaseId?: string): RentalContext {
  const leases = authorizedLeases(user, snapshot.leases)
  const activeLease = leaseId ? leases.find(lease => lease.id === leaseId) : leases[0]
  if (leaseId && !activeLease) throw new Error('Lease unavailable for this user.')
  const ids = new Set(leases.map(lease => lease.id))
  const payments = snapshot.payments.filter(item => ids.has(item.leaseId)).map(item => ({
    ...item, displayStatus: snapshot.simulatedPaymentIds.includes(item.id) ? 'Simulated' as const : item.status,
  }))
  const claims = snapshot.claims.filter(item => item.leaseId === activeLease?.id && item.visibleTo.includes(user.id))
    .map(({ id, leaseId: claimLeaseId, title, description, evidence, amount, status, source }) => ({ id, leaseId: claimLeaseId, title, description, evidence, amount, status, source }))
  const evidence = snapshot.evidence.filter(item => item.leaseId === activeLease?.id && item.visibleTo.includes(user.id))
    .map(({ id, name, kind, verified }) => ({ id, name, kind, verified }))
  return {
    user: { id: user.id, role: user.role, name: user.name }, asOf: snapshot.asOf, provenance: snapshot.source,
    activeLease: activeLease ?? null, leases, payments, claims, evidence,
    deposit: { amount: activeLease?.deposit ?? 0, status: payments.some(item => item.leaseId === activeLease?.id && item.kind === 'deposit' && item.displayStatus === 'Recorded') ? 'recorded' : 'unavailable', blockchain: 'unverified' },
    availableActions: activeLease ? ['lease', 'payments', 'disputes', 'evidence', 'draft'] : [],
    documents: 'unavailable', releaseDeadline: null, arbitrationRules: null,
  }
}

export function boundedHistory(history: Turn[]): Turn[] {
  return history.slice(-12).map(turn => ({ role: turn.role, text: turn.text.slice(0, 2000), ...(turn.intent ? { intent: turn.intent } : {}) }))
}

// Send minimum factual fields to a configured external model, never documents,
// dispute descriptions, evidence notes, names, addresses, or uploaded contents.
export function modelContext(context: RentalContext) {
  return {
    role: context.user.role, provenance: context.provenance, asOf: context.asOf,
    lease: context.activeLease && { rent: context.activeLease.rent, deposit: context.activeLease.deposit, start: context.activeLease.start, end: context.activeLease.end, status: context.activeLease.status },
    payments: context.payments.filter(item => item.leaseId === context.activeLease?.id).map(item => ({ amount: item.amount, date: item.date, kind: item.kind, status: item.displayStatus })),
    claims: context.claims.map(item => ({ amount: item.amount, status: item.status })),
    evidenceCount: context.evidence.length, documents: context.documents, blockchain: context.deposit.blockchain,
    releaseDeadline: null, arbitrationRules: null,
  }
}
