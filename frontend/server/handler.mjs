import { buildContext } from '../src/lib/ai/context.ts'
import { composeReply } from '../src/lib/ai/reply.ts'
import { parseModelPlan, parseRequest, parseReply } from '../src/lib/ai/protocol.ts'
import { classify } from '../src/lib/ai/policy.ts'

export function createAssistantHandler({ authenticate, loadSnapshot, gateway, allowExternal = false, origin = 'http://localhost:5173', now = Date.now, requestTimeoutMs = 12000 } = {}) {
  const limits = new Map()
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const finish = (status, value) => { if (!res.destroyed && !res.writableEnded) { res.statusCode = status; res.end(JSON.stringify(value)) } }
    if (req.url !== '/api/assistant') return finish(404, { error: 'Not found.' })
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return finish(405, { error: 'POST required.' }) }
    if (req.headers.origin !== origin || req.headers['x-fiavel-assistant'] !== '1') return finish(403, { error: 'Origin rejected.' })
    if (!req.headers['content-type']?.startsWith('application/json')) return finish(415, { error: 'JSON required.' })
    if (!authenticate || !loadSnapshot) return finish(503, { error: 'Session and data adapters are not configured.' })
    const controller = new AbortController()
    const close = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', close)
    const timer = setTimeout(() => { controller.abort(new DOMException('Request timeout', 'TimeoutError')); finish(504, { error: 'Assistant request timed out.' }) }, requestTimeoutMs)
    try {
      const user = await authenticate(req)
      if (!user || typeof user.id !== 'string' || !['tenant', 'landlord'].includes(user.role)) return finish(401, { error: 'Sign in required.' })
      for (const [key, entry] of limits) if (now() - entry.start > 60000) limits.delete(key)
      if (!limits.has(user.id) && limits.size >= 10000) return finish(429, { error: 'Rate limit exceeded.' })
      const bucket = limits.get(user.id) ?? { start: now(), count: 0 }
      bucket.count++; limits.set(user.id, bucket)
      if (bucket.count > 20 || limits.size > 10000) { res.setHeader('Retry-After', '60'); return finish(429, { error: 'Rate limit exceeded.' }) }
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 32768) return finish(413, { error: 'Request too large.' }); chunks.push(chunk) }
      let input
      try { input = parseRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { return finish(400, { error: 'Invalid request.' }) }
      const snapshot = await loadSnapshot(user, { signal: controller.signal })
      let context
      try { context = buildContext(user, snapshot, input.leaseId) } catch { return finish(403, { error: 'Lease unavailable.' }) }
      const request = { ...input, context }
      const intent = classify(input.question, input.history)
      // Sensitive requests are refused locally; never send them to a model.
      if (['safety', 'privacy'].includes(intent)) return finish(200, parseReply(composeReply(request)))
      if (!gateway) return finish(503, { error: 'Model gateway not configured. Choose explicit demo mode.' })
      if (!allowExternal || !input.externalConsent) return finish(403, { error: 'External processing requires configuration and consent.' })
      const plan = parseModelPlan(await gateway(request, controller.signal))
      controller.signal.throwIfAborted()
      const reply = composeReply(request, plan.intent)
      reply.mode = 'model-assisted'
      return finish(200, parseReply(reply))
    } catch (error) {
      // Never echo provider bodies, credentials, private data or stack traces.
      return finish(controller.signal.aborted || error.name === 'TimeoutError' ? 504 : error.status === 429 ? 429 : 502, { error: 'Assistant unavailable. Please retry.' })
    } finally { clearTimeout(timer); res.off('close', close) }
  }
}
