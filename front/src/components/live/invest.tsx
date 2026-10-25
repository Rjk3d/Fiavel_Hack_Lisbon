import { Check, Clock3, Lock, Sprout } from 'lucide-react'
import { Pill } from '../ui/Pill'
import { cx } from '../../lib/cx'
import { usdc } from '../../stellar/format'
import type { LeaseView } from '../../state/live'

/**
 * Where the guarantee's investment stands: off, proposed (with each party's approval),
 * or active. Every number comes from the lease or the pending proposal on-chain.
 */
export function InvestCard({ view }: { view: LeaseView }) {
  const l = view.snap.lease
  const p = view.snap.proposal
  const active = l.yield_active || l.shares > 0n
  const total = active ? l.liquid + l.placed : l.liquid
  const invested = active ? l.placed : p ? l.liquid - p.keep : 0n
  const kept = active ? l.liquid : p ? p.keep : l.liquid
  const keptPct = total > 0n ? Math.max(0, Math.min(100, Number((kept * 1000n) / total) / 10)) : 100
  const state = active ? 'active' : p ? 'proposed' : 'off'

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-tint text-brand">
            <Sprout size={19} />
          </span>
          <div>
            <p className="text-[16px] font-semibold">Invest the guarantee</p>
            <p className="text-[13px] text-ink-muted">Only with both parties' approval · one month always stays put</p>
          </div>
        </div>
        <Pill tone={state === 'active' ? 'success' : state === 'proposed' ? 'warning' : 'neutral'} dot>
          {state === 'active' ? 'Invested on Blend' : state === 'proposed' ? 'Waiting for approval' : 'Not invested'}
        </Pill>
      </div>

      <div className="mt-5">
        <div className="flex h-3.5 overflow-hidden rounded-full bg-brand-tint" role="img" aria-label={`${keptPct}% kept, ${100 - keptPct}% invested`}>
          <div className="bg-ink/85 transition-[width] duration-700" style={{ width: `${keptPct}%` }} />
          <div className={cx('flex-1 transition-colors', state === 'off' ? 'bg-transparent' : state === 'proposed' ? 'bg-brand/40' : 'bg-brand')} />
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-3 text-[13px]">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-ink" />
            <span className="text-ink-muted">Kept in the contract</span>
            <span className="tnum ml-auto font-semibold">{usdc(kept)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sprout size={14} className="text-brand" />
            <span className="text-ink-muted">{state === 'proposed' ? 'Would be invested' : 'Invested'}</span>
            <span className="tnum ml-auto font-semibold">{usdc(invested > 0n ? invested : 0n)}</span>
          </div>
        </div>
      </div>

      {p && !active && (
        <ol className="mt-5 grid gap-2 sm:grid-cols-2">
          <Approval who="Tenant" ok={p.tenant_ok} note={p.tenant_ok ? `Buffer of ${usdc(p.buffer)} locked` : `Locks a ${usdc(p.buffer)} buffer on approval`} />
          <Approval who="Landlord" ok={p.landlord_ok} note={p.landlord_ok ? 'Approved' : 'Not approved yet'} />
        </ol>
      )}

      {active && (
        <p className="mt-4 text-[13px] leading-[19px] text-ink-muted">
          Gain shared {l.terms.tenant_share_bps / 100} % tenant · {l.terms.landlord_share_bps / 100} % landlord ·{' '}
          {(10_000 - l.terms.tenant_share_bps - l.terms.landlord_share_bps) / 100} % arbitration fund. Either party can stop at any time.
        </p>
      )}
      {state === 'off' && (
        <p className="mt-4 text-[13px] leading-[19px] text-ink-muted">
          {view.snap.v2
            ? l.status.tag === 'Active'
              ? 'Either party can propose it from the actions panel; the other must approve before anything moves.'
              : 'Can be proposed while the lease is active.'
            : 'This deployment predates mid-lease investing. Redeploy LeaseVault (scripts/deploy-testnet.sh) to enable it.'}
        </p>
      )}
    </section>
  )
}

function Approval({ who, ok, note }: { who: string; ok: boolean; note: string }) {
  return (
    <li className={cx('flex items-center gap-3 rounded-2xl px-4 py-3', ok ? 'bg-success-tint' : 'bg-canvas')}>
      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full', ok ? 'bg-success text-white' : 'border-2 border-dashed border-line text-ink-muted')}>
        {ok ? <Check size={16} strokeWidth={3} /> : <Clock3 size={14} />}
      </span>
      <span>
        <span className="block text-[14px] font-semibold">{who}</span>
        <span className="block text-[12px] text-ink-muted">{note}</span>
      </span>
    </li>
  )
}
