import { CheckCircle2 } from 'lucide-react'
import { LifecycleTimeline } from '../lease/LifecycleTimeline'
import { cx } from '../../lib/cx'
import type { ContextCard, FactRow } from '../../lib/services/assistant'

const toneText: Record<NonNullable<FactRow['tone']>, string> = {
  success: 'text-success',
  warning: 'text-warning',
  brand: 'text-brand',
  neutral: 'text-ink',
}

export function FactList({ rows }: { rows: FactRow[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
          <dt className="text-ink-muted">{r.label}</dt>
          <dd className={cx('tnum text-right font-semibold', r.tone ? toneText[r.tone] : 'text-ink')}>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Structured facts the assistant attaches to an answer. Data comes from the shared store. */
export function ContextCardView({ card }: { card: ContextCard }) {
  return (
    <div className="rounded-xl2 border border-line bg-white p-4 shadow-card">
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{card.title}</p>
      {card.kind === 'facts' && <FactList rows={card.rows} />}
      {card.kind === 'timeline' && (
        <div className="pt-3">
          <LifecycleTimeline steps={card.steps} vertical />
        </div>
      )}
      {card.kind === 'checklist' && (
        <ul className="space-y-2 pt-2">
          {card.items.map((i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-[20px]">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand" />
              {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
