import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, ArrowUp, RotateCcw } from 'lucide-react'
import { AgentMark } from './AgentMark'
import { ContextCardView } from './ContextCards'
import { ActionCard } from './ActionCard'
import { DemoTag } from '../ui/Pill'
import { useDemo } from '../../state/demo-store'
import { assistantService, type AssistantReply } from '../../lib/services/assistant'
import { LANDLORD_PROMPTS, TENANT_PROMPTS } from '../../lib/demo-agent'
import { userFor } from '../../lib/lease-logic'
import { cx } from '../../lib/cx'

type Msg =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'agent'; reply: AssistantReply }
  | { id: number; from: 'error'; retry: string }

const LOGGED_INTENTS: Record<string, string> = {
  deposit_release: 'Tenant Guardian explained how the deposit is released',
  lease_summary: 'Tenant Guardian summarized the lease',
  claim_response: 'Tenant Guardian explained the claim process',
  evidence: 'Landlord Assistant prepared an evidence checklist',
  summarize_leases: 'Landlord Assistant summarized active leases',
  open_claim: 'Landlord Assistant explained claim eligibility',
}

/** The conversation. Talks to `assistantService` only — never to data or answers directly. */
export function ChatPanel({ initialQuestion, onConsumedQuestion }: { initialQuestion: string | null; onConsumedQuestion: () => void }) {
  const demo = useDemo()
  const { role } = demo
  const me = userFor(role)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const logged = useRef(new Set<string>())
  const snapshot = useRef(demo)
  snapshot.current = demo

  const prompts = role === 'tenant' ? TENANT_PROMPTS : LANDLORD_PROMPTS

  const send = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || busy) return
      setInput('')
      setBusy(true)
      setMsgs((m) => [...m, { id: Date.now(), from: 'user', text: q }])
      try {
        const reply = await assistantService.reply({ message: q, snapshot: snapshot.current })
        setMsgs((m) => [...m, { id: Date.now() + 1, from: 'agent', reply }])
        const note = LOGGED_INTENTS[reply.intent]
        if (note && !logged.current.has(reply.intent)) {
          logged.current.add(reply.intent)
          const s = snapshot.current
          snapshot.current.logActivity({
            leaseId: s.leases.find((l) => (role === 'tenant' ? l.tenantId : l.landlordId) === me.id)!.id,
            kind: 'ai',
            title: 'AI explanation generated',
            detail: note,
            visibleTo: [role],
            tone: 'neutral',
          })
        }
      } catch {
        setMsgs((m) => [...m, { id: Date.now() + 1, from: 'error', retry: q }])
      } finally {
        setBusy(false)
        requestAnimationFrame(() => field.current?.focus({ preventScroll: true }))
      }
    },
    [busy, role, me.id],
  )

  // Question handed over from a dashboard button: ask it once (the ref also absorbs StrictMode's double effect).
  const asked = useRef<string | null>(null)
  useEffect(() => {
    if (initialQuestion && asked.current !== initialQuestion) {
      asked.current = initialQuestion
      onConsumedQuestion()
      void send(initialQuestion)
    }
  }, [initialQuestion, onConsumedQuestion, send])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [input])

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(input)
    }
  }

  const name = role === 'tenant' ? 'Tenant Guardian' : 'Landlord Assistant'

  return (
    <section className="card flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <AgentMark size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-semibold">{name}</h1>
            <DemoTag>Demo AI</DemoTag>
          </div>
          <p className="truncate text-[12px] text-ink-muted">
            {busy ? 'Thinking…' : `For ${me.name} · answers from your demo lease data`}
          </p>
        </div>
        {msgs.length > 0 && (
          <button
            onClick={() => setMsgs([])}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink-muted transition hover:bg-canvas hover:text-ink"
          >
            <RotateCcw size={14} /> <span className="hidden sm:inline">New chat</span>
          </button>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        <AgentBubble>
          <p className="font-semibold">
            Hi {me.firstName}. I'm your {name}.
          </p>
          <p className="mt-1">
            {role === 'tenant'
              ? 'I can help you understand your lease, track upcoming payments, and prepare your next steps.'
              : 'I can help you track payments, understand lease obligations, and prepare a claim when needed.'}
          </p>
        </AgentBubble>

        {msgs.length === 0 && (
          <div className="ml-11 grid gap-2 sm:grid-cols-2">
            {prompts.map((p, i) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="animate-rise rounded-2xl border border-line bg-white px-4 py-3 text-left text-[14px] font-medium transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card"
                style={{ animationDelay: `${120 + i * 60}ms` }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {msgs.map((m) =>
          m.from === 'user' ? (
            <div key={m.id} className="flex animate-rise justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-brand px-4 py-2.5 text-[15px] leading-[22px] text-white sm:max-w-[70%]">
                {m.text}
              </p>
            </div>
          ) : m.from === 'error' ? (
            <AgentBubble key={m.id} error>
              <p className="flex items-center gap-2 font-semibold text-danger">
                <AlertTriangle size={16} /> I couldn't answer that just now.
              </p>
              <button onClick={() => send(m.retry)} className="mt-2 text-[14px] font-semibold text-brand hover:underline">
                Try again
              </button>
            </AgentBubble>
          ) : (
            <div key={m.id} className="space-y-3">
              <AgentBubble>
                {m.reply.paragraphs.map((p, i) => (
                  <p key={i} className={i ? 'mt-2' : ''}>
                    {p}
                  </p>
                ))}
              </AgentBubble>
              {m.reply.cards?.map((c, i) => (
                <div key={i} className="ml-11 max-w-[520px] animate-rise">
                  <ContextCardView card={c} />
                </div>
              ))}
              {m.reply.action && (
                <div className="ml-11 max-w-[520px] animate-rise">
                  <ActionCard action={m.reply.action} />
                </div>
              )}
              {m === msgs[msgs.length - 1] && m.reply.suggestions.length > 0 && !busy && (
                <div className="ml-11 flex flex-wrap gap-2">
                  {m.reply.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-brand/20 bg-brand-tint px-3.5 py-1.5 text-[13px] font-semibold text-brand transition hover:border-brand/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-3" role="status" aria-label="Assistant is typing">
            <AgentMark size={32} pulse />
            <div className="flex gap-1 rounded-[22px] rounded-bl-md bg-canvas px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-blink rounded-full bg-brand" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        className="border-t border-line bg-white p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <div className="flex items-end gap-2 rounded-[24px] border border-line bg-canvas p-1.5 pl-4 transition focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/10">
          <label htmlFor="chat-input" className="sr-only">
            Message {name}
          </label>
          <textarea
            id="chat-input"
            ref={field}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={role === 'tenant' ? 'Ask about your lease, rent or deposit…' : 'Ask about payments, leases or claims…'}
            className="max-h-[140px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-[22px] outline-none placeholder:text-[#A9A6B6]"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-dark disabled:bg-[#D9D3E8]"
            aria-label="Send"
          >
            <ArrowUp size={18} />
          </button>
        </div>
        <p className="mt-2 px-2 text-[11px] text-ink-muted">
          Demo AI: deterministic answers from fictional data. It explains and prepares; you confirm every action.
        </p>
      </form>
    </section>
  )
}

function AgentBubble({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <div className="flex animate-rise items-start gap-3">
      <AgentMark size={32} />
      <div
        className={cx(
          'max-w-[85%] rounded-[22px] rounded-tl-md px-4 py-3 text-[15px] leading-[23px] sm:max-w-[75%]',
          error ? 'border border-danger/20 bg-danger-tint' : 'bg-canvas',
        )}
      >
        {children}
      </div>
    </div>
  )
}
