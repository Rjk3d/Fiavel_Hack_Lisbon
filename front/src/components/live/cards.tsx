import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Building2, CalendarClock, Check, Copy, ExternalLink, KeyRound, Loader2, MapPin, Scale, ShieldCheck, Sparkles, Wallet as WalletIcon } from 'lucide-react'
import { timeline } from '@agents/rules'
import { LifecycleTimeline } from '../lease/LifecycleTimeline'
import { Button } from '../ui/Button'
import { Pill } from '../ui/Pill'
import { useLive, ROLE_LABEL, type LeaseView } from '../../state/live'
import { NETWORK, explorerAccount, short } from '../../stellar/config'
import { ROLES, type LiveRole } from '../../stellar/wallets'
import { clock, duration, relative, usdc } from '../../stellar/format'
import { milestones, statusOf, yieldOf } from './lease-view'
import { ReputationBadge } from './reputation'
import { cx } from '../../lib/cx'

const ROLE_ICON: Record<LiveRole, typeof KeyRound> = { tenant: KeyRound, landlord: Building2, arbiter: Scale }

/** Switches the whole app between the three testnet wallets. */
export function LiveRoleSwitcher({ full }: { full?: boolean }) {
  const { role, setRole } = useLive()
  return (
    <div role="radiogroup" aria-label="Acting as" className={cx('inline-grid grid-cols-3 gap-1 rounded-full bg-[#F1EFF6] p-1', full && 'w-full')}>
      {ROLES.map((r) => {
        const Icon = ROLE_ICON[r]
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            onClick={() => setRole(r)}
            className={cx(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition',
              role === r ? 'bg-white text-brand shadow-card' : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon size={13} />
            {ROLE_LABEL[r]}
          </button>
        )
      })}
    </div>
  )
}

/** The current role's testnet wallet: address, balances, test funds. */
export function WalletCard() {
  const live = useLive()
  const b = live.balances[live.role]
  const [copied, setCopied] = useState(false)
  const needsFunds = !b || !b.exists || b.usdc === 0n
  const funding = live.funding === live.role
  return (
    <div className="rounded-xl2 bg-canvas p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{ROLE_LABEL[live.role]} wallet</p>
        <a href={explorerAccount(live.wallet.address)} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-brand" aria-label="Open on Stellar Expert">
          <ExternalLink size={14} />
        </a>
      </div>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(live.wallet.address)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
        className="mt-1 inline-flex items-center gap-1.5 font-mono text-[13px] text-ink hover:text-brand"
        title={live.wallet.address}
      >
        {short(live.wallet.address)} {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      {live.role !== 'arbiter' && (
        <div className="mt-2">
          <ReputationBadge address={live.wallet.address} compact />
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <div>
          <p className="text-ink-muted">USDC</p>
          <p className="tnum font-semibold">{b ? usdc(b.usdc, { unit: false }) : '…'}</p>
        </div>
        <div>
          <p className="text-ink-muted">XLM (fees)</p>
          <p className="tnum font-semibold">{b ? b.xlm.toFixed(0) : '…'}</p>
        </div>
      </div>
      {(needsFunds || funding) && (
        <Button size="sm" className="mt-3 w-full" onClick={() => live.fund()} disabled={funding} icon={funding ? <Loader2 size={14} className="animate-spin" /> : <WalletIcon size={14} />}>
          {funding ? live.fundStep || 'Funding…' : 'Get test funds'}
        </Button>
      )}
    </div>
  )
}

/** Signature purple card: the guarantee, live from the contract. */
export function GuaranteeHero({ view, landlordView }: { view: LeaseView; landlordView?: boolean }) {
  const { role } = useLive()
  const l = view.snap.lease
  const [label] = statusOf(view)
  const y = yieldOf(view)
  const value = l.status.tag === 'Created' ? l.terms.deposit : view.snap.guaranteeValue
  const settled = l.status.tag === 'Closed' || l.status.tag === 'Refunded'
  return (
    <section className="brand-surface relative overflow-hidden rounded-xl3 p-5 text-white shadow-brand sm:p-7">
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-white/90">
          <ShieldCheck size={18} /> {settled ? 'Guarantee settled' : role === 'arbiter' ? 'Guarantee held by the contract' : landlordView ? 'Guarantee held for you' : 'Your guarantee is protected'}
        </div>
        <Pill tone="onBrand">Testnet · live</Pill>
      </div>
      <p className="tnum relative mt-3 text-[44px] font-semibold leading-none tracking-[-0.04em] sm:text-[56px]">{usdc(value)}</p>
      <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-white/80">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={15} /> {view.meta.home} · lease #{view.id.toString()}
        </span>
        <Pill tone="onBrand" dot>
          {label}
        </Pill>
        {l.yield_active && (
          <Pill tone="onBrand">
            <Sparkles size={12} /> {usdc(y.placed)} on Blend · +{usdc(y.earned, { decimals: 7 })}
          </Pill>
        )}
      </div>
      <div className="relative mt-7 sm:mt-8">
        <LifecycleTimeline steps={milestones(view)} onBrand compact />
      </div>
      <div className="relative mt-7 flex flex-col gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[46ch] text-[12px] leading-[17px] text-white/65">
          Held by the LeaseVault contract on Stellar Testnet, not by {landlordView ? 'you' : role === 'arbiter' ? 'either party' : 'the landlord'}. Amounts are test USDC.
        </p>
        <Link
          to={`/app/leases/${view.id}`}
          className="inline-flex h-10 items-center justify-center gap-1.5 self-start rounded-full bg-white px-4 text-[14px] font-semibold text-brand transition hover:bg-brand-tint sm:self-auto"
        >
          Open lease <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  )
}

/** Next rent and its deadlines, counting down live. */
export function NextRentCard({ view }: { view: LeaseView }) {
  const { now } = useLive()
  const l = view.snap.lease
  const tl = timeline(l)
  const active = l.status.tag === 'Active'
  const overdue = tl.unpaidClaimableAt !== undefined && now >= tl.unpaidClaimableAt
  return (
    <section className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="label">Next rent</p>
        {active && tl.nextDue !== undefined && (
          <Pill tone={overdue ? 'danger' : now >= tl.nextDue ? 'warning' : 'neutral'}>{overdue ? 'Overdue' : now >= tl.nextDue ? 'Due' : 'Upcoming'}</Pill>
        )}
      </div>
      {active && tl.nextDue !== undefined ? (
        <>
          <p className="tnum mt-2 text-[40px] font-semibold leading-none tracking-[-0.03em]">{usdc(l.terms.rent)}</p>
          <p className="mt-3 flex items-center gap-2 text-[14px] text-ink-muted">
            <CalendarClock size={16} className="text-brand" />
            Month {l.months_settled + 1} of {l.terms.months} · due <span className="font-medium text-ink">{relative(tl.nextDue, now)}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Grace period {duration(l.terms.grace)} · then the landlord can take it from the guarantee ({relative(tl.unpaidClaimableAt!, now)})
          </p>
        </>
      ) : (
        <p className="mt-3 text-[15px] text-ink-muted">
          {l.status.tag === 'Created' || l.status.tag === 'Funded' ? 'Rent starts once both parties confirm the move-in.' : 'No rent left on this lease.'}
        </p>
      )}
      <div className="mt-auto pt-5 text-[13px] text-ink-muted">
        {l.terms.months} months of {duration(l.terms.period)} · rent {usdc(l.terms.rent)}
      </div>
    </section>
  )
}

export function LeaseRow({ view }: { view: LeaseView }) {
  const { now, roleOf } = useLive()
  const [label, tone] = statusOf(view)
  const next = view.insight.deadlines.find((d) => d.at >= now)
  const mineAs = (['landlord', 'tenant', 'arbiter'] as LiveRole[]).filter((r) => roleOf(view, r))
  return (
    <Link to={`/app/leases/${view.id}`} className="card hover-lift flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-tint text-brand">
        <Building2 size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {view.meta.home} <span className="text-ink-muted">· #{view.id.toString()}</span>
        </p>
        <p className="text-[13px] text-ink-muted">
          {usdc(view.snap.lease.terms.rent)}/month · guarantee {usdc(view.snap.lease.terms.deposit)}
          {mineAs.length > 0 && ` · you: ${mineAs.map((r) => ROLE_LABEL[r].toLowerCase()).join(', ')}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        <Pill tone={tone} dot>
          {label}
        </Pill>
        {next && (
          <span className="text-[12px] text-ink-muted">
            {next.label} {relative(next.at, now)}
          </span>
        )}
      </div>
    </Link>
  )
}

/** Link the landlord sends to the tenant. */
export function InviteBox({ view }: { view: LeaseView }) {
  const url = `${location.origin}/app/join/${view.id}?home=${encodeURIComponent(view.meta.home)}`
  const [copied, setCopied] = useState(false)
  return (
    <section className="card p-5 sm:p-6">
      <p className="label">Invite the tenant</p>
      <p className="mt-1 text-[14px] text-ink-muted">
        Send this link. The tenant reads the terms, then locks the first rent and the guarantee before {clock(timeline(view.snap.lease).moveInDeadline)}.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-canvas p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{url}</span>
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
          onClick={() => {
            void navigator.clipboard?.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </section>
  )
}

export function NoFunds() {
  const live = useLive()
  const b = live.balances[live.role]
  if (b && b.exists && b.usdc > 0n) return null
  return (
    <div className="flex flex-col gap-3 rounded-xl2 border border-brand/20 bg-brand-tint/60 p-4 sm:flex-row sm:items-center">
      <WalletIcon size={20} className="shrink-0 text-brand" />
      <p className="flex-1 text-[14px]">
        <span className="font-semibold">This {ROLE_LABEL[live.role].toLowerCase()} wallet is empty.</span>{' '}
        <span className="text-ink-muted">Get test XLM (fees) and test USDC from Friendbot and the Blend faucet. Nothing real is used.</span>
      </p>
      <Button size="sm" onClick={() => live.fund()} disabled={live.funding === live.role}>
        {live.funding === live.role ? live.fundStep || 'Funding…' : 'Get test funds'}
      </Button>
    </div>
  )
}

export const networkLine = `${NETWORK.name} · LeaseVault ${short(NETWORK.leaseVault)}`
