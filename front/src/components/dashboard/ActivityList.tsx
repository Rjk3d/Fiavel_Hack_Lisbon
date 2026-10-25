import { CircleDollarSign, FileSignature, FileWarning, PlayCircle, ShieldCheck, Sparkles, SearchCheck } from 'lucide-react'
import { DemoTag } from '../ui/Pill'
import { cx } from '../../lib/cx'
import { formatDate } from '../../lib/formatters'
import type { ActivityEvent, ActivityKind } from '../../lib/types'

const ICONS: Record<ActivityKind, typeof Sparkles> = {
  lease_created: FileSignature,
  lease_active: PlayCircle,
  deposit: ShieldCheck,
  payment: CircleDollarSign,
  claim: FileWarning,
  ai: Sparkles,
  review: SearchCheck,
}

const TONES: Record<ActivityEvent['tone'], string> = {
  success: 'bg-success-tint text-success',
  brand: 'bg-brand-tint text-brand',
  warning: 'bg-warning-tint text-warning',
  neutral: 'bg-[#F1EFF6] text-ink-muted',
}

/** Chronological feed (newest first) with a connecting rail. */
export function ActivityList({ events, compact }: { events: ActivityEvent[]; compact?: boolean }) {
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const Icon = ICONS[e.kind]
        return (
          <li key={e.id} className={cx('relative flex gap-4 animate-rise', compact ? 'pb-4' : 'pb-6', 'last:pb-0')} style={{ animationDelay: `${i * 40}ms` }}>
            {i < events.length - 1 && <span className="absolute left-[19px] top-11 h-[calc(100%-44px)] w-px bg-line" aria-hidden />}
            <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', TONES[e.tone])}>
              <Icon size={18} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[15px] font-semibold">{e.title}</p>
                {e.origin === 'demo' && <DemoTag>Demo</DemoTag>}
              </div>
              <p className="mt-0.5 text-[14px] leading-[20px] text-ink-muted">{e.detail}</p>
              <p className="mt-1 text-[12px] text-[#A29FB0]">
                {formatDate(e.date)} · {e.time}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export const sortNewest = (a: ActivityEvent, b: ActivityEvent) => (b.date + b.time).localeCompare(a.date + a.time)
