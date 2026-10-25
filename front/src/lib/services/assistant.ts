import { assistantEndpoint } from '../config'
import { demoAgent } from '../demo-agent'
import type { Milestone, Snapshot } from '../lease-logic'

/**
 * Contract between the chat UI and whatever answers it.
 * Today: the deterministic demo agent. Later: a backend that returns the same shape.
 */
export interface FactRow {
  label: string
  value: string
  tone?: 'success' | 'warning' | 'brand' | 'neutral'
}

export type ContextCard =
  | { kind: 'facts'; title: string; rows: FactRow[] }
  | { kind: 'timeline'; title: string; steps: Milestone[] }
  | { kind: 'checklist'; title: string; items: string[] }

export type ProposedAction =
  | { type: 'simulate_payment'; paymentId: string; title: string; rows: FactRow[]; condition: string }
  | { type: 'mark_received'; paymentId: string; title: string; rows: FactRow[]; condition: string }
  | { type: 'prepare_claim'; leaseId: string; title: string; rows: FactRow[]; condition: string }

export interface AssistantReply {
  intent: string
  paragraphs: string[]
  cards?: ContextCard[]
  action?: ProposedAction
  suggestions: string[]
}

export interface AssistantRequest {
  message: string
  snapshot: Snapshot
}

export interface AssistantService {
  readonly mode: 'demo' | 'remote'
  reply(req: AssistantRequest): Promise<AssistantReply>
}

/** Remote adapter, used only when VITE_ASSISTANT_URL is set. Expects AssistantReply JSON back. */
function remoteAssistant(url: string): AssistantService {
  return {
    mode: 'remote',
    async reply({ message, snapshot }) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, role: snapshot.role, context: snapshot }),
      })
      if (!res.ok) throw new Error(`Assistant backend answered ${res.status}`)
      return (await res.json()) as AssistantReply
    },
  }
}

export const assistantService: AssistantService = assistantEndpoint ? remoteAssistant(assistantEndpoint) : demoAgent
