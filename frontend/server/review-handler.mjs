import { randomBytes, createHash } from 'node:crypto'

export function createReviewHandler({ service, authenticate, demo = false, origin = 'http://localhost:5173', now = Date.now } = {}) {
  const buckets = new Map()
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const finish = (code, value) => { res.statusCode = code; res.end(JSON.stringify(value)) }
    try {
      const expectedOrigin = typeof origin === 'function' ? origin() : origin
      const url = new URL(req.url, expectedOrigin)
      if (!url.pathname.startsWith('/api/reviews')) return finish(404, { error: 'Not found.' })
      if (!['GET', 'POST'].includes(req.method)) return finish(405, { error: 'GET or POST required.' })
      const sameOriginRead = req.method === 'GET' && !req.headers.origin && req.headers['sec-fetch-site'] === 'same-origin'
      if ((!sameOriginRead && req.headers.origin !== expectedOrigin) || req.headers['x-fiavel-reviews'] !== '1') return finish(403, { error: 'Origin rejected.' })
      if (!service || (!demo && !authenticate)) return finish(503, { error: 'Trusted review session, storage and lease adapters are not configured.' })
      let input = {}
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return finish(415, { error: 'JSON required.' })
        let size = 0; const chunks = []
        for await (const chunk of req) { size += chunk.length; if (size > 12000) return finish(413, { error: 'Request too large.' }); chunks.push(chunk) }
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error() } catch { return finish(400, { error: 'Invalid JSON object.' }) }
      }
      for (const [key, value] of buckets) if (value.until <= now()) buckets.delete(key)
      const token = /(?:^|;\s*)fiavel-review-demo=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1]
      const hash = token && createHash('sha256').update(token).digest('hex')
      const demoWorkspace = demo && hash ? service.getDemoSession(hash, now()) : null
      if (demo && req.method === 'POST' && url.pathname === '/api/reviews/session') {
        if (demoWorkspace) return finish(200, { mode: 'demo' })
        const id = randomBytes(24).toString('hex')
        service.createDemoSession(createHash('sha256').update(id).digest('hex'), now())
        const secure = expectedOrigin.startsWith('https:') ? '; Secure' : ''
        res.setHeader('Set-Cookie', `fiavel-review-demo=${id}; HttpOnly; SameSite=Strict; Path=/api/reviews; Max-Age=2592000${secure}`)
        return finish(201, { mode: 'demo' })
      }
      const role = req.headers['x-fiavel-demo-role']
      const user = demo ? demoWorkspace && ['tenant', 'landlord'].includes(role) ? { id: role === 'tenant' ? 'ana' : 'manuel', role } : null : await authenticate(req)
      if (!user) return finish(401, { error: 'Sign in required. Start a fictional demo session to explore.' })
      const workspace = demo ? demoWorkspace : 'live'
      const key = `${workspace}:${user.id}`
      const bucket = buckets.get(key) ?? { count: 0, until: now() + 60000 }
      bucket.count++; buckets.set(key, bucket)
      if (bucket.count > 60 || buckets.size > 10000) return finish(429, { error: 'Too many requests. Retry in a minute.' })
      if (req.method === 'GET' && url.pathname === '/api/reviews') return finish(200, service.view(user, workspace, { page: Number(url.searchParams.get('page') ?? 1), rating: url.searchParams.get('rating') ?? 'all', sort: url.searchParams.get('sort') ?? 'newest' }))
      if (req.method === 'GET' && url.pathname === '/api/reviews/context') return finish(200, service.assistantContext(user, workspace))
      if (req.method === 'GET' && url.pathname === '/api/reviews/moderation') return finish(200, service.moderationQueue(user, workspace))
      if (req.method === 'POST' && url.pathname === '/api/reviews') return finish(201, service.submit(user, workspace, input))
      if (req.method === 'POST' && url.pathname === '/api/reviews/assist') return finish(200, service.assist(user, workspace, input.text, input.language))
      const match = /^\/api\/reviews\/([a-zA-Z0-9-]+)\/(response|report|moderate)$/.exec(url.pathname)
      if (req.method === 'POST' && match) {
        const [,id,action] = match
        return finish(200, action === 'response' ? service.respond(user,workspace,id,input.text) : action === 'report' ? service.report(user,workspace,id,input.reason) : service.moderate(user,workspace,id,input.state,input.reason))
      }
      return finish(404, { error: 'Not found.' })
    } catch (error) { return finish(error.status ?? 500, { error: error.status ? error.message : 'Review service unavailable.' }) }
  }
}
