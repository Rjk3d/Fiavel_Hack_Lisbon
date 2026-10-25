import { Link } from 'react-router-dom'
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react'
import { LifecycleTimeline } from '../lease/LifecycleTimeline'
import { DemoTag, Pill } from '../ui/Pill'
import { formatEUR } from '../../lib/formatters'
import { lifecycle, propertyOf } from '../../lib/lease-logic'
import type { Lease } from '../../lib/types'

/** The tenant's signature purple card: deposit, lease, and lifecycle at a glance. */
export function DepositHeroCard({ lease, today }: { lease: Lease; today: string }) {
  const p = propertyOf(lease)
  return (
    <section className="brand-surface relative overflow-hidden rounded-xl3 p-5 text-white shadow-brand sm:p-7">
      <Ribbon />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-white/90">
          <ShieldCheck size={18} /> Your deposit is protected
        </div>
        <DemoTag onBrand>Demo data</DemoTag>
      </div>
      <p className="tnum relative mt-3 text-[48px] font-semibold leading-none tracking-[-0.04em] sm:text-[60px]">{formatEUR(lease.deposit)}</p>
      <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-white/80">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={15} /> {p.neighbourhood}, {p.city}
        </span>
        <Pill tone="onBrand" dot>
          Lease active
        </Pill>
      </div>
      <div className="relative mt-7 sm:mt-8">
        <LifecycleTimeline steps={lifecycle(lease, today)} onBrand compact />
      </div>
      <div className="relative mt-7 flex flex-col gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[44ch] text-[12px] leading-[17px] text-white/65">
          Demo values: this amount is not held in a real account or on Stellar Testnet.
        </p>
        <Link
          to="/app/lease"
          className="inline-flex h-10 items-center justify-center gap-1.5 self-start rounded-full bg-white px-4 text-[14px] font-semibold text-brand transition hover:bg-brand-tint sm:self-auto"
        >
          View lease <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  )
}

/** The flowing line from the reference visuals, kept subtle. */
function Ribbon() {
  return (
    <svg className="pointer-events-none absolute -right-10 -top-6 hidden h-[220px] w-[420px] opacity-25 sm:block" viewBox="0 0 420 220" fill="none" aria-hidden>
      <path d="M10 170c80-10 120-90 170-60s20 110 90 80 70-150 140-170" stroke="#E9DEFF" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}
