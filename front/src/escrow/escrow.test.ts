import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Snapshot } from '@agents/rules'
import type { Lease, Status } from 'lease-vault-client'
import { EscrowCapabilityResolver, LEASEVAULT_CAPABILITIES, RENTAL_REQUIREMENTS, TRUSTLESS_CAPABILITIES, parseProviderMode, resolutionNet } from '@escrow/capabilities'
import { EscrowProviderRegistry, guardedStore } from '@escrow/registry'
import { TrustlessWorkAdapter } from '@escrow/trustless-work'
import { EscrowStateNormalizer } from '@escrow/normalize'
import { escrowAssistantContext } from '@escrow/assistant'
import type { Capabilities, EscrowBinding, EscrowProvider, FundingProof } from '@escrow/domain'
import { LeaseVaultAdapter } from './leasevault'
import { createProviderFundingEngine } from './funding'
import { legacyBinding } from './runtime'
import { NETWORK } from '../stellar/config'
import { UNIT, scopeKey, type Attempt, type AttemptStore, type FundingPorts, type TransactionStatus, type WalletState } from '../stellar/funding/domain'
import { EscrowDetails } from '../components/live/EscrowDetails'

function snap(status: Status['tag'] = 'Created'): Snapshot {
  const lease: Lease = {
    landlord: 'landlord', tenant: status === 'Created' ? undefined : 'tenant', status: { tag: status, values: undefined } as Status,
    created_at: 1000n, start: 1000n, ended_at: 1300n, months_settled: 3, months_unpaid: 0, rent_escrow: 900n * UNIT,
    liquid: 1800n * UNIT, placed: 0n, shares: 0n, yield_active: false, tenant_moved_in: true, landlord_moved_in: true, entry_hash: undefined, exit_hash: undefined,
    terms: { rent: 900n * UNIT, deposit: 1800n * UNIT, months: 3, period: 60n, grace: 10n, move_in_window: 3600n, claim_window: 60n, response_window: 60n, arbitration_window: 120n, arbiter: 'arbiter', yield_offered: true, buffer_bps: 500, tenant_share_bps: 7000, landlord_share_bps: 2000 },
  }
  return { id: 7n, lease, now: 1320, guaranteeValue: lease.liquid, blendAtRisk: false }
}
function memory() {
  const map = new Map<string, string>()
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } }
}
function binding(provider: 'leasevault' | 'trustless_work' = 'leasevault'): EscrowBinding {
  return { ...legacyBinding(7n, snap()), leaseId: 'internal-lease-7', provider, providerEscrowId: provider === 'leasevault' ? '7' : NETWORK.blendPool, contractId: provider === 'leasevault' ? NETWORK.leaseVault : NETWORK.blendPool, requiredFunding: (provider === 'leasevault' ? 2700n * UNIT : 1800n * UNIT).toString(), capabilities: provider === 'leasevault' ? LEASEVAULT_CAPABILITIES : TRUSTLESS_CAPABILITIES }
}
function rawTW() {
  return { type: 'single-release', contractId: NETWORK.blendPool, amount: '1800', balance: '1800', trustline: { contractId: NETWORK.usdc }, roles: { receiver: 'landlord', approvers: ['tenant'], releaseSigners: ['tenant'], serviceProviders: ['landlord'], disputeResolvers: ['arbiter'] }, released: false, dispute: { isDisputed: false, resolved: false } }
}
// Synthetic verified profile for selection/orchestration tests only. The actual
// TrustlessWorkAdapter remains rolloutReady=false and never prepares a write.
function verifiedTestProvider(): EscrowProvider {
  const capabilities = Object.fromEntries(Object.entries(TRUSTLESS_CAPABILITIES).map(([key, value]) => [key, { ...value, level: key === 'fund' || key === 'milestones' ? 'verified' : value.level }])) as Capabilities
  return { id: 'trustless_work', rolloutReady: true, capabilities,
    createEscrow: vi.fn(), getEscrow: vi.fn(), prepareFunding: async b => ({ amount: 1800n * UNIT, revision: '1000', asset: b.asset }), verifyFunding: vi.fn(async () => null), getReleaseCapabilities: () => capabilities,
    prepareClaim: vi.fn(), prepareRelease: vi.fn(), getTransactionHistory: vi.fn(async () => []),
  }
}
function providers(snapshot = snap()) { return [new LeaseVaultAdapter({ snapshot: async () => snapshot }), new TrustlessWorkAdapter()] }
function proof(b: EscrowBinding): FundingProof { return { source: 'rpc', network: b.network, contractId: b.contractId, token: b.asset.contractId, amount: b.requiredFunding!, transactionHash: 'b'.repeat(64), ledger: 100, successful: true } }

