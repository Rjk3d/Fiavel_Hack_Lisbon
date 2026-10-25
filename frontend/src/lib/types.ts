export type Role = 'tenant' | 'landlord'
export interface User { id: string; name: string; role: Role; initials: string }
export interface Lease { id: string; tenant: User; landlord: User; address: string; district: string; rent: number; deposit: number; start: string; end: string; nextRent: string; status: 'Draft' | 'Funded' | 'Active' | 'Claim under review' | 'Released' }
export interface Transaction { id: string; leaseId: string; amount: number; date: string; kind: 'rent' | 'deposit'; status: 'Upcoming' | 'Recorded'; source: 'demo' }
export interface Dispute { id: string; leaseId: string; title: string; description: string; evidence: string; amount: number; status: 'Prepared'; source: 'demo' }
export interface Review { id: string; leaseId: string; authorId: string; rating: number; comment: string; source: 'demo' }
export interface Activity { id: string; title: string; detail: string; date: string; category: 'lease' | 'payment' | 'deposit' | 'ai' | 'claim'; source: 'demo' }
export interface AgentReply { text: string; facts?: { label: string; value: string }[]; suggestions: string[] }
