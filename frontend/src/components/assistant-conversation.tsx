import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUp, Sparkles, Square } from 'lucide-react'
import { Badge, PageHeading } from './ui'
import { useDemo } from '../app/use-demo'
import { landlord, leases, scenarioDate, tenant, transactions } from '../lib/demo-data'
import { authorizedLeases, boundedHistory, buildContext, type Language, type RentalContext, type Turn } from '../lib/ai/context'
import { contextualDemo, suggestedQuestions } from '../lib/ai/reply'
import { backendAssistant } from '../lib/ai/client'
import { clearSession, readSession, writeSession, type Message } from '../lib/ai/session'
import type { Role } from '../lib/types'

export function AssistantConversation() {
  const { role } = useDemo()
  const [params, setParams] = useSearchParams()
  const user = role === 'tenant' ? tenant : landlord
  const allowed = authorizedLeases(user, leases)
  const id = params.get('id') ?? allowed[0]?.id ?? ''
  const [language, setLanguage] = useState<Language>('en')
  const fr = language === 'fr'
  return <>
    <PageHeading eyebrow={fr ? 'COMPRENDRE EN TOUTE SÉRÉNITÉ' : 'A CALMER WAY TO UNDERSTAND'} title={role === 'tenant' ? 'Your Tenant Guardian.' : 'Your Landlord Assistant.'} description={fr ? 'Des réponses claires. Vous gardez le contrôle.' : 'Clear answers. Thoughtful next steps. You stay in control.'}/>
    <div className="assistant-controls">
      <label className="field">{fr ? 'Bail' : 'Lease'}<select value={allowed.some(item => item.id === id) ? id : ''} onChange={event => { const next = new URLSearchParams(params); next.set('id', event.target.value); next.delete('q'); setParams(next) }}>
        {!allowed.some(item => item.id === id) && <option value="">{fr ? 'Bail indisponible' : 'Lease unavailable'}</option>}
        {allowed.map(lease => <option key={lease.id} value={lease.id}>{lease.district}</option>)}
      </select></label>
      <label className="field">{fr ? 'Langue' : 'Language'}<select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="fr">Français</option></select></label>
    </div>
    <Conversation key={`${user.id}:${id}`} role={role} leaseId={id} language={language} initialQuestion={params.get('q') ?? ''}/>
  </>
}

