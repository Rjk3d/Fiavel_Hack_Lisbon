import { leases, transactions } from './demo-data'
import type { RentalService } from './services/contracts'
// Compatibility exports; the assistant now consumes structured, authorized context.
export { contextualDemo as demoAssistant } from './ai/reply'
export const demoRentalService: RentalService = { getLeases: async () => leases, getTransactions: async () => transactions }
