import { actionsFor, when, type Action, type ContractFn, type Role } from '@agents/rules'
import { checkAction } from '@agents/guards'
import { explainRule, normalize, ruleFor, ruleLabel, RULES, type Lang, type RuleId } from '@agents/explain'
import type { LeaseView } from '../../state/live'
import { NETWORK } from '../../stellar/config'
import { explainEscrow } from '@escrow/assistant'

/**
 * Tenant Guardian / Landlord Assistant, live version. Deterministic: every answer comes
 * from the rule engine, a rule template filled with on-chain values, or the guard.
 * It can propose a contract call; the user signs it. Messages from the other party are
 * never read as instructions. English or French, picked from keywords, never a model.
 */
export interface AgentReply {
  paragraphs: string[]
  bullets?: string[]
  action?: Action
  refused?: string
  suggestions: string[]
  /** What the answer was about, so a short follow-up ("and when?") can reuse it. */
  topic?: Topic
}

export interface Topic {
  rule?: RuleId
  fn?: ContractFn
}

export type { Lang }

type Intent = { re: RegExp; fn: ContractFn; args?: (v: LeaseView) => Record<string, unknown> }

const seize = (v: LeaseView) => ({ amount: v.snap.guaranteeValue, evidence: 'none' })

const INTENTS: Intent[] = [
  { re: /seiz|take (all|the whole|the entire)|keep the (deposit|guarantee)|grab/, fn: 'claim_damage', args: seize },
  { re: /\bpay\b.*rent|pay (now|this month|the rent)|^pay/, fn: 'pay_rent' },
  { re: /unpaid|late rent|take (the|this) (month|rent)|collect/, fn: 'claim_unpaid' },
  { re: /release|get my (deposit|guarantee|money) back|give .* back/, fn: 'release' },
  { re: /end the lease|move out|moving out|finish the lease/, fn: 'end_lease' },
  { re: /stop (the )?yield|exit blend|opt.?out|withdraw from blend/, fn: 'exit_blend' },
  { re: /accept (the )?counter/, fn: 'accept_counter' },
  { re: /arbiter.*(silent|late|not (answer|decid))|settle (without|halfway)/, fn: 'expire_dispute' },
  { re: /\brate\b|leave a (rating|review)|give .* stars?/, fn: 'rate' },
  { re: /approve (the )?invest/, fn: 'approve_yield' },
  { re: /invest (my|the) (deposit|guarantee)|propose (an )?invest/, fn: 'propose_yield' },
  { re: /refund|never moved/, fn: 'refund_no_keys' },
]

