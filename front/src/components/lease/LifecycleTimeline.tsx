import { Check } from 'lucide-react'
import { cx } from '../../lib/cx'
import { formatDate } from '../../lib/formatters'
import type { Milestone } from '../../lib/lease-logic'

/**
 * The four-step lease lifecycle. Horizontal (with a connecting rail) on wide containers,
 * vertical on narrow ones or when `vertical` is set. `onBrand` styles it for purple cards.
 */
export function LifecycleTimeline({
  steps,
  onBrand,
  vertical,
  compact,
}: {
  steps: Milestone[]
  onBrand?: boolean
  vertical?: boolean
  compact?: boolean
}) {
  const doneCount = steps.filter((s) => s.state === 'done').length
  const currentIdx = steps.findIndex((s) => s.state === 'current')
  const reach = currentIdx >= 0 ? currentIdx : Math.max(0, doneCount - 1)
  const pct = (reach / (steps.length - 1)) * 100

  if (vertical) {
    return (
      <ol className="relative">
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={cx('absolute left-[15px] top-8 h-[calc(100%-32px)] w-0.5 rounded', s.state === 'done' ? 'bg-brand' : 'bg-line')}
                aria-hidden
              />
            )}
            <Node state={s.state} />
            <div className="pt-1">
              <p className="text-[15px] font-semibold">{s.label}</p>
              <p className="text-[13px] text-ink-muted">
                {s.dateLabel ?? (s.date ? formatDate(s.date) : '—')} · {s.hint}
              </p>
            </div>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <div className="relative">
      <div className={cx('absolute left-[12.5%] right-[12.5%] top-4 h-1.5 -translate-y-1/2 rounded-full', onBrand ? 'bg-white/20' : 'bg-brand-tint')} aria-hidden>
        <div
          className={cx('h-full rounded-full transition-[width] duration-700 ease-out', onBrand ? 'bg-[#D9C9FA]' : 'bg-brand')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="relative grid grid-cols-4">
        {steps.map((s) => (
          <li key={s.key} className="flex flex-col items-center text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
            <Node state={s.state} onBrand={onBrand} />
            <p className={cx('mt-2 text-[12px] font-semibold leading-[15px] sm:text-[13px]', onBrand ? 'text-white' : 'text-ink')}>{s.label}</p>
            {!compact && (
              <p className={cx('mt-0.5 text-[11px] leading-[14px] sm:text-[12px]', onBrand ? 'text-white/65' : 'text-ink-muted')}>
                {s.dateLabel ?? (s.date ? formatDate(s.date) : '—')}
              </p>
            )}
            <span className="sr-only">{s.state === 'done' ? 'completed' : s.state === 'current' ? 'current step' : 'upcoming'}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Node({ state, onBrand }: { state: Milestone['state']; onBrand?: boolean }) {
  if (state === 'done')
    return (
      <span className={cx('relative z-10 grid h-8 w-8 place-items-center rounded-full', onBrand ? 'bg-[#D9C9FA] text-brand' : 'bg-brand text-white')}>
        <Check size={16} strokeWidth={3} />
      </span>
    )
  if (state === 'current')
    return (
      <span className={cx('relative z-10 grid h-8 w-8 place-items-center rounded-full ring-4', onBrand ? 'bg-white ring-white/25' : 'bg-white ring-brand/15 border-2 border-brand')}>
        <span className={cx('h-2.5 w-2.5 rounded-full', onBrand ? 'bg-brand' : 'bg-brand')} />
      </span>
    )
  return (
    <span
      className={cx(
        'relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 border-dashed',
        onBrand ? 'border-white/40 bg-brand' : 'border-[#D6D0E6] bg-white',
      )}
    />
  )
}
