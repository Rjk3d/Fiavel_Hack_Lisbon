import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUp, Sparkles } from 'lucide-react'
import { Badge, PageHeading } from '../components/ui'
import { useDemo } from '../app/use-demo'
import { demoAssistant } from '../lib/demo-agent'
import type { AgentReply, Role } from '../lib/types'
interface Message { id: string; from: 'user' | 'agent'; text: string; facts?: AgentReply['facts'] }
const prompts: Record<Role, string[]> = { tenant: ['When is my next rent payment?', 'How does my deposit get released?', 'Summarize my lease.', 'Help me respond to a claim.'], landlord: ['Which payments are coming up?', 'Can I open a claim?', 'What evidence should I prepare?', 'Summarize my active leases.'] }
export function AssistantPage() { const { role } = useDemo(); return <Conversation key={role} role={role}/> }
function Conversation({ role }: { role: Role }) {
  const [params] = useSearchParams()
  const [input, setInput] = useState(params.get('q') ?? '')
  const [messages, setMessages] = useState<Message[]>([{ id: 'greeting', from: 'agent', text: role === 'tenant' ? 'Hi Ana. I’m your Tenant Guardian. I can help you understand your lease, track upcoming payments, and prepare your next steps.' : 'Hi Manuel. I’m your Landlord Assistant. I can help you track payments, understand lease obligations, and prepare a claim when needed.' }])
  const [suggestions, setSuggestions] = useState(prompts[role])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, loading])
  async function send(question: string) {
    if (!question.trim() || loading) return
    setInput(''); setError(''); setLoading(true)
    setMessages(current => [...current, { id: crypto.randomUUID(), from: 'user', text: question.trim() }])
    try { const reply = await demoAssistant.reply(question, role); if (active.current) { setMessages(current => [...current, { id: crypto.randomUUID(), from: 'agent', ...reply }]); setSuggestions(reply.suggestions) } } catch { if (active.current) { setError('Could not load the demo response. Retry your question.'); setInput(question) } } finally { if (active.current) setLoading(false) }
  }
  return <><PageHeading eyebrow="A CALMER WAY TO UNDERSTAND" title={role === 'tenant' ? 'Your Tenant Guardian.' : 'Your Landlord Assistant.'} description="Clear answers. Thoughtful next steps. You stay in control."/><section className="chat-panel"><header className="chat-header"><span className="agent-icon"><Sparkles/></span><div><strong>{role === 'tenant' ? 'Tenant Guardian' : 'Landlord Assistant'}</strong><small>Rental context · Fictional data</small></div><Badge>Demo AI</Badge></header><div className="chat-messages" aria-live="polite" aria-busy={loading}>{messages.map(message => <div className={`message ${message.from}`} key={message.id}>{message.from === 'agent' && <span className="chat-avatar"><Sparkles size={17}/></span>}<div><div className="bubble">{message.text}</div>{message.facts && <div className="message-facts">{message.facts.map(fact => <div key={fact.label}><small>{fact.label}</small><strong>{fact.value}</strong></div>)}</div>}</div></div>)}{loading && <p className="loading-state">Preparing a demo explanation…</p>}{error && <p role="alert" className="error-state">{error}</p>}<div ref={end}/></div><div className="chat-bottom"><div className="suggested-prompts">{suggestions.map(prompt => <button key={prompt} disabled={loading} onClick={() => void send(prompt)}>{prompt}</button>)}</div>{role === 'landlord' && <Link className="text-link" to="/app/disputes">Prepare a claim draft for review</Link>}<form className="chat-input" onSubmit={e => { e.preventDefault(); void send(input) }}><label className="sr-only" htmlFor="question">Your question</label><textarea id="question" value={input} maxLength={2000} placeholder="Ask about your rental…" rows={1} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}/><button className="button send-button" disabled={!input.trim() || loading} aria-label="Send question"><ArrowUp size={20}/></button></form><p className="fine-print">Deterministic demo responses, not a live AI provider. No legal advice or transactions.</p></div></section></>
}