// Same contract calls, French wording, matched on accent-free text.
const INTENTS_FR: Intent[] = [
  { re: /saisi|prendre (toute|tout|la totalite)|garder (toute )?(la|ma) (caution|garantie)|confisqu/, fn: 'claim_damage', args: seize },
  { re: /\bpayer\b.*loyer|payer (maintenant|ce mois|le loyer)|^pa(yer|ie|ye)\b/, fn: 'pay_rent' },
  { re: /impaye|encaisser|recouvrer|prendre (le|ce) (mois|loyer)/, fn: 'claim_unpaid' },
  { re: /liberer|debloquer|rend(s|ez)?[ -]moi|restitue[rz]? (la|ma) (caution|garantie)/, fn: 'release' },
  { re: /(terminer|finir|mettre fin a|cloturer) (le|au) bail|je demenage|demenager|quitter le logement/, fn: 'end_lease' },
  { re: /arreter (le )?rendement|sortir de blend|retirer de blend|desactiver le rendement/, fn: 'exit_blend' },
  { re: /accepter (la )?contre/, fn: 'accept_counter' },
  { re: /arbitre.*(silencieux|ne (repond|decide)|en retard)|regler (sans|a mi-chemin|a moitie)/, fn: 'expire_dispute' },
  { re: /\bnoter\b|laisser (une note|un avis)|donner .* etoiles?/, fn: 'rate' },
  { re: /approuver (le |l')?(placement|invest)/, fn: 'approve_yield' },
  { re: /(placer|investir) (ma|la) (caution|garantie)|proposer (un )?(placement|invest)/, fn: 'propose_yield' },
  { re: /rembourse|jamais emmenage/, fn: 'refund_no_keys' },
]

// The rule behind each action, for follow-ups on a proposed or refused transaction.
const FN_RULE: Partial<Record<ContractFn, RuleId>> = {
  fund: 'first_rent',
  confirm_move_in: 'first_rent',
  refund_no_keys: 'no_keys',
  pay_rent: 'monthly_rent',
  claim_unpaid: 'unpaid_rent',
  end_lease: 'end_of_lease',
  release: 'end_of_lease',
  claim_damage: 'damage_claim',
  respond: 'tenant_response',
  accept_counter: 'arbitration',
  execute_claim: 'tenant_response',
  resolve: 'arbitration',
  expire_dispute: 'arbitration',
  exit_blend: 'yield_exit',
  propose_yield: 'invest_during_lease',
  approve_yield: 'invest_during_lease',
  cancel_yield: 'invest_during_lease',
  rate: 'rating',
}

export const PROMPTS: Record<Role, string[]> = {
  tenant: ['What can I do now?', 'When do I get my deposit back?', 'Invest my guarantee', 'How do ratings work?', 'Pay this month'],
  landlord: ['What can I do now?', 'Seize the whole guarantee now', 'Invest the guarantee', 'Rate my tenant', 'How does a damage claim work?'],
  arbiter: ['What can I do now?', 'How does arbitration work?', 'What happens to the bond?'],
  anyone: [],
}

export const PROMPTS_FR: Record<Role, string[]> = {
  tenant: ['Que puis-je faire maintenant ?', 'Quand est-ce que je récupère ma caution ?', 'Placer ma garantie', 'Comment fonctionnent les notes ?', 'Payer le loyer de ce mois'],
  landlord: ['Que puis-je faire maintenant ?', 'Saisir toute la caution maintenant', 'Placer la garantie', 'Noter mon locataire', 'Comment fonctionne une réclamation pour dégâts ?'],
  arbiter: ['Que puis-je faire maintenant ?', "Comment fonctionne l'arbitrage ?", 'Que devient la caution de litige ?'],
  anyone: [],
}

export const promptsFor = (role: Role, lang: Lang) => (lang === 'fr' ? PROMPTS_FR : PROMPTS)[role]

const FR_WORDS =
  /\b(loyer|caution|garantie|bail|litige|arbitre|quand|combien|pourquoi|payer|rendre|rend|reclamation|noter|je|j'|est-ce|que|quoi|mon|ma|mes|le|la|les|et|apres|saisir|toute|degats?|bonjour|merci|placer|investir|recuperer|proprietaire|locataire|puis|peux|dois|maintenant|ensuite)\b/
const EN_WORDS = /\b(what|when|how|why|the|my|can|do|does|i|is|get|pay|rent|deposit|guarantee|tell|more|and|now|much|rate|invest|seize|back|then)\b/

/** French when a French keyword shows up, English when an English one does, else undecided. */
export function detectLang(text: string): Lang | undefined {
  const k = normalize(text)
  if (FR_WORDS.test(k)) return 'fr'
  if (EN_WORDS.test(k)) return 'en'
  return undefined
}

const FOLLOW_UP =
  /^(?:(?:and|so|ok|et|alors|ok et)\s+)?(when|then|what next|what then|after that|and after|how long|how much|why|why not|how|tell me more|more|more details?|go on|quand|combien|combien de temps|pourquoi|pourquoi pas|comment|apres|et apres|ensuite|dis[- ]m'en plus|plus de details|en savoir plus|c'est-a-dire|and|et|so|alors)$/
const ABOUT_TIME = /^(?:(?:and|so|ok|et|alors|ok et)\s+)?(when|then|what next|what then|after that|and after|how long|quand|combien de temps|apres|et apres|ensuite)$/

/** "and when?", "pourquoi ?"... a short question that only makes sense with the previous topic. */
export function followUp(text: string): 'time' | 'more' | undefined {
  const k = normalize(text).replace(/[?!.,;:…]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!FOLLOW_UP.test(k)) return undefined
  return ABOUT_TIME.test(k) ? 'time' : 'more'
}

export interface ReplyOptions {
  /** Forced language (the chat toggle). Detected from the question otherwise. */
  lang?: Lang
  /** Topic of the previous assistant turn, for follow-ups. */
  topic?: Topic
}

export function reply(question: string, role: Role, view: LeaseView | undefined, now: number, opts: ReplyOptions = {}): AgentReply {
  const q = question.toLowerCase().trim()
  const lang = opts.lang ?? detectLang(question) ?? 'en'
  const fr = lang === 'fr'
  if (view?.escrow && (view.escrow.binding.provider !== 'leasevault' || /trustless|provider|backend|fournisseur|migration/i.test(q))) {
    return { paragraphs: explainEscrow(view.escrow, lang), suggestions: fr ? ['Quelles conditions de restitution sont vérifiées ?'] : ['Which refund conditions are verified?'] }
  }
  const nq = normalize(question).trim()
  const suggestions = promptsFor(role, lang)
    .filter((p) => normalize(p) !== nq)
    .slice(0, 3)

  if (!view) {
    return {
      paragraphs: [
        fr
          ? role === 'landlord'
            ? "Vous n'avez pas encore de bail. Créez-en un depuis l'aperçu : les conditions sont inscrites on-chain et vous obtenez un lien d'invitation pour le locataire."
            : role === 'tenant'
              ? "Vous n'avez pas encore de bail. Ouvrez le lien d'invitation envoyé par votre propriétaire ; je vous explique chaque règle avant le dépôt."
              : "Aucun bail ne vous désigne encore comme arbitre."
          : role === 'landlord'
            ? 'You have no lease yet. Create one from the overview: the terms go on-chain and you get an invite link for the tenant.'
            : role === 'tenant'
              ? 'You have no lease yet. Open the invite link your landlord sent you; I will explain every rule before you fund.'
              : 'No lease names you as arbiter yet.',
      ],
      suggestions: [fr ? 'Comment fonctionne une réclamation pour dégâts ?' : 'How does a damage claim work?'],
    }
  }

  // A short follow-up keeps the previous topic instead of starting over.
  const follow = opts.topic && followUp(question)
  const followRule = opts.topic && (opts.topic.rule ?? (opts.topic.fn && FN_RULE[opts.topic.fn]))
  if (follow && followRule) {
    const upcoming = view.insight.deadlines.filter((d) => d.at >= now).map((d) => `${d.label}: ${fr ? whenFr(d.at, now) : when(d.at, now)}`)
    return {
      paragraphs: [
        fr ? `Toujours au sujet de : ${ruleLabel(followRule, 'fr')}.` : `Still about ${ruleLabel(followRule)}.`,
        explainRule(followRule, ctx(view), lang),
      ],
      bullets:
        follow === 'time'
          ? upcoming.length
            ? upcoming
            : [fr ? 'Aucune échéance en cours sur ce bail pour le moment.' : 'No deadline is running on this lease right now.']
          : undefined,
      suggestions,
      topic: opts.topic,
    }
  }

  // Asking to do something: the guard decides, then the contract.
  // A French question ("quand", "pourquoi"...) asks for an explanation, not a transaction.
  const intent = fr ? (/^(quand|combien|pourquoi|comment)\b/.test(nq) ? undefined : INTENTS_FR.find((i) => i.re.test(nq))) : INTENTS.find((i) => i.re.test(q))
  if (intent) {
    const guard = checkAction(view.snap, role, intent.fn, intent.args?.(view) ?? {})
    const action = actionsFor(view.insight, role).find((a) => a.fn === intent.fn)
    if (!guard.ok || !action) {
      const rule = intent.fn === 'claim_damage' ? 'early_seizure' : ruleFor(q, lang)
      return {
        paragraphs: [
          fr
            ? `Je ne peux pas préparer cela. ${guard.ok ? "Ce n'est pas possible pour vous en ce moment." : `Verdict du garde-fou : ${guard.reason}`}`
            : `I can't prepare that. ${guard.ok ? 'It is not available to you right now.' : guard.reason}`,
        ],
        bullets: rule ? [explainRule(rule, ctx(view), lang)] : undefined,
        refused: fr
          ? 'Refusé par les règles avant toute transaction. Le contrat la rejetterait aussi.'
          : 'Refused by the rules before any transaction was built. The contract would reject it too.',
        suggestions,
        topic: { fn: intent.fn, rule },
      }
    }
    return {
      paragraphs: [fr ? "Voici la transaction, prête pour votre signature. Rien n'est envoyé avant que vous signiez." : `Here is the transaction, ready for your signature. Nothing is sent until you sign.`],
      action,
      suggestions,
      topic: { fn: intent.fn },
    }
  }

  // Where things stand.
  if (fr ? /que (puis|peux|dois)[ -]?je faire|quoi faire|ou en (est|suis|sommes)|statut|resume|prochaine etape|apercu|et maintenant/.test(nq) : /what can i do|status|where|what now|next|summar|overview/.test(q)) {
    const mine = actionsFor(view.insight, role)
    return {
      paragraphs: [view.insight.headline, ...view.insight.facts],
      bullets: [
        ...view.insight.deadlines.filter((d) => d.at >= now).map((d) => `${d.label}: ${fr ? whenFr(d.at, now) : when(d.at, now)}`),
        ...(mine.length ? mine.map((a) => `${fr ? 'Vous pouvez' : 'You can'}: ${a.label}`) : [fr ? 'Rien à faire de votre côté pour le moment.' : 'Nothing to do on your side right now.']),
        ...view.insight.blocked.filter((b) => b.role === role).map((b) => `${fr ? 'Pas encore' : 'Not yet'}: ${b.label}. ${b.reason}`),
      ],
      action: mine[0],
      suggestions,
      topic: mine[0] && { fn: mine[0].fn },
    }
  }

  const rule = ruleFor(q, lang)
  if (rule) return { paragraphs: [explainRule(rule, ctx(view), lang)], suggestions, topic: { rule } }

  return {
    paragraphs: [
      fr
        ? "Ce bail n'a pas de règle à ce sujet, et je ne réponds qu'à partir des règles du bail. Je peux expliquer : " +
          RULES.map((r) => ruleLabel(r, 'fr')).join(', ') +
          '.'
        : "This lease has no rule about that, and I only answer from the lease's rules. I can explain: " +
          RULES.map((r) => r.replace(/_/g, ' ')).join(', ') +
          '.',
    ],
    suggestions,
  }
}

function whenFr(at: number, now: number): string {
  const d = at - now
  if (d <= 0) return 'maintenant'
  if (d < 120) return `dans ${d} s`
  if (d < 7200) return `dans ${Math.round(d / 60)} min`
  if (d < 172800) return `dans ${Math.round(d / 3600)} h`
  return `dans ${Math.round(d / 86400)} jours`
}

const ctx = (v: LeaseView) => ({ lease: v.snap.lease, disputeBond: NETWORK.disputeBond })
