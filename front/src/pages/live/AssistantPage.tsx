import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUp, FileSignature, RotateCcw, ShieldAlert } from 'lucide-react'
import type { Action } from '@agents/rules'
import { AgentMark } from '../../components/ai/AgentMark'
import { ActionDialog } from '../../components/live/ActionPanel'
import { PROMPTS, reply, type AgentReply } from '../../components/live/agent'
import { Button } from '../../components/ui/Button'
import { Pill } from '../../components/ui/Pill'
import { useLive, ROLE_PERSON } from '../../state/live'
import { usdc } from '../../stellar/format'
import { cx } from '../../lib/cx'

type Msg = { id: number; from: 'user'; text: string } | { id: number; from: 'agent'; reply: AgentReply }

const NAME = { tenant: 'Tenant Guardian', landlord: 'Landlord Assistant', arbiter: 'Arbiter Desk' } as const

export function LiveAssistant() {
  const live = useLive()
  const [params, setParams] = useSearchParams()
  const [leaseId, setLeaseId] = useState<string>(() => live.mine[0]?.id.toString() ?? '')
  const view = live.mine.find((v) => v.id.toString() === leaseId) ?? live.mine[0]
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [dialog, setDialog] = useState<Action | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const name = NAME[live.role]

  const send = (text: string) => {
    const q = text.trim()
    if (!q) return
    setInput('')
    const r = reply(q, live.role, view, live.now)
    setMsgs((m) => [...m, { id: Date.now(), from: 'user', text: q }, { id: Date.now() + 1, from: 'agent', reply: r }])
  }

  const asked = useRef<string | null>(null)
  useEffect(() => {
    const q = params.get('q')
    if (q && asked.current !== q && live.ready) {
      asked.current = q
      setParams({}, { replace: true })
      send(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, live.ready])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  useEffect(() => setMsgs([]), [live.role])

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(input)
    }
  }

  const prompts = useMemo(() => PROMPTS[live.role], [live.role])

  return (
    <div className="grid h-[calc(100dvh-64px-20px-104px)] min-h-[460px] gap-6 md:h-[calc(100dvh-64px-20px-48px)] lg:h-[calc(100dvh-72px-32px-48px)] lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="card flex h-full min-h-0 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <AgentMark size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-semibold">{name}</h1>
              <Pill tone="brand">Rule-based</Pill>
            </div>
            <p className="truncate text-[12px] text-ink-muted">For {ROLE_PERSON[live.role].name} · answers from the lease on-chain</p>
          </div>
          {live.mine.length > 1 && (
            <select value={view?.id.toString()} onChange={(e) => setLeaseId(e.target.value)} className="h-9 rounded-full border border-line bg-white px-3 text-[13px]">
              {live.mine.map((v) => (
                <option key={v.id.toString()} value={v.id.toString()}>
                  #{v.id.toString()} {v.meta.home}
                </option>
              ))}
            </select>
          )}
          {msgs.length > 0 && (
            <button onClick={() => setMsgs([])} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink-muted hover:bg-canvas hover:text-ink">
              <RotateCcw size={14} />
            </button>
          )}
        </header>

        <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
          <Bubble>
            <p className="font-semibold">
              Hi {ROLE_PERSON[live.role].name.split(' ')[0]}. I'm your {name}.
            </p>
            <p className="mt-1">
              I explain the rules of your lease from what is recorded on-chain and prepare transactions for you to sign. I never sign or move money myself,
              and I can't do anything the contract forbids.
            </p>
          </Bubble>
          {msgs.length === 0 && (
            <div className="ml-11 grid gap-2 sm:grid-cols-2">
              {prompts.map((p) => (
                <button key={p} onClick={() => send(p)} className="rounded-2xl border border-line bg-white px-4 py-3 text-left text-[14px] font-medium transition hover:border-brand/30 hover:shadow-card">
                  {p}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m) =>
            m.from === 'user' ? (
              <div key={m.id} className="flex animate-rise justify-end">
                <p className="max-w-[85%] rounded-[22px] rounded-br-md bg-brand px-4 py-2.5 text-[15px] leading-[22px] text-white sm:max-w-[70%]">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="space-y-3">
                <Bubble error={!!m.reply.refused}>
                  {m.reply.paragraphs.map((p, i) => (
                    <p key={i} className={i ? 'mt-2' : ''}>
                      {p}
                    </p>
                  ))}
                  {m.reply.bullets && (
                    <ul className="mt-2 space-y-1 text-[14px]">
                      {m.reply.bullets.map((b) => (
                        <li key={b}>· {b}</li>
                      ))}
                    </ul>
                  )}
                  {m.reply.refused && (
                    <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-danger">
                      <ShieldAlert size={15} /> {m.reply.refused}
                    </p>
                  )}
                </Bubble>
                {m.reply.action && view && (
                  <div className="ml-11 max-w-[520px] animate-rise overflow-hidden rounded-xl2 border border-brand/25 bg-white shadow-card">
                    <div className="flex items-center gap-3 border-b border-line bg-brand-tint/60 px-4 py-3">
                      <FileSignature size={16} className="text-brand" />
                      <p className="flex-1 text-[14px] font-semibold">{m.reply.action.label}</p>
                      <Pill tone="brand">Needs your signature</Pill>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <Button size="sm" onClick={() => setDialog(m.reply.action!)} disabled={!!live.busy}>
                        Review &amp; sign
                      </Button>
                      <span className="text-[12px] text-ink-muted">Checked against the lease rules · guarantee {usdc(view.snap.guaranteeValue)}</span>
                    </div>
                  </div>
                )}
                {m === msgs[msgs.length - 1] && (
                  <div className="ml-11 flex flex-wrap gap-2">
                    {m.reply.suggestions.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border border-brand/20 bg-brand-tint px-3.5 py-1.5 text-[13px] font-semibold text-brand hover:border-brand/40">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        <form
          className="border-t border-line bg-white p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <div className="flex items-end gap-2 rounded-[24px] border border-line bg-canvas p-1.5 pl-4 focus-within:border-brand/40">
            <label htmlFor="chat-input" className="sr-only">
              Message {name}
            </label>
            <textarea
              id="chat-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask about your lease, rent or guarantee…"
              className="max-h-[140px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-[22px] outline-none placeholder:text-[#A9A6B6]"
            />
            <button type="submit" disabled={!input.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:bg-[#D9D3E8]" aria-label="Send">
              <ArrowUp size={18} />
            </button>
          </div>
          <p className="mt-2 px-2 text-[11px] text-ink-muted">Deterministic agent: no language model. It cannot hallucinate a rule; it says when the lease has none.</p>
        </form>
      </section>

      <aside className="hidden space-y-4 overflow-y-auto lg:block">
        <div className="card p-5 text-center">
          <div className="flex justify-center">
            <AgentMark size={64} />
          </div>
          <p className="mt-3 font-semibold">{name}</p>
          <p className="mt-1 text-[13px] leading-[19px] text-ink-muted">Explains, prepares, never decides.</p>
        </div>
        <div className="rounded-xl2 bg-brand-tint p-5 text-[13px] leading-[19px]">
          <p className="font-semibold text-brand">Three locks</p>
          <ol className="mt-2 space-y-1.5 text-ink-muted">
            <li>1. The guard refuses anything outside the lease rules.</li>
            <li>2. You sign every transaction yourself.</li>
            <li>3. The contract rejects whatever breaks a rule.</li>
          </ol>
        </div>
      </aside>
      {dialog && view && <ActionDialog view={view} action={dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

function Bubble({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <div className="flex animate-rise items-start gap-3">
      <AgentMark size={32} />
      <div className={cx('max-w-[85%] rounded-[22px] rounded-tl-md px-4 py-3 text-[15px] leading-[23px] sm:max-w-[75%]', error ? 'border border-danger/20 bg-danger-tint' : 'bg-canvas')}>{children}</div>
    </div>
  )
}
