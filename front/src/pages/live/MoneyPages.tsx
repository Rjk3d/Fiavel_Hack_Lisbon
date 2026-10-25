import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Inbox, Layers, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { explainRule } from '@agents/explain'
import { ActionPanel } from '../../components/live/ActionPanel'
import { MONTH_PILL, months, toActivity, yieldOf } from '../../components/live/lease-view'
import { NoFunds } from '../../components/live/cards'
import { ActivityList } from '../../components/dashboard/ActivityList'
import { EmptyState, FactRows, PageHeader, SectionHeader } from '../../components/ui/misc'
import { Pill } from '../../components/ui/Pill'
import { useLive, type LeaseView } from '../../state/live'
import { NETWORK, explorerContract, explorerTx } from '../../stellar/config'
import { clock, usdc } from '../../stellar/format'
import { cx } from '../../lib/cx'

export function LivePayments() {
  const live = useLive()
  const rows = live.mine.flatMap((v) => months(v, live.events, live.now).map((m) => ({ v, m })))
  const payable = live.mine.find((v) => v.insight.actions.some((a) => a.fn === 'pay_rent' || a.fn === 'claim_unpaid'))
  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title={live.role === 'tenant' ? 'Your rent' : 'Rent on your leases'}
        sub="Rent goes straight from the tenant to the landlord. A month left unpaid after the grace period can be taken from the guarantee."
      />
      <NoFunds />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <section className="card p-5 sm:p-6">
          {rows.length ? (
            <ul className="divide-y divide-line">
              {rows.map(({ v, m }) => (
                <li key={`${v.id}-${m.index}`} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
                  <span className="min-w-[140px] flex-1">
                    <span className="block font-semibold">
                      {m.label} · {usdc(v.snap.lease.terms.rent)}
                    </span>
                    <Link to={`/app/leases/${v.id}`} className="text-[12px] text-ink-muted hover:text-brand">
                      {v.meta.home} · #{v.id.toString()}
                    </Link>
                  </span>
                  <span className="text-[12px] text-ink-muted">{m.due ? `due ${clock(m.due)}` : 'after move-in'}</span>
                  <Pill tone={MONTH_PILL[m.state][1]}>{MONTH_PILL[m.state][0]}</Pill>
                  {m.tx ? (
                    <a href={explorerTx(m.tx)} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-brand" aria-label="Transaction">
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="w-[14px]" />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Inbox size={22} />} title="No rent yet" body="Months appear once a lease is funded." />
          )}
        </section>
        {payable ? <ActionPanel view={payable} /> : <div />}
      </div>
    </>
  )
}

export function LiveDeposit() {
  const live = useLive()
  return (
    <>
      <PageHeader
        eyebrow="Guarantee"
        title={live.role === 'tenant' ? 'Your guarantee, protected by code' : 'Guarantees under your leases'}
        sub="The contract holds it. Nobody can take it during the lease; unpaid rent and damage follow fixed rules; the rest comes back by default."
      />
      <NoFunds />
      <div className="mt-6 space-y-6">
        {live.mine.length ? (
          live.mine.map((v) => <GuaranteeDetail key={v.id.toString()} view={v} />)
        ) : (
          <section className="card">
            <EmptyState icon={<Inbox size={22} />} title="No guarantee yet" body="It appears here once a lease is funded." />
          </section>
        )}
        <figure className="rounded-xl3 border border-line bg-white p-6 sm:p-8">
          <blockquote className="text-[20px] font-medium leading-[30px] tracking-[-0.01em] sm:text-[24px] sm:leading-[34px]">
            “The code settles what is objective. A human mediator only ever decides the disputed amount, between the two parties.”
          </blockquote>
          <figcaption className="mt-3 text-[13px] text-ink-muted">How LeaseVault works</figcaption>
        </figure>
      </div>
    </>
  )
}

function GuaranteeDetail({ view }: { view: LeaseView }) {
  const l = view.snap.lease
  const y = yieldOf(view)
  const [rate, setRate] = useState('4')
  const r = Number(rate) / 100 || 0
  const base = Number(l.terms.deposit) / 1e7
  const projection = (years: number) => base * Math.pow(1 + r, years)
  const inflation = (years: number) => base * Math.pow(1.02, years)
  return (
    <section className="card overflow-hidden">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">
            {view.meta.home} · lease #{view.id.toString()}
          </p>
          <p className="tnum mt-2 text-[40px] font-semibold leading-none tracking-[-0.03em]">{usdc(view.snap.guaranteeValue)}</p>
          <p className="mt-1 text-[13px] text-ink-muted">Value now, read from the contract and from Blend</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat icon={<ShieldCheck size={16} />} label="In the contract" value={usdc(y.liquid)} />
            <Stat icon={<Layers size={16} />} label="Lent on Blend" value={usdc(y.placed)} />
            <Stat icon={<TrendingUp size={16} />} label="Yield so far" value={`+${usdc(y.earned, { decimals: 7 })}`} tone={y.earned > 0n ? 'success' : undefined} />
            <Stat icon={<Sparkles size={16} />} label="Yield option" value={l.yield_active ? 'Active' : l.terms.yield_offered ? 'Offered' : 'Off'} />
          </div>
          {l.yield_active && (
            <p className="mt-4 text-[12px] leading-[17px] text-ink-muted">
              Real balance from the{' '}
              <a href={explorerContract(NETWORK.blendPool)} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                Blend testnet pool
              </a>
              . Variable rate, not guaranteed. Over a few minutes of demo it is a few stroops: we never display a simulated yield.
            </p>
          )}
        </div>
        <div className="space-y-4">
          <ActionPanel view={view} compact />
          <p className="rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-[19px] text-ink-muted">{explainRule('yield_loss', { lease: l, disputeBond: NETWORK.disputeBond })}</p>
        </div>
      </div>
      {l.terms.yield_offered && (
        <div className="border-t border-line bg-canvas/60 p-6 sm:p-8">
          <SectionHeader
            title="Projection, not a promise"
            sub="If the guarantee followed you from lease to lease (passport, on the roadmap). Rate is your assumption; inflation at the ECB's 2 % target."
            action={
              <label className="flex items-center gap-2 text-[13px]">
                Rate
                <input value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 w-16 rounded-xl border border-line bg-white px-2 text-right" inputMode="decimal" />%
              </label>
            }
          />
          <FactRows
            rows={[1, 10, 30].map((yrs) => ({
              label: `${yrs} year${yrs > 1 ? 's' : ''}`,
              value: `${projection(yrs).toFixed(0)} USDC vs ${inflation(yrs).toFixed(0)} to keep up with inflation`,
            }))}
          />
        </div>
      )}
    </section>
  )
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: 'success' }) {
  return (
    <div className="rounded-2xl bg-canvas px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <span className="text-brand">{icon}</span>
        {label}
      </p>
      <p className={cx('tnum mt-1 text-[15px] font-semibold', tone === 'success' && 'text-success')}>{value}</p>
    </div>
  )
}

const FILTERS: { key: string; label: string; names: string[] | null }[] = [
  { key: 'all', label: 'All', names: null },
  { key: 'rent', label: 'Rent', names: ['rent_paid', 'unpaid_claimed', 'moved_in'] },
  { key: 'guarantee', label: 'Guarantee', names: ['lease_funded', 'blend_deposited', 'blend_exited', 'lease_settled', 'lease_refunded'] },
  { key: 'claims', label: 'Claims', names: ['damage_claimed', 'claim_answered', 'lease_settled'] },
]

export function LiveActivity() {
  const live = useLive()
  const [filter, setFilter] = useState('all')
  const f = FILTERS.find((x) => x.key === filter)!
  const events = live.events
    .filter((e) => live.mine.some((m) => m.id === e.leaseId))
    .filter((e) => !f.names || f.names.includes(e.name))
    .reverse()
    .map(toActivity)
  return (
    <>
      <PageHeader eyebrow="Activity" title="Everything that happened" sub="Read from the LeaseVault contract's events on Stellar Testnet. Each line links to its transaction." />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Filter activity">
        {FILTERS.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={filter === x.key}
            onClick={() => setFilter(x.key)}
            className={cx('h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition', filter === x.key ? 'bg-ink text-white' : 'bg-white text-ink-muted ring-1 ring-inset ring-line hover:text-ink')}
          >
            {x.label}
          </button>
        ))}
      </div>
      <section className="card p-5 sm:p-7">
        {events.length ? <ActivityList events={events} /> : <EmptyState icon={<Inbox size={22} />} title="Nothing here yet" body="Events appear as soon as a transaction touches your leases." />}
      </section>
    </>
  )
}
