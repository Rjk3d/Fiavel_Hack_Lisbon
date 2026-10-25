import type { Lease, Transaction } from '../types'
import type { ContextualAssistant } from '../ai/reply'
export interface RentalService { getLeases(): Promise<Lease[]>; getTransactions(): Promise<Transaction[]> }
export type AssistantService = ContextualAssistant
export interface StellarService {
  network: 'testnet';
  getVerification(leaseId: string): Promise<{ state: 'disconnected' } | { state: 'confirmed'; contractAddress: string; transactionHash: string }>
}
// No write adapter is enabled until a real wallet, backend and contract are configured.
export const stellarService: StellarService = { network: 'testnet', getVerification: async () => ({ state: 'disconnected' }) }
