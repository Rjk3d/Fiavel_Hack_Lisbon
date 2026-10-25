import { useNavigate } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { AgentMark } from './AgentMark'
import { DemoTag } from '../ui/Pill'
import type { Role } from '../../lib/types'

/** Compact AI nudge on dashboards. Each button opens the assistant with that question asked. */
export function AIInsightCard({ role, message, prompts }: { role: Role; message: string; prompts: { label: string; q: string }[] }) {
  const navigate = useNavigate()
  return (
    <section className="card relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-soft/15 blur-2xl" aria-hidden />
      <div className="flex items-center gap-3">
        <AgentMark size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{role === 'tenant' ? 'Tenant Guardian' : 'Landlord Assistant'}</p>
          <p className="text-[12px] text-ink-muted">Explains and prepares · you decide</p>
        </div>
        <DemoTag>Demo AI</DemoTag>
      </div>
      <p className="mt-4 text-[16px] leading-[25px] text-ink">{message}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p.label}
            onClick={() => navigate(`/app/assistant?q=${encodeURIComponent(p.q)}`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-tint px-4 py-2 text-[13px] font-semibold text-brand transition hover:border-brand/40 hover:bg-[#EAE0FF]"
          >
            {p.label}
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </section>
  )
}
