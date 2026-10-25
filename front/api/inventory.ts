// Vercel function: AI help for the move-in / move-out inventory (describe a
// room, compare a room at move-in and move-out). Needs ANTHROPIC_API_KEY.
// The photos are only sent here when a party clicks "Analyse with AI".

import { allow, clientFromEnv, STATUS } from '../server/assistant.js'
import { inspect } from '../server/inventory.js'

interface Req {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
interface Res {
  status: (n: number) => { json: (b: unknown) => void }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'invalid' })
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown'
  if (!allow(`inventory:${ip}`, Date.now(), 10)) return res.status(429).json({ ok: false, error: 'rate_limited' })
  const out = await inspect(req.body, clientFromEnv())
  return res.status(out.ok ? 200 : STATUS[out.error]).json(out)
}
