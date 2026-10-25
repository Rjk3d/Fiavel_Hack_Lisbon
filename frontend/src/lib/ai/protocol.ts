import { actionIds, type Language, type Turn } from './context.ts'
import { intents } from './policy.ts'
import type { Reply } from './reply.ts'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const short = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
export function parseHistory(value: unknown): Turn[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('Invalid conversation history.')
  return value.map(turn => {
    if (!object(turn) || !['user', 'assistant'].includes(String(turn.role)) || !short(turn.text, 2000) || (turn.intent !== undefined && !intents.includes(turn.intent as never))) throw new Error('Invalid conversation turn.')
    return { role: turn.role as Turn['role'], text: turn.text, ...(turn.intent ? { intent: turn.intent as Turn['intent'] } : {}) }
  })
}

export function parseRequest(value: unknown) {
  if (!object(value) || !short(value.question, 2000) || !value.question.trim() || !['en', 'fr'].includes(String(value.language)) || (value.leaseId !== undefined && !short(value.leaseId, 100))) throw new Error('Invalid assistant request.')
  // Context, user IDs, roles, and actions supplied by the browser are never trusted.
  return { question: value.question, language: value.language as Language, leaseId: value.leaseId as string | undefined, history: parseHistory(value.history), externalConsent: value.externalConsent === true }
}

export function parseReply(value: unknown): Reply {
  if (!object(value) || !short(value.text, 12000) || !intents.includes(value.intent as never) || !['en', 'fr'].includes(String(value.language)) || !['demo', 'model-assisted'].includes(String(value.mode)) || !['demo', 'backend', 'verified-blockchain'].includes(String(value.provenance))) throw new Error('Invalid assistant response.')
  if (!Array.isArray(value.facts) || value.facts.length > 12 || value.facts.some(fact => !object(fact) || !short(fact.label, 150) || !short(fact.value, 500))) throw new Error('Invalid response facts.')
  if (!Array.isArray(value.suggestions) || value.suggestions.length > 6 || value.suggestions.some(item => !short(item, 200))) throw new Error('Invalid response suggestions.')
  if (!Array.isArray(value.actions) || value.actions.length > 5 || value.actions.some(action => !object(action) || !actionIds.includes(action.id as never) || !short(action.label, 150))) throw new Error('Invalid response actions.')
  if (value.draft !== undefined && !short(value.draft, 4000)) throw new Error('Invalid draft.')
  return value as unknown as Reply
}

export function parseModelPlan(value: unknown) {
  if (!object(value) || Object.keys(value).some(key => !['intent'].includes(key)) || !intents.includes(value.intent as never)) throw new Error('Malformed provider output.')
  return { intent: value.intent as Reply['intent'] }
}
