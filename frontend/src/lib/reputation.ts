export const reviewCategories = {
  tenant: ['Communication', 'Property accuracy', 'Maintenance responsiveness', 'Deposit handling', 'Overall experience'],
  landlord: ['Communication', 'Respect for the property', 'Lease obligations', 'Overall experience'],
} as const
export const ratingLabels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']
export interface RentalEvidence {
  id: string; tenantId: string; landlordId: string; source: 'demo' | 'backend'
  status: 'active' | 'completed'; completedAt?: string; completionVerified: boolean
  provider: 'backend' | 'leasevault' | 'trustless_work'; reference?: string
  escrowState?: 'funded' | 'active' | 'settled'; escrowConfirmed?: boolean
  reviewOpensAt?: string; reviewClosesAt?: string
}
export interface ReviewRecord {
  id: string; leaseId: string; reviewerId: string; revieweeId: string; direction: 'tenant' | 'landlord'; reviewerRole?: 'tenant' | 'landlord'; revieweeRole?: 'tenant' | 'landlord'; reported?: boolean
  ratings: number[]; rating: number; text: string; submittedAt: string; publishedAt: string | null
  eligibility: 'verified' | 'demo'; moderation: 'clear' | 'pending' | 'removed'; response?: string
}
export interface ReputationView {
  mode: 'demo' | 'live'; leases: { id: string; revieweeId: string; revieweeRole: 'tenant' | 'landlord'; state: string; reason: string; verified: boolean; closesAt?: string; ownReview?: ReviewRecord }[]
  reviews: ReviewRecord[]; total: number; page: number
  summary: { count: number; verifiedRentals: number; average: number | null; distribution: number[]; categories: (number | null)[]; pending: number }
}
// Only trusted server-side adapters may supply this evidence. Funding is never completion.
export function reviewEligibility(lease: RentalEvidence, user: { id: string; role: string }, now: number, demo = false) {
  const reject = (reason: string) => ({ allowed: false, verified: false, reason })
  if (!['tenant', 'landlord'].includes(user.role) || (user.role === 'tenant' ? lease.tenantId : lease.landlordId) !== user.id) return reject('You are not a participant in this rental.')
  if (!lease.tenantId || !lease.landlordId || lease.tenantId === lease.landlordId) return reject('Two distinct verified participants are required.')
  if (lease.status !== 'completed' || !lease.completedAt || !Number.isFinite(Date.parse(lease.completedAt)) || Date.parse(lease.completedAt) > now) return reject('A completed rental relationship is required.')
  if (lease.source === 'demo' && !demo) return reject('Fictional records cannot verify a rental.')
  if (!lease.completionVerified) return reject('Trusted rental completion evidence is missing.')
  if (lease.provider !== 'backend' && (!lease.escrowConfirmed || lease.escrowState !== 'settled' || !lease.reference)) return reject('Confirmed final escrow evidence is missing. Funding alone is insufficient.')
  const opens = Date.parse(lease.reviewOpensAt ?? '')
  const closes = Date.parse(lease.reviewClosesAt ?? '')
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || opens < Date.parse(lease.completedAt) || closes <= opens) return reject('No valid review window has been configured for this lease.')
  if (now < opens) return reject('The review window has not opened.')
  if (now >= closes) return reject('Review window expired.')
  return { allowed: true, verified: lease.source !== 'demo', reason: lease.source === 'demo' ? 'Fictional completed rental. Demo submission only.' : 'Rental completion verified by the configured backend adapter.' }
}
export function sensitiveReviewText(text: string) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d ()-]{7,}\d)|\b(?:G[A-Z2-7]{55}|S[A-Z2-7]{55}|[A-Z]{2}\d{2}[A-Z0-9 ]{10,})\b|\b(?:rua|avenida|street|road)\b.{0,45}\d|https?:\/\//i.test(text)
}
// Conservative local assistance preserves all claims and ratings; it is not a model rewrite.
export function reviewWritingHelp(text: string, language: 'en' | 'fr' | 'pt') {
  const tips = {
    en: 'Describe what you personally observed, include relevant dates, and separate facts from assumptions. Remove names, contact details, exact addresses and private evidence.',
    fr: 'Décrivez vos observations personnelles, précisez les dates utiles et distinguez les faits des suppositions. Retirez noms, coordonnées, adresses exactes et preuves privées.',
    pt: 'Descreva o que observou pessoalmente, inclua datas relevantes e separe factos de suposições. Remova nomes, contactos, moradas exatas e provas privadas.',
  }
  return { mode: 'demo' as const, suggestion: text.trim().replace(/[ \t]+/g, ' '), sensitive: sensitiveReviewText(text), guidance: tips[language] }
}
