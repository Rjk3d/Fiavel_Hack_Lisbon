import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createAssistantHandler } from './handler.mjs'
import { createGateway } from './gateway.mjs'
import { createReviewHandler } from './review-handler.mjs'
import { createReviewService } from './reviews.mjs'

export function createApplication({ env = process.env, origin = env.AI_APP_ORIGIN || 'http://localhost:5173' } = {}) {
  const demo = env.REVIEWS_DEMO === 'true'
  const now = Date.now()
  const path = resolve(env.REVIEWS_DB_PATH || '.data/reviews-demo.sqlite')
  if (demo) mkdirSync(dirname(path), { recursive: true })
  const service = demo ? createReviewService({ demo: true, path, leases: [
    { id: 'lease-arroios', tenantId: 'ana', landlordId: 'manuel', source: 'demo', status: 'active', completionVerified: false, provider: 'backend' },
    { id: 'demo-completed-rental', tenantId: 'ana', landlordId: 'manuel', source: 'demo', status: 'completed', completedAt: new Date(now - 86400000).toISOString(), completionVerified: true, provider: 'backend', reviewOpensAt: new Date(now).toISOString(), reviewClosesAt: new Date(now + 14 * 86400000).toISOString() },
  ] }) : undefined
  const reviews = createReviewHandler({ service, demo, origin })
  const assistant = createAssistantHandler({ gateway: createGateway(env), allowExternal: env.AI_ALLOW_EXTERNAL === 'true', origin })
  const server = createServer((req,res) => req.url?.startsWith('/api/reviews') ? reviews(req,res) : assistant(req,res))
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.on('close', () => service?.close())
  return server
}
