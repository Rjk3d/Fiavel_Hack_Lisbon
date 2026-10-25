// Vercel function: language help for the landlord-tenant chat (translate,
// rephrase, summarize) through the Claude API. Needs ANTHROPIC_API_KEY in the
// project's environment variables; without it the app says the AI is off.

import { allow, assist, clientFromEnv, STATUS } from '../server/assistant.js'

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
  if (!allow(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' })
  const out = await assist(req.body, clientFromEnv())
  return res.status(out.ok ? 200 : STATUS[out.error]).json(out)
}
