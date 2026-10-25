import { formatDate, formatDateLong, formatEUR, ordinal, relativeDays } from './formatters'
import {
  claimDeadline,
  isSettled,
  leasesFor,
  lifecycle,
  nextPayment,
  paymentsOf,
  propertyOf,
  tenantOf,
  userFor,
  type Snapshot,
} from './lease-logic'
import type { AssistantReply, AssistantService } from './services/assistant'
import type { Lease } from './types'

/**
 * Deterministic demo agent. It matches the question to an intent with simple keyword
 * rules and answers ONLY from the snapshot (seeded demo data + what the user did in the demo).
 * No language model is involved; the UI labels every answer "Demo AI".
 */

type Rule = { intent: string; test: RegExp; answer: (s: Snapshot) => AssistantReply }

export const TENANT_PROMPTS = [
  'When is my next rent payment?',
  'How does my deposit get released?',
  'Summarize my lease.',
  'Help me respond to a claim.',
]

export const LANDLORD_PROMPTS = [
  'Which payments are coming up?',
  'Can I open a claim?',
  'What evidence should I prepare?',
  'Summarize my active leases.',
]

const addr = (l: Lease) => {
  const p = propertyOf(l)
  return `${p.street}, ${p.neighbourhood}`
}

// ---------------------------------------------------------------- tenant
function tenantLease(s: Snapshot) {
  return leasesFor(s)[0]
}

