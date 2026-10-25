import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, Transaction, TransactionBuilder, rpc, type Lease } from 'lease-vault-client'
import { NETWORK } from '../config'
import { escrowUSDC, fundingPorts } from './stellar'
import { assetKey, FUND_FEE_CAP, UNIT, type Attempt, type Quote } from './domain'
import { browserAttemptStore } from './storage'

const read = vi.hoisted(() => ({ token: '', lease: {} as Lease }))
vi.mock('lease-vault-client', async importOriginal => {
  const actual = await importOriginal<typeof import('lease-vault-client')>()
  return { ...actual, Client: class {
    async get_config() { return { result: { token: read.token } } }
    async get_lease() { return { result: read.lease } }
  } }
})

const pair = Keypair.random() // Ephemeral test-only key, never logged or submitted to a real network.
const wallet = { role: 'tenant' as const, address: pair.publicKey(), sign: pair }
let account: Record<string, unknown>
let closedAt: string
let paths: unknown[]
const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  if (url.pathname === '/') return Response.json({ network_passphrase: NETWORK.passphrase })
  if (url.pathname.startsWith('/accounts/')) return Response.json(account)
  if (url.pathname === '/ledgers') return Response.json({ _embedded: { records: [{ base_reserve_in_stroops: 5000000, closed_at: closedAt }] } })
  if (url.pathname === '/fee_stats') return Response.json({ fee_charged: { p90: '100' } })
  if (url.pathname === '/paths/strict-receive') return Response.json({ _embedded: { records: paths } })
  if (url.pathname === '/transactions' && init?.method === 'POST') return Response.json({ successful: true })
  if (url.pathname.startsWith('/transactions/')) return new Response('{}', { status: 404 })
  throw new Error(`Unexpected test HTTP call: ${url.pathname}`)
})
beforeEach(() => {
  read.token = NETWORK.usdc
  read.lease = { status: { tag: 'Created', values: undefined }, landlord: Keypair.random().publicKey(), created_at: BigInt(Math.floor(Date.now() / 1000) - 10), terms: { rent: 900n * UNIT, deposit: 1800n * UNIT, buffer_bps: 500, yield_offered: true, move_in_window: 3600n, arbiter: Keypair.random().publicKey() }, liquid: 1800n * UNIT, placed: 0n, rent_escrow: 900n * UNIT } as Lease
  account = { sequence: '100', subentry_count: 1, balances: [{ asset_type: 'native', balance: '10000.0000000', selling_liabilities: '0' }, { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: NETWORK.usdcIssuer, balance: '3000.0000000', selling_liabilities: '100.0000000', buying_liabilities: '10.0000000', limit: '10000.0000000', is_authorized: true }] }
  closedAt = new Date().toISOString(); paths = []
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.spyOn(rpc.Server.prototype, 'getNetwork').mockResolvedValue({ passphrase: NETWORK.passphrase, protocolVersion: '29' } as Awaited<ReturnType<rpc.Server['getNetwork']>>)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function quote(): Quote {
  const ports = fundingPorts(wallet, 7n)
  return { scope: ports.scope, kind: 'path', input: { code: 'XLM' }, required: 2700n * UNIT, receive: 700n * UNIT, expected: 2000n * UNIT, maximum: 2010n * UNIT, path: [], expires: Date.now() + 30000, slippageBps: 50, fee: 100n, acceptYield: false, createdAt: read.lease.created_at.toString() }
}
function attempt(q = quote()): Attempt { return { version: 1, scope: q.scope, required: q.required.toString(), receive: q.receive.toString(), source: q.input, sourceMax: q.maximum.toString(), acceptYield: q.acceptYield, createdAt: q.createdAt, stage: 'reviewed' } }

describe('Stellar SDK adapter with stubbed network (no end-to-end financial transactions)', () => {
  it('checks the manifest issuer/SAC, RPC, Horizon and deployed config', async () => {
    await expect(fundingPorts(wallet, 7n).checkNetwork()).resolves.toBeUndefined()
    read.token = 'wrong-token'
    await expect(fundingPorts(wallet, 7n).checkNetwork()).rejects.toThrow('different token')
  })
  it('blocks a network mismatch and non-tenant signer before any transaction', async () => {
    vi.mocked(rpc.Server.prototype.getNetwork).mockResolvedValue({ passphrase: 'wrong-network' } as Awaited<ReturnType<rpc.Server['getNetwork']>>)
    await expect(fundingPorts(wallet, 7n).checkNetwork()).rejects.toThrow('network mismatch')
    await expect(fundingPorts({ ...wallet, role: 'landlord' }, 7n).checkNetwork()).rejects.toThrow('guarantor funding are disabled')
  })
  it('computes reserves, selling liabilities, trustline capacity and authorization exactly', async () => {
    const state = await fundingPorts(wallet, 7n).wallet()
    expect(state.xlmSpendable).toBe(unitsFor('9998.5000000'))
    expect(state.assets.find(asset => assetKey(asset.asset) === assetKey(escrowUSDC))?.spendable).toBe(2900n * UNIT)
    expect(state.usdcCapacity).toBe(6990n * UNIT); expect(state.usdcAuthorized).toBe(true)
    const lines = account.balances as { is_authorized?: boolean; asset_issuer?: string }[]
    lines[1].is_authorized = false
    expect((await fundingPorts(wallet, 7n).wallet()).usdcAuthorized).toBe(false)
    lines[1].asset_issuer = Keypair.random().publicKey()
    expect((await fundingPorts(wallet, 7n).wallet()).hasUSDC).toBe(false)
  })
  it('strict receive SDK envelope is self-directed, exact-output, bounded and cryptographically referenced', async () => {
    const ports = fundingPorts(wallet, 7n); const q = quote()
    const ref = await ports.prepareSwap(q)
    const tx = TransactionBuilder.fromXDR(ref.xdr, NETWORK.passphrase) as Transaction
    expect(tx.hash().toString('hex')).toBe(ref.hash); expect(tx.source).toBe(wallet.address)
    expect(tx.operations).toHaveLength(1)
    const op = tx.operations[0]
    if (op.type !== 'pathPaymentStrictReceive') throw new Error('Wrong operation')
    expect(op.destination).toBe(wallet.address); expect(op.destAmount).toBe('700.0000000'); expect(op.sendMax).toBe('2010.0000000')
    expect(op.destAsset.issuer).toBe(NETWORK.usdcIssuer); expect(op.sendAsset.isNative()).toBe(true)
    expect(tx.signatures).toHaveLength(1)
  })
  it('tampered references and another recipient cannot be rebroadcast', async () => {
    const ports = fundingPorts(wallet, 7n); const ref = await ports.prepareSwap(quote())
    await expect(ports.submit({ ...ref, hash: '0'.repeat(64) }, 'swap')).rejects.toThrow('does not match')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
  it('does not treat an unconfirmed or unexpired hash as success', async () => {
    const ports = fundingPorts(wallet, 7n); const q = quote(); const ref = await ports.prepareSwap(q); const a = { ...attempt(q), swap: ref }
    expect((await ports.status(ref, 'swap', a)).state).toBe('pending')
    closedAt = new Date((ref.expires + 20) * 1000).toISOString()
    expect((await ports.status(ref, 'swap', a)).state).toBe('failed')
  })
  it('prepares the exact existing LeaseVault fund call with the tenant signer', async () => {
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(async transaction => transaction as Transaction)
    const ports = fundingPorts(wallet, 7n); const a = attempt(); const ref = await ports.prepareFunding(a)
    a.fund = ref; a.stage = 'fund-pending'; browserAttemptStore().save(a)
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockResolvedValue({ status: 'PENDING', hash: ref.hash } as Awaited<ReturnType<rpc.Server['sendTransaction']>>)
    await expect(ports.submit(ref, 'fund')).resolves.toBeUndefined()
    const tx = TransactionBuilder.fromXDR(ref.xdr, NETWORK.passphrase) as Transaction
    expect(tx.operations[0].type).toBe('invokeHostFunction'); expect(tx.source).toBe(wallet.address)
  })
  it('requires sufficient real USDC and rejects funding fees above the disclosed ceiling', async () => {
    const ports = fundingPorts(wallet, 7n)
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(async transaction => {
      const source = transaction as Transaction
      return new TransactionBuilder({ accountId: () => source.source, sequenceNumber: () => '100', incrementSequenceNumber() {} }, { fee: (FUND_FEE_CAP + 1n).toString(), networkPassphrase: NETWORK.passphrase }).addOperation(source.toEnvelope().v1().tx().operations()[0]).setTimeout(90).build()
    })
    await expect(ports.prepareFunding(attempt())).rejects.toThrow('10 XLM ceiling')
    const lines = account.balances as { balance: string; selling_liabilities: string }[]
    lines[1].balance = '100.0000000'; lines[1].selling_liabilities = '0'
    await expect(ports.prepareFunding(attempt())).rejects.toThrow('Insufficient authorized USDC')
  })
  it('verifies tenant, status and held contract amounts instead of frontend success flags', async () => {
    const ports = fundingPorts(wallet, 7n); const a = attempt()
    expect(await ports.verify(a)).toBe(false)
    read.lease.status = { tag: 'Funded', values: undefined }; read.lease.tenant = wallet.address
    expect(await ports.verify(a)).toBe(true)
    read.lease.liquid -= 1n
    expect(await ports.verify(a)).toBe(false)
  })
})
function unitsFor(value: string) { return BigInt(value.replace('.', '')) }
