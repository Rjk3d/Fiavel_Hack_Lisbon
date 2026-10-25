/**
 * Shared domain types. Every screen reads these shapes from one store
 * (`state/demo-store.tsx`), so a real backend only has to return the same shapes.
 */

export type Role = 'tenant' | 'landlord'

/** Where a record comes from. Only `demo` exists until a backend is connected. */
export type DataOrigin = 'demo' | 'database' | 'chain_submitted' | 'chain_confirmed'

export type LeaseStatus = 'draft' | 'funded' | 'active' | 'claim_review' | 'released'

export type DepositStatus = 'not_funded' | 'held' | 'claim_review' | 'released'

export type PaymentStatus = 'paid' | 'upcoming' | 'needs_review' | 'simulated' | 'scheduled'

export type ISODate = string // YYYY-MM-DD

export interface Person {
  id: string
  name: string
  firstName: string
  initials: string
  email: string
  note: string
}

export interface Property {
  id: string
  street: string
  unit: string
  neighbourhood: string
  city: string
  postcode: string
  type: string
  sizeM2: number
}

export interface Lease {
  id: string
  reference: string
  tenantId: string
  landlordId: string
  propertyId: string
  status: LeaseStatus
  depositStatus: DepositStatus
  monthlyRent: number
  deposit: number
  rentDueDay: number
  startDate: ISODate
  endDate: ISODate
  createdDate: ISODate
  depositFundedDate: ISODate | null
  /** Days after move-out during which the landlord may open a claim. */
  claimWindowDays: number
  /** Days the tenant has to respond to a claim. */
  responseWindowDays: number
  moveOutInspection: ISODate | null
  origin: DataOrigin
}

export interface Payment {
  id: string
  leaseId: string
  period: string
  amount: number
  dueDate: ISODate
  paidDate: ISODate | null
  status: PaymentStatus
  method: string | null
  events: { date: ISODate; label: string }[]
  origin: DataOrigin
}

export type ActivityKind =
  | 'lease_created'
  | 'deposit'
  | 'payment'
  | 'claim'
  | 'ai'
  | 'lease_active'
  | 'review'

export interface ActivityEvent {
  id: string
  leaseId: string
  kind: ActivityKind
  title: string
  detail: string
  date: ISODate
  time: string
  visibleTo: Role[]
  tone: 'success' | 'brand' | 'warning' | 'neutral'
  origin: DataOrigin
}

export type ClaimCategory = 'damage' | 'cleaning' | 'unpaid_rent' | 'missing_items' | 'other'

export interface ClaimDraft {
  id: string
  leaseId: string
  category: ClaimCategory
  amount: number
  description: string
  evidence: string[]
  createdDate: ISODate
  status: 'draft'
  origin: DataOrigin
}

/** Technical blockchain info. Every field stays null until something real exists. */
export interface ChainInfo {
  network: string
  contractId: string | null
  lastTxHash: string | null
  explorerBase: string | null
}
