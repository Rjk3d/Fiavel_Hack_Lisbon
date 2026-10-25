import { useEffect, useState } from 'react'
import { CalendarClock, CircleDollarSign, Info, Loader2, ShieldCheck } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { DemoTag } from '../ui/Pill'
import { FactRows } from '../ui/misc'
import { PaymentStatusPill } from '../lease/status'
import { useDemo } from '../../state/demo-store'
import { useToast } from '../ui/Toast'
import { formatDate, formatDateLong, formatEUR, relativeDays } from '../../lib/formatters'
import { nextPayment, propertyOf, tenantOf, landlordOf } from '../../lib/lease-logic'

/** Side panel with the full story of one payment, plus the actions allowed for the current role. */
export function PaymentDetailDialog({
  paymentId,
  onClose,
  onPay,
  onReview,
}: {
  paymentId: string | null
  onClose: () => void
  onPay: (id: string) => void
  onReview: (id: string) => void
}) {
  const { payments, leases, role, today } = useDemo()
  const p = payments.find((x) => x.id === paymentId)
  const lease = p && leases.find((l) => l.id === p.leaseId)
  if (!p || !lease) return null
  const isNext = nextPayment(payments, lease.id)?.id === p.id
  const canPay = role === 'tenant' && isNext
  const canReview = role === 'landlord' && p.status === 'needs_review'

  return (
    <Dialog
      open
      side
      onClose={onClose}
      title={`${p.period} rent`}
      description={`${propertyOf(lease).street} · ${role === 'tenant' ? landlordOf(lease).name : tenantOf(lease).name}`}
      footer={
        canPay ? (
          <Button className="w-full" size="lg" onClick={() => onPay(p.id)}>
            Make payment
          </Button>
        ) : canReview ? (
          <Button className="w-full" size="lg" onClick={() => onReview(p.id)}>
            Review payment
          </Button>
        ) : p.status === 'scheduled' ? (
          <p className="text-center text-[13px] text-ink-muted">Payments open in order — this one becomes payable after the earlier month.</p>
        ) : undefined
      }
    >
      <div className="rounded-xl3 bg-canvas p-5">
        <div className="flex items-center justify-between">
          <PaymentStatusPill status={p.status} />
          <DemoTag />
        </div>
        <p className="tnum mt-4 text-[40px] font-semibold leading-none tracking-[-0.03em]">{formatEUR(p.amount)}</p>
        <p className="mt-2 text-[14px] text-ink-muted">
          Due {formatDateLong(p.dueDate)}
          {!p.paidDate && ` · ${relativeDays(today, p.dueDate)}`}
        </p>
      </div>

      <h3 className="mb-1 mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Payment details</h3>
      <FactRows
        rows={[
          { label: 'Rent', value: formatEUR(p.amount) },
          { label: 'Fees', value: formatEUR(0) },
          { label: p.status === 'needs_review' ? 'Reported on' : 'Paid on', value: p.paidDate ? formatDate(p.paidDate) : '—' },
          { label: 'Method', value: p.method ?? 'Not set yet' },
          { label: 'Lease', value: lease.reference },
        ]}
      />

      <h3 className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Timeline</h3>
      {p.events.length ? (
        <ol className="space-y-3">
          {p.events.map((e, i) => (
            <li key={i} className="flex gap-3 text-[14px]">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
              <div>
                <p className="font-medium">{e.label}</p>
                <p className="text-[13px] text-ink-muted">{formatDate(e.date)}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[14px] text-ink-muted">No events yet. This payment is scheduled for {formatDate(p.dueDate)}.</p>
      )}
    </Dialog>
  )
}

/** Demo payment: review → processing → simulated. States plainly that no money moves. */
export function PayDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const { payments, leases, simulatePayment } = useDemo()
  const toast = useToast()
  const [step, setStep] = useState<'review' | 'processing' | 'done'>('review')
  const [ack, setAck] = useState(false)
  useEffect(() => {
    setStep('review')
    setAck(false)
  }, [paymentId])

  const p = payments.find((x) => x.id === paymentId)
  const lease = p && leases.find((l) => l.id === p.leaseId)
  if (!p || !lease) return null

  const confirm = () => {
    setStep('processing')
    setTimeout(() => {
      simulatePayment(p.id)
      setStep('done')
      toast({ title: 'Payment simulated', body: 'Demo only — no funds were transferred.', tone: 'demo' })
    }, 1100)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={step === 'done' ? 'Payment simulated' : `Pay ${p.period} rent`}
      description={step === 'done' ? undefined : 'Review the details before confirming.'}
      footer={
        step === 'done' ? (
          <Button className="w-full" size="lg" variant="dark" onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={onClose} disabled={step === 'processing'}>
              Cancel
            </Button>
            <Button size="lg" className="flex-[1.4]" onClick={confirm} disabled={!ack || step === 'processing'}>
              {step === 'processing' ? <Loader2 size={18} className="animate-spin" /> : null}
              {step === 'processing' ? 'Simulating…' : `Simulate ${formatEUR(p.amount)}`}
            </Button>
          </div>
        )
      }
    >
      {step === 'done' ? (
        <div className="py-4 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-tint text-brand">
            <ShieldCheck size={30} />
          </span>
          <p className="mt-4 text-[15px] leading-[23px]">
            Your {p.period} payment of <strong>{formatEUR(p.amount)}</strong> is recorded as <strong>simulated</strong> in this demo.
          </p>
          <p className="mx-auto mt-3 max-w-[36ch] text-[13px] leading-[19px] text-ink-muted">
            No money was transferred and no blockchain transaction was submitted. In the live product this step would hand off to your
            bank or wallet for approval.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl3 bg-canvas p-5">
            <FactRows
              rows={[
                { label: 'Amount', value: <span className="text-[18px] font-semibold">{formatEUR(p.amount)}</span> },
                { label: 'Due date', value: formatDate(p.dueDate) },
                { label: 'Pay to', value: landlordOf(lease).name },
                { label: 'Property', value: propertyOf(lease).street },
              ]}
            />
          </div>
          <div className="mt-4 flex gap-3 rounded-2xl border border-line p-4 text-[13px] leading-[19px] text-ink-muted">
            <CalendarClock size={18} className="mt-0.5 shrink-0 text-brand" />
            Your lease sets rent at {formatEUR(lease.monthlyRent)}, due on day {lease.rentDueDay} of each month.
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-warning-tint p-4 text-[13px] leading-[19px] text-ink">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#6338B8]"
            />
            <span>
              <strong>Demo simulation.</strong> I understand no real funds will be transferred and nothing is sent to Stellar.
            </span>
          </label>
        </>
      )}
    </Dialog>
  )
}

/** Landlord confirms a tenant-reported transfer. Updates the demo record only. */
export function ReviewPaymentDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const { payments, leases, markPaymentReceived } = useDemo()
  const toast = useToast()
  const p = payments.find((x) => x.id === paymentId)
  const lease = p && leases.find((l) => l.id === p.leaseId)
  if (!p || !lease) return null
  const t = tenantOf(lease)

  return (
    <Dialog
      open
      onClose={onClose}
      title="Review reported payment"
      description={`${t.name} says they paid ${p.period} rent by bank transfer.`}
      footer={
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => {
              toast({ title: 'Kept in review', body: `We'll remind you about ${t.firstName}'s payment tomorrow (demo).`, tone: 'demo' })
              onClose()
            }}
          >
            Not yet
          </Button>
          <Button
            size="lg"
            className="flex-[1.4]"
            onClick={() => {
              markPaymentReceived(p.id)
              toast({ title: 'Marked as received', body: 'Demo record updated — no funds moved.', tone: 'demo' })
              onClose()
            }}
          >
            Mark as received
          </Button>
        </div>
      }
    >
      <div className="rounded-xl3 bg-canvas p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-warning-tint text-warning">
            <CircleDollarSign size={20} />
          </span>
          <div>
            <p className="tnum text-[24px] font-semibold tracking-[-0.02em]">{formatEUR(p.amount)}</p>
            <p className="text-[13px] text-ink-muted">Reported {p.paidDate ? formatDate(p.paidDate) : ''} · due {formatDate(p.dueDate)}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-3 text-[13px] leading-[19px] text-ink-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-brand" />
        Only confirm once the transfer shows on your bank statement. Fiável can't see your bank account in this demo.
      </div>
    </Dialog>
  )
}
