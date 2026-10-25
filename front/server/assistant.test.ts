import { describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { allow, assist, MODEL, numbers, type MessagesClient } from './assistant'

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming

function mock(reply: string | Error, stop = 'end_turn') {
  const calls: Params[] = []
  const client: MessagesClient = {
    beta: {
      messages: {
        create: async (p) => {
          calls.push(p)
          if (reply instanceof Error) throw reply
          return { content: [{ type: 'text', text: reply }], stop_reason: stop } as unknown as Anthropic.Beta.Messages.BetaMessage
        },
      },
    },
  }
  return { client, calls }
}

describe('chat assistant', () => {
  it('says it is off without an API key', async () => {
    expect(await assist({ task: 'translate', lang: 'fr', text: 'hi' }, null)).toEqual({ ok: false, error: 'not_configured' })
  })

  it('translates with the constrained prompt, model and fallback', async () => {
    const { client, calls } = mock('Le loyer de 650 USDC arrive le 12.')
    const out = await assist({ task: 'translate', lang: 'fr', text: 'The 650 USDC rent arrives on the 12th.' }, client)
    expect(out).toEqual({ ok: true, text: 'Le loyer de 650 USDC arrive le 12.', numbersChanged: false })
    expect(calls[0].model).toBe(MODEL)
    expect(calls[0].fallbacks).toBe('default')
    expect(calls[0].betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(calls[0].output_config?.effort).toBe('low')
    expect(String(calls[0].system)).toMatch(/Keep every amount/)
    expect(String(calls[0].system)).toMatch(/French/)
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'The 650 USDC rent arrives on the 12th.' }])
  })

  it('flags a rewrite that changes a figure', async () => {
    const { client } = mock('I can offer 80 USDC for the wall.')
    const out = await assist({ task: 'rephrase', lang: 'en', role: 'tenant', text: 'ok 75 for the wall, no more' }, client)
    expect(out).toMatchObject({ ok: true, numbersChanged: true })
  })

  it('summarizes the thread from the asking party', async () => {
    const { client, calls } = mock('- Agreed: 75 USDC.')
    const thread = [
      { who: 'landlord', text: 'The wall needs 150.' },
      { who: 'tenant', text: '75 is fair.' },
    ]
    const out = await assist({ task: 'summarize', lang: 'pt', role: 'tenant', thread }, client)
    expect(out).toMatchObject({ ok: true, numbersChanged: false })
    expect(calls[0].messages[0].content).toBe('The landlord: The wall needs 150.\nMe: 75 is fair.')
    expect(String(calls[0].system)).toMatch(/European Portuguese/)
  })

  it('rejects malformed or oversized requests without calling the API', async () => {
    const { client, calls } = mock('x')
    for (const body of [
      null,
      { task: 'sign', lang: 'en', text: 'x' },
      { task: 'translate', lang: 'de', text: 'x' },
      { task: 'translate', lang: 'en', text: '' },
      { task: 'translate', lang: 'en', text: 'x'.repeat(2_001) },
      { task: 'rephrase', lang: 'en', text: 'x' },
      { task: 'summarize', lang: 'en', role: 'tenant', thread: [{ who: 'arbiter', text: 'x' }] },
    ])
      expect(await assist(body, client)).toEqual({ ok: false, error: 'invalid' })
    expect(calls).toHaveLength(0)
  })

  it('reports refusals and API errors plainly', async () => {
    expect(await assist({ task: 'translate', lang: 'en', text: 'x' }, mock('', 'refusal').client)).toEqual({ ok: false, error: 'refused' })
    const err = new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers())
    expect(await assist({ task: 'translate', lang: 'en', text: 'x' }, mock(err).client)).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('compares numbers across separators', () => {
    expect(numbers('1,300.50 USDC on 12/11')).toEqual(numbers('1 300,50 USDC le 12/11'))
    expect(numbers('150')).not.toEqual(numbers('15'))
  })

  it('limits requests per address', () => {
    const t = 1_000_000
    for (let i = 0; i < 3; i++) expect(allow('a', t, 3)).toBe(true)
    expect(allow('a', t, 3)).toBe(false)
    expect(allow('b', t, 3)).toBe(true)
    expect(allow('a', t + 61_000, 3)).toBe(true)
  })
})
