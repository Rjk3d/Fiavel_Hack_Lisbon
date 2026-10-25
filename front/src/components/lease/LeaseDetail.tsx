import type { ReactNode } from 'react'
import { BedDouble, ChevronRight, FileWarning, MapPin, Ruler } from 'lucide-react'
import { LifecycleTimeline } from './LifecycleTimeline'
import { BlockchainDetails } from './BlockchainDetails'
import { DepositStatusPill, LeaseStatusPill, PaymentStatusPill } from './status'
import { ActivityList, sortNewest } from '../dashboard/ActivityList'
import { Avatar, EmptyState, FactRows, SectionHeader } from '../ui/misc'
import { Button } from '../ui/Button'
import { DemoTag } from '../ui/Pill'
import { useDemo } from '../../state/demo-store'
import { useFlows } from '../../state/flows'
import { claimDeadline, landlordOf, leaseProgress, lifecycle, paymentsOf, propertyOf, tenantOf } from '../../lib/lease-logic'
import { daysBetween, formatDate, formatEUR, ordinal } from '../../lib/formatters'

/** Full lease view, shared by the tenant's "My lease" and the landlord's lease pages. */
export function LeaseDetail({ leaseId }: { leaseId: string }) {
  const demo = useDemo()
  const { openPayment, openClaim } = useFlows()
  const lease = demo.leases.find((l) => l.id === leaseId)!
  const p = propertyOf(lease)
  const t = tenantOf(lease)
  const ll = landlordOf(lease)
  const payments = paymentsOf(demo.payments, lease.id)
  const claims = demo.claims.filter((c) => c.leaseId === lease.id)
  const events = demo.activity.filter((e) => e.leaseId === lease.id && e.visibleTo.includes(demo.role)).sort(sortNewest)
  const progress = leaseProgress(lease, demo.today)
  const daysLeft = daysBetween(demo.today, lease.endDate)

  return (
    <div className="space-y-6">
      {/* Overview */}
      <section className="card overflow-hidden">
        <div className="brand-surface relative px-5 py-6 text-white sm:px-7 sm:py-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-white/75">Lease {lease.reference}</span>
            <DemoTag onBrand>Demo data</DemoTag>
          </div>
          <h1 className="mt-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[32px]">
            {p.street}, {p.unit}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[14px] text-white/75">
            <MapPin size={15} /> {p.postcode} {p.neighbourhood}, {p.city}
          </p>
          <div className="mt-5">
            <div className="flex justify-between text-[12px] text-white/70">
              <span>{formatDate(lease.startDate)}</span>
              <span>{daysLeft > 0 ? `${daysLeft} days left` : 'Ended'}</span>
              <span>{formatDate(lease.endDate)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-[#D9C9FA] transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          <Stat label="Status" value={<LeaseStatusPill status={lease.status} />} />
          <Stat label="Monthly rent" value={formatEUR(lease.monthlyRent)} />
          <Stat label="Deposit" value={formatEUR(lease.deposit)} />
          <Stat label="Rent due" value={`${ordinal(lease.rentDueDay)} of the month`} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* Deposit lifecycle */}
          <section className="card p-5 sm:p-6">
            <SectionHeader
              title="Deposit lifecycle"
              sub={`Released by ${formatDate(claimDeadline(lease))} if no claim is opened`}
              action={<DepositStatusPill status={lease.depositStatus} />}
            />
            <div className="pt-2">
              <LifecycleTimeline steps={lifecycle(lease, demo.today)} />
            </div>
          </section>

          {/* Payment schedule */}
          <section className="card p-5 sm:p-6">
            <SectionHeader title="Payment schedule" sub={`${formatEUR(lease.monthlyRent)} due on the ${ordinal(lease.rentDueDay)}`} />
            <ul className="-mx-2">
              {payments.map((pay) => (
                <li key={pay.id}>
                  <button
                    onClick={() => openPayment(pay.id)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{pay.period}</span>
                      <span className="block text-[13px] text-ink-muted">Due {formatDate(pay.dueDate)}</span>
                    </span>
                    <PaymentStatusPill status={pay.status} />
                    <span className="tnum w-16 text-right text-[15px] font-semibold">{formatEUR(pay.amount)}</span>
                    <ChevronRight size={16} className="text-ink-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Claims */}
          <section className="card p-5 sm:p-6">
            <SectionHeader
              title="Claims & evidence"
              sub={`Claims may be opened until ${formatDate(claimDeadline(lease))}`}
              action={
                demo.role === 'landlord' && (
                  <Button size="sm" variant="secondary" onClick={() => openClaim(lease.id)}>
                    Prepare a claim
                  </Button>
                )
              }
            />
            {claims.length ? (
              <ul className="space-y-3">
                {claims.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-line p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold capitalize">{c.category.replace('_', ' ')}</p>
                      <span className="tnum font-semibold">{formatEUR(c.amount)}</span>
                    </div>
                    <p className="mt-1 text-[14px] text-ink-muted">{c.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <DemoTag>Draft · not submitted</DemoTag>
                      <span className="text-[12px] text-ink-muted">
                        {c.evidence.length} evidence item{c.evidence.length > 1 ? 's' : ''} · {formatDate(c.createdDate)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<FileWarning size={22} />}
                title="No claim on this lease"
                body={
                  demo.role === 'tenant'
                    ? 'If one is ever opened, you will have ' + lease.responseWindowDays + ' days to respond. Your Tenant Guardian can help.'
                    : 'Check-in report and photos are on file and will be compared at move-out.'
                }
              />
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Parties */}
          <section className="card p-5 sm:p-6">
            <SectionHeader title="Tenant & landlord" />
            <div className="space-y-3">
              {[
                { person: t, role: 'Tenant' },
                { person: ll, role: 'Landlord' },
              ].map(({ person, role }) => (
                <div key={person.id} className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
                  <Avatar initials={person.initials} size={40} tone={role === 'Tenant' ? 'brand' : 'ink'} />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{person.name}</p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {role} · {person.email}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Property & terms */}
          <section className="card p-5 sm:p-6">
            <SectionHeader title="Property & terms" />
            <div className="mb-2 flex flex-wrap gap-2 text-[13px]">
              <Chip icon={<BedDouble size={14} />}>{p.type}</Chip>
              <Chip icon={<Ruler size={14} />}>{p.sizeM2} m²</Chip>
            </div>
            <FactRows
              rows={[
                { label: 'Start date', value: formatDate(lease.startDate) },
                { label: 'End date', value: formatDate(lease.endDate) },
                { label: 'Deposit funded', value: lease.depositFundedDate ? formatDate(lease.depositFundedDate) : '—' },
                { label: 'Claim window', value: `${lease.claimWindowDays} days after end` },
                { label: 'Tenant response', value: `${lease.responseWindowDays} days` },
                ...(lease.moveOutInspection ? [{ label: 'Move-out inspection', value: formatDate(lease.moveOutInspection) }] : []),
              ]}
            />
          </section>

          {/* Activity */}
          <section className="card p-5 sm:p-6">
            <SectionHeader title="Activity" />
            <ActivityList events={events.slice(0, 5)} compact />
          </section>

          <BlockchainDetails />
        </div>
      </div>
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="border-line px-5 py-4 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
    <p className="text-[12px] text-ink-muted">{label}</p>
    <div className="tnum mt-1 text-[17px] font-semibold">{value}</div>
  </div>
)

const Chip = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 font-medium text-ink-muted">
    {icon}
    {children}
  </span>
)
