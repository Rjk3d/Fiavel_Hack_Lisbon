import { assetKey, assertCanFund, assertQuote, bestPath, ceilBps, scopeKey, totalFor, validateSpend, QUOTE_MS, type AssetId, type Attempt, type AttemptStore, type FundingPorts, type Quote, type SupportedAsset } from './domain'

const busy = new Set<string>()
export class FundingEngine {
  constructor(readonly ports: FundingPorts, readonly store: AttemptStore) {}
  private async lock<T>(work: () => Promise<T>): Promise<T> {
    const key = scopeKey(this.ports.scope)
    if (busy.has(key)) throw new Error('A funding request is already running for this wallet and lease.')
    busy.add(key)
    try {
      // Prevent concurrent submissions across tabs where Web Locks is available.
      if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request(`fiavel-funding:${key}`, { ifAvailable: true }, lock => {
        if (!lock) throw new Error('This funding attempt is open in another tab.')
        return work()
      })
      return await work()
    } finally { busy.delete(key) }
  }
  getPending() { return this.store.load(this.ports.scope) }
  getWalletBalances() { return this.ports.wallet() }
  async getSupportedAssets(acceptYield = false): Promise<SupportedAsset[]> {
    await this.ports.checkNetwork()
    const wallet = await this.getWalletBalances()
    const assets = [...wallet.assets]
    if (!assets.some(asset => assetKey(asset.asset) === assetKey(this.ports.targetAsset))) assets.unshift({ asset: this.ports.targetAsset, balance: 0n, spendable: 0n, authorized: false })
    const priority = (asset: AssetId) => assetKey(asset) === assetKey(this.ports.targetAsset) ? 0 : assetKey(asset) === 'native' ? 1 : 2
    const candidates = assets.filter(asset => asset.balance > 0n || assetKey(asset.asset) === assetKey(this.ports.targetAsset)).sort((a, b) => priority(a.asset) - priority(b.asset)).slice(0, 20)
    const results = await Promise.all(candidates.map(async asset => {
      try {
        const quote = await this.getExactOutputQuote(asset.asset, acceptYield)
        if (assetKey(quote.input) !== assetKey(asset.asset)) return { asset, supported: false, reason: 'Enough USDC is already available. Choose direct USDC funding to avoid an unnecessary conversion.' }
        return { asset, supported: true }
      }
      catch (failure) { return { asset, supported: false, reason: failure instanceof Error ? failure.message : 'Conversion unavailable.' } }
    }))
    return results.sort((a, b) => Number(assetKey(b.asset.asset) === assetKey(this.ports.targetAsset)) - Number(assetKey(a.asset.asset) === assetKey(this.ports.targetAsset)))
  }
  async getExactOutputQuote(input: AssetId, acceptYield = false, slippageBps = 50): Promise<Quote> {
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 100) throw new Error('Maximum allowed slippage is 1%.')
    await this.ports.checkNetwork()
    const lease = await this.ports.lease()
    assertCanFund(lease, this.ports.scope.payer, Math.floor(this.ports.now() / 1000))
    const required = totalFor(lease, acceptYield)
    const wallet = await this.ports.wallet()
    const isDirect = assetKey(input) === assetKey(this.ports.targetAsset)
    const held = wallet.assets.find(asset => assetKey(asset.asset) === assetKey(this.ports.targetAsset))?.spendable ?? 0n
    const receive = isDirect ? 0n : required > held ? required - held : 0n
    if (!isDirect && receive === 0n) return this.getExactOutputQuote(this.ports.targetAsset, acceptYield, slippageBps)
    const path = isDirect ? undefined : bestPath(await this.ports.paths(input, receive), input, receive)
    if (!isDirect && !path) throw new Error('No executable route can deliver the required USDC amount. No conversion was submitted.')
    const expected = isDirect ? required : path!.inputAmount
    const quote: Quote = { scope: { ...this.ports.scope }, kind: isDirect ? 'direct' : 'path', input, required, receive, expected, maximum: isDirect ? required : ceilBps(expected, slippageBps), path: path?.path ?? [], expires: this.ports.now() + QUOTE_MS, slippageBps, fee: wallet.fee, acceptYield, createdAt: lease.created_at.toString() }
    validateSpend(wallet, quote)
    return quote
  }
  async validateQuote(quote: Quote): Promise<void> {
    await this.ports.checkNetwork()
    const lease = await this.ports.lease()
    assertQuote(quote, this.ports.scope, lease, this.ports.now())
    if ((quote.kind === 'direct') !== (assetKey(quote.input) === assetKey(this.ports.targetAsset))) throw new Error('Source asset/issuer does not match the selected funding route.')
    assertCanFund(lease, this.ports.scope.payer, Math.floor(this.ports.now() / 1000))
    const wallet = await this.ports.wallet()
    validateSpend(wallet, quote)
    if (wallet.fee > quote.fee) throw new Error('Network fees changed. Review a fresh quote.')
    if (quote.kind === 'path') {
      const held = wallet.assets.find(asset => assetKey(asset.asset) === assetKey(this.ports.targetAsset))?.spendable ?? 0n
      if (held + quote.receive < quote.required) throw new Error('The available USDC balance changed. Review a new quote.')
      const path = bestPath(await this.ports.paths(quote.input, quote.receive), quote.input, quote.receive)
      if (!path || path.inputAmount > quote.maximum) throw new Error('Liquidity changed beyond the approved maximum spend. Request a new quote.')
      if (JSON.stringify(path.path) !== JSON.stringify(quote.path)) throw new Error('The conversion route changed. Review a new quote.')
    }
  }
  async start(quote: Quote): Promise<Attempt> {
    return this.lock(async () => {
      const old = this.getPending()
      if (old && (old.swap || old.fund) && !['swap-failed', 'fund-failed'].includes(old.stage)) throw new Error('An existing transaction must be checked before starting another attempt.')
      // A successful swap must never be replaced by another swap, including after fund failure.
      if (old?.swap && old.stage !== 'swap-failed') throw new Error('USDC may already have been converted. Recover the existing attempt.')
      await this.validateQuote(quote)
      const attempt: Attempt = { version: 1, scope: { ...this.ports.scope }, required: quote.required.toString(), receive: quote.receive.toString(), source: quote.input, sourceMax: quote.maximum.toString(), acceptYield: quote.acceptYield, createdAt: quote.createdAt, stage: 'reviewed' }
      this.store.save(attempt) // Fail before signing/submission if durable storage is unavailable.
      if (quote.kind === 'direct') return attempt
      const tx = await this.ports.prepareSwap(quote)
      assertQuote(quote, this.ports.scope, await this.ports.lease(), this.ports.now())
      attempt.swap = tx; attempt.stage = 'swap-pending'; this.store.save(attempt)
      try { await this.ports.submit(tx, 'swap') } catch { attempt.error = 'Submission was not confirmed. Check the saved transaction; do not start a second swap.'; this.store.save(attempt) }
      return this.recover()
    })
  }
  private async recover(): Promise<Attempt> {
    const attempt = this.getPending()
    if (!attempt) throw new Error('No saved funding attempt.')
    await this.ports.checkNetwork()
    if (attempt.fund) {
      const result = await this.ports.status(attempt.fund, 'fund', attempt)
      attempt.stage = result.state === 'confirmed' ? await this.ports.verify(attempt) ? 'funded' : 'fund-pending' : result.state === 'failed' ? 'fund-failed' : 'fund-pending'
      if (result.state === 'confirmed' && attempt.stage !== 'funded') attempt.error = 'The transaction is confirmed, but the current lease does not match the expected Funded state. It may have progressed; inspect lease details. No new funding transaction will be created.'
      if (attempt.stage === 'funded') attempt.error = undefined
    } else if (attempt.swap) {
      const result = await this.ports.status(attempt.swap, 'swap', attempt)
      attempt.stage = result.state === 'confirmed' ? 'swap-confirmed' : result.state === 'failed' ? 'swap-failed' : 'swap-pending'
    }
    this.store.save(attempt)
    return attempt
  }
  recoverPendingFunding() { return this.lock(() => this.recover()) }
  fundEscrow(): Promise<Attempt> {
    return this.lock(async () => {
      let attempt = await this.recover()
      if (['funded', 'fund-pending', 'swap-pending'].includes(attempt.stage)) return attempt
      if (!['reviewed', 'swap-confirmed', 'fund-failed'].includes(attempt.stage)) throw new Error('A confirmed conversion or a reviewed direct payment is required.')
      const lease = await this.ports.lease()
      assertCanFund(lease, this.ports.scope.payer, Math.floor(this.ports.now() / 1000))
      if (lease.created_at.toString() !== attempt.createdAt || totalFor(lease, attempt.acceptYield).toString() !== attempt.required) throw new Error('Lease terms changed; keep the converted USDC in your wallet.')
      const tx = await this.ports.prepareFunding(attempt)
      attempt = { ...attempt, fund: tx, stage: 'fund-pending', error: undefined }
      this.store.save(attempt)
      try { await this.ports.submit(tx, 'fund') } catch { attempt.error = 'Funding submission is uncertain. Check this transaction before retrying.'; this.store.save(attempt) }
      return this.recover()
    })
  }
  rebroadcastPending(): Promise<Attempt> {
    return this.lock(async () => {
      const attempt = await this.recover()
      const kind = attempt.stage === 'fund-pending' ? 'fund' : attempt.stage === 'swap-pending' ? 'swap' : null
      if (!kind) return attempt
      const tx = attempt[kind]!
      if (this.ports.now() >= tx.expires * 1000) throw new Error('Transaction validity has expired; check status again after ledger confirmation.')
      // Same signed envelope, same hash: never create a new conversion for an uncertain one.
      try { await this.ports.submit(tx, kind) } catch { /* Recovery retains the hash. */ }
      return this.recover()
    })
  }
}
