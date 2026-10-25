import { useId, type ReactNode } from 'react'
import { CalendarCheck2, CheckCircle2, CircleDashed, Database, FileWarning, Layers, Link2, ShieldCheck, Users } from 'lucide-react'
import { PageHeader, SectionHeader, EmptyState } from '../components/ui/misc'
import { Button } from '../components/ui/Button'
import { DemoTag, Pill } from '../components/ui/Pill'
import { LifecycleTimeline } from '../components/lease/LifecycleTimeline'
import { BlockchainDetails } from '../components/lease/BlockchainDetails'
import { DepositStatusPill } from '../components/lease/status'
import { ActivityList, sortNewest } from '../components/dashboard/ActivityList'
import { useDemo } from '../state/demo-store'
import { useFlows } from '../state/flows'
import { chainConfig } from '../lib/config'
import { claimDeadline, leaseProgress, leasesFor, lifecycle, propertyOf, tenantOf } from '../lib/lease-logic'
import { formatDate, formatEUR, relativeDays } from '../lib/formatters'
import { cx } from '../lib/cx'
import type { Lease } from '../lib/types'

export function DepositPage() {
  const demo = useDemo()
  const leases = leasesFor(demo)
  const tenant = demo.role === 'tenant'

  return (
    <>
      <PageHeader
        eyebrow={tenant ? 'Protected deposit' : 'Deposits'}
        title={tenant ? 'Your deposit, protected by design' : 'Deposits under your leases'}
        sub={
          tenant
            ? 'See exactly what protects your money, when it comes back, and what could change that.'
            : 'Each deposit follows the same rules for both sides. You can claim within the window; otherwise it is released.'
        }
      />
      <div className="space-y-6">
        {leases.map((l) => (
          <DepositHero key={l.id} lease={l} landlordView={!tenant} />
        ))}

        <div className="grid gap-6 lg:grid-cols-2">
          <ReleaseRules lease={leases.find((l) => l.moveOutInspection) ?? leases[0]} tenant={tenant} />
          <div className="space-y-6">
            <ClaimStatus leases={leases} />
            <Provenance />
          </div>
        </div>

        <figure className="rounded-xl3 border border-line bg-white p-6 sm:p-8">
          <blockquote className="text-[20px] font-medium leading-[30px] tracking-[-0.01em] sm:text-[24px] sm:leading-[34px]">
            “Fiável uses programmed rules for supported actions. Subjective disputes may still require human resolution.”
          </blockquote>
          <figcaption className="mt-3 text-[13px] text-ink-muted">How deposit protection works in Fiável</figcaption>
        </figure>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className="card p-5 sm:p-6">
            <SectionHeader title="Deposit history" />
            <ActivityList
              events={demo.activity
                .filter((e) => e.visibleTo.includes(demo.role) && (e.kind === 'deposit' || e.kind === 'claim' || e.kind === 'lease_created' || e.kind === 'lease_active'))
                .sort(sortNewest)}
              compact
            />
          </section>
          <BlockchainDetails />
        </div>
      </div>
    </>
  )
}

function DepositHero({ lease, landlordView }: { lease: Lease; landlordView: boolean }) {
  const { today } = useDemo()
  const p = propertyOf(lease)
  const pct = leaseProgress(lease, today)
  const deadline = claimDeadline(lease)
  return (
    <section className="card overflow-hidden">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        <Ring pct={pct} amount={formatEUR(lease.deposit)} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DepositStatusPill status={lease.depositStatus} />
            <DemoTag>Demo amount</DemoTag>
          </div>
          <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">
            {landlordView ? `${tenantOf(lease).name} · ${p.neighbourhood}` : `${p.street}, ${p.neighbourhood}`}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="Recorded as held" value={formatEUR(lease.deposit)} />
            <Fact label="Lease ends" value={formatDate(lease.endDate)} sub={relativeDays(today, lease.endDate)} />
            <Fact label="Released by" value={formatDate(deadline)} sub="if no claim" />
          </dl>
          <div className="mt-6">
            <LifecycleTimeline steps={lifecycle(lease, today)} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Ring({ pct, amount }: { pct: number; amount: string }) {
  const r = 92
  const gid = `ring${useId().replace(/:/g, "")}`
  const c = 2 * Math.PI * r
  return (
    <div className="relative mx-auto grid h-[220px] w-[220px] place-items-center">
      <svg viewBox="0 0 220 220" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="110" cy="110" r={r} fill="none" stroke="#F3EEFF" strokeWidth="14" />
        <circle
          cx="110"
          cy="110"
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.02, pct))}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9B72E8" />
            <stop offset="1" stopColor="#6338B8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="text-center">
        <ShieldCheck size={22} className="mx-auto text-brand" />
        <p className="tnum mt-1 text-[38px] font-semibold leading-none tracking-[-0.04em]">{amount}</p>
        <p className="mt-1.5 text-[12px] text-ink-muted">{Math.round(pct * 100)}% of lease term</p>
      </div>
    </div>
  )
}

