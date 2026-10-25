import { bindingIdentity, integerAmount, type BindingStore, type Capability, type EscrowBinding, type EscrowProvider, type FundingProof, type ProviderMode } from './domain.js'
import { EscrowCapabilityResolver } from './capabilities.js'

export class EscrowProviderRegistry {
  constructor(readonly store: BindingStore, readonly providers: EscrowProvider[]) {}
  get(id: string) { return this.store.get(id) }
  providerFor(binding: EscrowBinding) {
    const stored = this.store.get(binding.leaseId)
    if (!stored || bindingIdentity(stored) !== bindingIdentity(binding)) throw new Error('Escrow provider binding mismatch. No automatic migration is allowed.')
    const provider = this.providers.find(item => item.id === stored.provider)
    if (!provider) throw new Error('The original escrow provider is unavailable. Do not fund another provider.')
    return provider
  }
  bind(binding: EscrowBinding): EscrowBinding {
    integerAmount(binding.expectedDeposit); if (binding.requiredFunding !== null) integerAmount(binding.requiredFunding)
    const existing = this.get(binding.leaseId)
    if (existing) {
      if (bindingIdentity(existing) !== bindingIdentity(binding)) throw new Error('This lease already has an immutable escrow provider. Funds cannot be migrated by editing records.')
      return existing
    }
    this.store.insert(binding)
    return binding
  }
  selectNew(mode: ProviderMode, requirements: Capability[], candidates: Partial<Record<EscrowProvider['id'], EscrowBinding>>, leaseId: string) {
    const existing = this.get(leaseId)
    if (existing) return existing // rollout flags never reassign an existing lease
    const selected = new EscrowCapabilityResolver().select(mode, requirements, this.providers)
    if (!selected.provider) throw new Error(selected.reasons.join(' '))
    const binding = candidates[selected.provider.id]
    if (!binding || binding.leaseId !== leaseId || binding.provider !== selected.provider.id) throw new Error('A verified deployed provider escrow reference is required before funding.')
    return this.bind(binding)
  }
  lockForFunding(id: string, amount: bigint) {
    const b = this.get(id)
    if (!b) throw new Error('Provider must be selected and persisted before any payment.')
    if (amount <= 0n || b.locked && b.requiredFunding !== null && b.requiredFunding !== amount.toString()) throw new Error('The existing funding amount cannot be replaced. Recover the original attempt.')
    const next = { ...b, locked: true, requiredFunding: amount.toString(), recovery: b.locked ? b.recovery : 'pending' as const }
    this.store.update(next); return next
  }
  reconcile(id: string, proof: FundingProof) {
    const b = this.get(id)
    if (!b || proof.source !== 'rpc' || !proof.successful || proof.network !== b.network || proof.contractId !== b.contractId || proof.token !== b.asset.contractId || integerAmount(proof.amount) <= 0n || b.requiredFunding !== null && integerAmount(proof.amount) !== integerAmount(b.requiredFunding) || !/^[a-f0-9]{64}$/.test(proof.transactionHash) || !Number.isSafeInteger(proof.ledger) || proof.ledger <= 0) throw new Error('Independent matching on-chain funding proof required.')
    const next: EscrowBinding = { ...b, requiredFunding: b.requiredFunding ?? proof.amount, locked: true, verifiedFundedAmount: proof.amount, status: 'funded', recovery: 'none', transactions: [...b.transactions.filter(tx => tx.hash !== proof.transactionHash), { hash: proof.transactionHash, kind: 'fund', status: 'confirmed' }] }
    this.store.update(next); return next
  }
  assertLegacy(id: string) {
    const binding = this.get(id)
    if (binding && binding.provider !== 'leasevault') throw new Error('This lease belongs to a different provider. LeaseVault actions are blocked.')
  }
}

export function guardedStore(storage: Pick<Storage, 'getItem' | 'setItem'>, namespace = 'fiavel.escrows.v1'): BindingStore {
  const key = (id: string) => `${namespace}:${id}`
  const get = (id: string): EscrowBinding | null => {
    const text = storage.getItem(key(id)); if (!text) return null
    const b = JSON.parse(text) as EscrowBinding
    if (b.version !== 1 || b.leaseId !== id || !['leasevault', 'trustless_work'].includes(b.provider) || !b.asset || b.asset.decimals !== 7 || !Array.isArray(b.transactions)) throw new Error('Invalid saved escrow binding; funding is blocked.')
    integerAmount(b.expectedDeposit); if (b.requiredFunding !== null) integerAmount(b.requiredFunding)
    return b
  }
  return {
    get,
    insert(binding) { if (get(binding.leaseId)) throw new Error('Escrow binding already exists.'); storage.setItem(key(binding.leaseId), JSON.stringify(binding)) },
    update(binding) {
      const old = get(binding.leaseId)
      if (!old || bindingIdentity(old) !== bindingIdentity(binding) || old.locked && (!binding.locked || old.requiredFunding !== null && old.requiredFunding !== binding.requiredFunding)) throw new Error('Immutable escrow identity/funding lock violation.')
      storage.setItem(key(binding.leaseId), JSON.stringify(binding))
    },
  }
}
