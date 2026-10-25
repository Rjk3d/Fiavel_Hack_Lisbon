import { ShieldCheck, ChevronRight } from 'lucide-react'
import { LifecycleTimeline } from '../lease/LifecycleTimeline'
import { AgentMark } from '../ai/AgentMark'
import { DEMO_TODAY, seedLeases, seedPayments } from '../../lib/demo-data'
import { claimDeadline, lifecycle, nextPayment } from '../../lib/lease-logic'
import { daysBetween, formatDate, formatDateShort, formatEUR } from '../../lib/formatters'

/** The hero's product screen, rendered from the same seeded data the app uses. */
export function PhonePreview() {
  const lease = seedLeases[0]
  const next = nextPayment(seedPayments, lease.id)!
  const days = daysBetween(DEMO_TODAY, next.dueDate)

  return (
    <div className="relative mx-auto w-full max-w-[540px]">
      {/* backdrop circle + ribbon, as in the reference visuals */}
      <div className="absolute left-1/2 top-1/2 aspect-square w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#6E42C6] to-[#A88AE8] opacity-95" aria-hidden />
      <svg className="absolute -left-[12%] top-[38%] w-[124%]" viewBox="0 0 600 200" fill="none" aria-hidden>
        <path d="M0 160c60-70 120 10 170-30S190 0 140 20s-10 120 80 120 160-120 250-60 80 60 130 20" stroke="#E4D6FF" strokeWidth="7" strokeLinecap="round" />
      </svg>

      {/* phone */}
      <div className="relative mx-auto w-[300px] rotate-[4deg] rounded-[46px] bg-[#C8B5F2] p-[7px] shadow-[0_40px_80px_-30px_rgba(23,19,41,0.55)] transition-transform duration-500 hover:rotate-[2deg] sm:w-[330px]">
        <div className="overflow-hidden rounded-[40px] bg-ink p-[6px]">
          <div className="relative overflow-hidden rounded-[34px] bg-canvas">
            <div className="absolute left-1/2 top-2 z-10 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-ink" aria-hidden />
            {/* purple top */}
            <div className="brand-surface px-5 pb-6 pt-11 text-white">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span>Fiável</span>
                <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold">Demo</span>
              </div>
              <p className="mt-3 text-[13px] font-semibold text-white/75">November</p>
              <p className="mt-1 text-[19px] font-semibold leading-[25px] tracking-[-0.01em]">
                You're on track! Your next rent is due in {days} days.
              </p>
              <span className="mt-4 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-brand">Pay early</span>
              <div className="mt-5">
                <LifecycleTimeline steps={lifecycle(lease, DEMO_TODAY)} onBrand compact />
              </div>
            </div>
            {/* white cards */}
            <div className="-mt-3 space-y-2.5 rounded-t-[26px] bg-canvas px-3.5 pb-5 pt-4">
              <div className="rounded-2xl bg-white p-3.5 shadow-card">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">Deposit</p>
                  <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold text-brand">Protected</span>
                </div>
                <div className="mt-1 flex items-end justify-between">
                  <p className="tnum text-[22px] font-semibold tracking-[-0.02em]">{formatEUR(lease.deposit)}</p>
                  <p className="text-[10px] text-ink-muted">Release by {formatDate(claimDeadline(lease))}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-3.5 shadow-card">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">{next.period.split(' ')[0]} rent</p>
                  <p className="tnum text-[13px] font-semibold">{formatEUR(next.amount)}</p>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[10px] font-semibold text-warning">Upcoming</span>
                  <span className="text-[11px] text-ink-muted">{formatDateShort(next.dueDate)}</span>
                  <ChevronRight size={13} className="ml-auto text-brand" />
                </div>
                <div className="mt-3 flex h-9 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">Make payment</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating cards */}
      <div className="absolute -left-4 top-[-2%] hidden w-[200px] -rotate-2 rounded-2xl bg-white p-3.5 shadow-lift sm:block lg:-left-20">
        <div className="flex items-center gap-2">
          <AgentMark size={26} />
          <p className="text-[12px] font-semibold">Tenant Guardian</p>
        </div>
        <p className="mt-2 text-[12px] leading-[17px] text-ink-muted">
          Your {formatEUR(lease.deposit)} is held under your lease rules. Neither side can move it alone.
        </p>
      </div>
      <div className="absolute -right-1 bottom-[12%] hidden items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3 shadow-lift sm:flex lg:-right-6">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-tint text-brand">
          <ShieldCheck size={16} />
        </span>
        <span>
          <span className="block text-[12px] font-semibold">Rules, not opinions</span>
          <span className="block text-[11px] text-ink-muted">Release if no claim in 14 days</span>
        </span>
      </div>
    </div>
  )
}
