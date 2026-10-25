import { DEMO_TODAY, people, properties } from './demo-data'
import { addDays, daysBetween, formatDate } from './formatters'
import type { ClaimDraft, Lease, Payment, Role } from './types'

/** Everything a screen or the demo agent needs, in one immutable snapshot. */
export interface Snapshot {
  role: Role
  today: string
  leases: Lease[]
  payments: Payment[]
  claims: ClaimDraft[]
}

export const DEMO_USER: Record<Role, string> = { tenant: 'ana', landlord: 'manuel' }

export const userFor = (role: Role) => people[DEMO_USER[role]]

export const leasesFor = (s: Pick<Snapshot, 'role' | 'leases'>) =>
  s.leases.filter((l) => (s.role === 'tenant' ? l.tenantId : l.landlordId) === DEMO_USER[s.role])

export const propertyOf = (l: Lease) => properties[l.propertyId]
export const tenantOf = (l: Lease) => people[l.tenantId]
export const landlordOf = (l: Lease) => people[l.landlordId]

export const paymentsOf = (payments: Payment[], leaseId: string) =>
  payments.filter((p) => p.leaseId === leaseId).sort((a, b) => a.dueDate.localeCompare(b.dueDate))

/** The next payment still owed: the earliest one not yet paid or simulated. */
export function nextPayment(payments: Payment[], leaseId: string): Payment | null {
  return paymentsOf(payments, leaseId).find((p) => p.status === 'upcoming' || p.status === 'scheduled') ?? null
}

export const isSettled = (p: Payment) => p.status === 'paid' || p.status === 'simulated'

/** Last day the landlord may open a deposit claim (lease end + claim window). */
export const claimDeadline = (l: Lease) => addDays(l.endDate, l.claimWindowDays)

export type MilestoneState = 'done' | 'current' | 'upcoming'
export interface Milestone {
  key: string
  label: string
  date: string | null
  hint: string
  state: MilestoneState
  /** Overrides the formatted date, e.g. a time for leases measured in minutes. */
  dateLabel?: string
}

/** The four-step deposit lifecycle shown on every screen. */
export function lifecycle(l: Lease, today = DEMO_TODAY): Milestone[] {
  const ended = daysBetween(l.endDate, today) > 0
  const released = l.depositStatus === 'released'
  return [
    { key: 'created', label: 'Lease created', date: l.createdDate, hint: 'Both parties signed', state: 'done' },
    {
      key: 'funded',
      label: 'Deposit funded',
      date: l.depositFundedDate,
      hint: l.depositFundedDate ? 'Recorded as held' : 'Waiting for funding',
      state: l.depositFundedDate ? 'done' : 'current',
    },
    {
      key: 'active',
      label: 'Lease active',
      date: l.startDate,
      hint: ended ? 'Lease ended' : `Until ${formatDate(l.endDate)}`,
      state: !l.depositFundedDate ? 'upcoming' : ended ? 'done' : 'current',
    },
    {
      key: 'release',
      label: 'Deposit release',
      date: released ? today : claimDeadline(l),
      hint: released ? 'Released' : 'If no claim is opened',
      state: released ? 'done' : ended ? 'current' : 'upcoming',
    },
  ]
}

/** Share of the lease term already elapsed, 0..1. */
export function leaseProgress(l: Lease, today = DEMO_TODAY) {
  const total = daysBetween(l.startDate, l.endDate)
  return Math.min(1, Math.max(0, daysBetween(l.startDate, today) / total))
}