describe('hybrid eligibility and permanent provider selection', () => {
  it('existing LeaseVault leases retain their provider under every rollout mode', () => {
    const registry = new EscrowProviderRegistry(guardedStore(memory()), providers())
    const b = registry.bind({ ...binding(), locked: true, status: 'funded', transactions: [{ hash: 'a'.repeat(64), kind: 'fund', status: 'confirmed' }] })
    for (const mode of ['leasevault', 'trustless_work', 'hybrid'] as const) expect(registry.selectNew(mode, [], {}, b.leaseId)).toEqual(b)
    expect(registry.get(b.leaseId)?.transactions).toHaveLength(1)
  })
  it('a new compatible lease can select synthetic verified TW ports, without funding either provider', () => {
    const registry = new EscrowProviderRegistry(guardedStore(memory()), [verifiedTestProvider(), ...providers().filter(p => p.id === 'leasevault')])
    const b = registry.selectNew('hybrid', ['fund', 'milestones'], { trustless_work: binding('trustless_work') }, 'internal-lease-7')
    expect(b.provider).toBe('trustless_work'); expect(b.verifiedFundedAmount).toBeNull()
  })
  it('unsupported exact-net rental requirements fall back to LeaseVault in hybrid mode', () => {
    const result = new EscrowCapabilityResolver().select('hybrid', RENTAL_REQUIREMENTS, providers())
    expect(result.provider?.id).toBe('leasevault')
    expect(result.reasons.join(' ')).toContain('not ready')
  })
  it('TW-only mode refuses unsupported new rentals rather than silently selecting another provider', () => {
    expect(new EscrowCapabilityResolver().select('trustless_work', RENTAL_REQUIREMENTS, providers()).provider).toBeNull()
  })
  it('documented capabilities alone never qualify as a verified production deployment', () => {
    expect(new EscrowCapabilityResolver().select('hybrid', ['milestones'], providers()).provider).toBeNull()
    expect(new TrustlessWorkAdapter().rolloutReady).toBe(false)
  })
  it('provider binding cannot be changed, deleted/rebound or silently replaced after funding', () => {
    const registry = new EscrowProviderRegistry(guardedStore(memory()), providers()); const b = registry.bind(binding())
    expect(() => registry.bind(binding('trustless_work'))).toThrow('immutable')
    registry.lockForFunding(b.leaseId, 2700n * UNIT)
    expect(() => registry.lockForFunding(b.leaseId, 1800n * UNIT)).toThrow('cannot be replaced')
    expect(() => registry.providerFor({ ...b, network: 'other-network' })).toThrow('mismatch')
  })
  it('selection must be persisted before starting a payment', () => {
    const registry = new EscrowProviderRegistry(guardedStore(memory()), providers())
    expect(() => registry.lockForFunding('unbound', 1800n * UNIT)).toThrow('persisted')
  })
  it('missing provider never triggers fallback after a lease was bound', () => {
    const store = guardedStore(memory()); const b = binding('trustless_work'); store.insert(b)
    expect(() => new EscrowProviderRegistry(store, providers().filter(p => p.id === 'leasevault')).providerFor(b)).toThrow('original escrow provider is unavailable')
  })
  it('feature mode parsing rejects typos and defaults to LeaseVault', () => {
    expect(parseProviderMode(undefined)).toBe('leasevault'); expect(parseProviderMode('hybrid')).toBe('hybrid')
    expect(() => parseProviderMode('automatic')).toThrow('Invalid')
  })
  it('legacy payment scope keys remain byte-for-byte unchanged', () => {
    const scope = { network: 'n', vault: 'v', token: 't', payer: 'p', leaseId: '7' }
    expect(scopeKey(scope)).toBe('n|v|t|p|7')
    expect(scopeKey({ ...scope, provider: 'leasevault' })).toBe(scopeKey(scope))
    expect(scopeKey({ ...scope, provider: 'trustless_work' })).not.toBe(scopeKey(scope))
  })
})

