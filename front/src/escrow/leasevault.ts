import { Buffer } from 'buffer'
import type { Snapshot } from '@agents/rules'
import { checkAction } from '@agents/guards'
import { requireHuman, integerAmount, type Capabilities, type ClaimInput, type EscrowBinding, type EscrowPlan, type EscrowProvider, type EscrowState, type EscrowTransaction, type FundingProof, type HumanActor, type ReleaseInput } from '@escrow/domain'
import { LEASEVAULT_CAPABILITIES } from '@escrow/capabilities'
import { legacyStatus } from '@escrow/normalize'
import { totalFor, assertCanFund } from '../stellar/funding/domain'

interface LeaseVaultReads {
  snapshot(id: bigint): Promise<Snapshot>
  history?(id: bigint): Promise<EscrowTransaction[]>
  fundingProof?(binding: EscrowBinding): Promise<FundingProof | null>
}
export class LeaseVaultAdapter implements EscrowProvider {
  readonly id = 'leasevault' as const
  readonly rolloutReady = true
  readonly capabilities: Capabilities = LEASEVAULT_CAPABILITIES
  constructor(readonly reads: LeaseVaultReads) {}
  private idOf(binding: EscrowBinding) {
    if (binding.provider !== this.id || !/^\d+$/.test(binding.providerEscrowId)) throw new Error('Not a LeaseVault escrow reference.')
    return BigInt(binding.providerEscrowId)
  }
  async createEscrow(input: { leaseId: string; actor: HumanActor; terms: Record<string, unknown> }): Promise<EscrowPlan> {
    requireHuman(input.actor)
    if (input.actor.role !== 'landlord') throw new Error('Only the landlord prepares a LeaseVault offer.')
    return { provider: this.id, leaseId: input.leaseId, action: 'create_lease', signer: input.actor.address, requiresHumanSignature: true, args: { landlord: input.actor.address, terms: input.terms }, explanation: 'Unsigned preparation only; the existing contract validates all lease terms.' }
  }
  async getEscrow(binding: EscrowBinding): Promise<EscrowState> {
    const snap = await this.reads.snapshot(this.idOf(binding)); const lease = snap.lease
    const proof = await this.verifyFunding(binding)
    const verified = !!proof && proof.source === 'rpc' && proof.successful && proof.contractId === binding.contractId && proof.token === binding.asset.contractId && proof.network === binding.network && proof.ledger > 0
    return { binding: { ...binding, verifiedFundedAmount: verified ? proof.amount : null }, status: legacyStatus(lease.status.tag), reportedStatus: lease.status.tag, heldAmount: snap.guaranteeValue.toString(), provenance: 'rpc', fundedVerified: verified, roles: { tenant: lease.tenant, landlord: lease.landlord, arbitrators: [lease.terms.arbiter], approvers: [], releaseSigners: [] }, limitations: ['Rental deadlines and unpaid-rent priority remain enforced by LeaseVault.', 'A prior funded amount is not inferred from the current remaining guarantee.'] }
  }
  async prepareFunding(binding: EscrowBinding, input: { payer: string; acceptYield: boolean }) {
    const snap = await this.reads.snapshot(this.idOf(binding))
    assertCanFund(snap.lease, input.payer, snap.now)
    return { amount: totalFor(snap.lease, input.acceptYield), revision: snap.lease.created_at.toString(), asset: binding.asset }
  }
  async verifyFunding(binding: EscrowBinding) { return this.reads.fundingProof ? this.reads.fundingProof(binding) : null }
  getReleaseCapabilities(_binding: EscrowBinding) { return this.capabilities }
  private plan(binding: EscrowBinding, actor: HumanActor, action: string, args: Record<string, unknown>, explanation: string): EscrowPlan {
    return { provider: this.id, leaseId: binding.leaseId, action, signer: actor.address, requiresHumanSignature: true, args: { id: this.idOf(binding), ...args }, explanation }
  }
  async prepareClaim(binding: EscrowBinding, input: ClaimInput) {
    requireHuman(input.actor)
    const snap = await this.reads.snapshot(this.idOf(binding))
    if (input.actor.address !== snap.lease.landlord || input.actor.role !== 'landlord') throw new Error('Unauthorized landlord claim.')
    if (!input.evidenceHash || input.evidenceHash.length !== 32) throw new Error('A 32-byte evidence hash is required.')
    const args = { amount: integerAmount(input.amount), evidence: Buffer.from(input.evidenceHash) }
    const guard = checkAction(snap, 'landlord', 'claim_damage', args)
    if (!guard.ok) throw new Error(guard.reason)
    return this.plan(binding, input.actor, 'claim_damage', args, 'Prepared only. Opening the claim refunds the undisputed amount under existing contract rules. No private message is published by this plan.')
  }
  async prepareRelease(binding: EscrowBinding, input: ReleaseInput) {
    requireHuman(input.actor)
    const snap = await this.reads.snapshot(this.idOf(binding)); const lease = snap.lease
    const expected = input.actor.role === 'arbiter' ? lease.terms.arbiter : input.actor.role === 'landlord' ? lease.landlord : lease.tenant
    if (!expected || expected !== input.actor.address) throw new Error('Unauthorized escrow participant.')
    if (input.kind === 'resolve') {
      if (input.actor.role !== 'arbiter' || !snap.claim || !input.allocations) throw new Error('Human arbitrator and an active claim are required.')
      const allocations = input.allocations
      if (new Set(allocations.map(a => a.address)).size !== allocations.length || allocations.some(a => a.address !== lease.landlord && a.address !== lease.tenant) || allocations.reduce((sum, a) => sum + integerAmount(a.amount), 0n) !== snap.claim.amount) throw new Error('Allocations must cover only the remaining disputed amount; prior refunds are separate.')
      const args = { to_landlord: integerAmount(allocations.find(a => a.address === lease.landlord)?.amount ?? '0') }
      const guard = checkAction(snap, 'arbiter', 'resolve', args); if (!guard.ok) throw new Error(guard.reason)
      return this.plan(binding, input.actor, 'resolve', args, 'Arbitrator must review and sign. Prior undisputed refunds and the separate bond are not counted twice.')
    }
    if (input.kind === 'release') throw new Error('A full payout to the landlord is not a generic LeaseVault capability.')
    const fn = lease.status.tag === 'Funded' ? 'refund_no_keys' : 'release'
    const guard = checkAction(snap, input.actor.role, fn); if (!guard.ok) throw new Error(guard.reason)
    return this.plan(binding, input.actor, fn, {}, 'Refund according to contract deadlines and unpaid-rent rules; no unconditional full-refund promise.')
  }
  async getTransactionHistory(binding: EscrowBinding) {
    // Without an event/indexer reader this is only the known local transaction
    // journal, not a promise of complete historical contract activity.
    return this.reads.history ? this.reads.history(this.idOf(binding)) : binding.transactions
  }
}