const tenantRules: Rule[] = [
  {
    intent: 'claim_response',
    test: /claim|dispute|deduct|contest|respond/,
    answer: (s) => {
      const l = tenantLease(s)
      const open = s.claims.filter((c) => c.leaseId === l.id)
      return {
        intent: 'claim_response',
        paragraphs: [
          open.length
            ? 'There is a claim draft on your lease. Drafts are not visible to you until the landlord submits them.'
            : "Good news: there is no claim open on your lease. Nothing needs a response right now.",
          `If Manuel opens a claim after you move out, you'll have ${l.responseWindowDays} days to accept it, accept part of it, or contest it. Any amount you don't contest is released straight away; contested amounts go to human mediation, not to an AI decision.`,
        ],
        cards: [
          {
            kind: 'checklist',
            title: 'How I would help you respond',
            items: [
              'Compare each claimed item with your check-in photos from 1 Sep 2026',
              'Separate normal wear and tear from actual damage',
              'Draft a polite reply that accepts, partially accepts or contests each item',
              'You review and send it — I never send anything on your behalf',
            ],
          },
        ],
        suggestions: ['How does my deposit get released?', 'What happens when I move out?'],
      }
    },
  },
  {
    intent: 'deposit_release',
    test: /deposit|release|refund|get .*back|cau[cç][aã]o|protected|held/,
    answer: (s) => {
      const l = tenantLease(s)
      return {
        intent: 'deposit_release',
        paragraphs: [
          `Your deposit of ${formatEUR(l.deposit)} is recorded as held under your lease rules. Neither you nor Manuel can move it alone.`,
          `Your lease ends on ${formatDate(l.endDate)}. After that, Manuel has ${l.claimWindowDays} days to open a claim. If no claim is opened by ${formatDate(claimDeadline(l))}, the full deposit is released back to you automatically under the programmed rule.`,
          'Note: this prototype runs on demo data. No real funds are held on Stellar yet.',
        ],
        cards: [{ kind: 'timeline', title: 'Your deposit lifecycle', steps: lifecycle(l, s.today) }],
        suggestions: ['Help me respond to a claim.', 'Summarize my lease.'],
      }
    },
  },
  {
    intent: 'move_out',
    test: /move out|moving out|leave|leaving|end of (the )?lease|notice|terminat/,
    answer: (s) => {
      const l = tenantLease(s)
      return {
        intent: 'move_out',
        paragraphs: [
          `Your lease runs until ${formatDateLong(l.endDate)}. Before you leave, a move-out inspection compares the apartment with the check-in report.`,
          'Leaving the apartment clean and documented with photos is the best way to get your full deposit back quickly.',
        ],
        cards: [
          {
            kind: 'checklist',
            title: 'Move-out checklist',
            items: [
              'Agree an inspection date with Manuel',
              'Take dated photos of every room',
              'Return all keys and note it in the app',
              'Share your IBAN for the deposit release',
            ],
          },
        ],
        suggestions: ['How does my deposit get released?', 'Help me respond to a claim.'],
      }
    },
  },
  {
    intent: 'pay_now',
    test: /pay (it |my rent )?now|make (a )?payment|pay (my )?rent|pay early/,
    answer: (s) => {
      const l = tenantLease(s)
      const next = nextPayment(s.payments, l.id)
      if (!next) return { intent: 'pay_now', paragraphs: ['You have no payment due right now.'], suggestions: [] }
      return {
        intent: 'pay_now',
        paragraphs: [
          `I've prepared your ${next.period} rent for review. Nothing happens until you confirm.`,
          'In this prototype the payment is simulated: no money is transferred.',
        ],
        action: {
          type: 'simulate_payment',
          paymentId: next.id,
          title: `Pay ${next.period} rent`,
          rows: [
            { label: 'Amount', value: formatEUR(next.amount) },
            { label: 'Due', value: formatDate(next.dueDate) },
            { label: 'To', value: `${userFor('landlord').name} · ${addr(l)}` },
          ],
          condition: `Your lease sets rent at ${formatEUR(l.monthlyRent)}, due on day ${l.rentDueDay} of each month.`,
        },
        suggestions: ['When is my next rent payment?'],
      }
    },
  },
  {
    intent: 'payment_history',
    test: /history|paid so far|past|previous|already paid|receipts?/,
    answer: (s) => {
      const l = tenantLease(s)
      const done = paymentsOf(s.payments, l.id).filter(isSettled)
      return {
        intent: 'payment_history',
        paragraphs: [
          `You've ${done.length === 1 ? 'one recorded payment' : `${done.length} recorded payments`} on this lease, totalling ${formatEUR(done.reduce((t, p) => t + p.amount, 0))}. All of them are demo records.`,
        ],
        cards: [
          {
            kind: 'facts',
            title: 'Recorded payments',
            rows: done.map((p) => ({
              label: p.period,
              value: `${formatEUR(p.amount)} · ${p.status === 'simulated' ? 'simulated' : `paid ${formatDate(p.paidDate!)}`}`,
              tone: p.status === 'simulated' ? 'brand' : 'success',
            })),
          },
        ],
        suggestions: ['When is my next rent payment?'],
      }
    },
  },
  {
    intent: 'next_payment',
    test: /\b(next|due|when|rent|payments?|pay)\b/,
    answer: (s) => {
      const l = tenantLease(s)
      const next = nextPayment(s.payments, l.id)
      if (!next)
        return {
          intent: 'next_payment',
          paragraphs: ['There are no upcoming payments on your lease in the demo data.'],
          suggestions: ['How does my deposit get released?'],
        }
      return {
        intent: 'next_payment',
        paragraphs: [
          `Your next rent payment is ${formatEUR(next.amount)} for ${next.period}, due on ${formatDateLong(next.dueDate)} — ${relativeDays(s.today, next.dueDate)}.`,
          "You're on track: every previous payment on this lease is recorded.",
        ],
        cards: [
          {
            kind: 'facts',
            title: 'Next payment',
            rows: [
              { label: 'Period', value: next.period },
              { label: 'Amount', value: formatEUR(next.amount) },
              { label: 'Due date', value: formatDate(next.dueDate) },
              { label: 'Status', value: next.status === 'upcoming' ? 'Upcoming' : 'Scheduled', tone: 'warning' },
            ],
          },
        ],
        suggestions: ['Pay my rent now', 'Show my payment history', 'How does my deposit get released?'],
      }
    },
  },
  {
    intent: 'lease_summary',
    test: /summar|lease|contract|terms|landlord|apartment|address/,
    answer: (s) => {
      const l = tenantLease(s)
      const p = propertyOf(l)
      return {
        intent: 'lease_summary',
        paragraphs: [
          `You rent a ${p.sizeM2} m² ${p.type} at ${p.street}, ${p.unit}, in ${p.neighbourhood}, from ${userFor('landlord').name}.`,
          `It's a 12-month lease from ${formatDate(l.startDate)} to ${formatDate(l.endDate)}, with rent of ${formatEUR(l.monthlyRent)} due on the ${ordinal(l.rentDueDay)} of each month and a ${formatEUR(l.deposit)} deposit (two months' rent).`,
        ],
        cards: [
          {
            kind: 'facts',
            title: `Lease ${l.reference}`,
            rows: [
              { label: 'Status', value: 'Active', tone: 'success' },
              { label: 'Monthly rent', value: formatEUR(l.monthlyRent) },
              { label: 'Deposit', value: `${formatEUR(l.deposit)} · held`, tone: 'brand' },
              { label: 'Ends', value: formatDate(l.endDate) },
              { label: 'Claim window', value: `${l.claimWindowDays} days after move-out` },
            ],
          },
        ],
        suggestions: ['How does my deposit get released?', 'What happens when I move out?'],
      }
    },
  },
]

