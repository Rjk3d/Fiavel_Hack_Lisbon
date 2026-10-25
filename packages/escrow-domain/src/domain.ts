// Shared application model. No wallet, secret, signing or submission capability.
export type ProviderId = 'leasevault' | 'trustless_work'
export type ProviderMode = 'leasevault' | 'trustless_work' | 'hybrid'
export type EvidenceLevel = 'verified' | 'documented' | 'unsupported' | 'unverified'
export type Capability = 'fund' | 'fullRefund' | 'fullRelease' | 'exactNetSplit' | 'claimDeadlines' | 'unpaidRent' | 'blend' | 'milestones' | 'partialFunding' | 'guarantor' | 'cancel'
export interface CapabilityEvidence { level: EvidenceLevel; reason: string; evidence: string }
export type Capabilities = Record<Capability, CapabilityEvidence>
export interface EscrowAsset { contractId: string; code: string; issuer: string; decimals: 7 }
export interface EscrowBinding {
  version: 1; leaseId: string; provider: ProviderId; providerEscrowId: string; contractId: string
  network: string; asset: EscrowAsset; expectedDeposit: string; requiredFunding: string | null
  verifiedFundedAmount: string | null; status: EscrowStatus; capabilities: Capabilities
  locked: boolean; recovery: 'none' | 'pending' | 'required'; transactions: EscrowTransaction[]
}
export type EscrowStatus = 'created' | 'partially_funded' | 'funded' | 'active' | 'disputed' | 'settled' | 'refunded' | 'unknown'
export interface EscrowTransaction { hash: string; kind: 'create' | 'swap' | 'fund' | 'claim' | 'release' | 'refund'; status: 'pending' | 'confirmed' | 'failed' }
export interface EscrowState {
  binding: EscrowBinding; status: EscrowStatus; heldAmount: string | null
  provenance: 'rpc' | 'provider-api' | 'unverified'; fundedVerified: boolean
  roles: { tenant?: string; landlord?: string; receiver?: string; arbitrators: string[]; approvers: string[]; releaseSigners: string[] }
  reportedStatus: string; limitations: string[]
}
export interface FundingRequirements { amount: bigint; revision: string; asset: EscrowAsset }
export interface FundingProof {
  source: 'rpc'; contractId: string; network: string; token: string; amount: string
  transactionHash: string; ledger: number; successful: boolean
}
export interface HumanActor { kind: 'human' | 'assistant'; address: string; role: 'tenant' | 'landlord' | 'arbiter' }
export interface EscrowPlan {
  provider: ProviderId; leaseId: string; action: string; signer: string
  requiresHumanSignature: true; unsignedXdr?: string; args: Record<string, unknown>; explanation: string
}
export interface ReleaseInput { actor: HumanActor; kind: 'refund' | 'release' | 'resolve'; allocations?: { address: string; amount: string }[] }
export interface ClaimInput { actor: HumanActor; amount: string; evidenceHash?: Uint8Array }
export interface EscrowProvider {
  readonly id: ProviderId
  readonly capabilities: Capabilities
  readonly rolloutReady: boolean
  createEscrow(input: { leaseId: string; actor: HumanActor; terms: Record<string, unknown> }): Promise<EscrowPlan>
  getEscrow(binding: EscrowBinding): Promise<EscrowState>
  prepareFunding(binding: EscrowBinding, input: { payer: string; acceptYield: boolean }): Promise<FundingRequirements>
  verifyFunding(binding: EscrowBinding): Promise<FundingProof | null>
  getReleaseCapabilities(binding: EscrowBinding): Capabilities
  prepareClaim(binding: EscrowBinding, input: ClaimInput): Promise<EscrowPlan>
  prepareRelease(binding: EscrowBinding, input: ReleaseInput): Promise<EscrowPlan>
  getTransactionHistory(binding: EscrowBinding): Promise<EscrowTransaction[]>
}
export interface BindingStore { get(id: string): EscrowBinding | null; insert(binding: EscrowBinding): void; update(binding: EscrowBinding): void }
export function integerAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Expected canonical non-negative integer token units.')
  return BigInt(value)
}
export const bindingIdentity = (b: EscrowBinding) => [b.leaseId, b.provider, b.providerEscrowId, b.contractId, b.network, b.asset.contractId, b.asset.code, b.asset.issuer, b.asset.decimals, b.expectedDeposit].join('|')
export function requireHuman(actor: HumanActor) {
  if (actor.kind !== 'human') throw new Error('An assistant cannot authorize financial actions. Human review and wallet signature are required.')
}
