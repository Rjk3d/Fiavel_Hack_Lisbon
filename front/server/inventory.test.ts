import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { inspect, type InventoryClient } from './inventory'

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
const IMG = 'iVBORw0KGgo='

function mock(output: unknown, stop = 'end_turn') {
  const calls: Params[] = []
  const client: InventoryClient = {
    beta: { messages: { parse: async (p) => (calls.push(p), { stop_reason: stop, parsed_output: output }) } },
  }
  return { client, calls }
}

describe('inventory AI', () => {
  it('describes a room from its move-in photos, labelled in order', async () => {
    const { client, calls } = mock({
      defects: [
        { item: 'wall left of the window', description: 'crack about 20 cm', severity: 'moderate', photo: 2 },
        { item: 'oven door', description: 'scratch', severity: 'minor', photo: 9 },
      ],
      cleanliness: 'clean',
      not_visible: ['ceiling'],
    })
    const out = await inspect({ task: 'describe', lang: 'fr', room: 'Salon', photos: [IMG, IMG] }, client)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const r = out.result as { defects: { photo: number }[] }
    // Photo 9 was never sent: the reference is dropped (0 = none).
    expect(r.defects.map((d) => d.photo)).toEqual([2, 0])
    const p = calls[0]
    expect(p.model).toBe('claude-opus-5-5')
    expect(p.fallbacks).toBe('default')
    expect(p.output_config?.effort).toBe('medium')
    expect(p.output_config?.format).toBeTruthy()
    expect(String(p.system)).toMatch(/never estimate a cost/)
    expect(String(p.system)).toMatch(/French/)
    const content = p.messages[0].content as { type: string; text?: string }[]
    expect(content.map((b) => b.type)).toEqual(['text', 'image', 'text', 'image', 'text'])
    expect(content[2].text).toBe('Move-in photo 2:')
  })

  it('compares move-in and move-out with the signed defects', async () => {
    const { client, calls } = mock({
      changes: [{ item: 'wall', description: 'new hole', kind: 'new_damage', severity: 'moderate', confidence: 'high', entry_photo: 1, exit_photo: 4 }],
      not_comparable: [],
      summary: 'One new hole.',
    })
    const out = await inspect(
      { task: 'compare', lang: 'en', room: 'Kitchen', entry_defects: ['oven door scratch'], entry_photos: [IMG], exit_photos: [IMG, IMG] },
      client,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect((out.result as { changes: { exit_photo: number | null }[] }).changes[0].exit_photo).toBeNull()
    const content = calls[0].messages[0].content as { type: string; text?: string }[]
    expect(content.find((b) => b.text?.includes('Defects signed at move-in'))?.text).toContain('- oven door scratch')
    expect(content.filter((b) => b.type === 'image')).toHaveLength(3)
  })

  it('refuses bad input before calling the API', async () => {
    const { client, calls } = mock({})
    for (const body of [
      null,
      { task: 'describe', lang: 'fr', room: 'Salon', photos: [] },
      { task: 'describe', lang: 'fr', room: 'Salon', photos: Array(7).fill(IMG) },
      { task: 'describe', lang: 'de', room: 'Salon', photos: [IMG] },
      { task: 'describe', lang: 'fr', room: 'Salon', photos: ['not base64!'] },
      { task: 'compare', lang: 'fr', room: 'Salon', entry_photos: [IMG] },
      { task: 'price', lang: 'fr', room: 'Salon', photos: [IMG] },
    ])
      expect(await inspect(body, client)).toEqual({ ok: false, error: 'invalid' })
    expect(calls).toHaveLength(0)
    expect(await inspect({ task: 'describe', lang: 'fr', room: 'Salon', photos: [IMG] }, null)).toEqual({ ok: false, error: 'not_configured' })
  })

  it('reports a refusal or an unexpected answer', async () => {
    const body = { task: 'describe', lang: 'en', room: 'Hall', photos: [IMG] }
    expect(await inspect(body, mock(null, 'refusal').client)).toEqual({ ok: false, error: 'refused' })
    expect(await inspect(body, mock({ defects: 'nope' }).client)).toMatchObject({ ok: false, error: 'unavailable' })
  })
})
