// Structural adapter for the EscrowProviderRegistry in packages/escrow-domain
// (currently present in the separate .funding-integration checkout).
// It consumes the existing registry instead of implementing another provider or RPC client.
export async function loadEscrowRentalEvidence(lease, registry) {
  if (!['leasevault','trustless_work'].includes(lease.provider)) throw new Error('An escrow-backed rental is required.')
  const missing = { ...lease, reference: undefined, escrowConfirmed: false, escrowState: undefined }
  const binding = registry.get(lease.id)
  if (!binding || binding.leaseId !== lease.id || binding.provider !== lease.provider) return missing
  // providerFor validates the immutable stored binding before selecting the reader.
  const provider = registry.providerFor(binding)
  const state = await provider.getEscrow(binding)
  const matches = state.binding.leaseId === binding.leaseId && state.binding.provider === binding.provider && state.binding.contractId === binding.contractId && state.binding.network === binding.network
  // The current Trustless Work normalizer explicitly labels provider-api as NOT
  // independent RPC verification. A reported release or funding proof cannot promote it.
  const confirmed = matches && state.provenance === 'rpc' && state.status === 'settled' && !!binding.contractId && !!binding.network
  return { ...missing, reference: confirmed ? `${binding.network}:${binding.contractId}` : undefined, escrowConfirmed: confirmed, escrowState: confirmed ? 'settled' : undefined }
}
