import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Inbox } from 'lucide-react'
import { TenantOverview } from '../components/dashboard/TenantOverview'
import { LandlordOverview } from '../components/dashboard/LandlordOverview'
import { LeaseTable } from '../components/dashboard/LeaseTable'
import { ActivityList, sortNewest } from '../components/dashboard/ActivityList'
import { LeaseDetail } from '../components/lease/LeaseDetail'
import { ChatPanel } from '../components/ai/ChatPanel'
import { AgentMark } from '../components/ai/AgentMark'
import { EmptyState, PageHeader } from '../components/ui/misc'
import { ButtonLink } from '../components/ui/Button'
import { useDemo } from '../state/demo-store'
import { leasesFor, nextPayment, propertyOf } from '../lib/lease-logic'
import { formatDate, formatEUR } from '../lib/formatters'
import { cx } from '../lib/cx'
import type { ActivityKind } from '../lib/types'

export function OverviewPage() {
  const { role } = useDemo()
  return role === 'tenant' ? <TenantOverview /> : <LandlordOverview />
}

export function LeasePage() {
  const demo = useDemo()
  const leases = leasesFor(demo)
  if (demo.role === 'tenant') return <LeaseDetail leaseId={leases[0].id} />
  return (
    <>
      <PageHeader eyebrow="Landlord" title="Your leases" sub="Open a lease to see its payments, deposit lifecycle, claims and activity." />
      <LeaseTable leases={leases} payments={demo.payments} today={demo.today} />
    </>
  )
}

export function LeaseDetailPage() {
  const { id } = useParams()
  const demo = useDemo()
  const lease = leasesFor(demo).find((l) => l.id === id)
  return (
    <>
      <Link to="/app/lease" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline">
        <ArrowLeft size={16} /> {demo.role === 'tenant' ? 'My lease' : 'All leases'}
      </Link>
      {lease ? (
        <LeaseDetail leaseId={lease.id} />
      ) : (
        <div className="card">
          <EmptyState
            icon={<Inbox size={22} />}
            title="Lease not available in this view"
            body="This lease isn't part of the current demo role. Switch role or go back to your leases."
            action={<ButtonLink to="/app/lease">Back to leases</ButtonLink>}
          />
        </div>
      )}
    </>
  )
}

export function AssistantPage() {
  const { role } = useDemo()
  const [params, setParams] = useSearchParams()
  const q = params.get('q')
  const consume = useMemo(() => () => setParams({}, { replace: true }), [setParams])
  return (
    <div className="grid h-[calc(100dvh-64px-20px-104px)] min-h-[460px] gap-6 md:h-[calc(100dvh-64px-20px-48px)] lg:h-[calc(100dvh-72px-32px-48px)] lg:grid-cols-[minmax(0,1fr)_300px]">
      <ChatPanel key={role} initialQuestion={q} onConsumedQuestion={consume} />
      <AgentSide />
    </div>
  )
}

function AgentSide() {
  const demo = useDemo()
  const lease = leasesFor(demo)[0]
  const next = nextPayment(demo.payments, lease.id)
  const tenant = demo.role === 'tenant'
  return (
    <aside className="hidden space-y-4 overflow-y-auto lg:block">
      <div className="card p-5 text-center">
        <div className="flex justify-center">
          <AgentMark size={64} />
        </div>
        <p className="mt-3 font-semibold">{tenant ? 'Tenant Guardian' : 'Landlord Assistant'}</p>
        <p className="mt-1 text-[13px] leading-[19px] text-ink-muted">
          {tenant ? 'On your side: explains your lease and helps you protect your deposit.' : 'Keeps your rentals organised and your claims well-evidenced.'}
        </p>
      </div>
      <div className="card p-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">What it knows</p>
        <ul className="mt-3 space-y-2 text-[14px]">
          {tenant ? (
            <>
              <li>Lease at {propertyOf(lease).street}</li>
              <li>Deposit {formatEUR(lease.deposit)} · protected</li>
              {next && (
                <li>
                  Next rent {formatEUR(next.amount)} · {formatDate(next.dueDate)}
                </li>
              )}
            </>
          ) : (
            <>
              <li>{leasesFor(demo).length} active leases</li>
              <li>Payments, reviews and deadlines</li>
              <li>Claim rules and evidence</li>
            </>
          )}
        </ul>
      </div>
      <div className="rounded-xl2 bg-brand-tint p-5 text-[13px] leading-[19px] text-ink">
        <p className="font-semibold text-brand">You stay in control</p>
        <p className="mt-1.5 text-ink-muted">
          The assistant explains and prepares. It never moves funds: consequential actions need your confirmation, and supported fund movements follow
          the lease's programmed rules.
        </p>
      </div>
    </aside>
  )
}

const FILTERS: { key: string; label: string; kinds: ActivityKind[] | null }[] = [
  { key: 'all', label: 'All', kinds: null },
  { key: 'payments', label: 'Payments', kinds: ['payment', 'review'] },
  { key: 'deposit', label: 'Deposit & lease', kinds: ['deposit', 'lease_created', 'lease_active'] },
  { key: 'claims', label: 'Claims', kinds: ['claim'] },
  { key: 'ai', label: 'AI', kinds: ['ai'] },
]

export function ActivityPage() {
  const demo = useDemo()
  const [filter, setFilter] = useState('all')
  const f = FILTERS.find((x) => x.key === filter)!
  const events = demo.activity
    .filter((e) => e.visibleTo.includes(demo.role))
    .filter((e) => !f.kinds || f.kinds.includes(e.kind))
    .sort(sortNewest)

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Everything that happened"
        sub="A chronological record of your rental. Every event here is demo data, including the ones created by your actions in this prototype."
      />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Filter activity">
        {FILTERS.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={filter === x.key}
            onClick={() => setFilter(x.key)}
            className={cx(
              'h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition',
              filter === x.key ? 'bg-ink text-white' : 'bg-white text-ink-muted ring-1 ring-inset ring-line hover:text-ink',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <section className="card p-5 sm:p-7">
        {events.length ? (
          <ActivityList key={filter} events={events} />
        ) : (
          <EmptyState
            icon={<Inbox size={22} />}
            title="Nothing here yet"
            body={filter === 'claims' ? (demo.role === 'tenant' ? 'No claim has been opened on your lease.' : 'Prepared claim drafts will appear here.') : 'No events match this filter.'}
          />
        )}
      </section>
    </>
  )
}

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState
        icon={<Inbox size={22} />}
        title="Page not found"
        body="This page doesn't exist in the prototype."
        action={<ButtonLink to="/app">Go to overview</ButtonLink>}
      />
    </div>
  )
}
