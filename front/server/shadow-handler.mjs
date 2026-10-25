/** Inject real backend sessions and authorized DB lookup before serving reads.
 * Existing client-side optional sign-in is NOT sufficient authorization.
 * This endpoint never builds, signs, submits or releases a transaction.
 */
export function createShadowHandler({ authenticate, loadAuthorizedBinding, readOnChain } = {}) {
  const limits = new Map()
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const finish = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)) }
    if (req.method !== 'GET') return finish(405, { error: 'This integration is read-only.' })
    if (!authenticate || !loadAuthorizedBinding || !readOnChain) return finish(503, { error: 'Trusted session, binding store and provider reader are not configured.' })
    try {
      const user = await authenticate(req)
      if (!user?.id) return finish(401, { error: 'Sign in required.' })
      for (const [key, entry] of limits) if (Date.now() - entry.at > 60000) limits.delete(key)
      if (limits.size >= 10000 && !limits.has(user.id)) return finish(429, { error: 'Rate limit reached.' })
      const entry = limits.get(user.id) ?? { at: Date.now(), count: 0 }; entry.count++; limits.set(user.id, entry)
      if (entry.count > 20) return finish(429, { error: 'Rate limit reached.' })
      const id = new URL(req.url, 'http://localhost').searchParams.get('leaseId')
      if (!id || id.length > 256) return finish(400, { error: 'A valid internal lease ID is required.' })
      const binding = await loadAuthorizedBinding(user, id)
      if (!binding) return finish(403, { error: 'Escrow unavailable for this participant.' })
      if (binding.provider !== 'trustless_work') return finish(409, { error: 'This lease remains on its original provider.' })
      return finish(200, { source: 'provider-api', snapshot: await readOnChain(binding.contractId) })
    } catch { return finish(502, { error: 'Provider unavailable. No migration, funding or release was performed.' }) }
  }
}