// ---------------------------------------------------------------- landlord
const ending = (s: Snapshot) => leasesFor(s).find((l) => l.moveOutInspection) ?? leasesFor(s)[0]

const landlordRules: Rule[] = [
  {
    intent: 'evidence',
    test: /evidence|proof|photo|document|prepare/,
    answer: (s) => {
      const l = ending(s)
      return {
        intent: 'evidence',
        paragraphs: [
          `For the ${propertyOf(l).neighbourhood} move-out on ${formatDateLong(l.moveOutInspection!)}, strong evidence is specific, dated and comparable with the check-in report.`,
        ],
        cards: [
          {
            kind: 'checklist',
            title: 'Evidence checklist',
            items: [
              'Check-in report and photos (signed at move-in)',
              'Dated move-out photos of the same rooms and angles',
              'Invoices or quotes for any repair or cleaning',
              'Messages where the tenant was told about an issue',
              'Meter readings and key handover record',
            ],
          },
        ],
        suggestions: ['Can I open a claim?', 'Which payments are coming up?'],
      }
    },
  },
  {
    intent: 'open_claim',
    test: /claim|deduct|damage|keep .*deposit/,
    answer: (s) => {
      const l = ending(s)
      const t = tenantOf(l)
      const drafts = s.claims.filter((c) => c.leaseId === l.id).length
      return {
        intent: 'open_claim',
        paragraphs: [
          `Yes, on the ${propertyOf(l).neighbourhood} lease. ${t.name}'s lease ends on ${formatDate(l.endDate)} and the inspection is on ${formatDate(l.moveOutInspection!)}. You can submit a claim until ${formatDate(claimDeadline(l))}; after that, the ${formatEUR(l.deposit)} deposit is released to the tenant automatically.`,
          `A claim must list each item with an amount and evidence. ${t.firstName} then has ${l.responseWindowDays} days to respond, and contested amounts go to human mediation.`,
          drafts ? `You already have ${drafts} draft${drafts > 1 ? 's' : ''} saved for this lease.` : 'I can open the claim form for you to fill in.',
        ],
        action: {
          type: 'prepare_claim',
          leaseId: l.id,
          title: 'Prepare a deposit claim draft',
          rows: [
            { label: 'Lease', value: `${addr(l)} · ${t.name}` },
            { label: 'Deposit held', value: formatEUR(l.deposit) },
            { label: 'Claim deadline', value: formatDate(claimDeadline(l)), tone: 'warning' },
          ],
          condition: `The lease allows claims within ${l.claimWindowDays} days of the end date, capped at the deposit amount.`,
        },
        suggestions: ['What evidence should I prepare?', 'Summarize my active leases.'],
      }
    },
  },
  {
    intent: 'review_payment',
    test: /review|confirm|pending|check .*transfer|received/,
    answer: (s) => {
      const p = s.payments.find((x) => x.status === 'needs_review' && leasesFor(s).some((l) => l.id === x.leaseId))
      if (!p)
        return {
          intent: 'review_payment',
          paragraphs: ['Nothing is waiting for your review. Every reported payment has been checked.'],
          suggestions: ['Which payments are coming up?'],
        }
      const l = s.leases.find((x) => x.id === p.leaseId)!
      return {
        intent: 'review_payment',
        paragraphs: [
          `${tenantOf(l).name} reported a ${formatEUR(p.amount)} bank transfer for ${p.period} on ${formatDate(p.paidDate!)}. Check your bank statement, then confirm receipt here.`,
        ],
        action: {
          type: 'mark_received',
          paymentId: p.id,
          title: `Mark ${p.period} rent as received`,
          rows: [
            { label: 'Tenant', value: tenantOf(l).name },
            { label: 'Amount', value: formatEUR(p.amount) },
            { label: 'Reported', value: formatDate(p.paidDate!) },
          ],
          condition: 'Only confirm once the transfer appears on your bank statement. This updates the demo record only.',
        },
        suggestions: ['Which payments are coming up?'],
      }
    },
  },
  {
    intent: 'upcoming_payments',
    test: /payment|upcoming|coming up|\brent\b|\bdue\b|income|money/,
    answer: (s) => {
      const leases = leasesFor(s)
      const rows = leases.flatMap((l) => {
        const out = []
        const review = paymentsOf(s.payments, l.id).find((p) => p.status === 'needs_review')
        if (review)
          out.push({ label: `${tenantOf(l).firstName} · ${review.period}`, value: `${formatEUR(review.amount)} · needs review`, tone: 'warning' as const })
        const next = nextPayment(s.payments, l.id)
        if (next && next.dueDate <= l.endDate)
          out.push({ label: `${tenantOf(l).firstName} · ${next.period}`, value: `${formatEUR(next.amount)} · due ${formatDate(next.dueDate)}` })
        return out
      })
      return {
        intent: 'upcoming_payments',
        paragraphs: [
          rows.length
            ? `Here's what's coming up across your ${leases.length} leases.${rows.some((r) => r.tone === 'warning') ? ' One item needs your attention first.' : ''}`
            : 'No payments are coming up right now.',
          `${tenantOf(ending(s)).firstName}'s lease ends on ${formatDate(ending(s).endDate)}, so there is no November rent on that one.`,
        ],
        cards: [{ kind: 'facts', title: 'Upcoming & pending', rows }],
        suggestions: ['Review the pending payment', 'Summarize my active leases.'],
      }
    },
  },
  {
    intent: 'summarize_leases',
    test: /summar|leases?|portfolio|tenants?|propert|overview|deposit/,
    answer: (s) => {
      const leases = leasesFor(s)
      return {
        intent: 'summarize_leases',
        paragraphs: [
          `You have ${leases.length} active leases with ${formatEUR(leases.reduce((t, l) => t + l.monthlyRent, 0))} of monthly rent and ${formatEUR(leases.reduce((t, l) => t + l.deposit, 0))} of deposits recorded as held (demo data).`,
        ],
        cards: leases.map((l) => ({
          kind: 'facts' as const,
          title: `${propertyOf(l).neighbourhood} · ${tenantOf(l).name}`,
          rows: [
            { label: 'Rent', value: formatEUR(l.monthlyRent) },
            { label: 'Deposit', value: `${formatEUR(l.deposit)} · held`, tone: 'brand' as const },
            {
              label: 'Ends',
              value: `${formatDate(l.endDate)}${l.moveOutInspection ? ' · ending soon' : ''}`,
              tone: l.moveOutInspection ? ('warning' as const) : undefined,
            },
          ],
        })),
        suggestions: ['Can I open a claim?', 'Which payments are coming up?'],
      }
    },
  },
]

