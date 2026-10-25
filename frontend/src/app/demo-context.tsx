import { useState, type ReactNode } from 'react'
import { activities as seededActivities } from '../lib/demo-data'
import type { Activity, Dispute, Role } from '../lib/types'
import { DemoContext } from './use-demo'
export function DemoProvider({ children }: { children: ReactNode }) {
  const [role, updateRole] = useState<Role>(() => { try { return localStorage.getItem('fiavel-role') === 'landlord' ? 'landlord' : 'tenant' } catch { return 'tenant' } })
  const [events, setEvents] = useState(seededActivities)
  const [claims, setClaims] = useState<Dispute[]>([])
  const [paid, setPaid] = useState<string[]>([])
  function addEvent(title: string, detail: string, category: Activity['category']) { setEvents(current => [{ id: crypto.randomUUID(), title, detail, category, date: '2026-10-25', source: 'demo' }, ...current]) }
  return <DemoContext.Provider value={{ role, setRole: next => { updateRole(next); try { localStorage.setItem('fiavel-role', next) } catch { /* Preference storage is optional. */ } }, events, claims, addClaim: claim => { setClaims(current => [...current, claim]); addEvent('Claim prepared', `${claim.title} — draft simulation only; no submission or transfer.`, 'claim') }, paid, recordPayment: (id, amount) => { setPaid(current => [...current, id]); addEvent('Payment simulation recorded', `${amount}. No real funds transferred. Resets on refresh.`, 'payment') } }}>{children}</DemoContext.Provider>
}
