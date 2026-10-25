import { TRUSTLESS_CAPABILITIES } from './capabilities.js'
import { EscrowStateNormalizer } from './normalize.js'
import type { Capabilities, ClaimInput, EscrowBinding, EscrowPlan, EscrowProvider, EscrowState, EscrowTransaction, FundingProof, FundingRequirements, HumanActor, ReleaseInput } from './domain.js'

export class TrustlessWorkAdapter implements EscrowProvider {
  readonly id = 'trustless_work' as const
  readonly rolloutReady = false
  readonly capabilities: Capabilities = TRUSTLESS_CAPABILITIES
  constructor(private readonly readOnChain?: (contractId: string) => Promise<unknown>) {}
  private blocked(): never { throw new Error('Trustless Work is shadow-only: credentials, deployed contract ABI, roles, fee/refund rights and independent funding verification are not approved. No financial transaction was prepared.') }
  async createEscrow(_input: { leaseId: string; actor: HumanActor; terms: Record<string, unknown> }): Promise<EscrowPlan> { return this.blocked() }
  async getEscrow(binding: EscrowBinding): Promise<EscrowState> {
    if (!this.readOnChain) throw new Error('Trustless Work server reader is not configured.')
    return new EscrowStateNormalizer().trustlessWork(binding, await this.readOnChain(binding.contractId))
  }
  async prepareFunding(_binding: EscrowBinding, _input: { payer: string; acceptYield: boolean }): Promise<FundingRequirements> { return this.blocked() }
  async verifyFunding(_binding: EscrowBinding): Promise<FundingProof | null> { return null }
  getReleaseCapabilities(_binding: EscrowBinding) { return this.capabilities }
  async prepareClaim(_binding: EscrowBinding, _input: ClaimInput): Promise<EscrowPlan> { return this.blocked() }
  async prepareRelease(_binding: EscrowBinding, _input: ReleaseInput): Promise<EscrowPlan> { return this.blocked() }
  async getTransactionHistory(_binding: EscrowBinding): Promise<EscrowTransaction[]> { throw new Error('No verified provider history adapter is configured; an empty history would be misleading.') }
}
