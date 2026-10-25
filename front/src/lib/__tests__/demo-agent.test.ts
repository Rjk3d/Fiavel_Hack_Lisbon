import { describe, expect, it } from 'vitest'
import { answer } from '../demo-agent'
import { DEMO_TODAY, seedLeases, seedPayments } from '../demo-data'
import { claimDeadline, lifecycle, nextPayment, type Snapshot } from '../lease-logic'
import type { Role } from '../types'

const snap = (role: Role, payments = seedPayments): Snapshot => ({ role, today: DEMO_TODAY, leases: seedLeases, payments, claims: [] })

describe('lease logic', () => {
  it('derives the next payment and the deposit release date from the seed', () => {
    expect(nextPayment(seedPayments, 'lease-arroios')?.dueDate).toBe('2026-11-01')
    expect(nextPayment(seedPayments, 'lease-ourique')).toBeNull()
    expect(claimDeadline(seedLeases[0])).toBe('2027-09-14')
  })

  it('marks lease active as the current lifecycle step', () => {
    expect(lifecycle(seedLeases[0], DEMO_TODAY).map((m) => m.state)).toEqual(['done', 'done', 'current', 'upcoming'])
  })
})

describe('demo agent', () => {
  it('answers the tenant suggested prompts with distinct, data-backed intents', () => {
    const intents = [
      'When is my next rent payment?',
      'How does my deposit get released?',
      'Summarize my lease.',
      'Help me respond to a claim.',
    ].map((q) => answer(q, snap('tenant')).intent)
    expect(intents).toEqual(['next_payment', 'deposit_release', 'lease_summary', 'claim_response'])
    expect(answer('When is my next rent payment?', snap('tenant')).paragraphs[0]).toContain('€900')
    expect(answer('How does my deposit get released?', snap('tenant')).paragraphs.join(' ')).toContain('€1,800')
  })

  it('answers the landlord suggested prompts with distinct intents', () => {
    const intents = ['Which payments are coming up?', 'Can I open a claim?', 'What evidence should I prepare?', 'Summarize my active leases.'].map(
      (q) => answer(q, snap('landlord')).intent,
    )
    expect(intents).toEqual(['upcoming_payments', 'open_claim', 'evidence', 'summarize_leases'])
    expect(answer('Can I open a claim?', snap('landlord')).action?.type).toBe('prepare_claim')
  })

  it('follows the state: after the November payment, the next one is December', () => {
    const paid = seedPayments.map((p) => (p.id === 'pay-arroios-2026-11' ? { ...p, status: 'simulated' as const } : p))
    expect(answer('When is my next rent payment?', snap('tenant', paid)).paragraphs[0]).toContain('December 2026')
  })

  it('declines unrelated questions honestly', () => {
    expect(answer("What's the weather in Porto?", snap('tenant')).intent).toBe('unknown')
  })
})
