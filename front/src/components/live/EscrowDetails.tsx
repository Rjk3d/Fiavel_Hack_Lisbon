import type { EscrowState } from '@escrow/domain'
import { explorerContract } from '../../stellar/config'
import { usdc } from '../../stellar/format'
import { FactRows } from '../ui/misc'
import { Pill } from '../ui/Pill'

export function EscrowDetails({ state }: { state: EscrowState }) {
  const binding = state.binding
  return <details className="mt-4 rounded-2xl border border-line p-4"><summary className="cursor-pointer text-[13px] font-semibold text-brand">Deposit protection & technical details</summary><div className="mt-3 space-y-3 text-[13px]">
    <Pill tone={state.fundedVerified && state.provenance === 'rpc' ? 'success' : 'neutral'}>{state.fundedVerified && state.provenance === 'rpc' ? 'Funding verified by RPC' : 'Funding proof not linked'}</Pill>
    <FactRows rows={[{ label: 'Escrow provider', value: binding.provider === 'leasevault' ? 'LeaseVault' : 'Trustless Work · shadow integration' }, { label: 'Provider state', value: state.reportedStatus }, { label: 'Deposit specified', value: usdc(BigInt(binding.expectedDeposit)) }, { label: 'Verified funding amount', value: binding.verifiedFundedAmount ? usdc(BigInt(binding.verifiedFundedAmount)) : 'Unavailable · no inferred confirmation' }, { label: 'Asset', value: `${binding.asset.code} · configured issuer` }]}/>
    <a className="block break-all font-mono text-[11px] text-brand" href={explorerContract(binding.contractId)} target="_blank" rel="noreferrer">{binding.contractId}</a>
    <ul className="space-y-2 text-ink-muted">{([{ id: 'fullRefund', label: 'Refund conditions' }, { id: 'exactNetSplit', label: 'Partial claim allocation' }, { id: 'claimDeadlines', label: 'Claim deadlines' }, { id: 'guarantor', label: 'Separate guarantor' }] as const).map(cap => <li key={cap.id}><strong className="text-ink">{cap.label} · {binding.capabilities[cap.id].level}</strong><p>{binding.capabilities[cap.id].reason}</p></li>)}</ul>
    <p className="text-ink-muted">One selected provider. Funds are never moved between providers by changing a record or rollout flag.</p>
  </div></details>
}
