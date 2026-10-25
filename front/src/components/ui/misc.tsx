import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

export function Logo({ light, compact }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="10" fill={light ? '#fff' : '#6338B8'} />
        <path d="M16 7.5 23 10v5.6c0 4.6-3 7.7-7 8.9-4-1.2-7-4.3-7-8.9V10l7-2.5Z" fill={light ? '#6338B8' : '#fff'} />
        <path d="m12.6 15.8 2.4 2.4 4.4-4.6" stroke={light ? '#fff' : '#6338B8'} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className={cx('text-[19px] font-semibold tracking-[-0.02em]', light ? 'text-white' : 'text-ink')}>Fiável</span>
      )}
    </span>
  )
}

export function Avatar({ initials, size = 40, tone = 'brand' }: { initials: string; size?: number; tone?: 'brand' | 'ink' | 'soft' }) {
  const t = { brand: 'bg-brand text-white', ink: 'bg-ink text-white', soft: 'bg-brand-tint text-brand' }[tone]
  return (
    <span
      className={cx('inline-grid shrink-0 place-items-center rounded-full font-semibold', t)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function SectionHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-ink-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-xl bg-[#F1EFF6]', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  )
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-2 max-w-[60ch] text-[15px] leading-[23px] text-ink-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-tint text-brand">{icon}</span>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-[36ch] text-[14px] leading-[21px] text-ink-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function FactRows({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3 text-[14px]">
          <dt className="text-ink-muted">{r.label}</dt>
          <dd className="tnum text-right font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