describe('required 1800 → landlord 150 / tenant 1650 outcome', () => {
  it('documents why a 30-bps TW protocol fee is incompatible with the exact net requirement', () => {
    const result = resolutionNet(1800n * UNIT, [150n * UNIT, 1650n * UNIT])
    expect(result.fees).toBe(54000000n)
    expect(result.net).toEqual([1495500000n, 16450500000n]); expect(result.exactNet).toBe(false)
    expect(TRUSTLESS_CAPABILITIES.exactNetSplit.level).toBe('unsupported')
    // Rounding a tiny fee to zero does not establish a zero-fee capability.
    expect(resolutionNet(1n, [1n]).exactNet).toBe(false)
  })
  it('prepares the bounded LeaseVault arbitration after the undisputed 1650 has already been refunded', async () => {
    const s = snap('Disputed'); s.lease.liquid = 150n * UNIT; s.guaranteeValue = 150n * UNIT
    s.claim = { amount: 150n * UNIT, bond: 20n * UNIT, evidence: Buffer.alloc(32), filed_at: 1300n, offer: 0n, answered_at: 1310n }
    const adapter = new LeaseVaultAdapter({ snapshot: async () => s })
    const plan = await adapter.prepareRelease(binding(), { actor: { kind: 'human', address: 'arbiter', role: 'arbiter' }, kind: 'resolve', allocations: [{ address: 'landlord', amount: (150n * UNIT).toString() }, { address: 'tenant', amount: '0' }] })
    expect(plan.action).toBe('resolve'); expect(plan.args.to_landlord).toBe(150n * UNIT); expect(plan.requiresHumanSignature).toBe(true)
    expect(1650n * UNIT + (s.claim.amount - (plan.args.to_landlord as bigint))).toBe(1650n * UNIT)
  })
  it('does not count an already refunded 1650 a second time in the dispute allocation', async () => {
    const s = snap('Disputed'); s.claim = { amount: 150n * UNIT, bond: 0n, evidence: Buffer.alloc(32), filed_at: 1300n, offer: 0n, answered_at: 1310n }
    const adapter = new LeaseVaultAdapter({ snapshot: async () => s })
    await expect(adapter.prepareRelease(binding(), { actor: { kind: 'human', address: 'arbiter', role: 'arbiter' }, kind: 'resolve', allocations: [{ address: 'landlord', amount: (150n * UNIT).toString() }, { address: 'tenant', amount: (1650n * UNIT).toString() }] })).rejects.toThrow('remaining disputed amount')
  })
  it('full refund follows existing no-claim deadlines, with no generic landlord withdrawal', async () => {
    const s = snap('Ended'); s.now = 1400; const adapter = new LeaseVaultAdapter({ snapshot: async () => s })
    const actor = { kind: 'human' as const, address: 'tenant', role: 'tenant' as const }
    expect((await adapter.prepareRelease(binding(), { actor, kind: 'refund' })).action).toBe('release')
    await expect(adapter.prepareRelease(binding(), { actor, kind: 'release' })).rejects.toThrow('not a generic')
  })
  it('a dispute under review blocks the normal release path', async () => {
    const s = snap('Disputed'); const adapter = new LeaseVaultAdapter({ snapshot: async () => s })
    await expect(adapter.prepareRelease(binding(), { actor: { kind: 'human', address: 'tenant', role: 'tenant' }, kind: 'refund' })).rejects.toThrow()
  })
  it('unauthorized humans and the AI cannot authorize financial outcomes', async () => {
    const adapter = new LeaseVaultAdapter({ snapshot: async () => snap('Ended') })
    await expect(adapter.prepareRelease(binding(), { actor: { kind: 'human', address: 'intruder', role: 'tenant' }, kind: 'refund' })).rejects.toThrow('Unauthorized')
    await expect(adapter.prepareRelease(binding(), { actor: { kind: 'assistant', address: 'tenant', role: 'tenant' }, kind: 'refund' })).rejects.toThrow('cannot authorize')
    await expect(adapter.prepareClaim(binding(), { actor: { kind: 'assistant', address: 'landlord', role: 'landlord' }, amount: '150' })).rejects.toThrow('cannot authorize')
  })
})

