import { createServer } from 'vite'
import { once } from 'node:events'
import { createApplication } from '../server/application.mjs'

// Development starts the fictional application's real API together with Vite.
// Production/live verification remains disabled without trusted adapters.
const env = { ...process.env, REVIEWS_DEMO: process.env.REVIEWS_DEMO ?? 'true' }
let origin = 'http://localhost:5173'
const api = createApplication({ env, origin: () => origin })
let vite
try {
  api.listen(0,'127.0.0.1'); await once(api,'listening')
  const target = `http://127.0.0.1:${api.address().port}`
  vite = await createServer({ server: { host: '127.0.0.1', port: Number(env.DEV_PORT || 5173), strictPort: env.DEV_STRICT_PORT === 'true', proxy: { '/api/assistant': target, '/api/reviews': target } } })
  await vite.listen()
  origin = vite.resolvedUrls.local[0].replace(/\/$/, '')
  console.log(`\nFiável ${env.REVIEWS_DEMO === 'true' ? 'persistent fictional review demo' : 'review backend disabled'}\n${origin}/app/reviews\nAPI ${target}\n`)
} catch (error) {
  console.error(error.message)
  await vite?.close(); api.closeAllConnections(); api.close()
  process.exitCode = 1
}
let closing = false
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => {
  if (closing) return
  closing = true
  await vite?.close(); api.closeAllConnections(); api.close()
})
