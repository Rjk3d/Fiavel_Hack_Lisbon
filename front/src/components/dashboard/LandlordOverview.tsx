import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, ClipboardCheck, Home, ShieldCheck, Wallet } from 'lucide-react'
import { ActivityList, sortNewest } from './ActivityList'
import { LeaseTable, currentPayment } from './LeaseTable'
import { AIInsightCard } from '../ai/AIInsightCard'
import { RoleSwitcher } from '../layout/RoleSwitcher'
import { Button } from '../ui/Button'
import { DemoTag } from '../ui/Pill'
import { SectionHeader } from '../ui/misc'
import { useDemo } from '../../state/demo-store'
import { useFlows } from '../../state/flows'
import { claimDeadline, leasesFor, nextPayment, propertyOf, tenantOf, userFor } from '../../lib/lease-logic'
import { dayMonth, formatDate, formatDateShort, formatEUR, formatMonth, relativeDays } from '../../lib/formatters'
import { cx } from '../../lib/cx'

export function LandlordOverview() {
  const demo = useDemo()
  const { openReview } = useFlows()
  const leases = leasesFor(demo)
  const month = formatMonth(demo.today).split(' ')[0]

  const current = leases.map((l) => currentPayment(demo.payments, l.id, demo.today)).filter(Boolean)
  const expected = leases.reduce((t, l) => t + l.monthlyRent, 0)
  const received = current.filter((p) => p!.status === 'paid' || p!.status === 'simulated').reduce((t, p) => t + p!.amount, 0)
  const review = demo.payments.find((p) => p.status === 'needs_review' && leases.some((l) => l.id === p.leaseId))
  const reviewLease = review && leases.find((l) => l.id === review.leaseId)
  const ending = leases.find((l) => l.moveOutInspection)
  const deposits = leases.reduce((t, l) => t + l.deposit, 0)

  const obligations = [
    ...leases.flatMap((l) => {
      const n = nextPayment(demo.payments, l.id)
      return n && n.dueDate <= l.endDate ? [{ date: n.dueDate, title: `${tenantOf(l).firstName}'s ${n.period.split(' ')[0]} rent`, sub: `${formatEUR(n.amount)} expected` }] : []
    }),
    ...(ending
      ? [
          { date: ending.endDate, title: `${tenantOf(ending).firstName}'s lease ends`, sub: propertyOf(ending).neighbourhood },
          { date: ending.moveOutInspection!, title: 'Move-out inspection', sub: `${propertyOf(ending).street} · 10:00` },
          { date: claimDeadline(ending), title: 'Claim window closes', sub: `Deposit ${formatEUR(ending.deposit)} released if no claim` },
        ]
      : []),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const events = demo.activity.filter((e) => e.visibleTo.includes('landlord')).sort(sortNewest).slice(0, 4)

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">Good morning, {userFor('landlord').firstName}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">
            {leases.length} active leases · your {month} at a glance.
          </p>
        </div>
        <span className="sm:hidden">
          <RoleSwitcher />
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Metric icon={<Home size={18} />} label="Monthly rent" value={formatEUR(expected)} sub={`${leases.length} active leases`} />
        <Metric
          icon={<Wallet size={18} />}
          label={`Received in ${month}`}
          value={formatEUR(received)}
          sub={received < expected ? `${formatEUR(expected - received)} awaiting review` : 'All confirmed'}
          progress={received / expected}
        />
        <Metric icon={<ShieldCheck size={18} />} label="Deposits held" value={formatEUR(deposits)} sub="Recorded in demo" />
        <Metric
          icon={<CalendarClock size={18} />}
          label="Next obligation"
          value={obligations[0] ? formatDateShort(obligations[0].date) : '—'}
          sub={obligations[0]?.title ?? 'Nothing scheduled'}
        />
      </div>

      {review && reviewLease ? (
        <section className="flex flex-col gap-4 rounded-xl3 border border-warning/25 bg-warning-tint p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-warning">
            <ClipboardCheck size={20} />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Pending review · {tenantOf(reviewLease).name}'s {review.period} rent</p>
              <DemoTag />
            </div>
            <p className="mt-1 text-[14px] text-ink-muted">
              {formatEUR(review.amount)} bank transfer reported {formatDate(review.paidDate!)}. Confirm once it shows on your statement.
            </p>
          </div>
          <Button onClick={() => openReview(review.id)}>Review payment</Button>
        </section>
      ) : (
        <section className="flex items-center gap-4 rounded-xl3 border border-line bg-white p-5">
          <CheckCircle2 size={22} className="text-success" />
          <p className="text-[15px]">
            <span className="font-semibold">All caught up.</span> <span className="text-ink-muted">No payment is waiting for your review.</span>
          </p>
        </section>
      )}

      <section>
        <SectionHeader
          title="Your leases"
          action={
            <Link to="/app/lease" className="text-[13px] font-semibold text-brand hover:underline">
              Manage leases
            </Link>
          }
        />
        <LeaseTable leases={leases} payments={demo.payments} today={demo.today} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 sm:p-6">
          <SectionHeader title="Coming up" />
          <ol className="space-y-1">
            {obligations.map((o) => (
              <li key={o.date + o.title} className="flex items-center gap-4 rounded-2xl px-2 py-2.5">
                <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-brand-tint py-1.5 text-brand">
                  <span className="text-[10px] font-semibold uppercase">{dayMonth(o.date).month}</span>
                  <span className="text-[17px] font-semibold leading-none">{dayMonth(o.date).day}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{o.title}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{o.sub}</span>
                </span>
                <span className="text-[12px] text-ink-muted">{relativeDays(demo.today, o.date)}</span>
              </li>
            ))}
          </ol>
        </section>
        <AIInsightCard
          role="landlord"
          message={
            ending
              ? `${tenantOf(ending).firstName}'s lease ends ${relativeDays(demo.today, ending.endDate)}. Gather the check-in photos before the ${formatDate(ending.moveOutInspection!)} inspection — if anything needs a claim, you have until ${formatDate(claimDeadline(ending))}.`
              : 'Everything is on track across your leases.'
          }
          prompts={[
            { label: 'Evidence checklist', q: 'What evidence should I prepare?' },
            { label: 'Upcoming payments', q: 'Which payments are coming up?' },
          ]}
        />
        <section className="card p-5 sm:p-6">
          <SectionHeader
            title="Recent activity"
            action={
              <Link to="/app/activity" className="text-[13px] font-semibold text-brand hover:underline">
                See all
              </Link>
            }
          />
          <ActivityList events={events} compact />
        </section>
      </div>
    </div>
  )
}

function Metric({ icon, label, value, sub, progress }: { icon: ReactNode; label: string; value: string; sub: string; progress?: number }) {
  return (
    <div className="card p-4 sm:p-5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-brand">{icon}</span>
      <p className="mt-3 text-[13px] text-ink-muted">{label}</p>
      <p className="tnum mt-0.5 text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">{value}</p>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-tint">
          <div className={cx('h-full rounded-full bg-brand transition-[width] duration-700')} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <p className="mt-1.5 truncate text-[12px] text-ink-muted">{sub}</p>
    </div>
  )
}
