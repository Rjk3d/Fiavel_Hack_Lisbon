import { Pill, type Tone } from '../ui/Pill'
import type { DepositStatus, LeaseStatus, PaymentStatus } from '../../lib/types'

const lease: Record<LeaseStatus, [string, Tone]> = {
  draft: ['Draft', 'neutral'],
  funded: ['Funded', 'brand'],
  active: ['Active', 'success'],
  claim_review: ['Claim under review', 'warning'],
  released: ['Released', 'neutral'],
}

const deposit: Record<DepositStatus, [string, Tone]> = {
  not_funded: ['Not funded', 'neutral'],
  held: ['Protected', 'brand'],
  claim_review: ['Claim under review', 'warning'],
  released: ['Released', 'success'],
}

const payment: Record<PaymentStatus, [string, Tone]> = {
  paid: ['Paid', 'success'],
  upcoming: ['Upcoming', 'warning'],
  scheduled: ['Scheduled', 'neutral'],
  needs_review: ['Needs review', 'warning'],
  simulated: ['Simulated', 'brand'],
}

export const LeaseStatusPill = ({ status }: { status: LeaseStatus }) => (
  <Pill tone={lease[status][1]} dot>
    {lease[status][0]}
  </Pill>
)

export const DepositStatusPill = ({ status }: { status: DepositStatus }) => (
  <Pill tone={deposit[status][1]} dot>
    {deposit[status][0]}
  </Pill>
)

export const PaymentStatusPill = ({ status }: { status: PaymentStatus }) => (
  <Pill tone={payment[status][1]}>{payment[status][0]}</Pill>
)

export const paymentStatusLabel = (s: PaymentStatus) => payment[s][0]
