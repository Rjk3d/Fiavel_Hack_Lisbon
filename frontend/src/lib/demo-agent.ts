import { leases, primaryLease } from './demo-data'
import { date, money } from './formatters'
import type { AssistantService, RentalService } from './services/contracts'
import { transactions } from './demo-data'
export const demoRentalService: RentalService = { getLeases: async () => leases, getTransactions: async () => transactions }
export const demoAssistant: AssistantService = {
  async reply(question, role) {
    const q = question.toLowerCase()
    const suggestions = ['How does my deposit get released?', 'When is my next rent payment?']
    if (/claim|evidence|dispute/.test(q)) return { text: 'There is no submitted claim on the Arroios lease. Prepare a dated description, the amount requested, and evidence such as check-in photos or invoices. A prepared demo claim does not move funds or resolve a dispute. Both parties should review the facts; subjective issues may need human resolution.', suggestions: ['Summarize my lease.', 'How does my deposit get released?'] }
    if (/deposit|release/.test(q)) return { text: `Your ${money(primaryLease.deposit)} deposit is recorded as held in this demo. At lease end, both parties review the property and any claims before an authorized release. No real funds are held here. The exact release deadline must be agreed in the final lease and contract; this prototype does not assume one.`, facts: [{ label: 'Demo deposit', value: money(primaryLease.deposit) }, { label: 'Lease ends', value: date(primaryLease.end) }], suggestions: ['What evidence should I prepare?', 'Summarize my lease.'] }
    if (/pay|rent|coming|due/.test(q)) return { text: role === 'tenant' ? `Your next rent is ${money(primaryLease.rent)}, due ${date(primaryLease.nextRent)}. October rent is recorded in the demo. You can review the November entry on the Payments page; no real payment is enabled.` : `Two rent entries are upcoming on ${date(primaryLease.nextRent)}: Ana’s €900 and Leo’s €1,100. October demo rent records total €2,000. Review the upcoming entries before sending any reminders.`, facts: [{ label: 'Next due date', value: date(primaryLease.nextRent) }, { label: role === 'tenant' ? 'Rent' : 'Monthly total', value: money(role === 'tenant' ? primaryLease.rent : leases.reduce((sum, l) => sum + l.rent, 0)) }], suggestions }
    if (/lease|summari|obligation/.test(q)) return { text: role === 'tenant' ? `Your active demo lease is at ${primaryLease.address}, with Manuel Ferreira. It runs from ${date(primaryLease.start)} to ${date(primaryLease.end)}. Monthly rent is €900 and the deposit is €1,800.` : 'You have two active fictional leases: Ana Costa in Arroios (€900/month, €1,800 deposit) and Leo Martins in Alvalade (€1,100/month, €2,200 deposit). Both end on 31 Aug 2027.', suggestions }
    return { text: 'I can help with the fictional Fiável leases, rent dates, deposits, and preparing claim evidence. I’m a deterministic demo assistant, so I cannot look up external information, provide legal advice, or execute transactions. Try asking about your next payment.', suggestions }
  },
}
