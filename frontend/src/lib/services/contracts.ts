import type { AgentReply, Lease, Role, Transaction } from '../types'
export interface RentalService { getLeases(): Promise<Lease[]>; getTransactions(): Promise<Transaction[]> }
export interface AssistantService { reply(question: string, role: Role): Promise<AgentReply> }
export interface StellarService {
  network: 'testnet';
  getVerification(leaseId: string): Promise<{ state: 'disconnected' } | { state: 'confirmed'; contractAddress: string; transactionHash: string }>
}
// No write adapter is enabled until a real wallet, backend and contract are configured.
export const stellarService: StellarService = { network: 'testnet', getVerification: async () => ({ state: 'disconnected' }) }
