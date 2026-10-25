import { tenant, landlord, leases, transactions, scenarioDate } from '../src/lib/demo-data.ts'
import { buildContext } from '../src/lib/ai/context.ts'
export { tenant, landlord, leases, transactions }
export const snapshot = () => ({ leases, payments: transactions, claims: [], evidence: [], simulatedPaymentIds: [], asOf: scenarioDate, source: 'demo' })
export const context = (user = tenant, id, patch = {}) => buildContext(user, { ...snapshot(), ...patch }, id)
export const request = (question, patch = {}) => ({ question, context: context(), history: [], language: 'en', ...patch })
