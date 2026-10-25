import { timeline } from '@agents/rules'
import type { Milestone } from '../../lib/lease-logic'
import type { ActivityEvent } from '../../lib/types'
import type { Tone } from '../ui/Pill'
import type { LeaseView } from '../../state/live'
import type { ChainEvent } from '../../stellar/vault'
import { clock, usdc } from '../../stellar/format'

/** Pure mappings from on-chain lease state to what the screens display. */

export const STATUS: Record<string, [string, Tone]> = {
  Created: ['Waiting for funding', 'neutral'],
  Funded: ['Waiting for move-in', 'brand'],
  Active: ['Active', 'success'],
  Ended: ['Claim window open', 'warning'],
  Claimed: ['Claim filed', 'warning'],
  Disputed: ['In arbitration', 'danger'],
  Closed: ['Closed', 'neutral'],
  Refunded: ['Refunded', 'neutral'],
}

export const statusOf = (v: LeaseView) => STATUS[v.snap.lease.status.tag]

const ORDER = ['Created', 'Funded', 'Active', 'Ended', 'Claimed', 'Disputed', 'Closed', 'Refunded']
const at = (s: bigint | number) => Number(s)

export function milestones(v: LeaseView): Milestone[] {
  const l = v.snap.lease
  const step = ORDER.indexOf(l.status.tag)
  const tl = timeline(l)
  const settled = l.status.tag === 'Closed' || l.status.tag === 'Refunded'
  const state = (doneFrom: number, currentAt: number[]): Milestone['state'] =>
    step >= doneFrom ? 'done' : currentAt.includes(step) ? 'current' : 'upcoming'
  return [
    { key: 'created', label: 'Offer created', date: null, dateLabel: clock(at(l.created_at)), hint: 'Terms on-chain', state: 'done' },
    {
      key: 'funded',
      label: 'Guarantee funded',
      date: null,
      dateLabel: step >= 1 ? 'Locked' : `Before ${clock(tl.moveInDeadline)}`,
      hint: step >= 1 ? 'Locked in the contract' : 'Waiting for the tenant',
      state: state(1, [0]),
    },
    {
      key: 'active',
      label: 'Lease active',
      date: null,
      dateLabel: l.start ? `${clock(at(l.start))} → ${clock(tl.endAt)}` : '—',
      hint: step >= 3 ? 'Lease ended' : 'Rent month by month',
      state: step >= 3 ? 'done' : step >= 1 ? 'current' : 'upcoming',
    },
    {
      key: 'release',
      label: settled ? (l.status.tag === 'Refunded' ? 'Refunded' : 'Settled') : 'Guarantee back',
      date: null,
      dateLabel: settled ? 'Paid out' : l.ended_at ? `After ${clock(tl.claimWindowEnd)}` : '—',
      hint: settled ? 'Everything paid out' : 'If no claim is filed',
      state: settled ? 'done' : step >= 3 ? 'current' : 'upcoming',
    },
  ]
}

export type MonthState = 'paid' | 'from_guarantee' | 'due' | 'overdue' | 'upcoming' | 'first_rent'

export interface MonthRow {
  index: number
  label: string
  due: number
  state: MonthState
  tx?: string
}

/** One row per rental month, with what happened to it. */
export function months(v: LeaseView, events: ChainEvent[], now: number): MonthRow[] {
  const l = v.snap.lease
  const t = l.terms
  const mine = events.filter((e) => e.leaseId === v.id)
  const start = at(l.start)
  return Array.from({ length: t.months }, (_, m) => {
    const due = start ? start + m * at(t.period) : 0
    const paid = mine.find((e) => e.name === 'rent_paid' && Number(e.data.month) === m)
    const taken = mine.find((e) => e.name === 'unpaid_claimed' && Number(e.data.month) === m)
    let state: MonthState
    if (m === 0) state = l.start ? 'first_rent' : 'upcoming'
    else if (paid) state = 'paid'
    else if (taken) state = 'from_guarantee'
    else if (m < l.months_settled) state = 'paid'
    else if (!start) state = 'upcoming'
    else if (now > due + at(t.grace)) state = 'overdue'
    else if (now >= due || m === l.months_settled) state = 'due'
    else state = 'upcoming'
    const tx = (paid ?? taken ?? (m === 0 ? mine.find((e) => e.name === 'moved_in') : undefined))?.tx
    return { index: m, label: `Month ${m + 1}`, due, state, tx }
  })
}

