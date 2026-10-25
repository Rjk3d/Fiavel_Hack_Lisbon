import { actionsFor, when, type Action, type ContractFn, type Role } from '@agents/rules'
import { checkAction } from '@agents/guards'
import { explainRule, ruleFor, RULES } from '@agents/explain'
import type { LeaseView } from '../../state/live'
import { NETWORK } from '../../stellar/config'

/**
 * Tenant Guardian / Landlord Assistant, live version. Deterministic: every answer comes
 * from the rule engine, a rule template filled with on-chain values, or the guard.
 * It can propose a contract call; the user signs it. Messages from the other party are
 * never read as instructions.
 */
export interface AgentReply {
  paragraphs: string[]
  bullets?: string[]
  action?: Action
  refused?: string
  suggestions: string[]
}

const INTENTS: { re: RegExp; fn: ContractFn; args?: (v: LeaseView) => Record<string, unknown> }[] = [
  { re: /seiz|take (all|the whole|the entire)|keep the (deposit|guarantee)|grab/, fn: 'claim_damage', args: (v) => ({ amount: v.snap.guaranteeValue, evidence: 'none' }) },
  { re: /\bpay\b.*rent|pay (now|this month|the rent)|^pay/, fn: 'pay_rent' },
  { re: /unpaid|late rent|take (the|this) (month|rent)|collect/, fn: 'claim_unpaid' },
  { re: /release|get my (deposit|guarantee|money) back|give .* back/, fn: 'release' },
  { re: /end the lease|move out|moving out|finish the lease/, fn: 'end_lease' },
  { re: /stop (the )?yield|exit blend|opt.?out|withdraw from blend/, fn: 'exit_blend' },
  { re: /accept (the )?counter/, fn: 'accept_counter' },
  { re: /\brate\b|leave a (rating|review)|give .* stars?/, fn: 'rate' },
  { re: /approve (the )?invest/, fn: 'approve_yield' },
  { re: /invest (my|the) (deposit|guarantee)|propose (an )?invest/, fn: 'propose_yield' },
  { re: /refund|never moved/, fn: 'refund_no_keys' },
]

export const PROMPTS: Record<Role, string[]> = {
  tenant: ['What can I do now?', 'When do I get my deposit back?', 'Invest my guarantee', 'How do ratings work?', 'Pay this month'],
  landlord: ['What can I do now?', 'Seize the whole guarantee now', 'Invest the guarantee', 'Rate my tenant', 'How does a damage claim work?'],
  arbiter: ['What can I do now?', 'How does arbitration work?', 'What happens to the bond?'],
  anyone: [],
}

export function reply(question: string, role: Role, view: LeaseView | undefined, now: number): AgentReply {
  const q = question.toLowerCase().trim()
  const suggestions = PROMPTS[role].filter((p) => p.toLowerCase() !== q).slice(0, 3)

  if (!view) {
    return {
      paragraphs: [
        role === 'landlord'
          ? 'You have no lease yet. Create one from the overview: the terms go on-chain and you get an invite link for the tenant.'
          : role === 'tenant'
            ? 'You have no lease yet. Open the invite link your landlord sent you; I will explain every rule before you fund.'
            : 'No lease names you as arbiter yet.',
      ],
      suggestions: ['How does a damage claim work?'],
    }
  }

  // Asking to do something: the guard decides, then the contract.
  const intent = INTENTS.find((i) => i.re.test(q))
  if (intent) {
    const guard = checkAction(view.snap, role, intent.fn, intent.args?.(view) ?? {})
    const action = actionsFor(view.insight, role).find((a) => a.fn === intent.fn)
    if (!guard.ok || !action) {
      const rule = intent.fn === 'claim_damage' ? 'early_seizure' : ruleFor(q)
      return {
        paragraphs: [`I can't prepare that. ${guard.ok ? 'It is not available to you right now.' : guard.reason}`],
        bullets: rule ? [explainRule(rule, ctx(view))] : undefined,
        refused: 'Refused by the rules before any transaction was built. The contract would reject it too.',
        suggestions,
      }
    }
    return {
      paragraphs: [`Here is the transaction, ready for your signature. Nothing is sent until you sign.`],
      action,
      suggestions,
    }
  }

  // Where things stand.
  if (/what can i do|status|where|what now|next|summar|overview/.test(q)) {
    const mine = actionsFor(view.insight, role)
    return {
      paragraphs: [view.insight.headline, ...view.insight.facts],
      bullets: [
        ...view.insight.deadlines.filter((d) => d.at >= now).map((d) => `${d.label}: ${when(d.at, now)}`),
        ...(mine.length ? mine.map((a) => `You can: ${a.label}`) : ['Nothing to do on your side right now.']),
        ...view.insight.blocked.filter((b) => b.role === role).map((b) => `Not yet: ${b.label}. ${b.reason}`),
      ],
      action: mine[0],
      suggestions,
    }
  }

  const rule = ruleFor(q)
  if (rule) return { paragraphs: [explainRule(rule, ctx(view))], suggestions }

  return {
    paragraphs: [
      "This lease has no rule about that, and I only answer from the lease's rules. I can explain: " +
        RULES.map((r) => r.replace(/_/g, ' ')).join(', ') +
        '.',
    ],
    suggestions,
  }
}

const ctx = (v: LeaseView) => ({ lease: v.snap.lease, disputeBond: NETWORK.disputeBond })