describe('normalization, verification and AI projection', () => {
  it('TW read responses do not produce a verified funding badge or map receiver to tenant/landlord', async () => {
    const adapter = new TrustlessWorkAdapter(async () => rawTW())
    const state = await adapter.getEscrow(binding('trustless_work'))
    expect(state.status).toBe('funded'); expect(state.fundedVerified).toBe(false); expect(state.provenance).toBe('provider-api')
    expect(state.roles.receiver).toBe('landlord'); expect(state.roles.landlord).toBeUndefined()
    expect(await adapter.verifyFunding(binding('trustless_work'))).toBeNull()
  })
  it('a cached amount alone never produces a LeaseVault verified badge', async () => {
    const b = { ...binding(), verifiedFundedAmount: (2700n * UNIT).toString() }
    const state = await new LeaseVaultAdapter({ snapshot: async () => snap('Funded') }).getEscrow(b)
    expect(state.fundedVerified).toBe(false); expect(state.binding.verifiedFundedAmount).toBeNull()
  })
  it('preserves unknown historical funding amounts instead of inventing a missing buffer', () => {
    const b = legacyBinding(7n, snap('Active'))
    expect(b.requiredFunding).toBeNull(); expect(b.verifiedFundedAmount).toBeNull(); expect(b.locked).toBe(true)
  })
  it('accepts exact decimal strings and refuses fractional JSON-number ambiguity', () => {
    const n = new EscrowStateNormalizer(); const raw = rawTW()
    expect(n.trustlessWork(binding('trustless_work'), { ...raw, balance: '150.1234567' }).heldAmount).toBe('1501234567')
    expect(() => n.trustlessWork(binding('trustless_work'), { ...raw, balance: 150.1234567 })).toThrow('exact decimal string')
  })
  it('wrong asset, contract, response shape and approval-like status cannot be treated as verified', () => {
    const n = new EscrowStateNormalizer(); const b = binding('trustless_work')
    expect(() => n.trustlessWork(b, { ...rawTW(), contractId: 'other' })).toThrow('mismatch')
    expect(() => n.trustlessWork(b, { ...rawTW(), trustline: { contractId: 'wrong-token' } })).toThrow('mismatch')
    expect(() => n.trustlessWork(b, {})).toThrow()
    expect(n.trustlessWork(b, { ...rawTW(), milestones: [{ status: 'Approved', approvals: { target: 2, approvalCount: 0 } }] }).fundedVerified).toBe(false)
  })
  it('registry only records funding from matching successful RPC evidence', () => {
    const registry = new EscrowProviderRegistry(guardedStore(memory()), providers()); const b = registry.bind(binding())
    expect(() => registry.reconcile(b.leaseId, { ...proof(b), token: 'wrong-token' })).toThrow('proof required')
    expect(() => registry.reconcile(b.leaseId, { ...proof(b), successful: false })).toThrow('proof required')
    expect(registry.reconcile(b.leaseId, proof(b)).verifiedFundedAmount).toBe(b.requiredFunding)
  })
  it('provider API unavailable never triggers provider replacement or financial preparation', async () => {
    const adapter = new TrustlessWorkAdapter(async () => { throw new Error('Provider API unavailable') })
    const b = binding('trustless_work')
    await expect(adapter.getEscrow(b)).rejects.toThrow('unavailable')
    await expect(adapter.prepareFunding(b, { payer: 'tenant', acceptYield: false })).rejects.toThrow('shadow-only')
    await expect(adapter.prepareRelease(b, { actor: { kind: 'human', address: 'arbiter', role: 'arbiter' }, kind: 'resolve' })).rejects.toThrow('shadow-only')
    expect(b.provider).toBe('trustless_work')
  })
  it('AI context is authorized and contains no signing, private evidence or execution handle', async () => {
    const state = await new LeaseVaultAdapter({ snapshot: async () => snap('Active') }).getEscrow(binding())
    const context = escrowAssistantContext(state, 'tenant')
    expect(context.financialAuthority).toBe('none'); expect(context.fundedVerified).toBe(false)
    expect(JSON.stringify(context)).not.toMatch(/secret|signTransaction|privateEvidence|signedXdr/)
    expect(() => escrowAssistantContext(state, 'another-tenant')).toThrow('unavailable')
  })
  it('frontend renders the selected provider and never claims API-only data is verified', () => {
    const state = new EscrowStateNormalizer().trustlessWork(binding('trustless_work'), rawTW())
    const html = renderToStaticMarkup(createElement(EscrowDetails, { state }))
    expect(html).toContain('Trustless Work'); expect(html).toContain('Funding proof not linked')
    expect(html).not.toContain('Funding verified by RPC')
  })
})

