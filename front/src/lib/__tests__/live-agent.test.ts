import { describe, expect, it } from 'vitest'
import type { Lease, Status } from 'lease-vault-client'
import { analyze } from '@agents/rules'
import { explainRule } from '@agents/explain'
import { detectLang, followUp, reply } from '../../components/live/agent'
import { append, chatKey, forget, MAX_TURNS, recall } from '../../components/live/conversation'
import type { LeaseView } from '../../state/live'
import { NETWORK } from '../../stellar/config'

const U = 10_000_000n
const T0 = 1_000

function view(status: Status['tag'] = 'Active', now = T0 + 10): LeaseView {
  const lease: Lease = {
    landlord: 'GLANDLORD',
    tenant: 'GTENANT',
    status: { tag: status, values: undefined } as Status,
    terms: {
      rent: 100n * U,
      deposit: 200n * U,
      months: 3,
      period: 60n,
      grace: 10n,
      move_in_window: 600n,
      claim_window: 60n,
      response_window: 60n,
      arbitration_window: 120n,
      arbiter: 'GARBITER',
      yield_offered: true,
      buffer_bps: 500,
      tenant_share_bps: 7000,
      landlord_share_bps: 2000,
    },
    created_at: BigInt(T0),
    start: BigInt(T0),
    ended_at: 0n,
    months_settled: 1,
    months_unpaid: 0,
    rent_escrow: 0n,
    liquid: 200n * U,
    shares: 0n,
    placed: 0n,
    yield_active: false,
    entry_hash: undefined,
    tenant_moved_in: true,
    landlord_moved_in: true,
    exit_hash: undefined,
  }
  const snap = { id: 0n, lease, now, guaranteeValue: lease.liquid, blendAtRisk: false }
  return { id: 0n, snap, insight: analyze(snap), meta: {} as LeaseView['meta'] }
}

const NOW = T0 + 10
const ctx = (v: LeaseView) => ({ lease: v.snap.lease, disputeBond: NETWORK.disputeBond })

describe('language detection', () => {
  it('spots French from keywords, with or without accents', () => {
    expect(detectLang('Quand est-ce que je récupère ma caution ?')).toBe('fr')
    expect(detectLang('quand je recupere ma caution')).toBe('fr')
    expect(detectLang('payer le loyer')).toBe('fr')
    expect(detectLang('Pourquoi ?')).toBe('fr')
    expect(detectLang('et après ?')).toBe('fr')
  })

  it('keeps English questions in English and leaves the rest to the toggle', () => {
    expect(detectLang('When do I get my deposit back?')).toBe('en')
    expect(detectLang('Seize the whole guarantee now')).toBe('en')
    expect(detectLang('How does a damage claim work?')).toBe('en')
    expect(detectLang('ok')).toBeUndefined()
  })
})

