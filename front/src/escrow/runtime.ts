import type { Snapshot } from '@agents/rules'
import { LEASEVAULT_CAPABILITIES, RENTAL_REQUIREMENTS, EscrowCapabilityResolver, parseProviderMode } from '@escrow/capabilities'
import { EscrowProviderRegistry, guardedStore } from '@escrow/registry'
import { TrustlessWorkAdapter } from '@escrow/trustless-work'
import { legacyStatus } from '@escrow/normalize'
import type { EscrowBinding, EscrowState } from '@escrow/domain'
import { NETWORK } from '../stellar/config'
import { fundingProofFor, snapshotOf } from '../stellar/vault'
import { totalFor } from '../stellar/funding/domain'
import { LeaseVaultAdapter } from './leasevault'

declare const __ESCROW_PROVIDER_MODE__: string
export const ESCROW_MODE = parseProviderMode(typeof __ESCROW_PROVIDER_MODE__ === 'undefined' ? undefined : __ESCROW_PROVIDER_MODE__)
export const internalLeaseId = (id: bigint) => `${NETWORK.passphrase}:${NETWORK.leaseVault}:${id}`
export const escrowAsset = { contractId: NETWORK.usdc, code: NETWORK.usdcCode, issuer: NETWORK.usdcIssuer, decimals: 7 as const }
export function createEscrowRegistry(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  return new EscrowProviderRegistry(guardedStore(storage), [new LeaseVaultAdapter({ snapshot: snapshotOf }), new TrustlessWorkAdapter()])
}
export function legacyBinding(id: bigint, snap: Snapshot): EscrowBinding {
  return { version: 1, leaseId: internalLeaseId(id), provider: 'leasevault', providerEscrowId: id.toString(), contractId: NETWORK.leaseVault, network: NETWORK.passphrase, asset: escrowAsset, expectedDeposit: snap.lease.terms.deposit.toString(), requiredFunding: snap.lease.status.tag === 'Created' ? totalFor(snap.lease, false).toString() : null, verifiedFundedAmount: null, status: legacyStatus(snap.lease.status.tag), capabilities: LEASEVAULT_CAPABILITIES, locked: snap.lease.status.tag !== 'Created', recovery: 'none', transactions: [] }
}
export async function observeLegacyEscrow(id: bigint, snap: Snapshot): Promise<EscrowState> {
  let binding = legacyBinding(id, snap)
  let storageUnavailable = false
  try { binding = createEscrowRegistry().bind(binding) } catch (error) {
    // Read-only chain visibility must survive unavailable storage. Financial
    // entrypoints enforce persistence again and fail closed before signing.
    if (error instanceof Error && /immutable|provider|migrat/i.test(error.message)) throw error
    storageUnavailable = true
  }
  const state = await new LeaseVaultAdapter({ snapshot: async () => snap, fundingProof: b => fundingProofFor(b, snap.lease) }).getEscrow(binding)
  if (storageUnavailable) state.limitations.push('Provider binding could not be persisted; funding remains blocked until storage is available.')
  return state
}
export function newRentalEligibility() {
  return new EscrowCapabilityResolver().select(ESCROW_MODE, RENTAL_REQUIREMENTS, [new LeaseVaultAdapter({ snapshot: snapshotOf }), new TrustlessWorkAdapter()])
}
export function assertLeaseVaultAction(id: bigint) { createEscrowRegistry().assertLegacy(internalLeaseId(id)) }
