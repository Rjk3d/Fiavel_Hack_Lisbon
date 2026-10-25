import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, MessageSquare, ShieldCheck, Star } from 'lucide-react'
import { useDemo } from '../app/use-demo'
import { Badge, Card, PageHeading } from '../components/ui'
import { ratingLabels, reviewCategories } from '../lib/reputation'
import type { ReputationView, ReviewRecord } from '../lib/reputation'
import { reviewRequest as request, ReviewApiError } from '../lib/review-client'
export function ReviewsPage() {
  const { role } = useDemo()
  // A keyed workspace clears private drafts and loaded data when switching demo personas.
  return <ReviewWorkspace key={role} role={role}/>
}
function ReviewWorkspace({ role }: { role: 'tenant' | 'landlord' }) {
  const [view, setView] = useState<ReputationView | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ratingFilter, setRatingFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const lock = useRef(false)
  const formHeading = useRef<HTMLHeadingElement>(null)
  const [leaseId, setLeaseId] = useState('')
  const [step, setStep] = useState<'ratings' | 'writing' | 'preview' | 'done'>('ratings')
  const [ratings, setRatings] = useState<number[]>(reviewCategories[role].map(() => 0))
  const [text, setText] = useState('')
  const [help, setHelp] = useState<{ suggestion: string; sensitive: boolean; guidance: string } | null>(null)
  const [language, setLanguage] = useState('en')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    request(role, '', undefined, controller.signal).then(setView).catch(e => {
      if (!controller.signal.aborted && !(e instanceof ReviewApiError && e.status === 401)) setError(e.message)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [role])
  useEffect(() => { if (leaseId) formHeading.current?.focus() }, [leaseId, step])
  async function run(fn: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e) {
      if (e instanceof ReviewApiError && e.status === 401) setView(null)
      setError(e instanceof Error ? e.message : 'Review service unavailable. Start the configured backend.')
    } finally { lock.current = false; setBusy(false) }
  }
  const refresh = async (page = 1, rating = ratingFilter, sort = sortOrder) => {
    const data = await request(role, `?${new URLSearchParams({ page: String(page), rating, sort })}`)
    setView(data); setRatingFilter(rating); setSortOrder(sort)
  }
  async function afterSaved(message: string) {
    setNotice(message)
    try { await refresh(view?.page) } catch {
      setError('Your change was saved, but the latest reviews could not be loaded. Refresh to synchronize before submitting again.')
    }
  }
  const chosen = view?.leases.find(l => l.id === leaseId)
  return <div className="reputation"><PageHeading eyebrow="TRUST, BUILT TOGETHER" title="Good renting leaves a good story." description="Thoughtful feedback from shared rental experiences. A fair voice for both sides."/>
    <div className="reputation-intro"><ShieldCheck size={26}/><div><strong>Real relationships. Independent perspectives.</strong><p>Reviews stay private until both people submit or the configured review window closes. Opinions never move escrow funds.</p></div></div>
    {error && <p role="alert" className="callout">{error}</p>}{notice && <p role="status" className="callout">{notice}</p>}
    {loading ? <Card><p role="status">Loading your reputation?</p></Card> : !view ? <Card className="review-welcome"><Badge>Fictional demo · No verified rentals</Badge><h2>A little honesty. A lot more trust.</h2><p>Explore a completed fictional rental, write independent feedback, then switch the demo role to see double-blind publication in action. Your session is isolated from other visitors and is saved privately in this browser for 30 days, including across server restarts.</p><button disabled={busy} className="button" onClick={() => void run(async () => { await request(role, '/session', {}); await refresh() })}>{busy ? 'Connecting…' : 'Explore review demo'} <ArrowRight size={17}/></button><p className="fine-print">The development command starts the persistent demo backend. Live verification is not configured.</p></Card> : <>
      <div className="reputation-layout"><Card className="reputation-summary"><Badge>{view.mode === 'demo' ? 'Fictional profile' : 'Your rental profile'}</Badge><h2>{role === 'tenant' ? 'Ana Costa' : 'Manuel Ferreira'}</h2><p>{role === 'tenant' ? 'Tenant' : 'Landlord'} · Rental feedback</p><div className="reputation-score">{view.summary.average?.toFixed(1) ?? '—'}<Star size={28}/></div><p>{view.summary.count < 3 ? 'An average appears after 3 published reviews.' : 'Average overall experience from published feedback.'}</p><strong>{view.summary.verifiedRentals} verified reviewed rentals</strong><p>{view.summary.pending} of your reviews awaiting publication</p><p className="fine-print">{view.summary.count} published {view.mode === 'demo' ? 'demo ' : ''}review(s). No credit or screening score. This profile is visible only within your authorized rental relationships.</p><div className="rating-distribution" aria-label="Rating distribution">{[5,4,3,2,1].map(n => <div key={n}><span>{n} ★</span><progress max={Math.max(view.summary.count,1)} value={view.summary.distribution[n-1]}/><span>{view.summary.distribution[n-1]}</span></div>)}</div>{view.summary.count >= 3 && reviewCategories[role === 'tenant' ? 'landlord' : 'tenant'].map((label,i) => <p key={label}>{label}: {view.summary.categories[i]?.toFixed(1)}</p>)}</Card>
      <div><div className="section-heading"><h2>Your review invitations</h2><button className="text-link" disabled={busy} onClick={() => void run(() => refresh())}>Refresh</button></div><div className="review-invitations">{view.leases.map(l => <article key={l.id} className="review-invitation"><div><Badge>{l.state}</Badge><h3>{l.id === 'demo-completed-rental' ? 'A completed chapter · Demo' : 'Your current rental'}</h3><p>{l.reason}</p>{l.closesAt && <small>Window closes {new Date(l.closesAt).toLocaleString('en-GB')}</small>}{l.ownReview && <p className="fine-print">Your review: {l.ownReview.rating} / 5 · {l.ownReview.text || 'Ratings only'}<br/>{l.ownReview.response && <>Response: {l.ownReview.response}<br/></>}{!l.ownReview.publishedAt && 'Submitted. Hidden from the other party.'}</p>}</div>{l.state === 'Ready to review' && <button disabled={busy} className="button light" onClick={() => { setLeaseId(l.id); setStep('ratings'); setRatings(reviewCategories[role].map(() => 0)); setText(''); setHelp(null) }}>Write review <ArrowRight size={16}/></button>}</article>)}</div></div></div>
      {leaseId && <Card className="review-form"><div className="section-heading"><h2 ref={formHeading} tabIndex={-1}>{step === 'done' ? 'Your voice is part of the story.' : `Review your ${role === 'tenant' ? 'landlord' : 'tenant'}`}</h2><button disabled={busy} className="text-link" onClick={() => setLeaseId('')}>Close</button></div>{step === 'done' ? <div role="status" className="empty-state"><Check/><h3>Review submitted</h3><p>Feedback becomes visible when both submit or the configured window closes. Content held for moderation stays hidden.</p></div> : <><ol className="review-steps" aria-label="Review steps">{['ratings','writing','preview'].map((s,i) => <li key={s} aria-current={step === s ? 'step' : undefined}>{i+1}. {['Your experience','Your words','Review & submit'][i]}</li>)}</ol>
        {step === 'ratings' && <><p>Rate only your firsthand experience. Every category is required.</p>{reviewCategories[role].map((label,i) => <fieldset className="star-field" key={label}><legend>{label}</legend><div className="stars">{ratingLabels.map((meaning,n) => <label key={meaning} title={`${n+1} — ${meaning}`}><input type="radio" name={`rating-${i}`} value={n+1} checked={ratings[i] === n+1} onChange={() => setRatings(current => current.map((r,index) => index === i ? n+1 : r))}/><Star aria-hidden="true" className={ratings[i] >= n+1 ? 'filled' : ''} size={29}/><span className="sr-only">{n+1} — {meaning}</span></label>)}<span>{ratings[i] ? ratingLabels[ratings[i]-1] : 'Choose a rating'}</span></div></fieldset>)}<button className="button" disabled={ratings.some(r => !r)} onClick={() => setStep('writing')}>Continue <ArrowRight size={16}/></button></>}
        {step === 'writing' && <><label className="field">Your experience, in your own words <span className="muted">Optional · {text.length}/2,000</span><textarea maxLength={2000} rows={6} value={text} onChange={e => { setText(e.target.value); setHelp(null) }} placeholder="What worked well? What could have been better? Stick to what you personally experienced."/></label><p className="fine-print">Leave out names, contact details, exact addresses, private messages and dispute evidence. Possible private information is held for human moderation.</p><div className="review-writing-help"><MessageSquare size={21}/><div><strong>Make room for clarity</strong><p>Demo writing assistance · Local formatting and guidance. No live AI model or translation.</p><label className="field">Guidance language<select value={language} onChange={e => { setLanguage(e.target.value); setHelp(null) }}><option value="en">English</option><option value="fr">Français</option><option value="pt">Português</option></select></label><button className="button light" disabled={busy || !text.trim()} onClick={() => void run(async () => setHelp(await request(role, '/assist', { text, language })))}>Suggest clarity improvements</button>{help && <div className="callout"><p>{help.guidance}</p>{help.sensitive && <strong>Potential private information detected. Please remove it.</strong>}<p className="preserve-lines">{help.suggestion}</p><button className="text-link" onClick={() => { setText(help.suggestion); setHelp(null) }}>Accept formatting suggestion</button></div>}</div></div><div className="action-row"><button className="button light" onClick={() => setStep('ratings')}>Back</button><button className="button" onClick={() => setStep('preview')}>Preview review</button></div></>}
        {step === 'preview' && <><Badge>{chosen?.verified ? 'Verified rental' : 'Demo rental · Unverified'}</Badge><h3>Overall experience · {ratings.at(-1)} / 5</h3>{reviewCategories[role].map((c,i) => <p key={c}>{c} <strong>{ratings[i]} / 5</strong></p>)}<p className="preserve-lines">{text || 'No written feedback.'}</p><p className="callout">Submission is final. Reviews cannot be edited to react to the other party. Both publish together, or after the window closes on {chosen?.closesAt ? new Date(chosen.closesAt).toLocaleString('en-GB') : 'an unavailable date'}. Moderation may delay visibility.</p><div className="action-row"><button disabled={busy} className="button light" onClick={() => setStep('writing')}>Edit draft</button><button className="button" disabled={busy} onClick={() => void run(async () => { await request(role, '', { leaseId, ratings, text }); setStep('done'); await afterSaved('Review saved. Publication follows the policy below.') })}>{busy ? 'Submitting…' : 'Submit demo review'}</button></div></>}
      </>}</Card>}
      <div className="review-filters">
        <label className="field">Rating<select aria-label="Rating" disabled={busy} value={ratingFilter} onChange={e => void run(() => refresh(1,e.target.value,sortOrder))}><option value="all">All ratings</option>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} stars</option>)}</select></label>
        <label className="field">Sort<select aria-label="Sort" disabled={busy} value={sortOrder} onChange={e => void run(() => refresh(1,ratingFilter,e.target.value))}>{[['newest','Newest first'],['oldest','Oldest first'],['highest','Highest rating'],['lowest','Lowest rating']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="section-heading dashboard-lower"><h2>Feedback you’ve received</h2><span className="muted">Published opinions · {view.summary.count}</span></div>{!view.reviews.length ? <Card><div className="empty-state"><MessageSquare/><h3>{view.summary.count ? 'No reviews match this filter.' : 'No reviews yet.'}</h3><p>{view.summary.count ? 'Try another rating or choose All ratings.' : 'No published feedback yet. Hidden reviews are never loaded into this view.'}</p></div></Card> : view.reviews.map(r => <ReviewDetail key={r.id} review={r} busy={busy} action={(path,body) => void run(async () => { await request(role,path,body); await afterSaved(path.endsWith('/report') ? 'Report saved and queued for human review. Feedback is not automatically removed.' : 'Your response was published.') })}/>)}
      {view.total > 10 && <div className="action-row"><button className="button light" disabled={busy || view.page === 1} onClick={() => void run(() => refresh(view.page-1))}>Previous</button><span>Page {view.page}</span><button className="button light" disabled={busy || view.page*10 >= view.total} onClick={() => void run(() => refresh(view.page+1))}>Next</button></div>}
      <p className="fine-print">Written feedback stays off-chain. Rental verification confirms the relationship, not the truth of an opinion. <Link to="/app/assistant?q=When%20can%20I%20review%20my%20landlord%3F">Ask your rental assistant</Link></p>
    </>}
  </div>
}
function ReviewDetail({ review: r, busy, action }: { review: ReviewRecord; busy: boolean; action: (path: string, body: object) => void }) {
  const [response, setResponse] = useState('')
  const [reason, setReason] = useState('Private information')
  return <Card className="published-review"><div className="section-heading"><strong>Overall experience · {r.rating} / 5</strong><Badge>{r.eligibility === 'verified' ? 'Verified rental' : 'Fictional demo · Unverified'}</Badge></div><p className="fine-print">Published {new Date(r.publishedAt!).toLocaleDateString('en-GB')} · {r.direction === 'tenant' ? 'Tenant' : 'Landlord'} feedback · Moderation: clear</p><p className="preserve-lines">{r.text || 'This reviewer left ratings only.'}</p><details><summary>Category ratings</summary>{reviewCategories[r.direction].map((c,i) => <p key={c}>{c}: {r.ratings[i]} / 5</p>)}</details>{r.response ? <blockquote><strong>Your response</strong><p>{r.response}</p></blockquote> : <details><summary>Respond thoughtfully</summary><form onSubmit={e => { e.preventDefault(); action(`/${r.id}/response`, { text: response }) }}><label className="field">Public response · One response, up to 1,000 characters<textarea required maxLength={1000} value={response} onChange={e => setResponse(e.target.value)}/></label><button className="button light" disabled={busy}>Publish response</button></form></details>}{r.reported ? <p className="fine-print">Report submitted · Awaiting human review</p> : <details><summary>Report this review</summary><form onSubmit={e => { e.preventDefault(); action(`/${r.id}/report`, { reason }) }}><label className="field">Reason<select value={reason} onChange={e => setReason(e.target.value)}>{['Private information','Harassment','Not firsthand','Manipulation'].map(s => <option key={s}>{s}</option>)}</select></label><p className="fine-print">Reports are reviewed by a human. Disagreement or a low rating alone is not a reason for removal.</p><button className="button light" disabled={busy}>Send report</button></form></details>}</Card>
}
