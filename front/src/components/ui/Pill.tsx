import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

export type Tone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral' | 'onBrand'

const tones: Record<Tone, string> = {
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  brand: 'bg-brand-tint text-brand',
  neutral: 'bg-[#F1EFF6] text-ink-muted',
  onBrand: 'bg-white/15 text-white ring-1 ring-inset ring-white/20',
}

const dots: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  brand: 'bg-brand',
  neutral: 'bg-ink-muted',
  onBrand: 'bg-white',
}

export function Pill({ tone = 'neutral', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] font-semibold leading-[18px] whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dots[tone])} aria-hidden />}
      {children}
    </span>
  )
}

/** Small marker shown next to any fictional record or simulated result. */
export function DemoTag({ children = 'Demo data', onBrand }: { children?: ReactNode; onBrand?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em]',
        onBrand ? 'bg-white/15 text-white/85' : 'bg-[#F1EFF6] text-ink-muted',
      )}
    >
      {children}
    </span>
  )
}