describe('shared upstream funding with synthetic verified provider ports, not a live TW integration', () => {
  function flow() {
    const b = binding('trustless_work'); const provider = verifiedTestProvider()
    const registry = new EscrowProviderRegistry(guardedStore(memory()), [provider]); registry.bind(b)
    let saved: Attempt | null = null
    const store: AttemptStore = { load: () => saved && structuredClone(saved), save: attempt => { saved = structuredClone(attempt) } }
    const state: WalletState = { assets: [{ asset: { code: b.asset.code, issuer: b.asset.issuer }, balance: 2000n * UNIT, spendable: 2000n * UNIT, authorized: true }, { asset: { code: 'XLM' }, balance: 10000n * UNIT, spendable: 9990n * UNIT, authorized: true }], hasUSDC: true, usdcAuthorized: true, usdcCapacity: 10000n * UNIT, xlmSpendable: 9990n * UNIT, fee: 100n, ledgerTime: 2000 }
    const ports: FundingPorts = { scope: { provider: 'trustless_work', network: b.network, vault: b.contractId, token: b.asset.contractId, payer: 'tenant', leaseId: b.leaseId }, targetAsset: { code: b.asset.code, issuer: b.asset.issuer }, wallet: async () => state, checkNetwork: vi.fn(async () => {}), paths: vi.fn(async (input, required) => [{ input, outputAmount: required, inputAmount: 5000n * UNIT, path: [] }]), prepareSwap: vi.fn(async () => ({ hash: 'a'.repeat(64), xdr: 'TEST-ONLY-XDR', expires: 2100 })), prepareFunding: vi.fn(async () => ({ hash: 'b'.repeat(64), xdr: 'TEST-ONLY-XDR', expires: 2100 })), submit: vi.fn(async () => {}), status: vi.fn(async () => ({ state: 'confirmed' } as TransactionStatus)), verify: vi.fn(async () => true), fundingProof: vi.fn(async () => proof(b)), now: () => 2000000 }
    return { engine: createProviderFundingEngine(b, registry, ports, store), registry, ports, state, b }
  }
  it('direct USDC uses the chosen provider amount (1800, not LeaseVault rent + deposit)', async () => {
    const f = flow(); const quote = await f.engine.getExactOutputQuote(f.ports.targetAsset)
    expect(quote.required).toBe(1800n * UNIT); expect(quote.kind).toBe('direct')
    await f.engine.start(quote); expect((await f.engine.fundEscrow()).stage).toBe('funded')
    expect(f.registry.get(f.b.leaseId)?.provider).toBe('trustless_work')
    expect(f.registry.get(f.b.leaseId)?.verifiedFundedAmount).toBe((1800n * UNIT).toString())
  })
  it('swap succeeds, funding fails, and retry never swaps again or switches providers', async () => {
    const f = flow(); f.state.assets[0].balance = f.state.assets[0].spendable = 0n
    const quote = await f.engine.getExactOutputQuote({ code: 'XLM' }); await f.engine.start(quote)
    vi.mocked(f.ports.prepareFunding).mockRejectedValueOnce(new Error('Wallet rejects second signature'))
    await expect(f.engine.fundEscrow()).rejects.toThrow('second signature')
    expect(f.registry.get(f.b.leaseId)?.verifiedFundedAmount).toBeNull()
    expect(f.registry.get(f.b.leaseId)?.recovery).toBe('required')
    expect((await f.engine.recoverPendingFunding()).swap?.hash).toBe('a'.repeat(64))
    expect((await f.engine.fundEscrow()).stage).toBe('funded')
    expect(f.ports.prepareSwap).toHaveBeenCalledTimes(1)
    expect(f.registry.get(f.b.leaseId)?.transactions.some(tx => tx.kind === 'swap')).toBe(true)
  })
  it('scope mismatch, provider change and a failed proof block verified completion', async () => {
    const f = flow(); const quote = await f.engine.getExactOutputQuote(f.ports.targetAsset)
    await f.engine.start(quote)
    expect(() => f.registry.bind({ ...f.b, provider: 'leasevault' })).toThrow('immutable')
    vi.mocked(f.ports.fundingProof!).mockResolvedValue(null)
    expect((await f.engine.fundEscrow()).stage).toBe('fund-pending')
    expect(f.registry.get(f.b.leaseId)?.verifiedFundedAmount).toBeNull()
  })
  it('expired quotes, slippage, no route and insufficient balance remain enforced upstream', async () => {
    const f = flow(); const quote = await f.engine.getExactOutputQuote(f.ports.targetAsset)
    await expect(f.engine.start({ ...quote, expires: 1 })).rejects.toThrow('expired')
    await expect(f.engine.getExactOutputQuote(f.ports.targetAsset, false, 101)).rejects.toThrow('1%')
    f.state.assets[0].spendable = 0n; vi.mocked(f.ports.paths).mockResolvedValue([])
    await expect(f.engine.getExactOutputQuote({ code: 'XLM' })).rejects.toThrow('No executable route')
    await expect(f.engine.getExactOutputQuote(f.ports.targetAsset)).rejects.toThrow('Insufficient')
  })
})
