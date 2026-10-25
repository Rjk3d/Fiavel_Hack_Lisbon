import { useState } from 'react'
import { ChevronRight, Info, Wallet } from 'lucide-react'
import { PageHeader, EmptyState } from '../components/ui/misc'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/misc'
import { PaymentStatusPill } from '../components/lease/status'
import { useDemo } from '../state/demo-store'
import { useFlows } from '../state/flows'
import { isSettled, leasesFor, nextPayment, propertyOf, tenantOf } from '../lib/lease-logic'
import { formatDate, formatDateLong, formatEUR, relativeDays } from '../lib/formatters'
import { cx } from '../lib/cx'
import type { Payment, PaymentStatus } from '../lib/types'

const FILTERS: { key: string; label: string; match: (s: PaymentStatus) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'upcoming', label: 'Upcoming', match: (s) => s === 'upcoming' || s === 'scheduled' },
  { key: 'review', label: 'Needs review', match: (s) => s === 'needs_review' },
  { key: 'done', label: 'Completed', match: (s) => s === 'paid' || s === 'simulated' },
]

export function PaymentsPage() {
  const demo = useDemo()
  const { openPayment, openPay } = useFlows()
  const [filter, setFilter] = useState('all')
  const leases = leasesFor(demo)
  const tenant = demo.role === 'tenant'
  const all = demo.payments.filter((p) => leases.some((l) => l.id === p.leaseId))
  const f = FILTERS.find((x) => x.key === filter)!
  const visible = all.filter((p) => f.match(p.status))
  const open = visible.filter((p) => !isSettled(p)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const done = visible.filter(isSettled).sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const next = tenant ? nextPayment(demo.payments, leases[0].id) : null
  const filters = tenant ? FILTERS.filter((x) => x.key !== 'review') : FILTERS

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title={tenant ? 'Your rent payments' : 'Rent across your leases'}
        sub={tenant ? 'Upcoming and completed rent for your Arroios lease.' : 'Reported, confirmed and upcoming rent for your two leases.'}
      />

      {tenant && next && (
        <section className="brand-surface mb-6 flex flex-col gap-5 rounded-xl3 p-6 text-white shadow-brand sm:flex-row sm:items-center sm:p-7">
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-white/80">Next payment · {next.period}</p>
            <p className="tnum mt-1 text-[44px] font-semibold leading-none tracking-[-0.04em]">{formatEUR(next.amount)}</p>
            <p className="mt-2 text-[14px] text-white/75">
              Due {formatDateLong(next.dueDate)} · {relativeDays(demo.today, next.dueDate)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="white" onClick={() => openPay(next.id)}>
              Make payment
            </Button>
            <button onClick={() => openPayment(next.id)} className="h-11 rounded-full px-4 text-[15px] font-semibold text-white/90 ring-1 ring-inset ring-white/30 transition hover:bg-white/10">
              Details
            </button>
          </div>
        </section>
      )}

      <p className="mb-5 flex items-start gap-2 rounded-2xl bg-white px-4 py-3 text-[13px] leading-[19px] text-ink-muted ring-1 ring-inset ring-line">
        <Info size={16} className="mt-0.5 shrink-0 text-brand" />
        All payments shown are demo records. "Make payment" runs a simulation: no real funds are transferred.
      </p>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Filter payments">
        {filters.map((x) => {
          const count = all.filter((p) => x.match(p.status)).length
          return (
            <button
              key={x.key}
              role="tab"
              aria-selected={filter === x.key}
              onClick={() => setFilter(x.key)}
              className={cx(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition',
                filter === x.key ? 'bg-ink text-white' : 'bg-white text-ink-muted ring-1 ring-inset ring-line hover:text-ink',
              )}
            >
              {x.label}
              <span className={cx('rounded-full px-1.5 text-[11px]', filter === x.key ? 'bg-white/20' : 'bg-canvas')}>{count}</span>
            </button>
          )
        })}
      </div>

      {open.length === 0 && done.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Wallet size={22} />} title="No payments here" body="Nothing matches this filter right now." />
        </div>
      ) : (
        <div className="space-y-6">
          {open.length > 0 && <Group title="Upcoming & open" items={open} showTenant={!tenant} onOpen={openPayment} />}
          {done.length > 0 && <Group title="Completed" items={done} showTenant={!tenant} onOpen={openPayment} />}
        </div>
      )}
    </>
  )
}

function Group({ title, items, showTenant, onOpen }: { title: string; items: Payment[]; showTenant: boolean; onOpen: (id: string) => void }) {
  const { leases } = useDemo()
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{title}</h2>
      <ul className="space-y-3">
        {items.map((p, i) => {
          const l = leases.find((x) => x.id === p.leaseId)!
          return (
            <li key={p.id} className="animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
              <button onClick={() => onOpen(p.id)} className="card hover-lift flex w-full items-center gap-4 p-4 text-left sm:p-5">
                {showTenant && <Avatar initials={tenantOf(l).initials} size={40} tone="soft" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    {showTenant ? `${tenantOf(l).name} · ` : ''}
                    {p.period}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                    <PaymentStatusPill status={p.status} />
                    {p.paidDate ? (p.status === 'needs_review' ? `Reported ${formatDate(p.paidDate)}` : `${p.status === 'simulated' ? 'Simulated' : 'Paid'} ${formatDate(p.paidDate)}`) : `Due ${formatDate(p.dueDate)}`}
                    {showTenant && <span className="hidden sm:inline">· {propertyOf(l).neighbourhood}</span>}
                  </span>
                </span>
                <span className="tnum text-[17px] font-semibold">{formatEUR(p.amount)}</span>
                <ChevronRight size={18} className="text-ink-muted" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
