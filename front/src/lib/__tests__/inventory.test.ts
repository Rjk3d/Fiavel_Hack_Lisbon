import { describe, expect, it } from 'vitest'
import { claimEvidence, flags, fromFile, hexHash, inventoryHash, pairs, toFile, type Inventory, type Photo, type Report } from '../../stellar/inventory'

const photo = (s: string): Photo => {
  const bytes = new TextEncoder().encode(s)
  return { sha256: hexHash(bytes), data: btoa(s) }
}

const entry: Inventory = {
  version: 1,
  kind: 'entry',
  contract: 'CVAULT',
  leaseId: '4',
  author: 'GLANDLORD',
  createdAt: 1_000,
  aiModel: 'claude-opus-5-5',
  rooms: [
    { name: 'Living room', notes: 'Walls repainted', photos: [photo('a'), photo('b')], defects: [{ item: 'wall', description: 'crack 20 cm', severity: 'moderate', photo: 2, source: 'ai' }] },
    { name: 'Kitchen', notes: '', photos: [photo('c')], defects: [] },
  ],
}

describe('inventory hash', () => {
  it('commits to every room, note, defect and photo', () => {
    const h = inventoryHash(entry)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(inventoryHash(structuredClone(entry))).toBe(h)
    const edits: ((i: Inventory) => void)[] = [
      (i) => (i.rooms[0].notes = 'Walls repainted.'),
      (i) => (i.rooms[0].defects[0].severity = 'minor'),
      (i) => i.rooms[0].defects.pop(),
      (i) => (i.rooms[1].photos[0] = photo('c2')),
      (i) => i.rooms.reverse(),
      (i) => (i.kind = 'exit'),
      (i) => (i.leaseId = '5'),
    ]
    for (const edit of edits) {
      const copy = structuredClone(entry)
      edit(copy)
      expect(inventoryHash(copy)).not.toBe(h)
    }
  })

  it('does not depend on key order', () => {
    const reordered = Object.fromEntries(Object.entries(structuredClone(entry)).reverse()) as unknown as Inventory
    expect(Object.keys(reordered)[0]).toBe('rooms')
    expect(inventoryHash(reordered)).toBe(inventoryHash(entry))
  })
})

describe('inventory file', () => {
  it('round-trips and rejects any change', () => {
    const text = JSON.stringify(toFile(entry))
    expect(fromFile(text).hash).toBe(inventoryHash(entry))
    const f = JSON.parse(text)
    f.inventory.rooms[0].notes = 'Walls perfect'
    expect(() => fromFile(JSON.stringify(f))).toThrow(/modified after/)
    const g = JSON.parse(text)
    g.inventory.rooms[1].photos[0].data = btoa('swapped')
    expect(() => fromFile(JSON.stringify(g))).toThrow(/Photos were modified in: Kitchen/)
    expect(() => fromFile('{"format":"other"}')).toThrow()
  })
})

describe('move-out checks (code, not AI)', () => {
  const exit: Inventory = {
    ...entry,
    kind: 'exit',
    author: 'GTENANT',
    createdAt: 2_000,
    rooms: [
      { name: 'living room', notes: '', photos: [photo('a'), photo('z')], defects: [] },
      { name: 'Balcony', notes: '', photos: [photo('y')], defects: [] },
    ],
  }

  it('flags missing rooms, extra rooms and reused photos', () => {
    expect(flags(entry, exit)).toEqual([
      { room: 'Kitchen', level: 'warning', text: 'Documented at move-in, no move-out photos.' },
      { room: 'living room', level: 'warning', text: '1 move-out photo(s) are identical to move-in photos.' },
      { room: 'Balcony', level: 'warning', text: 'Not in the move-in inventory: nothing to compare with.' },
    ])
  })

  it('pairs rooms by name for comparison', () => {
    expect(pairs(entry, exit).map((p) => [p.name, p.entry.name])).toEqual([['living room', 'Living room']])
  })

  it('gives a claim evidence hash tied to the report and the items', () => {
    const report: Report = { version: 1, contract: 'CVAULT', leaseId: '4', entryHash: 'e', exitHash: 'x', rooms: [], flags: [], aiModel: null, createdAt: 3 }
    const a = claimEvidence(report, [{ room: 'Kitchen', item: 'wall', description: 'hole' }], 'invoice 80 USDC')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(claimEvidence(report, [{ room: 'Kitchen', item: 'wall', description: 'hole' }], 'invoice 90 USDC')).not.toBe(a)
    expect(claimEvidence({ ...report, exitHash: 'y' }, [{ room: 'Kitchen', item: 'wall', description: 'hole' }], 'invoice 80 USDC')).not.toBe(a)
  })
})