describe('French answers', () => {
  it('maps French requests to the same contract actions as English ones', () => {
    const v = view()
    const seizeFr = reply('Saisir toute la caution maintenant', 'landlord', v, NOW)
    const seizeEn = reply('Seize the whole guarantee now', 'landlord', v, NOW)
    expect(seizeEn.refused).toBeDefined()
    expect(seizeFr.refused).toMatch(/^Refusé par les règles/)
    expect(seizeFr.topic?.fn).toBe('claim_damage')
    expect(seizeFr.bullets).toEqual([explainRule('early_seizure', ctx(v), 'fr')])
    expect(seizeFr.action).toBeUndefined()

    expect(reply('Je veux payer le loyer', 'tenant', v, NOW).topic?.fn).toBe('pay_rent')
    expect(reply('Pay this month', 'tenant', v, NOW).topic?.fn).toBe('pay_rent')
  })

  it('answers a French question with the French rule template', () => {
    const v = view()
    const r = reply('Quand est-ce que je récupère ma caution ?', 'tenant', v, NOW)
    expect(r.paragraphs).toEqual([explainRule('end_of_lease', ctx(v), 'fr')])
    expect(r.topic).toEqual({ rule: 'end_of_lease' })
    expect(r.suggestions.every((s) => !/^(What|When|How|Pay|Invest)/.test(s))).toBe(true)
  })

  it('speaks French for its own sentences and the no-rule fallback', () => {
    const v = view()
    expect(reply('Que puis-je faire maintenant ?', 'tenant', v, NOW).bullets?.some((b) => /^(Vous pouvez|Rien à faire|Pas encore)/.test(b))).toBe(true)
    expect(reply('Puis-je avoir un chat ?', 'tenant', v, NOW, { lang: 'fr' }).paragraphs[0]).toMatch(/^Ce bail n'a pas de règle/)
    expect(reply('Bonjour', 'tenant', undefined, NOW).paragraphs[0]).toMatch(/^Vous n'avez pas encore de bail/)
  })

  it('keeps the English answers unchanged', () => {
    const v = view()
    expect(reply('can I have a cat?', 'tenant', v, NOW).paragraphs[0]).toMatch(/^This lease has no rule about that/)
    expect(reply('Seize the whole guarantee now', 'landlord', v, NOW).paragraphs[0]).toMatch(/^I can't prepare that\. /)
  })
})

describe('follow-up questions', () => {
  it('recognises short follow-ups in both languages', () => {
    expect(followUp('and when?')).toBe('time')
    expect(followUp('et après ?')).toBe('time')
    expect(followUp('Et quand ?')).toBe('time')
    expect(followUp('How much?')).toBe('more')
    expect(followUp('pourquoi ?')).toBe('more')
    expect(followUp('combien ?')).toBe('more')
    expect(followUp('tell me more')).toBe('more')
    expect(followUp('When do I get my deposit back?')).toBeUndefined()
  })

  it('reuses the topic of the previous answer', () => {
    const v = view()
    const first = reply('When do I get my deposit back?', 'tenant', v, NOW)
    expect(first.topic?.rule).toBe('end_of_lease')

    const when = reply('and when?', 'tenant', v, NOW, { topic: first.topic })
    expect(when.paragraphs).toEqual(['Still about end of lease.', explainRule('end_of_lease', ctx(v))])
    expect(when.bullets?.length).toBeGreaterThan(0)
    expect(when.topic).toEqual(first.topic)

    const quand = reply('et quand ?', 'tenant', v, NOW, { topic: first.topic })
    expect(quand.paragraphs).toEqual(['Toujours au sujet de : fin du bail.', explainRule('end_of_lease', ctx(v), 'fr')])

    // A proposed action is a topic too: "how much?" after paying explains the rent.
    const pay = reply('Pay this month', 'tenant', v, NOW)
    expect(reply('how much?', 'tenant', v, NOW, { topic: pay.topic }).paragraphs[1]).toBe(explainRule('monthly_rent', ctx(v)))
  })

  it('does not invent a topic when there was none', () => {
    expect(reply('pourquoi ?', 'tenant', view(), NOW).paragraphs[0]).toMatch(/^Ce bail n'a pas de règle/)
  })
})

describe('conversation memory', () => {
  it('keeps one capped history per role and lease, and clears it', () => {
    const v = view()
    const tenant = chatKey('tenant', 1n)
    const landlord = chatKey('landlord', 1n)
    const other = chatKey('tenant', 2n)
    for (let i = 0; i < MAX_TURNS + 3; i++) append(tenant, `q${i}`, reply('What can I do now?', 'tenant', v, NOW))
    append(landlord, 'hello', reply('Rate my tenant', 'landlord', v, NOW))

    expect(recall(tenant)).toHaveLength(MAX_TURNS * 2)
    expect(recall(tenant)[0]).toMatchObject({ from: 'user', text: 'q3' })
    expect(recall(landlord)).toHaveLength(2)
    expect(recall(other)).toHaveLength(0)

    forget(tenant)
    expect(recall(tenant)).toHaveLength(0)
    expect(recall(landlord)).toHaveLength(2)
  })
})
