import { createServer } from 'node:http'
import { createAssistantHandler } from './handler.mjs'
import { createGateway } from './gateway.mjs'

// Fail closed until the host application supplies authenticated session and
// authorized database adapters. No browser-supplied identity is accepted.
const handler = createAssistantHandler({ gateway: createGateway(), allowExternal: process.env.AI_ALLOW_EXTERNAL === 'true', origin: process.env.AI_APP_ORIGIN || 'http://localhost:5173' })
const server = createServer(handler)
server.requestTimeout = 15000
server.headersTimeout = 10000
server.listen(Number(process.env.AI_PORT || 8787), '127.0.0.1', () => console.log('Assistant backend adapter listening on 127.0.0.1. Live mode requires trusted session/data adapters.'))
