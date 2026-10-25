import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { formatEUR } from '../lib/formatters'
import { DEMO_TODAY, seedActivity, seedLeases, seedPayments } from '../lib/demo-data'
import type { Snapshot } from '../lib/lease-logic'
import type { ActivityEvent, ClaimDraft, Payment, Role } from '../lib/types'

/**
 * In-memory demo state. A real backend would replace the action bodies with API calls;
 * the screens only use the returned values and the actions below.
 * Only the selected role is persisted (a harmless UI preference).
 */
interface DemoStore extends Snapshot {
  activity: ActivityEvent[]
  setRole: (r: Role) => void
  simulatePayment: (paymentId: string) => void
  markPaymentReceived: (paymentId: string) => void
  saveClaimDraft: (d: Omit<ClaimDraft, 'id' | 'createdDate' | 'status' | 'origin'>) => ClaimDraft
  logActivity: (e: Omit<ActivityEvent, 'id' | 'date' | 'time' | 'origin'>) => void
  resetDemo: () => void
}

const Ctx = createContext<DemoStore | null>(null)
const ROLE_KEY = 'fiavel.demoRole'

function readRole(): Role {
  try {
    return localStorage.getItem(ROLE_KEY) === 'landlord' ? 'landlord' : 'tenant'
  } catch {
    return 'tenant'
  }
}

const nowTime = () => new Date().toTimeString().slice(0, 5)

export function DemoProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(readRole)
  const [payments, setPayments] = useState<Payment[]>(seedPayments)
  const [claims, setClaims] = useState<ClaimDraft[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>(seedActivity)

  const setRole = useCallback((r: Role) => {
    setRoleState(r)
    try {
      localStorage.setItem(ROLE_KEY, r)
    } catch {
      /* storage unavailable: the choice simply isn't remembered */
    }
  }, [])

  const logActivity = useCallback<DemoStore['logActivity']>((e) => {
    setActivity((a) => [...a, { ...e, id: `act-${Date.now()}-${a.length}`, date: DEMO_TODAY, time: nowTime(), origin: 'demo' }])
  }, [])

  const simulatePayment = useCallback(
    (paymentId: string) => {
      const p = payments.find((x) => x.id === paymentId)
      if (!p) return
      setPayments((ps) =>
        ps.map((x) =>
          x.id === paymentId
            ? {
                ...x,
                status: 'simulated',
                paidDate: DEMO_TODAY,
                method: 'Demo simulation — no funds moved',
                events: [...x.events, { date: DEMO_TODAY, label: 'Payment simulated in demo (no funds transferred)' }],
              }
            : x,
        ),
      )
      logActivity({
        leaseId: p.leaseId,
        kind: 'payment',
        title: `${p.period.split(' ')[0]} rent simulated`,
        detail: 'Demo simulation · no funds were transferred',
        visibleTo: ['tenant', 'landlord'],
        tone: 'brand',
      })
    },
    [payments, logActivity],
  )

  const markPaymentReceived = useCallback(
    (paymentId: string) => {
      const p = payments.find((x) => x.id === paymentId)
      if (!p) return
      setPayments((ps) =>
        ps.map((x) =>
          x.id === paymentId
            ? { ...x, status: 'paid', events: [...x.events, { date: DEMO_TODAY, label: 'Marked as received by landlord (demo)' }] }
            : x,
        ),
      )
      logActivity({
        leaseId: p.leaseId,
        kind: 'payment',
        title: `${p.period.split(' ')[0]} rent marked as received`,
        detail: `${formatEUR(p.amount)} · reviewed by landlord (demo)`,
        visibleTo: ['landlord'],
        tone: 'success',
      })
    },
    [payments, logActivity],
  )

  const saveClaimDraft = useCallback<DemoStore['saveClaimDraft']>(
    (d) => {
      const draft: ClaimDraft = { ...d, id: `claim-${Date.now()}`, createdDate: DEMO_TODAY, status: 'draft', origin: 'demo' }
      setClaims((c) => [...c, draft])
      logActivity({
        leaseId: d.leaseId,
        kind: 'claim',
        title: 'Claim draft prepared',
        detail: 'Saved as a demo draft · not submitted to the tenant or any contract',
        visibleTo: ['landlord'],
        tone: 'warning',
      })
      return draft
    },
    [logActivity],
  )

  const resetDemo = useCallback(() => {
    setPayments(seedPayments)
    setClaims([])
    setActivity(seedActivity)
  }, [])

  const value = useMemo<DemoStore>(
    () => ({
      role,
      today: DEMO_TODAY,
      leases: seedLeases,
      payments,
      claims,
      activity,
      setRole,
      simulatePayment,
      markPaymentReceived,
      saveClaimDraft,
      logActivity,
      resetDemo,
    }),
    [role, payments, claims, activity, setRole, simulatePayment, markPaymentReceived, saveClaimDraft, logActivity, resetDemo],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDemo() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDemo must be used inside <DemoProvider>')
  return v
}