const Fact = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div>
    <dt className="text-[12px] text-ink-muted">{label}</dt>
    <dd className="tnum mt-0.5 text-[16px] font-semibold">{value}</dd>
    {sub && <dd className="text-[12px] text-ink-muted">{sub}</dd>}
  </div>
)

function ReleaseRules({ lease, tenant }: { lease: Lease; tenant: boolean }) {
  const steps: { icon: ReactNode; title: string; body: string }[] = [
    { icon: <CalendarCheck2 size={18} />, title: 'The lease ends', body: `On ${formatDate(lease.endDate)}, after a move-out inspection compared with the check-in report.` },
    {
      icon: <FileWarning size={18} />,
      title: `${lease.claimWindowDays}-day claim window`,
      body: `${tenant ? 'Your landlord' : 'You'} may open a claim until ${formatDate(claimDeadline(lease))}, itemised, evidenced and capped at the deposit.`,
    },
    {
      icon: <CheckCircle2 size={18} />,
      title: 'No claim? Full release',
      body: `If no claim is opened, the full ${formatEUR(lease.deposit)} is released to the tenant under the programmed rule. Nobody has to approve it.`,
    },
    {
      icon: <Users size={18} />,
      title: 'Claim? Shared resolution',
      body: `The tenant has ${lease.responseWindowDays} days to respond. Undisputed amounts are released; disputed amounts go to human mediation.`,
    },
  ]
  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader title="Release conditions" sub={tenant ? undefined : `Shown for the ${propertyOf(lease).neighbourhood} lease`} />
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', i === 2 ? 'bg-success-tint text-success' : 'bg-brand-tint text-brand')}>
              {s.icon}
            </span>
            <div>
              <p className="text-[15px] font-semibold">{s.title}</p>
              <p className="mt-0.5 text-[14px] leading-[21px] text-ink-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ClaimStatus({ leases }: { leases: Lease[] }) {
  const demo = useDemo()
  const { openClaim } = useFlows()
  const drafts = demo.claims.filter((c) => leases.some((l) => l.id === c.leaseId))
  const ending = leases.find((l) => l.moveOutInspection)
  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader title="Claim status" />
      {demo.role === 'tenant' ? (
        <div className="flex items-center gap-3 rounded-2xl bg-canvas p-4">
          <CheckCircle2 size={20} className="text-success" />
          <p className="text-[14px]">
            <span className="font-semibold">No claim open.</span> <span className="text-ink-muted">Nothing needs your attention.</span>
          </p>
        </div>
      ) : drafts.length ? (
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas p-4 text-[14px]">
              <span>
                <span className="font-semibold capitalize">{d.category.replace('_', ' ')}</span>
                <span className="text-ink-muted"> · {propertyOf(demo.leases.find((l) => l.id === d.leaseId)!).neighbourhood}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tnum font-semibold">{formatEUR(d.amount)}</span>
                <DemoTag>Draft</DemoTag>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<FileWarning size={22} />} title="No claims" body="No claim has been prepared on your leases." />
      )}
      {demo.role === 'landlord' && ending && (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => openClaim(ending.id)}>
          Prepare a claim · {propertyOf(ending).neighbourhood}
        </Button>
      )}
    </section>
  )
}

/** Makes the four possible states of "truth" explicit, so a demo number is never mistaken for real funds. */
function Provenance() {
  const rows: { icon: ReactNode; label: string; state: string; active: boolean }[] = [
    { icon: <Layers size={16} />, label: 'Demo application state', state: 'Showing fictional data', active: true },
    { icon: <Database size={16} />, label: 'Database records', state: 'Not connected', active: false },
    { icon: <Link2 size={16} />, label: 'Submitted blockchain transactions', state: chainConfig.lastTxHash ? 'Configured' : 'None', active: !!chainConfig.lastTxHash },
    { icon: <ShieldCheck size={16} />, label: 'Confirmed on-chain state', state: 'Not connected', active: false },
  ]
  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader title="Where these numbers come from" />
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 rounded-2xl px-1 py-1.5">
            <span className={cx('grid h-8 w-8 place-items-center rounded-xl', r.active ? 'bg-brand-tint text-brand' : 'bg-canvas text-[#A29FB0]')}>{r.icon}</span>
            <span className="flex-1 text-[14px] font-medium">{r.label}</span>
            {r.active ? (
              <Pill tone="brand">{r.state}</Pill>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
                <CircleDashed size={13} /> {r.state}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] leading-[17px] text-ink-muted">Amounts on this page do not represent real funds on Stellar Testnet or anywhere else.</p>
    </section>
  )
}
