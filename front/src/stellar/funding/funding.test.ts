import { describe, expect, it, vi } from 'vitest'
import type { Lease } from 'lease-vault-client'
import { FundingEngine } from './engine'
import { assertCanFund, assetKey, bestPath, ceilBps, decimal, totalFor, UNIT, units, type Attempt, type AttemptStore, type FundingPorts, type Scope, type TransactionStatus, type TxReference, type WalletState } from './domain'
import { browserAttemptStore } from './storage'

const target = { code: 'USDC', issuer: 'configured-issuer' }
const xlm = { code: 'XLM' }
const scope: Scope = { payer: 'tenant', vault: 'configured-vault', token: 'configured-sac', network: 'test-network', leaseId: '7' }
const lease = (): Lease => ({ landlord: 'landlord', tenant: undefined, status: { tag: 'Created', values: undefined }, created_at: 1000n, start: 0n, ended_at: 0n, months_settled: 0, months_unpaid: 0, rent_escrow: 0n, liquid: 0n, shares: 0n, placed: 0n, yield_active: false, entry_hash: undefined, exit_hash: undefined, tenant_moved_in: false, landlord_moved_in: false, terms: { rent: 900n * UNIT, deposit: 1800n * UNIT, arbiter: 'arbiter', move_in_window: 10000n, months: 12, period: 86400n, grace: 60n, claim_window: 60n, response_window: 60n, arbitration_window: 60n, buffer_bps: 500, tenant_share_bps: 7000, landlord_share_bps: 2000, yield_offered: true } })
const wallet = (): WalletState => ({ assets: [{ asset: target, balance: 3000n * UNIT, spendable: 3000n * UNIT, authorized: true }, { asset: xlm, balance: 10000n * UNIT, spendable: 9990n * UNIT, authorized: true }], hasUSDC: true, usdcAuthorized: true, usdcCapacity: 100000n * UNIT, xlmSpendable: 9990n * UNIT, fee: 100n, ledgerTime: 2000 })
const ref = (letter: string): TxReference => ({ hash: letter.repeat(64), xdr: 'TEST-ONLY-NOT-A-REAL-TRANSACTION', expires: 2200 })
function fixture() {
  let saved: Attempt | null = null
  const state = wallet(); const currentLease = lease(); let time = 2000000
  const store: AttemptStore = { load: () => saved && structuredClone(saved), save: value => { saved = structuredClone(value) } }
  const ports: FundingPorts = {
    scope, targetAsset: target, now: () => time, lease: vi.fn(async () => currentLease), wallet: vi.fn(async () => state), checkNetwork: vi.fn(async () => {}),
    paths: vi.fn(async (input, required) => [{ input, inputAmount: 5000n * UNIT, outputAmount: required, path: [] }]),
    prepareSwap: vi.fn(async () => ref('a')), prepareFunding: vi.fn(async () => ref('b')), submit: vi.fn(async () => {}),
    status: vi.fn(async () => ({ state: 'confirmed' } as TransactionStatus)), verify: vi.fn(async () => true),
  }
  const engine = new FundingEngine(ports, store)
  return { ports, engine, state, currentLease, store, advance: (ms: number) => { time += ms } }
}
describe('exact financial units and contract funding requirements', () => {
  it('never uses float arithmetic, preserves stroops and rounds max spend upward', () => {
    expect(units('123456789.1234567')).toBe(1234567891234567n)
    expect(decimal(1234567891234567n)).toBe('123456789.1234567')
    expect(ceilBps(1n, 50)).toBe(2n)
    expect(() => units('1.12345678')).toThrow(); expect(() => units('-1')).toThrow(); expect(() => units('NaN')).toThrow()
  })
  it('funds rent + deposit and only the explicitly accepted yield buffer', () => {
    expect(totalFor(lease(), false)).toBe(2700n * UNIT)
    expect(totalFor(lease(), true)).toBe(2790n * UNIT)
    const noYield = lease(); noYield.terms.yield_offered = false
    expect(totalFor(noYield, true)).toBe(2700n * UNIT)
  })
  it('chooses the cheapest exact-output route, rejecting underdelivery and excessive hops', () => {
    expect(bestPath([{ input: xlm, inputAmount: 5n, outputAmount: 10n, path: [] }, { input: xlm, inputAmount: 4n, outputAmount: 10n, path: [] }, { input: xlm, inputAmount: 1n, outputAmount: 9n, path: [] }], xlm, 10n)?.inputAmount).toBe(4n)
    expect(bestPath([{ input: xlm, inputAmount: 1n, outputAmount: 10n, path: Array(6).fill(target) }], xlm, 10n)).toBeUndefined()
  })
})
describe('funding state machine with deterministic test ports (no real swaps)', () => {
  it('direct USDC skips conversion and verifies contract state before success', async () => {
    const f = fixture(); const quote = await f.engine.getExactOutputQuote(target)
    expect(quote.kind).toBe('direct'); expect(f.ports.paths).not.toHaveBeenCalled()
    expect((await f.engine.start(quote)).stage).toBe('reviewed')
    expect(f.ports.prepareSwap).not.toHaveBeenCalled()
    expect((await f.engine.fundEscrow()).stage).toBe('funded')
    expect(f.ports.verify).toHaveBeenCalledTimes(1)
  })
  it('discovery only offers wallet assets and disables unavailable routes with reasons', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    vi.mocked(f.ports.paths).mockResolvedValue([])
    const choices = await f.engine.getSupportedAssets()
    expect(choices).toHaveLength(2)
    expect(choices.every(choice => !choice.supported)).toBe(true)
    expect(choices.find(choice => choice.asset.asset.code === 'XLM')?.reason).toContain('No executable route')
  })
  it('does not claim an XLM conversion route exists when it actually selects existing USDC', async () => {
    const f = fixture(); vi.mocked(f.ports.paths).mockResolvedValue([])
    const choices = await f.engine.getSupportedAssets()
    expect(choices.find(choice => choice.asset.asset.code === 'USDC')?.supported).toBe(true)
    expect(choices.find(choice => choice.asset.asset.code === 'XLM')?.supported).toBe(false)
    expect(choices.find(choice => choice.asset.asset.code === 'XLM')?.reason).toContain('unnecessary conversion')
  })
  it('rejects tampered spend limits and a direct quote with the wrong issuer', async () => {
    const f = fixture(); const quote = await f.engine.getExactOutputQuote(target)
    await expect(f.engine.start({ ...quote, maximum: quote.maximum * 2n })).rejects.toThrow('spend')
    await expect(f.engine.start({ ...quote, input: { code: 'USDC', issuer: 'other' } })).rejects.toThrow('issuer')
  })
  it('cached success is always rechecked against transaction and contract state', async () => {
    const f = fixture(); await f.engine.start(await f.engine.getExactOutputQuote(target)); await f.engine.fundEscrow()
    vi.mocked(f.ports.status).mockResolvedValue({ state: 'pending' })
    expect((await f.engine.recoverPendingFunding()).stage).toBe('fund-pending')
  })
  it('XLM conversion is exact output; escrow requires a separate explicit operation', async () => {
    const f = fixture(); f.state.assets[0].balance = f.state.assets[0].spendable = 0n
    const quote = await f.engine.getExactOutputQuote(xlm)
    expect(quote.receive).toBe(2700n * UNIT); expect(quote.maximum).toBe(5025n * UNIT)
    expect((await f.engine.start(quote)).stage).toBe('swap-confirmed')
    expect(f.ports.prepareFunding).not.toHaveBeenCalled()
    expect((await f.engine.fundEscrow()).stage).toBe('funded')
  })
  it('only converts the shortfall and skips conversion if enough USDC is already available', async () => {
    const f = fixture(); f.state.assets[0].spendable = 1000n * UNIT
    expect((await f.engine.getExactOutputQuote(xlm)).receive).toBe(1700n * UNIT)
    f.state.assets[0].spendable = 2700n * UNIT
    expect((await f.engine.getExactOutputQuote(xlm)).kind).toBe('direct')
  })
  it('rejects insufficient XLM after reserves and fee cap', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n; f.state.assets[1].spendable = 5010n * UNIT
    await expect(f.engine.getExactOutputQuote(xlm)).rejects.toThrow('Insufficient spendable XLM')
    f.state.xlmSpendable = 1n
    await expect(f.engine.getExactOutputQuote(xlm)).rejects.toThrow('fee budget')
  })
  it('rejects insufficient USDC for a direct payment', async () => {
    const f = fixture(); f.state.assets[0].spendable = 1n
    await expect(f.engine.getExactOutputQuote(target)).rejects.toThrow('Insufficient spendable USDC')
  })
  it('no route and exact-output mismatch disable conversion without a fabricated price', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    vi.mocked(f.ports.paths).mockResolvedValue([])
    await expect(f.engine.getExactOutputQuote(xlm)).rejects.toThrow('No executable route')
    vi.mocked(f.ports.paths).mockResolvedValue([{ input: xlm, inputAmount: 1n, outputAmount: 1n, path: [] }])
    await expect(f.engine.getExactOutputQuote(xlm)).rejects.toThrow('No executable route')
    expect(f.ports.submit).not.toHaveBeenCalled()
  })
  it('expired quotes are rejected before signing', async () => {
    const f = fixture(); const quote = await f.engine.getExactOutputQuote(target); f.advance(31000)
    await expect(f.engine.start(quote)).rejects.toThrow('expired')
    expect(f.ports.prepareFunding).not.toHaveBeenCalled()
  })
  it('caps slippage at 1% and revalidates executable liquidity against the approved maximum', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    await expect(f.engine.getExactOutputQuote(xlm, false, 101)).rejects.toThrow('1%')
    const quote = await f.engine.getExactOutputQuote(xlm)
    vi.mocked(f.ports.paths).mockResolvedValue([{ input: xlm, inputAmount: 6000n * UNIT, outputAmount: quote.receive, path: [] }])
    await expect(f.engine.start(quote)).rejects.toThrow('maximum spend')
    expect(f.ports.prepareSwap).not.toHaveBeenCalled()
  })
  it('wallet signature rejection never marks a transaction submitted', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    vi.mocked(f.ports.prepareSwap).mockRejectedValue(new Error('User rejected wallet signature'))
    await expect(f.engine.start(await f.engine.getExactOutputQuote(xlm))).rejects.toThrow('User rejected')
    expect(f.store.load(scope)?.swap).toBeUndefined(); expect(f.ports.submit).not.toHaveBeenCalled()
  })
  it('uncertain swap submission persists its identifier and does not trigger a second swap', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    vi.mocked(f.ports.submit).mockRejectedValue(new Error('Network timeout'))
    vi.mocked(f.ports.status).mockResolvedValue({ state: 'pending' })
    const quote = await f.engine.getExactOutputQuote(xlm)
    const attempt = await f.engine.start(quote)
    expect(attempt.stage).toBe('swap-pending'); expect(attempt.swap?.hash).toBe(ref('a').hash)
    await expect(f.engine.start(quote)).rejects.toThrow('existing transaction')
    expect(f.ports.prepareSwap).toHaveBeenCalledTimes(1)
  })
  it('swap success + rejected second signature remains recoverable and never swaps again', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    const quote = await f.engine.getExactOutputQuote(xlm); await f.engine.start(quote)
    vi.mocked(f.ports.prepareFunding).mockRejectedValue(new Error('Second signature rejected'))
    await expect(f.engine.fundEscrow()).rejects.toThrow('Second signature')
    expect((await f.engine.recoverPendingFunding()).stage).toBe('swap-confirmed')
    await expect(f.engine.start(quote)).rejects.toThrow('existing transaction')
    expect(f.ports.prepareSwap).toHaveBeenCalledTimes(1)
  })
  it('failed funding can be retried after chain failure with the conversion reference retained', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    await f.engine.start(await f.engine.getExactOutputQuote(xlm))
    vi.mocked(f.ports.status).mockImplementation(async (_ref, kind) => ({ state: kind === 'fund' ? 'failed' : 'confirmed' }))
    expect((await f.engine.fundEscrow()).stage).toBe('fund-failed')
    vi.mocked(f.ports.status).mockResolvedValue({ state: 'confirmed' })
    expect((await f.engine.fundEscrow()).stage).toBe('funded')
    expect(f.ports.prepareSwap).toHaveBeenCalledTimes(1)
  })
  it('successful submission without verified escrow state is not success', async () => {
    const f = fixture(); await f.engine.start(await f.engine.getExactOutputQuote(target))
    vi.mocked(f.ports.verify).mockResolvedValue(false)
    expect((await f.engine.fundEscrow()).stage).toBe('fund-pending')
  })
  it('funding pending/timeout never prepares a second financial transaction', async () => {
    const f = fixture(); await f.engine.start(await f.engine.getExactOutputQuote(target))
    vi.mocked(f.ports.status).mockResolvedValue({ state: 'pending' })
    expect((await f.engine.fundEscrow()).stage).toBe('fund-pending')
    expect((await f.engine.fundEscrow()).stage).toBe('fund-pending')
    expect(f.ports.prepareFunding).toHaveBeenCalledTimes(1)
  })
  it('duplicate concurrent requests are blocked synchronously', async () => {
    const f = fixture(); const quote = await f.engine.getExactOutputQuote(target)
    const first = f.engine.start(quote)
    await expect(f.engine.start(quote)).rejects.toThrow('already running')
    await first
  })
  it('network mismatch or invalid contract blocks all signing and submission', async () => {
    for (const message of ['Network mismatch', 'Invalid escrow contract']) {
      const f = fixture(); vi.mocked(f.ports.checkNetwork).mockRejectedValue(new Error(message))
      await expect(f.engine.getExactOutputQuote(target)).rejects.toThrow(message)
      expect(f.ports.prepareFunding).not.toHaveBeenCalled(); expect(f.ports.submit).not.toHaveBeenCalled()
    }
  })
  it('missing/unauthorized trustlines and full receive limit block conversions', async () => {
    for (const flag of ['hasUSDC', 'usdcAuthorized'] as const) {
      const f = fixture(); f.state[flag] = false
      await expect(f.engine.getExactOutputQuote(target)).rejects.toThrow(/trustline/)
    }
    const f = fixture(); f.state.assets[0].spendable = 0n; f.state.usdcCapacity = 1n
    await expect(f.engine.getExactOutputQuote(xlm)).rejects.toThrow('limit')
  })
  it('USDC with another issuer is never treated as the escrow asset', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    const other = { code: 'USDC', issuer: 'wrong-issuer' }
    f.state.assets.push({ asset: other, balance: 6000n * UNIT, spendable: 6000n * UNIT, authorized: true })
    const quote = await f.engine.getExactOutputQuote(other)
    expect(quote.kind).toBe('path'); expect(assetKey(quote.input)).not.toBe(assetKey(target))
  })
  it('does not mislabel an external cryptocurrency as native XLM', async () => {
    const f = fixture()
    await expect(f.engine.getExactOutputQuote({ code: 'ETH' })).rejects.toThrow('External-chain assets')
    expect(f.ports.prepareSwap).not.toHaveBeenCalled()
  })
  it('quotes are bound to wallet/network/lease and immutable on-chain terms', async () => {
    const f = fixture(); const quote = await f.engine.getExactOutputQuote(target)
    await expect(f.engine.start({ ...quote, scope: { ...scope, payer: 'someone-else' } })).rejects.toThrow('another wallet')
    f.currentLease.terms.deposit += UNIT
    await expect(f.engine.start(quote)).rejects.toThrow('terms changed')
  })
  it('deadline and party restrictions hold even after conversion', () => {
    expect(() => assertCanFund(lease(), 'landlord', 2000)).toThrow('cannot fund')
    expect(() => assertCanFund(lease(), 'arbiter', 2000)).toThrow('cannot fund')
    expect(() => assertCanFund(lease(), 'tenant', 12000)).toThrow('deadline')
  })
  it('durable storage failure stops payment before any signature/submission', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    f.store.save = () => { throw new Error('Storage quota exceeded') }
    await expect(f.engine.start(await f.engine.getExactOutputQuote(xlm))).rejects.toThrow('Storage quota')
    expect(f.ports.prepareSwap).not.toHaveBeenCalled(); expect(f.ports.submit).not.toHaveBeenCalled()
  })
  it('resume/rebroadcast uses the identical signed envelope and hash', async () => {
    const f = fixture(); f.state.assets[0].spendable = 0n
    vi.mocked(f.ports.status).mockResolvedValue({ state: 'pending' })
    await f.engine.start(await f.engine.getExactOutputQuote(xlm))
    await f.engine.rebroadcastPending()
    expect(f.ports.prepareSwap).toHaveBeenCalledTimes(1)
    expect(f.ports.submit).toHaveBeenNthCalledWith(1, ref('a'), 'swap')
    expect(f.ports.submit).toHaveBeenNthCalledWith(2, ref('a'), 'swap')
  })
})
describe('recovery persistence', () => {
  it('round trips by network/wallet/lease and journals transaction references without private keys', async () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const store = browserAttemptStore(storage)
    const f = fixture(); await f.engine.start(await f.engine.getExactOutputQuote(target)); const attempt = f.store.load(scope)!
    store.save({ ...attempt, fund: ref('b'), stage: 'fund-pending' })
    expect(store.load(scope)?.fund?.hash).toBe(ref('b').hash)
    expect(store.load({ ...scope, payer: 'other-user' })).toBeNull()
    expect([...values.values()].join('')).not.toMatch(/secret|seed|privateKey/)
  })
})
