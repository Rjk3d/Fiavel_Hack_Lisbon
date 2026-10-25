import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import { useLive, type LeaseView } from '../../state/live'
import { createFundingEngine, escrowUSDC } from '../../stellar/funding/stellar'
import { assetKey, decimal, FUND_FEE_CAP, totalFor, UNIT, type AssetId, type Attempt, type Quote, type SupportedAsset } from '../../stellar/funding/domain'
import { NETWORK, explorerAccount, explorerTx } from '../../stellar/config'
import { usdc } from '../../stellar/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { FactRows } from '../ui/misc'
import { Pill } from '../ui/Pill'

export function FundingDialog({ view, acceptYield = false, onClose }: { view: LeaseView; acceptYield?: boolean; onClose: () => void }) {
  const live = useLive()
  return <FundingContent key={`${live.wallet.address}:${view.id}`} view={view} acceptYield={acceptYield} onClose={onClose}/>
}

function FundingContent({ view, acceptYield = false, onClose }: { view: LeaseView; acceptYield?: boolean; onClose: () => void }) {
  const live = useLive()
  const engine = useMemo(() => createFundingEngine(live.wallet, view.id), [live.wallet, view.id])
  const [choices, setChoices] = useState<SupportedAsset[]>([])
  const [search, setSearch] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [busy, setBusy] = useState('Checking network and escrow…')
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [now, setNow] = useState(Date.now())
  const running = useRef(false)
  const mounted = useRef(true)
  const effectiveYield = attempt?.acceptYield ?? quote?.acceptYield ?? acceptYield
  const total = totalFor(view.snap.lease, effectiveYield)
  const pending = attempt?.stage === 'swap-pending' || attempt?.stage === 'fund-pending'

  async function work(label: string, action: () => Promise<void>) {
    if (running.current) return
    running.current = true; setBusy(label); setError('')
    try { await action() } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : 'Network request failed. No confirmation was assumed.')
        try { const saved = engine.getPending(); if (saved && (saved.swap || saved.fund)) { setAttempt(saved.stage === 'funded' ? { ...saved, stage: 'fund-pending' } : saved); setQuote(null) } } catch { /* Keep the storage error visible; do not reset it. */ }
      }
    } finally { running.current = false; if (mounted.current) setBusy('') }
  }
  async function initialize() {
      await engine.ports.checkNetwork()
      const saved = engine.getPending()
      if (saved && (saved.swap || saved.fund)) {
        const recovered = await engine.recoverPendingFunding()
        if (mounted.current) setAttempt(recovered)
        if (recovered.stage !== 'swap-failed') return
      }
      const results = await engine.getSupportedAssets(acceptYield)
      if (mounted.current) setChoices(results)
  }
  useEffect(() => {
    mounted.current = true
    void work('Checking network, assets and pending transactions…', initialize)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { mounted.current = false; clearInterval(clock) }
    // Engine identity is stable for this wallet/lease. Live clock ticks must not reload quotes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, acceptYield])

  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => {
      if (!running.current) void work('Checking transaction confirmation…', async () => {
        const next = await engine.recoverPendingFunding()
        if (mounted.current) { setAttempt(next); if (next.stage === 'funded') void live.refresh() }
      })
    }, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, pending])

  const requestQuote = (asset: AssetId) => work('Refreshing executable quote…', async () => {
    const next = await engine.getExactOutputQuote(asset, acceptYield)
    if (mounted.current) { setAttempt(null); setQuote(next); setAcknowledged(false) }
  })
  const execute = () => work(quote?.kind === 'path' ? 'Signing and submitting conversion…' : 'Simulating, signing and funding escrow…', async () => {
    if (!quote || !acknowledged) return
    let next = await engine.start(quote)
    if (quote.kind === 'direct') next = await engine.fundEscrow()
    if (mounted.current) { setAttempt(next); setQuote(null); setAcknowledged(false); if (next.stage === 'funded') void live.refresh() }
  })
  const continueFunding = () => work('Simulating, signing and funding escrow…', async () => {
    if (!acknowledged) return
    const next = await engine.fundEscrow()
    if (mounted.current) { setAttempt(next); setAcknowledged(false); if (next.stage === 'funded') void live.refresh() }
  })
  const isRecoverable = attempt && ['reviewed', 'swap-confirmed', 'fund-failed'].includes(attempt.stage)
  const transactionLinks = attempt && [attempt.swap && { label: 'Conversion transaction', tx: attempt.swap }, attempt.fund && { label: 'Escrow funding transaction', tx: attempt.fund }].filter(Boolean)

  return <Dialog open wide onClose={onClose} title="Pay with supported crypto" description={`Lease #${view.id} · Stellar Testnet · Blend test USDC, not mainnet USDC`} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onClose}>{busy ? 'Close · recovery stays saved' : 'Close'}</Button>
    {quote && <><Button variant="secondary" disabled={!!busy} onClick={() => { setQuote(null); setAcknowledged(false) }}>Choose asset</Button><Button disabled={!!busy || !acknowledged || quote.expires <= now} onClick={execute}>{quote.kind === 'direct' ? 'Sign and lock USDC' : 'Sign conversion only'}</Button></>}
    {isRecoverable && <Button disabled={!!busy || !acknowledged} onClick={continueFunding}>Review approved · sign escrow funding</Button>}
  </div>}>
    <div className="rounded-2xl bg-brand-tint p-5"><div className="flex items-center gap-2 text-brand"><ShieldCheck size={20}/><strong>USDC escrow · your lease rules stay in force</strong></div><p className="mt-2 text-[13px] leading-5 text-ink-muted">Funds go to LeaseVault, never straight to the landlord. The first rent is released only at co-signed move-in. The guarantee follows the existing lease rules.</p></div>
    <FactRows rows={[{ label: 'Guarantee', value: usdc(view.snap.lease.terms.deposit) }, { label: 'First rent (also required by contract)', value: usdc(view.snap.lease.terms.rent) }, ...(effectiveYield && view.snap.lease.terms.yield_offered ? [{ label: 'Blend buffer', value: usdc(total - view.snap.lease.terms.rent - view.snap.lease.terms.deposit) }] : []), { label: 'Total escrow funding', value: usdc(total) }]}/>
    <a href={explorerAccount(live.wallet.address)} target="_blank" rel="noreferrer" className="mt-3 block break-all font-mono text-[12px] text-brand">Tenant test wallet: {live.wallet.address}</a>
    <p className="mt-3 text-[12px] leading-5 text-ink-muted">This app uses its existing browser testnet signer, not Freighter. You become the tenant and refund recipient. A separate guarantor and assets on other blockchains are unsupported.</p>
    {busy && <p role="status" className="mt-4 flex items-center gap-2 text-[14px] text-brand"><RefreshCw className="animate-spin" size={16}/>{busy}</p>}
    {error && <div className="mt-4 rounded-2xl bg-danger-tint p-4"><p role="alert" className="text-[14px] text-danger">{error}</p><Button className="mt-3" size="sm" variant="secondary" disabled={!!busy} onClick={() => void work('Checking network and saved payment…', initialize)}>Retry network check</Button></div>}

    {!quote && (!attempt || attempt.stage === 'swap-failed') && <div className="mt-5"><label className="block text-[13px] font-semibold">Select an available Stellar asset<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search symbol or issuer" className="mt-2 h-11 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-brand"/></label><div className="mt-3 space-y-2">{choices.filter(choice => `${choice.asset.asset.code} ${choice.asset.asset.issuer ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(choice => <button key={assetKey(choice.asset.asset)} disabled={!!busy || !choice.supported} onClick={() => void requestQuote(choice.asset.asset)} className="w-full rounded-2xl border border-line p-4 text-left transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"><span className="flex flex-wrap justify-between gap-2"><strong>{choice.asset.asset.code}{assetKey(choice.asset.asset) === assetKey(escrowUSDC) ? ' · escrow asset' : ''}</strong><span className="tnum text-[13px]">{decimal(choice.asset.balance)}</span></span><span className="mt-1 block break-all font-mono text-[10px] text-ink-muted">{choice.asset.asset.issuer ?? 'Native XLM · no issuer'}</span><span className="mt-2 block text-[12px] text-ink-muted">{choice.supported ? 'Executable route found · refresh quote to review' : choice.reason}</span></button>)}</div>{!busy && !choices.some(choice => choice.supported) && <p className="mt-4 text-[13px] leading-5 text-ink-muted">No executable funding route is available for this wallet right now. Check its USDC trustline, test balances and current liquidity. No swap has been performed.</p>}</div>}

    {quote && <div className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[18px] font-semibold">Review {quote.kind === 'direct' ? 'direct USDC funding' : 'conversion and escrow funding'}</h3><Pill tone={quote.expires > now ? 'brand' : 'danger'}>{quote.expires > now ? `${Math.ceil((quote.expires - now) / 1000)}s remaining` : 'Quote expired'}</Pill></div><FactRows rows={[{ label: 'Expected source amount', value: `${decimal(quote.expected)} ${quote.input.code}` }, { label: 'Maximum source spend', value: `${decimal(quote.maximum)} ${quote.input.code}` }, ...(quote.kind === 'path' ? [{ label: 'Exact USDC received in your wallet', value: usdc(quote.receive, { decimals: 7 }) }, { label: 'Existing USDC applied', value: usdc(quote.required - quote.receive, { decimals: 7 }) }, { label: 'Executable rate (USDC / source unit)', value: decimal(quote.receive * UNIT / quote.expected) }, { label: 'Conversion network fee', value: `${decimal(quote.fee)} XLM` }, { label: 'Slippage limit', value: `${quote.slippageBps} basis points` }] : []), { label: 'LeaseVault receives', value: usdc(quote.required, { decimals: 7 }) }, { label: 'Funding transaction fee ceiling', value: `${decimal(FUND_FEE_CAP)} XLM` }]}/><p className="mt-3 text-[12px] leading-5 text-ink-muted">{quote.kind === 'path' ? 'The executable source amount includes the route’s conversion cost. Horizon does not provide a separate price-impact or fee breakdown; none is invented. The swap receives USDC into your own wallet. Escrow funding needs a second, separate approval.' : 'You already hold the required USDC. No conversion is needed.'} The exact Soroban resource fee is simulated before funding and must stay below the displayed ceiling; the ceiling is reserved, not an estimated charge.</p><Button className="mt-3" size="sm" variant="secondary" disabled={!!busy} onClick={() => void requestQuote(quote.input)}>Refresh quote</Button></div>}

    {attempt && <section className="mt-5 space-y-3" aria-live="polite"><Pill tone={attempt.stage === 'funded' ? 'success' : 'warning'}>{attempt.stage === 'funded' ? 'Escrow verified on-chain' : 'Payment recovery saved'}</Pill><ol className="space-y-2 text-[14px]"><li>1. {attempt.swap ? `Conversion: ${['swap-pending', 'swap-failed'].includes(attempt.stage) ? attempt.stage === 'swap-failed' ? 'failed / expired on ledger' : 'awaiting confirmation' : 'confirmed'}` : 'Direct USDC · no conversion'}</li><li>2. Escrow funding: {attempt.stage === 'funded' ? 'confirmed and contract state verified' : attempt.stage === 'fund-pending' ? 'submitted / awaiting verification' : attempt.stage === 'fund-failed' ? 'failed · converted USDC is not verified as escrowed' : 'not submitted'}</li></ol>
      {attempt.stage === 'funded' ? <div className="rounded-2xl bg-success-tint p-4 text-success"><CheckCircle2 size={22}/><p className="mt-2 font-semibold">LeaseVault confirms the funded lease.</p><p className="mt-1 text-[13px]">{usdc(BigInt(attempt.required))} funded under this lease. No landlord payout was initiated by this flow.</p></div> : <p className="rounded-2xl bg-warning-tint p-4 text-[13px] leading-5 text-warning">{attempt.swap ? 'If the conversion is confirmed, the resulting USDC was credited to your wallet. It is not protected by escrow until the contract funding is verified. You may close this dialog and return to resume with the same wallet. Check the current balance if it changed elsewhere.' : 'The payment attempt is saved. A submitted transaction may still be pending; do not start another payment until its status is known.'}</p>}
      {transactionLinks && transactionLinks.map(link => link && <a key={link.tx.hash} href={explorerTx(link.tx.hash)} target="_blank" rel="noreferrer" className="flex items-start gap-2 break-all text-[12px] text-brand"><ExternalLink size={14}/><span>{link.label}: {link.tx.hash}</span></a>)}
      {attempt.error && <p className="text-[13px] text-warning">{attempt.error}</p>}
      {attempt.stage !== 'funded' && <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!!busy} onClick={() => void work('Checking saved transaction…', async () => { const result = await engine.recoverPendingFunding(); if (mounted.current) setAttempt(result) })}>Check on-chain status</Button>{pending && <Button variant="secondary" disabled={!!busy} onClick={() => void work('Rebroadcasting the same signed transaction…', async () => { const result = await engine.rebroadcastPending(); if (mounted.current) setAttempt(result) })}>Rebroadcast same transaction</Button>}</div>}
    </section>}
    {(quote || isRecoverable) && <label className="mt-5 flex items-start gap-3 rounded-2xl border border-brand/20 p-4 text-[13px] leading-5"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/><span>I am the tenant and refund recipient. I reviewed the amounts, network and fee ceiling. I approve only the transaction named on the signing button. {effectiveYield ? 'I also accept the existing Blend option and its risk.' : 'The Blend option is not accepted by this payment.'}</span></label>}
    <p className="mt-5 break-all text-[10px] text-ink-muted">Escrow token: {NETWORK.usdc} · Issuer: {NETWORK.usdcIssuer}</p>
  </Dialog>
}
