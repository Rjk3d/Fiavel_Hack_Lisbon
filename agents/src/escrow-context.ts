import type { EscrowBinding, EscrowProvider } from '../../packages/escrow-domain/src/domain.js'
import { escrowAssistantContext } from '../../packages/escrow-domain/src/assistant.js'

/** Provider-neutral read-only tool. No signer, wallet or submission is exposed. */
export async function getProviderEscrowContext(provider: EscrowProvider, binding: EscrowBinding, participantAddress: string) {
  if (provider.id !== binding.provider) throw new Error('Use the original provider of this lease.')
  return escrowAssistantContext(await provider.getEscrow(binding), participantAddress)
}
