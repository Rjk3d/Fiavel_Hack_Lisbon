import { CalendarDays, Check, ChevronRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { PaymentStatusPill } from '../lease/status'
import { useFlows } from '../../state/flows'
import { formatDate, formatDateShort, formatEUR, relativeDays } from '../../lib/formatters'
import { isSettled, nextPayment, paymentsOf } from '../../lib/lease-logic'
import type { Lease, Payment } from '../../lib/types'

export function UpcomingRentCard({ lease, payments, today }: { lease: Lease; payments: Payment[]; today: string }) {
  const { openPayment, openPay } = useFlows()
  const next = nextPayment(payments, lease.id)
  const last = paymentsOf(payments, lease.id).filter(isSettled).slice(-1)[0]

  return (
    <section className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="label">Next rent</p>
        {next && <PaymentStatusPill status={next.status} />}
      </div>
      {next ? (
        <>
          <p className="tnum mt-2 text-[40px] font-semibold leading-none tracking-[-0.03em]">{formatEUR(next.amount)}</p>
          <p className="mt-3 flex items-center gap-2 text-[14px] text-ink-muted">
            <CalendarDays size={16} className="text-brand" />
            Due {formatDateShort(next.dueDate)} · <span className="font-medium text-ink">{relativeDays(today, next.dueDate)}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">{next.period}</p>
          <div className="mt-5 flex gap-2">
            <Button className="flex-1" onClick={() => openPayment(next.id)}>
              View details
            </Button>
            <Button variant="secondary" onClick={() => openPay(next.id)}>
              Pay early
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[15px] text-ink-muted">No upcoming payments on this lease.</p>
      )}
      {last && (
        <button
          onClick={() => openPayment(last.id)}
          className="mt-5 flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-left transition hover:bg-brand-tint/60"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-success-tint text-success">
            <Check size={16} strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">{last.period}</span>
            <span className="block text-[12px] text-ink-muted">
              {last.status === 'simulated' ? 'Simulated in demo' : `Paid ${formatDate(last.paidDate!)}`}
            </span>
          </span>
          <span className="tnum text-[14px] font-semibold">{formatEUR(last.amount)}</span>
          <ChevronRight size={16} className="text-ink-muted" />
        </button>
      )}
    </section>
  )
}