function Conversation({ role, leaseId, language, initialQuestion }: { role: Role; leaseId: string; language: Language; initialQuestion: string }) {
  const { claims, paid } = useDemo()
  const user = role === 'tenant' ? tenant : landlord
  const key = `${user.id}:${role}:${leaseId}`
  const fr = language === 'fr'
  const say = (en: string, french: string) => fr ? french : en
  const greeting = (): Message => ({ id: 'greeting', from: 'agent', text: say(`Hi ${user.name.split(' ')[0]}. I’m your ${role === 'tenant' ? 'Tenant Guardian' : 'Landlord Assistant'}. Ask about your selected lease, payments, deposit or dispute preparation. This is a contextual, deterministic demo; no live model or real funds are connected.`, `Bonjour ${user.name.split(' ')[0]}. Je suis votre assistant ${role === 'tenant' ? 'locataire' : 'propriétaire'}. Posez vos questions sur le bail sélectionné, les paiements, la caution ou un litige. Démo contextuelle déterministe ; aucun modèle connecté ni fonds réel.`) })
  const [messages, setMessages] = useState<Message[]>(() => readSession(key)?.messages ?? [greeting()])
  const [input, setInput] = useState(() => initialQuestion || readSession(key)?.input || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState<{ question: string; id: string } | null>(null)
  const [mode, setMode] = useState<'demo' | 'backend'>('demo')
  const [consent, setConsent] = useState(false)
  const [draftReview, setDraftReview] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const pending = useRef<AbortController | null>(null)
  const active = useRef(true)
  let context: RentalContext | null = null
  try {
    context = buildContext(user, { leases, payments: transactions, claims: claims.map(claim => {
      const lease = leases.find(item => item.id === claim.leaseId)
      // Prepared claims are private landlord drafts, not submitted disputes.
      return { ...claim, visibleTo: lease ? [lease.landlord.id] : [] }
    }), evidence: [], simulatedPaymentIds: paid, asOf: scenarioDate, source: 'demo' }, leaseId)
  } catch { /* Render unavailable instead of silently selecting another lease. */ }

  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => { writeSession(key, { messages, input }) }, [key, messages, input])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, loading, error])

  async function send(question: string, retryId?: string) {
    question = question.trim()
    if (!question || pending.current || !context || (mode === 'backend' && !consent)) return
    const controller = new AbortController()
    pending.current = controller
    const id = retryId ?? crypto.randomUUID()
    const turns: Turn[] = messages.filter(message => message.id !== 'greeting' && message.id !== retryId).map(message => ({ role: message.from === 'user' ? 'user' : 'assistant', text: message.text, ...(message.reply ? { intent: message.reply.intent } : {}) }))
    setInput(''); setError(''); setNotice(''); setLoading(true); setFailed(null)
    if (!retryId) setMessages(current => [...current, { id, from: 'user' as const, text: question }].slice(-40))
    try {
      const reply = await (mode === 'demo' ? contextualDemo : backendAssistant).reply({ question, context, history: boundedHistory(turns), language, signal: controller.signal })
      if (active.current && !controller.signal.aborted) setMessages(current => [...current, { id: crypto.randomUUID(), from: 'agent' as const, text: reply.text, reply }].slice(-40))
    } catch (failure) {
      if (!active.current) return
      setFailed({ question, id })
      if (controller.signal.aborted) setNotice(say('Stopped. Retry or edit your question.', 'Arrêté. Réessayez ou modifiez votre question.'))
      else setError(say(failure instanceof Error ? failure.name === 'TimeoutError' ? 'The request timed out. Please retry.' : failure.message : 'Unable to prepare a response.', 'Réponse indisponible. Vérifiez la connexion et la configuration du serveur, puis réessayez.'))
    } finally { if (pending.current === controller) { pending.current = null; if (active.current) setLoading(false) } }
  }
  const last = [...messages].reverse().find(message => message.reply)?.reply
  const suggestions = last?.language === language ? last.suggestions : suggestedQuestions(role, language)
  function actionLink(id: string) {
    if (id === 'payments') return '/app/payments'
    if (id === 'disputes') return `/app/disputes?id=${encodeURIComponent(leaseId)}`
    return `/app/lease?id=${encodeURIComponent(leaseId)}${id === 'evidence' ? '#claims-evidence' : ''}`
  }
  function reset() {
    clearSession(key); setMessages([greeting()]); setInput(''); setFailed(null); setError(''); setNotice(''); setDraftReview(null)
  }
  return <section className="chat-panel assistant-panel" aria-label={role === 'tenant' ? 'Tenant Guardian' : 'Landlord Assistant'}>
    <header className="chat-header"><span className="agent-icon"><Sparkles/></span><div><strong>{role === 'tenant' ? 'Tenant Guardian' : 'Landlord Assistant'}</strong><small>{say('Fictional records · 25 Oct 2026', 'Données fictives · 25 oct. 2026')}</small></div><Badge>{mode === 'demo' ? say('Contextual demo', 'Démo contextuelle') : say('Backend selected', 'Serveur sélectionné')}</Badge></header>
    <div className="assistant-mode"><label>{say('Response service', 'Service de réponse')} <select value={mode} disabled={loading} onChange={event => { setMode(event.target.value as 'demo' | 'backend'); setConsent(false); setError(''); setFailed(null) }}><option value="demo">{say('Demo · no external model', 'Démo · aucun modèle externe')}</option><option value="backend">{say('Configured backend · requires setup', 'Serveur configuré · installation requise')}</option></select></label><button className="text-link" disabled={loading} onClick={reset}>{say('Clear chat', 'Effacer le chat')}</button>
      {mode === 'backend' && <label className="assistant-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>{say('I authorize sending this question, recent chat and minimal lease/payment facts to the configured external model. Do not include sensitive documents or secrets. A trusted backend session is required.', 'J’autorise l’envoi de cette question, des échanges récents et des faits minimaux du bail/paiements au modèle externe configuré. Ne joignez ni documents sensibles ni secrets. Une session serveur authentifiée est requise.')}</label>}
    </div>
    {!context && <p className="error-state" role="alert">{say('This lease is unavailable for the current user. Choose an authorized lease above.', 'Ce bail est indisponible pour cet utilisateur. Choisissez un bail autorisé ci-dessus.')}</p>}
    <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions" aria-busy={loading}>
      {messages.map(message => <article className={`message ${message.from}`} key={message.id}>{message.from === 'agent' && <span className="chat-avatar"><Sparkles size={17}/></span>}<div className="message-body"><div className="bubble preserve-lines">{message.text}</div>{message.reply && <>
        <small className="reply-source">{message.reply.mode === 'demo' ? say('Deterministic demo', 'Démo déterministe') : say('Model-assisted intent · grounded response', 'Intention assistée par modèle · réponse fondée sur les données')} · {message.reply.provenance === 'demo' ? say('Fictional data', 'Données fictives') : say('Backend records', 'Données serveur')}</small>
        {message.reply.facts.length > 0 && <div className="message-facts">{message.reply.facts.map(fact => <div key={fact.label}><small>{fact.label}</small><strong>{fact.value}</strong></div>)}</div>}
        {message.reply.draft && <div className="assistant-draft"><strong>{say('Private draft · not sent', 'Brouillon privé · non envoyé')}</strong><p className="preserve-lines">{message.reply.draft}</p><button className="button light small" onClick={() => setDraftReview(message.reply!.draft!)}>{say('Review and edit draft', 'Revoir et modifier')}</button></div>}
        <div className="assistant-actions">{message.reply.actions.map(action => action.id === 'draft' ? <button className="button light small" key={action.id} disabled={loading} onClick={() => void send(say('Draft a respectful response about this claim.', 'Rédige une réponse respectueuse à cette réclamation.'))}>{action.label}</button> : <Link className="button light small" key={action.id} to={actionLink(action.id)}>{action.label}</Link>)}</div>
      </>}</div></article>)}
      {loading && <p className="loading-state" role="status">{say('Preparing an explanation…', 'Préparation de la réponse…')}</p>}
      {error && <p role="alert" className="error-state">{error}</p>}{notice && <p role="status">{notice}</p>}
      {failed && <div className="assistant-actions"><button className="button light small" disabled={loading} onClick={() => void send(failed.question, failed.id)}>{say('Retry last question', 'Réessayer')}</button><button className="button light small" onClick={() => { setInput(failed.question); setFailed(null) }}>{say('Edit question', 'Modifier la question')}</button></div>}
      <div ref={end}/>
    </div>
    <div className="chat-bottom"><div className="suggested-prompts">{suggestions.map(prompt => <button key={prompt} disabled={loading || !context || (mode === 'backend' && !consent)} onClick={() => void send(prompt)}>{prompt}</button>)}</div>
      <form className="chat-input" onSubmit={event => { event.preventDefault(); void send(input) }}><label className="sr-only" htmlFor="question">{say('Your question', 'Votre question')}</label><textarea id="question" value={input} maxLength={2000} placeholder={say('Ask about your rental…', 'Posez une question sur votre location…')} rows={2} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input) } }}/>{loading ? <button type="button" className="button send-button" onClick={() => { pending.current?.abort(); setNotice(say('Stopping…', 'Arrêt…')) }} aria-label={say('Stop response', 'Arrêter la réponse')}><Square size={16}/></button> : <button className="button send-button" disabled={!input.trim() || !context || (mode === 'backend' && !consent)} aria-label={say('Send question', 'Envoyer')}><ArrowUp size={20}/></button>}</form>
      <p className="fine-print">{say('Private session memory; clears on reload. No legal certainty, automatic messages, or transactions.', 'Mémoire privée de session ; effacée au rechargement. Aucune garantie juridique, envoi automatique ou transaction.')}</p>
    </div>
    {draftReview !== null && <div className="assistant-review"><label className="field">{say('Review your private draft', 'Relisez votre brouillon privé')}<textarea rows={7} maxLength={4000} value={draftReview} onChange={event => setDraftReview(event.target.value)}/></label><p>{say('Nothing will be published or sent. After reviewing, you may copy it manually to your chosen communication channel.', 'Rien ne sera publié ni envoyé. Après relecture, vous pouvez le copier manuellement vers le canal de votre choix.')}</p><button className="button light small" onClick={() => setDraftReview(null)}>{say('Close review', 'Fermer la relecture')}</button></div>}
  </section>
}
