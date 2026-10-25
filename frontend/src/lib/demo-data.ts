import type { Activity, Lease, Transaction, User } from './types'
export const scenarioDate = '2026-10-25'
export const tenant: User = { id: 'ana', name: 'Ana Costa', role: 'tenant', initials: 'AC' }
export const landlord: User = { id: 'manuel', name: 'Manuel Ferreira', role: 'landlord', initials: 'MF' }
export const leases: Lease[] = [
  { id: 'lease-arroios', tenant, landlord, address: 'Rua de Arroios 42, Lisbon, Portugal', district: 'Arroios, Lisbon', rent: 900, deposit: 1800, start: '2026-09-01', end: '2027-08-31', nextRent: '2026-11-01', status: 'Active' },
  { id: 'lease-alvalade', tenant: { id: 'leo', name: 'Leo Martins', role: 'tenant', initials: 'LM' }, landlord, address: 'Rua José Duro 18, Lisbon, Portugal', district: 'Alvalade, Lisbon', rent: 1100, deposit: 2200, start: '2026-09-01', end: '2027-08-31', nextRent: '2026-11-01', status: 'Active' },
]
export const primaryLease = leases[0]!
export const transactions: Transaction[] = leases.flatMap(lease => [
  { id: `${lease.id}-nov`, leaseId: lease.id, amount: lease.rent, date: lease.nextRent, kind: 'rent', status: 'Upcoming', source: 'demo' },
  { id: `${lease.id}-oct`, leaseId: lease.id, amount: lease.rent, date: '2026-10-01', kind: 'rent', status: 'Recorded', source: 'demo' },
  { id: `${lease.id}-deposit`, leaseId: lease.id, amount: lease.deposit, date: '2026-08-28', kind: 'deposit', status: 'Recorded', source: 'demo' },
])
export const activities: Activity[] = [
  { id: 'a1', title: 'Your lease, made clearer', detail: 'Tenant Guardian explained the deposit release process.', date: '2026-10-24', category: 'ai', source: 'demo' },
  { id: 'a2', title: 'October rent recorded', detail: '€900 rent entry for the Arroios lease. No real transfer.', date: '2026-10-01', category: 'payment', source: 'demo' },
  { id: 'a3', title: 'A new chapter begins', detail: 'Arroios lease marked active in the fictional dataset.', date: '2026-09-01', category: 'lease', source: 'demo' },
  { id: 'a4', title: 'Deposit funding recorded', detail: '€1,800 recorded as held in demo data. No on-chain funds.', date: '2026-08-28', category: 'deposit', source: 'demo' },
  { id: 'a5', title: 'Lease created', detail: 'Ana and Manuel’s fictional rental agreement was prepared.', date: '2026-08-25', category: 'lease', source: 'demo' },
]
