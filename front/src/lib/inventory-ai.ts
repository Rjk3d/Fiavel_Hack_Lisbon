import type { AssistLang } from './assistant'
import type { Change, Severity } from '../stellar/inventory'

/** Browser side of /api/inventory (front/server/inventory.ts). */

/** Recorded in an inventory when the AI helped write it (the server picks the model). */
export const AI_MODEL = 'claude-opus-5-5'

export interface RoomDescription {
  defects: { item: string; description: string; severity: Severity; photo: number }[]
  cleanliness: 'clean' | 'needs_cleaning' | 'unclear'
  not_visible: string[]
}

export interface RoomComparison {
  changes: Change[]
  not_comparable: string[]
  summary: string
}

type Failure = { ok: false; error: 'not_configured' | 'invalid' | 'refused' | 'unavailable' | 'rate_limited' | 'offline' | 'too_large' }

async function call<T>(body: unknown): Promise<{ ok: true; result: T } | Failure> {
  try {
    const r = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.status === 413) return { ok: false, error: 'too_large' }
    const out = (await r.json().catch(() => null)) as { ok: true; result: T } | Failure | null
    return out ?? { ok: false, error: r.status === 404 ? 'not_configured' : 'unavailable' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export const describeRoom = (room: string, notes: string, photos: string[], lang: AssistLang) =>
  call<RoomDescription>({ task: 'describe', lang, room, notes, photos })

export const compareRoom = (a: { room: string; entryNotes: string; exitNotes: string; entryDefects: string[]; entryPhotos: string[]; exitPhotos: string[]; lang: AssistLang }) =>
  call<RoomComparison>({
    task: 'compare',
    lang: a.lang,
    room: a.room,
    entry_notes: a.entryNotes,
    exit_notes: a.exitNotes,
    entry_defects: a.entryDefects,
    entry_photos: a.entryPhotos,
    exit_photos: a.exitPhotos,
  })

export const INVENTORY_AI_ERROR: Record<Failure['error'], string> = {
  not_configured: 'AI analysis is not set up on this deployment (no API key). You can still list defects yourself.',
  invalid: 'These photos cannot be analysed (1 to 6 photos per room).',
  refused: 'The AI declined these photos.',
  unavailable: 'The AI is unavailable right now. Try again.',
  rate_limited: 'Too many AI requests. Wait a minute.',
  offline: 'No connection to the AI.',
  too_large: 'Too many photos in one request. Remove one or two.',
}
