import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Buffer } from 'buffer'
import { ArrowUp, BookOpen, ExternalLink, Languages, Lock, ShieldCheck, Sparkles, TriangleAlert, Wand2, X } from 'lucide-react'
import { explainRule, ruleFor, ruleLabel, type RuleId } from '@agents/explain'
import { Button } from '../ui/Button'
import { Pill } from '../ui/Pill'
import { SectionHeader } from '../ui/misc'
import { useLive, type LeaseView } from '../../state/live'
import { MAX_TEXT_BYTES, open, payloadSize, seal, verifiedCount, type SentMessage } from '../../stellar/chat'
import { NETWORK, explorerTx } from '../../stellar/config'
import { threadOf, type ChainEvent } from '../../stellar/vault'
import { ASSIST_ERROR, assist, browserLang, type AssistLang } from '../../lib/assistant'
import { detectLang } from './agent'
import { cx } from '../../lib/cx'

/**
 * Tenant-landlord messages of one lease. Each message is encrypted on this
 * device for the two parties and sent with `send_message`; the contract
 * chains it into a thread hash, so the app can show that nothing was dropped
 * or edited. Lease rules come from the rule engine. The AI buttons only
 * translate, polish or summarize text the user picks, and every rewrite is
 * shown for review before anything is sent.
 */

interface Stored extends SentMessage {
  tx: string
  at: string
}

const LANG_NAME: Record<AssistLang, string> = { en: 'English', fr: 'Français', pt: 'Português' }
const storeKey = (id: bigint) => `fiavel.chat.${NETWORK.leaseVault}.${id}`
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')
const unhex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'))

/** Messages kept on this device, so the thread stays readable after the RPC forgets old events. */
function loadStored(id: bigint): Stored[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(id)) ?? '[]') as { from: string; seq: number; payload: string; thread: string; tx: string; at: string }[]
    return raw.map((m) => ({ ...m, payload: unhex(m.payload), thread: unhex(m.thread) }))
  } catch {
    return []
  }
}

function saveStored(id: bigint, msgs: Stored[]) {
  try {
    localStorage.setItem(storeKey(id), JSON.stringify(msgs.map((m) => ({ ...m, payload: hex(m.payload), thread: hex(m.thread) }))))
  } catch {
    /* not persisted */
  }
}

function fromEvent(e: ChainEvent): Stored | null {
  const d = e.data as { seq?: number; payload?: Uint8Array; thread?: Uint8Array }
  if (!e.actor || d.seq == null || !d.payload || !d.thread) return null
  return { from: e.actor, seq: Number(d.seq), payload: new Uint8Array(d.payload), thread: new Uint8Array(d.thread), tx: e.tx, at: e.at }
}

/** Rules that only matter before the move-in. */
const BEFORE_MOVE_IN: RuleId[] = ['first_rent', 'no_keys']

/**
 * Lease rule a message is about, from the deterministic rule table. Skips
 * rules that no longer apply at this stage, and "early seizure" unless the
 * text is about taking the guarantee ("now" alone is not).
 */
function ruleHint(text: string, status: string): RuleId | undefined {
  const rule = ruleFor(text, detectLang(text) ?? 'en')
  if (!rule) return undefined
  if (BEFORE_MOVE_IN.includes(rule) && status !== 'Created' && status !== 'Funded') return undefined
  if (rule === 'early_seizure' && !/seiz|take (all|the whole)|grab|saisi|prend/i.test(text)) return undefined
  return rule
}