// ---------------------------------------------------------------- shared
const smallTalk: Rule[] = [
  {
    intent: 'thanks',
    test: /^(thanks|thank you|obrigad[oa]|great|perfect|ok(ay)?)[.!\s]*$/,
    answer: () => ({ intent: 'thanks', paragraphs: ["You're welcome. I'm here whenever you need me."], suggestions: [] }),
  },
  {
    intent: 'greeting',
    test: /^(hi|hello|hey|ol[aá]|bom dia|good (morning|afternoon|evening))[.!,\s]*$/,
    answer: (s) => ({
      intent: 'greeting',
      paragraphs: [`Hello ${userFor(s.role).firstName}. What would you like to look at?`],
      suggestions: s.role === 'tenant' ? TENANT_PROMPTS.slice(0, 3) : LANDLORD_PROMPTS.slice(0, 3),
    }),
  },
  {
    intent: 'capabilities',
    test: /what can you do|who are you|^help[?!.\s]*$/,
    answer: (s) => ({
      intent: 'capabilities',
      paragraphs: [
        s.role === 'tenant'
          ? 'I can explain your lease, track your payments and deposit, and help you prepare replies. I explain and prepare; you decide, and programmed rules move funds.'
          : 'I can track your rent, summarize your leases, and help you prepare a well-evidenced claim. You stay in control of every decision.',
      ],
      suggestions: s.role === 'tenant' ? TENANT_PROMPTS : LANDLORD_PROMPTS,
    }),
  },
]

function fallback(s: Snapshot): AssistantReply {
  return {
    intent: 'unknown',
    paragraphs: [
      "I'm not able to help with that one. In this demo I only know about your lease, payments, deposit and claims, and I'd rather say so than guess.",
    ],
    suggestions: s.role === 'tenant' ? TENANT_PROMPTS : LANDLORD_PROMPTS,
  }
}

export function answer(message: string, s: Snapshot): AssistantReply {
  const q = message.toLowerCase().trim()
  const rules = [...smallTalk, ...(s.role === 'tenant' ? tenantRules : landlordRules)]
  return rules.find((r) => r.test.test(q))?.answer(s) ?? fallback(s)
}

export const demoAgent: AssistantService = {
  mode: 'demo',
  reply: ({ message, snapshot }) =>
    new Promise((resolve) => setTimeout(() => resolve(answer(message, snapshot)), 650 + Math.min(600, message.length * 8))),
}
