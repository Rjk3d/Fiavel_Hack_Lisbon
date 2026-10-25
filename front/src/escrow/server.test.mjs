import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { sqliteBindingStore, sqliteAttemptStore } from '../../../packages/escrow-domain/server/sqlite-store.mjs'
import { createTrustlessWorkServerReader } from '../../../packages/escrow-domain/server/trustless-reader.mjs'
import { createShadowHandler } from '../../server/shadow-handler.mjs'
// Vite 5 predates this Node 22 built-in; load it natively, not as a package.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

const databases = []
const testBinding = (leaseId = 'lease-7') => ({ version: 1, leaseId, provider: 'leasevault', providerEscrowId: leaseId, contractId: 'test-only-contract', network: 'test-only-network', asset: { contractId: 'test-only-token', code: 'USDC', issuer: 'test-only-issuer', decimals: 7 }, expectedDeposit: '18000000000', requiredFunding: '27000000000', verifiedFundedAmount: null, status: 'created', capabilities: {}, locked: false, recovery: 'none', transactions: [] })
function database() { const db = new DatabaseSync(':memory:'); databases.push(db); return db }
afterEach(() => { for (const db of databases.splice(0)) db.close() })

describe('actual SQLite constraints and durable recovery storage (synthetic records)', () => {
  it('persists identity and amounts through closing and reopening a database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fiavel-hybrid-'))
    const path = join(directory, 'escrows.sqlite')
    let db = new DatabaseSync(path)
    try {
      sqliteBindingStore(db).insert(testBinding()); db.close(); db = new DatabaseSync(path)
      expect(sqliteBindingStore(db).get('lease-7').expectedDeposit).toBe('18000000000')
    } finally { db.close(); rmSync(path); rmdirSync(directory) }
  })
  it('one active escrow per lease is enforced by a database primary key', () => {
    const store = sqliteBindingStore(database()); store.insert(testBinding())
    expect(() => store.insert({ ...testBinding(), provider: 'trustless_work' })).toThrow()
  })
  it('provider, asset and escrow identity cannot be changed or deleted, even after funding', () => {
    const db = database(); const store = sqliteBindingStore(db); const b = testBinding(); store.insert(b)
    expect(() => store.update({ ...b, provider: 'trustless_work' })).toThrow('immutable')
    expect(() => store.update({ ...b, asset: { ...b.asset, contractId: 'other-token' } })).toThrow('immutable')
    expect(() => store.update({ ...b, asset: { ...b.asset, issuer: 'other-issuer' } })).toThrow('immutable')
    expect(() => store.update({ ...b, asset: { ...b.asset, decimals: 6 } })).toThrow('immutable')
    expect(() => db.prepare('DELETE FROM escrow_bindings WHERE lease_id=?').run(b.leaseId)).toThrow('cannot be deleted')
    store.update({ ...b, locked: true })
    expect(() => store.update({ ...b, requiredFunding: '18000000000', locked: true })).toThrow('immutable')
  })
  it('supports unknown historical amounts without inventing a missing Blend buffer', () => {
    const store = sqliteBindingStore(database()); const b = { ...testBinding(), locked: true, requiredFunding: null }; store.insert(b)
    expect(store.get(b.leaseId).requiredFunding).toBeNull()
    store.update({ ...b, requiredFunding: '27900000000' })
    expect(() => store.update({ ...b, requiredFunding: '27000000000' })).toThrow('immutable')
  })
  it('transaction references survive a swap-confirmed/funding-failed retry and idempotency is scoped', () => {
    const db = database(); const bindings = sqliteBindingStore(db); const b = testBinding(); bindings.insert(b)
    const attempts = sqliteAttemptStore(db)
    const swap = { hash: 'a'.repeat(64), kind: 'swap', xdr: 'TEST-ONLY-SIGNED-XDR', status: 'confirmed' }
    attempts.save('payment-7', b, 'SWAP_CONFIRMED', { swap: swap.hash }, [swap])
    attempts.save('payment-7', b, 'RECOVERY_REQUIRED', { swap: swap.hash, fundingFailed: true }, [swap])
    expect(attempts.get('payment-7').swap).toBe(swap.hash)
    expect(db.prepare('SELECT count(*) AS n FROM escrow_transactions').get().n).toBe(1)
    const other = testBinding('lease-8'); bindings.insert(other)
    expect(() => attempts.save('payment-7', other, 'CREATED', {})).toThrow('another escrow')
  })
  it('funding an unbound or different provider is rejected before attempt persistence', () => {
    const db = database(); sqliteBindingStore(db); const attempts = sqliteAttemptStore(db)
    expect(() => attempts.save('payment-7', testBinding(), 'CREATED', {})).toThrow('bound first')
    sqliteBindingStore(db).insert(testBinding())
    expect(() => attempts.save('payment-7', { ...testBinding(), provider: 'trustless_work' }, 'CREATED', {})).toThrow('bound first')
  })
})

