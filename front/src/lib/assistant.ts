/** Browser side of /api/assistant (front/server/assistant.ts). */
export type AssistLang = 'en' | 'fr' | 'pt'

export type AssistResult =
  | { ok: true; text: string; numbersChanged: boolean }
  | { ok: false; error: 'not_configured' | 'invalid' | 'refused' | 'unavailable' | 'rate_limited' | 'offline' }

export async function assist(body: {
  task: 'translate' | 'rephrase' | 'summarize'
  lang: AssistLang
  text?: string
  role?: 'tenant' | 'landlord'
  thread?: { who: 'tenant' | 'landlord'; text: string }[]
}): Promise<AssistResult> {
  try {
    const r = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const out = (await r.json().catch(() => null)) as AssistResult | null
    return out ?? { ok: false, error: r.status === 404 ? 'not_configured' : 'unavailable' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export const ASSIST_ERROR: Record<Exclude<AssistResult, { ok: true }>['error'], string> = {
  not_configured: 'AI language help is not set up on this deployment (no API key). Messages still work.',
  invalid: 'This text cannot be sent to the AI (empty or too long).',
  refused: 'The AI declined this text.',
  unavailable: 'The AI is unavailable right now. Try again.',
  rate_limited: 'Too many AI requests. Wait a minute.',
  offline: 'No connection to the AI.',
}

/** Language the viewer reads, from the browser. */
export function browserLang(): AssistLang {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2)
  return l === 'fr' || l === 'pt' ? l : 'en'
}
