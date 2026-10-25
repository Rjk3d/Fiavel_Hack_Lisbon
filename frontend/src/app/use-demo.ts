import { createContext, useContext } from 'react'
import type { Activity, Dispute, Role } from '../lib/types'
interface DemoState { role: Role; setRole: (role: Role) => void; events: Activity[]; claims: Dispute[]; addClaim: (claim: Dispute) => void; paid: string[]; recordPayment: (id: string, amount: string) => void }
export const DemoContext = createContext<DemoState | null>(null)
export function useDemo() { const state = useContext(DemoContext); if (!state) throw new Error('DemoProvider is required'); return state }
