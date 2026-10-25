import type { EscrowBinding } from '@escrow/domain'
import type { EscrowProviderRegistry } from '@escrow/registry'
import { FundingEngine } from '../stellar/funding/engine'
import type { Attempt, AttemptStore, FundingPorts } from '../stellar/funding/domain'

/** Provider-specific funding is downstream of the same exact-output swap engine.
 * No provider selection, signing or fund movement is performed implicitly here.
 */
export function createProviderFundingEngine(initial: EscrowBinding | (() => Promise<EscrowBinding>), registry: EscrowProviderRegistry, ports: FundingPorts, attempts: AttemptStore) {
  let binding: EscrowBinding | null = typeof initial === 'function' ? null : initial
  const selected = () => { if (!binding) throw new Error('Provider must be resolved before funding.'); return binding }
  const provider = () => registry.providerFor(selected())
  const resolve = async () => {
    if (!binding) binding = await (initial as () => Promise<EscrowBinding>)()
    if ((ports.scope.provider ?? 'leasevault') !== binding.provider || ports.scope.vault !== binding.contractId || ports.scope.network !== binding.network || ports.scope.token !== binding.asset.contractId) throw new Error('Funding ports do not match the selected escrow provider/network/asset.')
    provider()
    const previous = attempts.load(ports.scope)
    if (previous && (previous.swap || previous.fund)) registry.lockForFunding(binding.leaseId, BigInt(previous.required))
    return binding
  }
  const persist = (attempt: Attempt) => {
    const current = registry.get(selected().leaseId)
    if (!current) throw new Error('Escrow binding lost; recover the original payment before continuing.')
    const refs = [...current.transactions]
    for (const kind of ['swap', 'fund'] as const) {
      const tx = attempt[kind]
      if (tx) {
        const status = kind === 'swap' ? attempt.stage === 'swap-failed' ? 'failed' : attempt.stage === 'swap-pending' ? 'pending' : 'confirmed' : attempt.stage === 'funded' ? 'confirmed' : attempt.stage === 'fund-failed' ? 'failed' : 'pending'
        const old = refs.find(ref => ref.hash === tx.hash)
        if (!old) refs.push({ hash: tx.hash, kind, status })
        else if (old.status !== 'confirmed') old.status = status
      }
    }
    registry.store.update({ ...current, recovery: attempt.stage === 'funded' ? current.verifiedFundedAmount ? 'none' : 'required' : attempt.swap && attempt.stage !== 'swap-failed' ? 'required' : 'pending', transactions: refs })
  }
  return new FundingEngine({
    ...ports,
    checkNetwork: async () => { await ports.checkNetwork(); await resolve() },
    requirements: async acceptYield => {
      const b = await resolve()
      const requirement = await provider().prepareFunding(registry.get(b.leaseId)!, { payer: ports.scope.payer, acceptYield })
      if (requirement.asset.contractId !== b.asset.contractId || requirement.asset.issuer !== b.asset.issuer || requirement.asset.decimals !== 7) throw new Error('Selected escrow accepted asset mismatch.')
      return { amount: requirement.amount, revision: requirement.revision }
    },
    beforeStart: quote => { registry.lockForFunding(selected().leaseId, quote.required) },
    persistAttempt: persist,
    verify: async attempt => {
      if (!await ports.verify(attempt)) return false
      const b = selected()
      const proof = ports.fundingProof ? await ports.fundingProof(attempt) : await provider().verifyFunding(registry.get(b.leaseId)!)
      if (!proof) return false
      registry.reconcile(b.leaseId, proof)
      return true
    },
  }, attempts)
}
