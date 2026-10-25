import type { EscrowBinding, EscrowState } from './domain.js'

export function legacyStatus(tag: string): EscrowState['status'] {
  const statuses: Record<string, EscrowState['status']> = { Created: 'created', Funded: 'funded', Active: 'active', Ended: 'active', Claimed: 'disputed', Disputed: 'disputed', Closed: 'settled', Refunded: 'refunded' }
  return statuses[tag] ?? 'unknown'
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider response.')
  return value as Record<string, unknown>
}
function decimalUnits(value: unknown): string {
  // V2 prose says decimal strings; its live Swagger still says number.
  // Safe integers are exact. Fractional JSON numbers are refused rather than
  // silently rounding a financial amount received from an evolving beta API.
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Provider amount requires an exact decimal string.')
    return (BigInt(value) * 10000000n).toString()
  }
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,7})?$/.test(value)) throw new Error('Invalid provider decimal amount.')
  const [whole, fraction = ''] = value.split('.')
  return (BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, '0'))).toString()
}
export class EscrowStateNormalizer {
  trustlessWork(binding: EscrowBinding, payload: unknown): EscrowState {
    const raw = object(payload); const trustline = object(raw.trustline); const roles = object(raw.roles); const dispute = object(raw.dispute)
    if (binding.provider !== 'trustless_work' || raw.contractId !== binding.contractId || raw.type !== 'single-release' || trustline.contractId !== binding.asset.contractId || typeof raw.released !== 'boolean' || typeof dispute.isDisputed !== 'boolean' || typeof dispute.resolved !== 'boolean') throw new Error('Provider contract, type, asset or lifecycle mismatch.')
    for (const field of ['approvers', 'releaseSigners', 'disputeResolvers', 'serviceProviders']) {
      if (!Array.isArray(roles[field]) || !(roles[field] as unknown[]).every(value => typeof value === 'string')) throw new Error('Invalid provider roles.')
    }
    if (typeof roles.receiver !== 'string') throw new Error('Invalid provider receiver.')
    const amount = decimalUnits(raw.amount); const balance = decimalUnits(raw.balance)
    if (amount !== binding.requiredFunding) throw new Error('Provider target amount differs from the selected escrow.')
    const reportedStatus = raw.released || dispute.resolved ? 'settled' : dispute.isDisputed ? 'disputed' : BigInt(balance) >= BigInt(amount) ? 'funded' : BigInt(balance) > 0n ? 'partially_funded' : 'created'
    return {
      binding, status: reportedStatus, reportedStatus, heldAmount: balance, provenance: 'provider-api', fundedVerified: false,
      roles: { receiver: roles.receiver, arbitrators: roles.disputeResolvers as string[], approvers: roles.approvers as string[], releaseSigners: roles.releaseSigners as string[] },
      limitations: ['Provider API response is not independent Fiável RPC verification.', 'No rental deadline, net-refund or guarantor rights are inferred from milestone status.'],
    }
  }
}