export const MONTH_PILL: Record<MonthState, [string, Tone]> = {
  first_rent: ['Paid at move-in', 'success'],
  paid: ['Paid', 'success'],
  from_guarantee: ['Taken from guarantee', 'warning'],
  due: ['Due', 'brand'],
  overdue: ['Overdue', 'danger'],
  upcoming: ['Upcoming', 'neutral'],
}

/** Yield so far on the Blend part (value above what was locked). */
export function yieldOf(v: LeaseView) {
  const l = v.snap.lease
  const principal = l.liquid + l.placed
  let earned = l.yield_active ? v.snap.guaranteeValue - principal : 0n
  // Blend rounds shares down: a few stroops below the principal is rounding, not a loss
  // (the contract uses the same 0.1 % tolerance).
  if (earned < 0n && -earned * 1000n < l.placed) earned = 0n
  return { placed: l.placed, liquid: l.liquid, value: v.snap.guaranteeValue, earned }
}

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => [string, string, ActivityEvent['kind'], ActivityEvent['tone']]> = {
  lease_created: (d) => ['Lease offer created', `Rent ${usdc(BigInt(d.rent as bigint))} · guarantee ${usdc(BigInt(d.deposit as bigint))}`, 'lease_created', 'brand'],
  lease_funded: (d) => ['Guarantee funded', `${usdc(BigInt(d.total as bigint))} locked${d.yield_active ? ' · yield option on' : ''}`, 'deposit', 'success'],
  blend_deposited: (d) => ['Lent on Blend', `${usdc(BigInt(d.amount as bigint))} supplied to the Blend pool`, 'deposit', 'brand'],
  moved_in: () => ['Move-in co-signed', 'Inventory hash signed by both · first rent released', 'lease_active', 'success'],
  rent_paid: (d) => [`Month ${Number(d.month) + 1} paid`, `${usdc(BigInt(d.amount as bigint))} sent to the landlord`, 'payment', 'success'],
  unpaid_claimed: (d) => [`Month ${Number(d.month) + 1} taken from the guarantee`, `${usdc(BigInt(d.amount as bigint))} after the grace period`, 'payment', 'warning'],
  lease_ended: () => ['Lease ended', 'Exit inventory recorded · claim window open', 'lease_active', 'neutral'],
  damage_claimed: (d) => ['Damage claim filed', `${usdc(BigInt(d.amount as bigint))} claimed · ${usdc(BigInt(d.refunded_now as bigint))} returned at once`, 'claim', 'warning'],
  claim_answered: (d) => ['Tenant answered', `Offer: ${usdc(BigInt(d.offer as bigint))}`, 'claim', 'brand'],
  lease_settled: (d) => ['Settled', `${usdc(BigInt(d.to_landlord as bigint))} to the landlord · ${usdc(BigInt(d.to_tenant as bigint))} to the tenant`, 'deposit', 'success'],
  lease_refunded: (d) => ['Refunded (no move-in)', `${usdc(BigInt(d.amount as bigint))} back to the tenant`, 'deposit', 'neutral'],
  blend_exited: (d) => ['Back from Blend', `Yield ${usdc(BigInt(d.gain as bigint), { decimals: 7 })}`, 'deposit', 'brand'],
}

export function toActivity(e: ChainEvent): ActivityEvent {
  const [title, detail, kind, tone] = EVENT_TEXT[e.name]?.(e.data) ?? [e.name, '', 'deposit', 'neutral']
  const d = new Date(e.at)
  return {
    id: e.key,
    leaseId: e.leaseId.toString(),
    kind,
    title: `${title} · lease #${e.leaseId}`,
    detail,
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 8),
    visibleTo: ['tenant', 'landlord'],
    tone,
    origin: 'chain_confirmed',
    tx: e.tx,
  }
}
