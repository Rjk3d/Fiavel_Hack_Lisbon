import { useState } from 'react'
import { FileText, Info, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { DemoTag } from '../ui/Pill'
import { FactList } from './ContextCards'
import { useDemo } from '../../state/demo-store'
import { useFlows } from '../../state/flows'
import { nextPayment } from '../../lib/lease-logic'
import type { ProposedAction } from '../../lib/services/assistant'

type Step = 'proposed' | 'confirm' | 'done' | 'dismissed'

/**
 * A consequential action prepared by the assistant. The user goes through:
 * summary + lease condition → explicit confirmation → result clearly labelled as a demo simulation.
 */
export function ActionCard({ action }: { action: ProposedAction }) {
  const demo = useDemo()
  const { openClaim } = useFlows()
  const [step, setStep] = useState<Step>('proposed')

  const stale =
    (action.type === 'simulate_payment' && (() => {
      const p = demo.payments.find((x) => x.id === action.paymentId)
      return !p || nextPayment(demo.payments, p.leaseId)?.id !== p.id
    })()) ||
    (action.type === 'mark_received' && demo.payments.find((x) => x.id === action.paymentId)?.status !== 'needs_review')

  const confirm = () => {
    if (action.type === 'simulate_payment') demo.simulatePayment(action.paymentId)
    if (action.type === 'mark_received') demo.markPaymentReceived(action.paymentId)
    if (action.type === 'prepare_claim') openClaim(action.leaseId)
    setStep('done')
  }

  const result =
    action.type === 'simulate_payment'
      ? 'Payment simulated in the demo. No funds were transferred and nothing was sent to Stellar.'
      : action.type === 'mark_received'
        ? 'Marked as received in the demo record. No funds moved.'
        : 'Claim form opened. Nothing is submitted until you review and save it — and in this demo it stays a draft.'

  return (
    <div className="overflow-hidden rounded-xl2 border border-brand/25 bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-line bg-brand-tint/60 px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-brand">
          {action.type === 'prepare_claim' ? <FileText size={16} /> : <ShieldCheck size={16} />}
        </span>
        <p className="flex-1 text-[14px] font-semibold">{action.title}</p>
        <DemoTag>Needs your OK</DemoTag>
      </div>

      <div className="px-4 py-3">
        <FactList rows={action.rows} />
        <p className="mt-2 flex gap-2 rounded-xl bg-canvas px-3 py-2.5 text-[13px] leading-[19px] text-ink-muted">
          <Info size={15} className="mt-0.5 shrink-0 text-brand" />
          {action.condition}
        </p>
      </div>

      <div className="border-t border-line px-4 py-3">
        {stale && step !== 'done' ? (
          <p className="text-[13px] text-ink-muted">This was already handled elsewhere in the demo. Nothing to do.</p>
        ) : step === 'proposed' ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setStep('confirm')}>
              Review &amp; confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep('dismissed')}>
              Not now
            </Button>
          </div>
        ) : step === 'confirm' ? (
          <div className="animate-fade">
            <p className="text-[13px] leading-[19px]">
              <strong>Confirm this action?</strong>{' '}
              <span className="text-ink-muted">This is a demo simulation: no real funds move and no transaction is submitted.</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={confirm}>
                {action.type === 'prepare_claim' ? 'Open claim form' : 'Confirm (demo)'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setStep('proposed')}>
                Back
              </Button>
            </div>
          </div>
        ) : step === 'done' ? (
          <p className="animate-fade text-[13px] leading-[19px] text-brand">
            <strong>Demo simulation · </strong>
            {result}
          </p>
        ) : (
          <p className="text-[13px] text-ink-muted">Dismissed. Nothing was changed.</p>
        )}
      </div>
    </div>
  )
}
