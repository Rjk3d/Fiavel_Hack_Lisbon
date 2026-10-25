import type { Capabilities, Capability, EscrowProvider, ProviderMode } from './domain.js'

const evidence = (level: 'verified' | 'documented' | 'unsupported' | 'unverified', reason: string, source: string) => ({ level, reason, evidence: source })
const lv = 'contracts/lease_vault/src/lib.rs'
const tw = 'https://docs.trustlesswork.com/trustless-work/v2-en/introduction/technology-overview/escrow-lifecycle/dispute-resolution.md'
export const LEASEVAULT_CAPABILITIES: Capabilities = {
  fund: evidence('verified', 'First rent + deposit + accepted yield buffer, not deposit only.', lv),
  fullRefund: evidence('verified', 'Only under contract rules: no move-in or after settlement of unpaid rent; not an arbitrary cancellation.', lv),
  fullRelease: evidence('unsupported', 'Landlord cannot freely withdraw the whole guarantee.', lv),
  exactNetSplit: evidence('verified', 'Bounded arbiter resolution; undisputed money is refunded when the claim is opened. Unpaid rent/yield must be accounted for separately.', lv),
  claimDeadlines: evidence('verified', 'Claim, response and arbitration windows are enforced by the contract.', lv),
  unpaidRent: evidence('verified', 'Unpaid rent is settled before deposit refunds.', lv),
  blend: evidence('verified', 'Existing dual-consent yield rules.', lv),
  milestones: evidence('unsupported', 'Rental state machine, not a generic milestone protocol.', lv),
  partialFunding: evidence('unsupported', 'fund takes the entire required amount atomically.', lv),
  guarantor: evidence('unsupported', 'The funding signer becomes the tenant/refund recipient.', lv),
  cancel: evidence('unsupported', 'Only the specific refund_no_keys path is implemented.', lv),
}
export const TRUSTLESS_CAPABILITIES: Capabilities = {
  fund: evidence('documented', 'V2 builds unsigned funding XDR; deployment/asset/roles not verified for Fiável.', tw),
  fullRefund: evidence('unverified', 'Distribution/refund rights and net amount require a verified deployment and fees.', tw),
  fullRelease: evidence('documented', 'Milestone approval and release signer gates, with fees.', tw),
  exactNetSplit: evidence('unsupported', '0.30% protocol fee prevents a net 150 + 1650 payout from exactly 1800 funded.', tw),
  claimDeadlines: evidence('unverified', 'No verified equivalent of Fiável rental deadlines, silence defaults or unpaid-rent priority.', tw),
  unpaidRent: evidence('unsupported', 'No verified Fiável unpaid-rent adapter.', tw),
  blend: evidence('unsupported', 'No verified Blend integration.', tw),
  milestones: evidence('documented', 'Single/multi release; plural roles and threshold approvals in V2.', tw),
  partialFunding: evidence('documented', 'Funding amount is a parameter; production behavior still needs deployment tests.', tw),
  guarantor: evidence('unverified', 'Funding signer is distinct from receiver, but Fiável guarantor/refund rights are not validated.', tw),
  cancel: evidence('unverified', 'No general rental cancellation mapping has been verified.', tw),
}
export function parseProviderMode(value: string | undefined): ProviderMode {
  if (value === undefined || value === '') return 'leasevault'
  if (!['leasevault', 'trustless_work', 'hybrid'].includes(value)) throw new Error('Invalid ESCROW_PROVIDER_MODE.')
  return value as ProviderMode
}
export interface Selection { provider: EscrowProvider | null; reasons: string[] }
export class EscrowCapabilityResolver {
  select(mode: ProviderMode, required: Capability[], providers: EscrowProvider[]): Selection {
    const candidates = mode === 'leasevault' ? ['leasevault'] : mode === 'trustless_work' ? ['trustless_work'] : ['trustless_work', 'leasevault']
    const reasons: string[] = []
    for (const id of candidates) {
      const provider = providers.find(p => p.id === id)
      if (!provider || !provider.rolloutReady) { reasons.push(`${id}: deployment/session/asset verification is not ready.`); continue }
      const missing = required.filter(cap => provider.capabilities[cap].level !== 'verified')
      if (missing.length) { reasons.push(`${id}: ${missing.map(cap => provider.capabilities[cap].reason).join(' ')}`); continue }
      return { provider, reasons }
    }
    return { provider: null, reasons }
  }
}
export const RENTAL_REQUIREMENTS: Capability[] = ['fund', 'fullRefund', 'exactNetSplit', 'claimDeadlines', 'unpaidRent']
export function resolutionNet(gross: bigint, allocations: bigint[], protocolBps = 30n, platformBps = 0n) {
  if (gross <= 0n || allocations.some(a => a < 0n) || allocations.reduce((s, a) => s + a, 0n) !== gross || protocolBps < 0n || platformBps < 0n || protocolBps + platformBps >= 10000n) throw new Error('Invalid distribution or fee configuration.')
  const fees = gross * (protocolBps + platformBps) / 10000n
  // Economic compatibility check only. No claim that this reproduces every
  // deployed contract's rounding; exact-net rentals reject nonzero fees entirely.
  return { fees, net: allocations.map(amount => amount - amount * fees / gross), exactNet: protocolBps + platformBps === 0n }
}
