import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { PayDialog, PaymentDetailDialog, ReviewPaymentDialog } from '../components/payments/PaymentDialogs'
import { ClaimDialog } from '../components/lease/ClaimDialog'

/**
 * One place that owns the app's modal flows, so any screen (or an assistant action card)
 * can open "pay", "review" or "prepare claim" without duplicating dialog state.
 */
interface Flows {
  openPayment: (paymentId: string) => void
  openPay: (paymentId: string) => void
  openReview: (paymentId: string) => void
  openClaim: (leaseId: string) => void
}

const Ctx = createContext<Flows | null>(null)

export function FlowsProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<string | null>(null)
  const [pay, setPay] = useState<string | null>(null)
  const [review, setReview] = useState<string | null>(null)
  const [claim, setClaim] = useState<string | null>(null)

  const flows = useMemo<Flows>(
    () => ({ openPayment: setDetail, openPay: setPay, openReview: setReview, openClaim: setClaim }),
    [],
  )

  return (
    <Ctx.Provider value={flows}>
      {children}
      <PaymentDetailDialog
        paymentId={detail}
        onClose={() => setDetail(null)}
        onPay={(id) => {
          setDetail(null)
          setPay(id)
        }}
        onReview={(id) => {
          setDetail(null)
          setReview(id)
        }}
      />
      <PayDialog paymentId={pay} onClose={() => setPay(null)} />
      <ReviewPaymentDialog paymentId={review} onClose={() => setReview(null)} />
      <ClaimDialog leaseId={claim} onClose={() => setClaim(null)} />
    </Ctx.Provider>
  )
}

export function useFlows() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFlows must be used inside <FlowsProvider>')
  return v
}
