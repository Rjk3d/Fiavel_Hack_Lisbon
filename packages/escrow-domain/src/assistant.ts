import type { EscrowState } from './domain.js'

/** Read-only projection: no transactions, private evidence or signer is exposed. */
export function escrowAssistantContext(state: EscrowState, address: string) {
  const roles = state.roles
  if (![roles.tenant, roles.landlord, roles.receiver, ...roles.arbitrators, ...roles.approvers, ...roles.releaseSigners].includes(address)) throw new Error('Escrow context is unavailable for this participant.')
  return {
    provider: state.binding.provider, network: state.binding.network, status: state.status,
    heldAmount: state.heldAmount, token: state.binding.asset.contractId, decimals: state.binding.asset.decimals,
    fundedVerified: state.fundedVerified && state.provenance === 'rpc', provenance: state.provenance,
    capabilities: Object.entries(state.binding.capabilities).map(([name, cap]) => ({ name, level: cap.level, limitation: cap.reason })),
    limitations: state.limitations,
    financialAuthority: 'none' as const,
  }
}
export function explainEscrow(state: EscrowState, language: 'en' | 'fr' = 'en'): string[] {
  const fr = language === 'fr'
  const provider = state.binding.provider === 'leasevault' ? 'LeaseVault' : 'Trustless Work'
  return fr ? [
    `Ce bail reste lié à ${provider}. État rapporté : ${state.reportedStatus}. Un changement de configuration ne déplace aucun dépôt.`,
    state.fundedVerified && state.provenance === 'rpc' ? 'Le financement dispose d’une preuve RPC associée.' : 'Aucune preuve indépendante de financement n’est associée ici ; je ne peux pas annoncer une confirmation.',
    state.binding.capabilities.exactNetSplit.reason,
    'Je peux préparer des explications ou un brouillon. Seul un humain autorisé peut signer ; aucun fonds ne sera déplacé par cette réponse.',
  ] : [
    `This lease stays bound to ${provider}. Reported state: ${state.reportedStatus}. A configuration change never moves an existing deposit.`,
    state.fundedVerified && state.provenance === 'rpc' ? 'Funding has a linked RPC proof.' : 'There is no linked independent funding proof here; I cannot announce a confirmation.',
    state.binding.capabilities.exactNetSplit.reason,
    'I can explain or prepare a draft. Only an authorized human can sign; this reply does not move funds.',
  ]
}
