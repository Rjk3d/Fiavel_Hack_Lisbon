import { createApplication } from './application.mjs'

const server = createApplication()
server.on('error', error => { console.error(`Backend failed to start: ${error.code}. Check AI_PORT and any existing server.`); process.exitCode = 1 })
server.listen(Number(process.env.AI_PORT || 8787), '127.0.0.1', () => console.log(`Fiável API listening on http://127.0.0.1:${server.address().port}. Reviews: ${process.env.REVIEWS_DEMO === 'true' ? 'persistent fictional demo' : 'disabled until trusted live adapters are configured'}.`))
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close() })
