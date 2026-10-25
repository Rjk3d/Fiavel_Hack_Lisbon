import { boundedHistory } from './context.ts'
import { parseReply } from './protocol.ts'
import type { ContextualAssistant } from './reply.ts'

export const backendAssistant: ContextualAssistant = {
  async reply(request) {
    const timeout = AbortSignal.timeout(15000)
    const signal = request.signal ? AbortSignal.any([timeout, request.signal]) : timeout
    const response = await fetch('/api/assistant', {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json', 'X-Fiavel-Assistant': '1' },
      body: JSON.stringify({ question: request.question, history: boundedHistory(request.history), language: request.language, leaseId: request.context.activeLease?.id, externalConsent: true }),
    })
    if (!response.ok) {
      const messages: Record<number, string> = { 401: 'Sign in through the configured backend session.', 403: 'Access or external-model consent denied.', 404: 'The assistant backend is not available.', 429: 'Too many requests. Wait a moment before retrying.', 503: 'The backend session, data adapter, or model gateway is not configured.', 504: 'The model gateway timed out. Please retry.' }
      throw new Error(messages[response.status] ?? 'The assistant service could not complete this request.')
    }
    const text = await response.text()
    if (text.length > 20000) throw new Error('Assistant response exceeded the limit.')
    return parseReply(JSON.parse(text))
  },
}