export function LeaseChat({ view }: { view: LeaseView }) {
  const live = useLive()
  const l = view.snap.lease
  const role = live.role === 'tenant' || live.role === 'landlord' ? live.role : null
  const party = role !== null && live.roleOf(view)
  const me = live.wallet
  const other = role === 'landlord' ? l.tenant : l.landlord

  const [stored, setStored] = useState<Stored[]>(() => loadStored(view.id))
  const [onChain, setOnChain] = useState<{ count: number } | null | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [lang, setLang] = useState<AssistLang>(browserLang)
  const [suggestion, setSuggestion] = useState<{ text: string; numbersChanged: boolean } | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const events = live.events.filter((e) => e.name === 'message_sent' && e.leaseId === view.id)
  const fresh = events.length

  // Merge the events the RPC still has with what this device kept.
  useEffect(() => {
    const bySeq = new Map(loadStored(view.id).map((m) => [m.seq, m]))
    for (const e of events) {
      const m = fromEvent(e)
      if (m) bySeq.set(m.seq, m)
    }
    const all = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
    saveStored(view.id, all)
    setStored(all)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, fresh])

  useEffect(() => {
    let alive = true
    void threadOf(view.id).then((t) => alive && setOnChain(t))
    return () => {
      alive = false
    }
  }, [view.id, fresh])

  const messages = useMemo(
    () =>
      stored.map((m) => ({
        ...m,
        mine: m.from === me.address,
        text: party && other ? open(m.payload, m.from, me.sign, other, view.id) : null,
      })),
    [stored, party, other, me, view.id],
  )
  const verified = verifiedCount(stored)

  if (!l.tenant)
    return (
      <section className="card p-5 sm:p-6">
        <SectionHeader title="Messages" />
        <p className="text-[14px] text-ink-muted">Messages open once the tenant has funded the guarantee: the contract then knows both parties.</p>
      </section>
    )

  if (onChain === null)
    return (
      <section className="card p-5 sm:p-6">
        <SectionHeader title="Messages" />
        <p className="text-[14px] text-ink-muted">
          This contract version has no messaging. Encrypted messages arrive with the next LeaseVault deployment (send_message).
        </p>
      </section>
    )

  const bytes = payloadSize(draft) - payloadSize('')
  const tooLong = bytes > MAX_TEXT_BYTES
  const canSend = party && !!other && draft.trim().length > 0 && !tooLong && live.connection === 'live' && !live.busy

  async function send() {
    if (!canSend || !other) return
    const payload = Buffer.from(seal(draft.trim(), me.sign, other, view.id))
    const out = await live.run('send_message', { id: view.id, from: me.address, payload }, 'Message sent', view.id)
    if (out) {
      setDraft('')
      setSuggestion(null)
    }
  }

  async function polish() {
    if (!role || !draft.trim()) return
    setAiBusy('polish')
    setAiError(null)
    const out = await assist({ task: 'rephrase', lang, role, text: draft.trim() })
    setAiBusy(null)
    if (out.ok) setSuggestion({ text: out.text, numbersChanged: out.numbersChanged })
    else setAiError(ASSIST_ERROR[out.error])
  }

  async function summarize() {
    if (!role) return
    const thread = messages.filter((m) => m.text).map((m) => ({ who: (m.from === l.landlord ? 'landlord' : 'tenant') as 'tenant' | 'landlord', text: m.text as string }))
    if (!thread.length) return
    setAiBusy('summary')
    setAiError(null)
    const out = await assist({ task: 'summarize', lang, role, thread: thread.slice(-60) })
    setAiBusy(null)
    if (out.ok) setSummary(out.text)
    else setAiError(ASSIST_ERROR[out.error])
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
  }

  const count = onChain?.count ?? 0
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-[18px] font-semibold tracking-[-0.01em]">
            Messages
            <Pill tone="brand"><Lock size={12} className="mr-1 inline" />End-to-end encrypted</Pill>
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {role === 'landlord' ? 'Between you and your tenant' : role === 'tenant' ? 'Between you and your landlord' : 'Between the tenant and the landlord'}
          </p>
        </div>
        {party && messages.some((m) => m.text) && (
          <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={summarize} disabled={!!aiBusy}>
            {aiBusy === 'summary' ? 'Summarizing…' : 'Summarize'}
          </Button>
        )}
      </div>

      <ThreadStatus count={count} shown={stored.length} verified={verified} loading={onChain === undefined} />

      {summary && (
        <div className="mb-4 rounded-2xl border border-brand/20 bg-brand-tint/60 p-4 text-[14px] leading-[21px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand"><Sparkles size={13} /> AI summary · check it against the messages</span>
            <button onClick={() => setSummary(null)} className="text-ink-muted hover:text-ink" aria-label="Close summary"><X size={14} /></button>
          </div>
          <p className="whitespace-pre-line">{summary}</p>
        </div>
      )}

      {!party && (
        <p className="mb-4 rounded-2xl bg-canvas px-4 py-3 text-[13px] text-ink-muted">
          Only the tenant and the landlord hold the keys to read these {count} message(s). Switch to one of their roles.
        </p>
      )}

      {party && (
        <ul className="mb-4 max-h-[420px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.length === 0 && <li className="text-[14px] text-ink-muted">No messages yet. Write the first one below.</li>}
          {messages.map((m) => (
            <Bubble key={m.seq} m={m} lang={lang} view={view} />
          ))}
        </ul>
      )}

      {party && (
        <div className="space-y-2">
          {suggestion && (
            <div className={cx('rounded-2xl border p-3 text-[14px]', suggestion.numbersChanged ? 'border-warning/40 bg-warning-tint/60' : 'border-brand/20 bg-brand-tint/50')}>
              <p className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand"><Wand2 size={13} /> Suggested by the AI · you decide</p>
              {suggestion.numbersChanged && (
                <p className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-warning">
                  <TriangleAlert size={13} /> A number differs from your draft. Check every amount and date.
                </p>
              )}
              <p className="whitespace-pre-line">{suggestion.text}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => { setDraft(suggestion.text); setSuggestion(null) }}>Use this</Button>
                <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>Keep mine</Button>
              </div>
            </div>
          )}
          <label htmlFor={`chat-${view.id}`} className="sr-only">Message</label>
          <textarea
            id={`chat-${view.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={3}
            placeholder={role === 'landlord' ? 'Write to your tenant…' : 'Write to your landlord…'}
            className="w-full resize-none rounded-2xl border border-line bg-white px-4 py-3 text-[14px] outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
              <Languages size={14} />
              <select value={lang} onChange={(e) => setLang(e.target.value as AssistLang)} className="rounded-lg border border-line bg-white px-2 py-1 text-[12px]" aria-label="AI language">
                {(Object.keys(LANG_NAME) as AssistLang[]).map((k) => (
                  <option key={k} value={k}>{LANG_NAME[k]}</option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="secondary" icon={<Wand2 size={14} />} onClick={polish} disabled={!draft.trim() || tooLong || !!aiBusy}>
              {aiBusy === 'polish' ? 'Polishing…' : 'Polish with AI'}
            </Button>
            <span className={cx('ml-auto text-[12px] tnum', tooLong ? 'font-semibold text-danger' : 'text-ink-muted')}>{bytes}/{MAX_TEXT_BYTES}</span>
            <Button size="sm" icon={<ArrowUp size={14} />} onClick={send} disabled={!canSend}>
              {live.busy === 'Message sent' ? 'Sending…' : 'Send'}
            </Button>
          </div>
          {aiError && <p className="text-[12px] text-warning">{aiError}</p>}
          {live.connection !== 'live' && <p className="text-[12px] text-ink-muted">Sending needs the testnet connection.</p>}
        </div>
      )}

      <p className="mt-4 text-[12px] leading-[18px] text-ink-muted">
        Encrypted on this device with your wallet key: the contract and the network only see ciphertext. A message moves no money and changes nothing in the lease.
        The AI buttons send only the text you choose to Fiável&apos;s server and the Claude API; the AI never sees your keys, cannot sign and cannot move funds.
      </p>
    </section>
  )
}

function ThreadStatus({ count, shown, verified, loading }: { count: number; shown: number; verified: number; loading: boolean }) {
  if (loading || count === 0) return null
  // verified can briefly exceed count: a new event arrives before get_thread is read again.
  if (verified >= count)
    return (
      <p className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
        <ShieldCheck size={14} /> All {verified} message(s) match the thread hash recorded by the contract.
      </p>
    )
  if (shown < count)
    return (
      <p className="mb-4 text-[12px] text-ink-muted">
        {count - shown} older message(s) are past the RPC's event history and were not kept on this device; {verified} verified from the start.
      </p>
    )
  return (
    <p className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-warning">
      <TriangleAlert size={14} /> The messages shown do not match the contract's thread hash after message {verified}.
    </p>
  )
}

function Bubble({ m, lang, view }: { m: Stored & { mine: boolean; text: string | null }; lang: AssistLang; view: LeaseView }) {
  const [translation, setTranslation] = useState<{ text: string; numbersChanged: boolean } | null>(null)
  const [rule, setRule] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hint = m.text ? ruleHint(m.text, view.snap.lease.status.tag) : undefined

  async function translate() {
    if (!m.text) return
    setBusy(true)
    setError(null)
    const out = await assist({ task: 'translate', lang, text: m.text })
    setBusy(false)
    if (out.ok) setTranslation({ text: out.text, numbersChanged: out.numbersChanged })
    else setError(ASSIST_ERROR[out.error])
  }

  return (
    <li className={cx('flex flex-col', m.mine ? 'items-end' : 'items-start')}>
      <div className={cx('max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-[20px]', m.mine ? 'bg-brand text-white' : 'bg-canvas text-ink')}>
        {m.text != null ? <p className="whitespace-pre-line break-words">{m.text}</p> : <p className="italic opacity-75">Cannot be decrypted with this wallet.</p>}
        {translation && (
          <div className={cx('mt-2 border-t pt-2', m.mine ? 'border-white/25' : 'border-line')}>
            <p className="mb-0.5 text-[11px] font-semibold opacity-80">AI translation · {LANG_NAME[lang]}</p>
            {translation.numbersChanged && <p className="text-[11px] font-semibold text-warning">A number differs from the original: trust the original.</p>}
            <p className="whitespace-pre-line break-words">{translation.text}</p>
          </div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-[11px] text-ink-muted">
        <span>{new Date(m.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
        <a href={explorerTx(m.tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-brand">
          tx <ExternalLink size={10} />
        </a>
        {!m.mine && m.text && !translation && (
          <button onClick={translate} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline disabled:opacity-50">
            <Languages size={11} /> {busy ? 'Translating…' : 'Translate'}
          </button>
        )}
        {hint && (
          <button onClick={() => setRule((r) => !r)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
            <BookOpen size={11} /> Lease rule: {ruleLabel(hint)}
          </button>
        )}
      </div>
      {rule && hint && (
        <p className="mt-1 max-w-[85%] rounded-xl bg-white px-3 py-2 text-[12px] leading-[18px] text-ink-muted ring-1 ring-line">
          {explainRule(hint, { lease: view.snap.lease, disputeBond: NETWORK.disputeBond })}
          <span className="mt-1 block text-[11px] font-semibold text-ink-muted">From the rule engine, not the AI.</span>
        </p>
      )}
      {error && <p className="mt-1 px-1 text-[11px] text-warning">{error}</p>}
    </li>
  )
}