describe('server-only documented V2 GET transport', () => {
  it('uses the verified beta route and server-only x-api-key, without financial writes', async () => {
    const http = vi.fn(async (url, options) => {
      expect(url).toBe(`https://beta.api.trustlesswork.com/escrow/single-release/v2/${'C'.repeat(56)}`)
      expect(options.method).toBe('GET'); expect(options.redirect).toBe('error')
      expect(options.headers['x-api-key']).toBe('server-only-fiavel-test-key')
      return Response.json({ balance: '1800' })
    })
    expect(await createTrustlessWorkServerReader('server-only-fiavel-test-key', http)('C'.repeat(56))).toEqual({ balance: '1800' })
    expect(http).toHaveBeenCalledTimes(1)
  })
  it('missing credentials, invalid contract, malformed body and provider API outage fail closed', async () => {
    expect(() => createTrustlessWorkServerReader('')).toThrow('not configured')
    const http = vi.fn(async () => new Response('{}', { status: 503 }))
    const reader = createTrustlessWorkServerReader('test', http)
    await expect(reader('not-a-contract')).rejects.toThrow('Invalid'); expect(http).not.toHaveBeenCalled()
    await expect(reader('C'.repeat(56))).rejects.toThrow('original provider remains selected')
    await expect(createTrustlessWorkServerReader('test', async () => new Response('not-json'))('C'.repeat(56))).rejects.toThrow()
  })
})

async function serve(options, check) {
  const server = createServer(createShadowHandler(options)); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try { await check(`http://127.0.0.1:${server.address().port}`) } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}
describe('HTTP shadow boundary: no production session is fabricated', () => {
  it('default route is unavailable and financial HTTP writes are rejected', async () => serve({}, async base => {
    expect((await fetch(`${base}/api/escrow?leaseId=7`)).status).toBe(503)
    expect((await fetch(`${base}/api/escrow`, { method: 'POST' })).status).toBe(405)
  }))
  it('requires a trusted session and authorized binding, not browser-supplied provider/contract', async () => {
    const read = vi.fn(async () => ({ balance: '1800' }))
    await serve({ authenticate: async () => null, loadAuthorizedBinding: async () => testBinding(), readOnChain: read }, async base => expect((await fetch(`${base}/api/escrow?leaseId=7`)).status).toBe(401))
    await serve({ authenticate: async () => ({ id: 'tenant' }), loadAuthorizedBinding: async () => null, readOnChain: read }, async base => expect((await fetch(`${base}/api/escrow?leaseId=other&contractId=stolen`)).status).toBe(403))
    expect(read).not.toHaveBeenCalled()
  })
  it('does not reassign an existing LeaseVault binding to TW just because the API is available', async () => {
    const read = vi.fn()
    await serve({ authenticate: async () => ({ id: 'tenant' }), loadAuthorizedBinding: async () => testBinding(), readOnChain: read }, async base => expect((await fetch(`${base}/api/escrow?leaseId=7`)).status).toBe(409))
    expect(read).not.toHaveBeenCalled()
  })
  it('authorized shadow reads return API provenance and errors never echo credentials or private provider bodies', async () => {
    const options = { authenticate: async () => ({ id: 'tenant' }), loadAuthorizedBinding: async () => ({ ...testBinding(), provider: 'trustless_work' }), readOnChain: async () => ({ balance: '1800' }) }
    await serve(options, async base => { const response = await fetch(`${base}/api/escrow?leaseId=7`); expect(response.headers.get('cache-control')).toBe('no-store'); expect((await response.json()).source).toBe('provider-api') })
    await serve({ ...options, readOnChain: async () => { throw new Error('secret-api-key private body') } }, async base => { const response = await fetch(`${base}/api/escrow?leaseId=7`); expect(response.status).toBe(502); expect(await response.text()).not.toContain('secret-api-key') })
  })
})
