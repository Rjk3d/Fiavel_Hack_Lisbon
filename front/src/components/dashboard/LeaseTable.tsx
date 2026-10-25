import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Avatar } from '../ui/misc'
import { Button } from '../ui/Button'
import { DepositStatusPill, PaymentStatusPill } from '../lease/status'
import { useFlows } from '../../state/flows'
import { formatEUR } from '../../lib/formatters'
import { paymentsOf, propertyOf, tenantOf } from '../../lib/lease-logic'
import type { Lease, Payment } from '../../lib/types'

/** The payment shown for a lease this month: the one due in the current month, else the latest. */
export function currentPayment(payments: Payment[], leaseId: string, today: string): Payment | undefined {
  const ps = paymentsOf(payments, leaseId)
  return ps.find((p) => p.dueDate.slice(0, 7) === today.slice(0, 7)) ?? ps.filter((p) => p.dueDate <= today).slice(-1)[0]
}

type NextAction = { label: string; run: () => void; primary: boolean }

export function useNextAction() {
  const { openReview, openClaim } = useFlows()
  const navigate = useNavigate()
  return (lease: Lease, current?: Payment): NextAction => {
    if (current?.status === 'needs_review') return { label: 'Review payment', run: () => openReview(current.id), primary: true }
    if (lease.moveOutInspection) return { label: 'Prepare claim', run: () => openClaim(lease.id), primary: false }
    return { label: 'View lease', run: () => navigate(`/app/leases/${lease.id}`), primary: false }
  }
}

export function LeaseTable({ leases, payments, today }: { leases: Lease[]; payments: Payment[]; today: string }) {
  const navigate = useNavigate()
  const nextAction = useNextAction()
  return (
    <div className="card overflow-hidden">
      {/* Desktop table */}
      <table className="hidden w-full text-left text-[14px] lg:table">
        <thead>
          <tr className="border-b border-line text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            <th className="px-6 py-4 font-semibold">Tenant</th>
            <th className="px-3 py-4 font-semibold">Rent</th>
            <th className="px-3 py-4 font-semibold">This month</th>
            <th className="px-3 py-4 font-semibold">Deposit</th>
            <th className="px-6 py-4 text-right font-semibold">Next action</th>
          </tr>
        </thead>
        <tbody>
          {leases.map((l) => {
            const t = tenantOf(l)
            const cur = currentPayment(payments, l.id, today)
            const a = nextAction(l, cur)
            return (
              <tr
                key={l.id}
                onClick={() => navigate(`/app/leases/${l.id}`)}
                className="cursor-pointer border-b border-line transition last:border-0 hover:bg-canvas"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar initials={t.initials} size={38} tone="soft" />
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-[13px] text-ink-muted">
                        {propertyOf(l).street} · {propertyOf(l).neighbourhood}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="tnum px-3 py-4 font-semibold">{formatEUR(l.monthlyRent)}</td>
                <td className="px-3 py-4">{cur && <PaymentStatusPill status={cur.status} />}</td>
                <td className="px-3 py-4">
                  <div className="flex flex-col items-start gap-1">
                    <DepositStatusPill status={l.depositStatus} />
                    <span className="tnum text-[12px] text-ink-muted">{formatEUR(l.deposit)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button
                    size="sm"
                    variant={a.primary ? 'primary' : 'secondary'}
                    onClick={(e) => {
                      e.stopPropagation()
                      a.run()
                    }}
                  >
                    {a.label}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Mobile / tablet cards */}
      <ul className="divide-y divide-line lg:hidden">
        {leases.map((l) => {
          const t = tenantOf(l)
          const cur = currentPayment(payments, l.id, today)
          const a = nextAction(l, cur)
          return (
            <li key={l.id} className="p-4 sm:p-5">
              <button onClick={() => navigate(`/app/leases/${l.id}`)} className="flex w-full items-center gap-3 text-left">
                <Avatar initials={t.initials} size={40} tone="soft" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block truncate text-[13px] text-ink-muted">{propertyOf(l).neighbourhood}</span>
                </span>
                <span className="tnum font-semibold">{formatEUR(l.monthlyRent)}</span>
                <ChevronRight size={16} className="text-ink-muted" />
              </button>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {cur && <PaymentStatusPill status={cur.status} />}
                <DepositStatusPill status={l.depositStatus} />
                <Button size="sm" variant={a.primary ? 'primary' : 'secondary'} className="ml-auto" onClick={a.run}>
                  {a.label}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
