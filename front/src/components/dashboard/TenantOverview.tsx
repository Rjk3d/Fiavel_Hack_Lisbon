import { Link } from 'react-router-dom'
import { DepositHeroCard } from './DepositHeroCard'
import { UpcomingRentCard } from './UpcomingRentCard'
import { ActivityList, sortNewest } from './ActivityList'
import { AIInsightCard } from '../ai/AIInsightCard'
import { RoleSwitcher } from '../layout/RoleSwitcher'
import { LeaseStatusPill } from '../lease/status'
import { SectionHeader } from '../ui/misc'
import { useDemo } from '../../state/demo-store'
import { leasesFor, nextPayment, userFor } from '../../lib/lease-logic'
import { formatEUR, relativeDays } from '../../lib/formatters'

export function TenantOverview() {
  const demo = useDemo()
  const lease = leasesFor(demo)[0]
  const next = nextPayment(demo.payments, lease.id)
  const events = demo.activity.filter((e) => e.visibleTo.includes('tenant')).sort(sortNewest).slice(0, 4)

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">Good morning, {userFor('tenant').firstName}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">Here's where things stand with your rental.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LeaseStatusPill status={lease.status} />
          <span className="sm:hidden">
            <RoleSwitcher />
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DepositHeroCard lease={lease} today={demo.today} />
        <UpcomingRentCard lease={lease} payments={demo.payments} today={demo.today} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <AIInsightCard
          role="tenant"
          message={
            next
              ? `You're on track. Your ${formatEUR(next.amount)} rent is due ${relativeDays(demo.today, next.dueDate)}. Want me to explain what happens to your deposit when the lease ends?`
              : "You're all paid up. Want me to explain what happens to your deposit when the lease ends?"
          }
          prompts={[
            { label: 'Explain my deposit', q: 'How does my deposit get released?' },
            { label: 'Check next payment', q: 'When is my next rent payment?' },
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
