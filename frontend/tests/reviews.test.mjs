import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReviewService } from '../server/reviews.mjs'
import { createReviewHandler } from '../server/review-handler.mjs'
import { loadEscrowRentalEvidence } from '../server/escrow-review-adapter.mjs'
import { reviewEligibility, reviewWritingHelp, sensitiveReviewText } from '../src/lib/reputation.ts'
import { classify } from '../src/lib/ai/policy.ts'
import { composeReply } from '../src/lib/ai/reply.ts'
import { context, request } from './fixtures.mjs'

const tenant = { id: 'ana', role: 'tenant' }
const landlord = { id: 'manuel', role: 'landlord' }
const moderator = { id: 'mod', role: 'moderator' }
const start = Date.parse('2026-10-25T12:00:00Z')
const lease = { id: 'finished', tenantId: 'ana', landlordId: 'manuel', source: 'backend', status: 'completed', completionVerified: true, completedAt: '2026-10-20T00:00:00Z', provider: 'backend', reviewOpensAt: '2026-10-20T00:00:00Z', reviewClosesAt: '2026-11-03T00:00:00Z' }
const input = (user, text = 'Communication was clear.') => ({ leaseId: 'finished', ratings: user.role === 'tenant' ? [4,4,4,4,4] : [5,5,5,5], text })
function fixture(t, overrides = {}) { const service = createReviewService({ leases: [lease], now: () => start, ...overrides }); t.after(() => service.close()); return service }
const status = n => error => error.status === n

test('tenant and landlord submit independently; no hidden text or scores before mutual publication', t => {
  const s = fixture(t)
  s.submit(tenant,'w',input(tenant,'Private until both submit'))
  const before = s.view(landlord,'w')
  assert.equal(before.reviews.length,0); assert.equal(before.summary.count,0)
  assert.ok(!JSON.stringify(before).includes('Private until both submit'))
  assert.ok(!JSON.stringify(s.assistantContext(landlord,'w')).includes('Private until both submit'))
  assert.equal(s.view(tenant,'w').leases[0].state,'Awaiting other party')
  s.submit(landlord,'w',input(landlord))
  assert.equal(s.view(landlord,'w').reviews[0].text,'Private until both submit')
  assert.equal(s.view(tenant,'w').reviews[0].direction,'landlord')
  assert.equal(s.view(tenant,'w').leases[0].state,'Published')
})
test('server rejects unauthenticated, unrelated, mismatched role and self review attempts', t => {
  const s = fixture(t)
  assert.throws(() => s.submit(null,'w',input(tenant)),status(401))
  for (const u of [{id:'stranger',role:'tenant'},{id:'ana',role:'landlord'}]) assert.throws(() => s.submit(u,'w',input(tenant)),status(403))
  assert.throws(() => s.submit(tenant,'w',{ ...input(tenant),leaseId:'other' }),status(403))
  const self = fixture(t,{leases:[{...lease,landlordId:'ana'}]})
  assert.throws(() => self.submit(tenant,'w',input(tenant)),status(403))
})
test('duplicates and parallel submissions cannot replace original feedback', async t => {
  const s = fixture(t)
  const attempts = await Promise.allSettled([1,2,3].map(() => Promise.resolve().then(() => s.submit(tenant,'w',input(tenant)))))
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length,1)
  assert.equal(attempts.filter(r => r.status === 'rejected' && r.reason.status === 409).length,2)
})
test('eligibility rejects active, future completion, unverified completion, missing or invented windows', () => {
  for (const change of [{status:'active'},{completedAt:'2027-01-01'},{completedAt:'invalid'},{completionVerified:false},{reviewClosesAt:undefined},{reviewOpensAt:undefined},{reviewOpensAt:'2026-10-19'},{reviewClosesAt:'2026-10-19'},{reviewOpensAt:'2026-10-28'}]) assert.equal(reviewEligibility({...lease,...change},tenant,start).allowed,false)
  assert.equal(reviewEligibility(lease,tenant,start).verified,true)
})
test('LeaseVault and Trustless Work require confirmed settled escrow plus trusted tenancy completion', () => {
  for (const provider of ['leasevault','trustless_work']) {
    const backed = {...lease,provider,escrowConfirmed:true,escrowState:'settled',reference:'trusted-reference'}
    assert.equal(reviewEligibility(backed,tenant,start).allowed,true)
    for (const change of [{escrowConfirmed:false},{escrowState:'funded'},{reference:undefined},{completionVerified:false},{status:'active'}]) assert.equal(reviewEligibility({...backed,...change},tenant,start).allowed,false)
  }
})
test('existing escrow registry adapter binds provider identity and refuses provider-API claims', async () => {
  for (const provider of ['leasevault','trustless_work']) {
    const binding = {leaseId:lease.id,provider,contractId:'contract',network:'testnet'}
    let state = {binding,status:'settled',provenance:'rpc'}
    let reads = 0
    const registry = {get:()=>binding,providerFor:b=>{assert.equal(b,binding);return {getEscrow:async()=>{reads++;return state}}}}
    const record = {...lease,provider}
    const verified = await loadEscrowRentalEvidence(record,registry)
    assert.equal(reviewEligibility(verified,tenant,start).verified,true)
    assert.equal(reads,1)
    for (const change of [{provenance:'provider-api'},{status:'funded'},{binding:{...binding,contractId:'other'}}]) {
      state = {binding,status:'settled',provenance:'rpc',...change}
      assert.equal(reviewEligibility(await loadEscrowRentalEvidence(record,registry),tenant,start).allowed,false)
    }
    assert.equal((await loadEscrowRentalEvidence(record,{get:()=>null})).escrowConfirmed,false)
  }
})
test('a configured deadline publishes the single review; no late submissions', t => {
  let now = start
  const s = fixture(t,{now:()=>now})
  s.submit(tenant,'w',input(tenant))
  now = Date.parse(lease.reviewClosesAt)
  assert.equal(s.view(landlord,'w').reviews.length,1)
  assert.equal(s.view(landlord,'w').leases[0].state,'Review window expired')
  assert.throws(() => s.submit(landlord,'w',input(landlord)),status(403))
})
test('responses require published feedback, the reviewee, safe text and a single response', t => {
  const s = fixture(t)
  const {id} = s.submit(tenant,'w',input(tenant))
  assert.throws(() => s.respond(landlord,'w',id,'Thank you'),status(403))
  s.submit(landlord,'w',input(landlord))
  assert.throws(() => s.respond(tenant,'w',id,'Thank you'),status(403))
  assert.throws(() => s.respond(landlord,'w',id,'Email me at contact@example.com'),status(400))
  s.respond(landlord,'w',id,'Thank you for sharing your experience.')
  assert.match(s.view(landlord,'w').reviews[0].response,/Thank you/)
  assert.throws(() => s.respond(landlord,'w',id,'Again'),status(409))
})
test('reporting queues audit evidence without automatically suppressing a negative review', t => {
  const s = fixture(t)
  const {id} = s.submit(tenant,'w',{...input(tenant),ratings:[1,1,1,1,1]})
  s.submit(landlord,'w',input(landlord))
  s.report(landlord,'w',id,'Harassment')
  assert.equal(s.view(landlord,'w').reviews[0].rating,1)
  assert.equal(s.moderationQueue(moderator,'w').reports.length,1)
  assert.throws(() => s.report(landlord,'w',id,'Harassment'),status(409))
  assert.throws(() => s.report({id:'outsider',role:'tenant'},'w',id,'Harassment'),status(403))
  assert.throws(() => s.report(landlord,'w',id,'Negative rating'),status(400))
})
test('moderation is restricted and audited; held private text never reaches reviewee', t => {
  const s = fixture(t)
  const {id} = s.submit(tenant,'w',input(tenant,'Contact contact@example.com'))
  s.submit(landlord,'w',input(landlord))
  assert.equal(s.view(tenant,'w').leases[0].state,'Under moderation')
  assert.ok(!JSON.stringify(s.view(landlord,'w')).includes('contact@example.com'))
  assert.throws(() => s.moderate(landlord,'w',id,'clear','approved'),status(403))
  assert.throws(() => s.moderationQueue(tenant,'w'),status(403))
  s.moderate(moderator,'w',id,'removed','Private contact information')
  assert.equal(s.view(landlord,'w').reviews.length,0)
  assert.ok(s.moderationQueue(moderator,'w').events.some(e => e.action === 'moderation:removed'))
})
test('private information detector covers emails, phones, addresses, links and Stellar secrets', () => {
  for (const text of ['a@example.com','+351 912 345 678','Rua de Arroios 42','https://example.com','S'+'A'.repeat(55)]) assert.equal(sensitiveReviewText(text),true,text)
  assert.equal(sensitiveReviewText('The repair took three days.'),false)
})
test('local assistance labels demo, preserves claims and does not invent events in any guidance language', () => {
  for (const lang of ['en','fr','pt']) {
    const result = reviewWritingHelp('  Repairs  took three days.  ',lang)
    assert.equal(result.mode,'demo'); assert.equal(result.suggestion,'Repairs took three days.')
    assert.ok(result.guidance.length > 40)
    assert.ok(!('ratings' in result))
  }
})
test('demo reviews never acquire verified status and require an explicit demo adapter', t => {
  const fictional = {...lease,source:'demo'}
  assert.equal(reviewEligibility(fictional,tenant,start).allowed,false)
  const s = fixture(t,{demo:true,leases:[fictional]})
  s.submit(tenant,'w',input(tenant)); s.submit(landlord,'w',input(landlord))
  const v = s.view(landlord,'w')
  assert.equal(v.mode,'demo'); assert.equal(v.reviews[0].eligibility,'demo'); assert.equal(v.summary.verifiedRentals,0)
})
test('ratings and text are validated; client supplied verification and reviewee fields are ignored', t => {
  const s = fixture(t)
  for (const ratings of [[6,4,4,4,4],[0,4,4,4,4],[4.5,4,4,4,4],[4]]) assert.throws(() => s.submit(tenant,'w',{...input(tenant),ratings}),status(400))
  assert.throws(() => s.submit(tenant,'w',{...input(tenant),text:'x'.repeat(2001)}),status(400))
  s.submit(tenant,'w',{...input(tenant),revieweeId:'victim',eligibility:'demo',publishedAt:'yesterday'})
  const own = s.view(tenant,'w').leases[0].ownReview
  assert.equal(own.revieweeId,'manuel'); assert.equal(own.eligibility,'verified'); assert.equal(own.publishedAt,null)
})
test('summary and pagination use the same published visible population; averages require 3 reviews', t => {
  const leases = Array.from({length:12},(_,i)=>({...lease,id:`lease-${i}`}))
  const s = fixture(t,{leases})
  for (const [i,l] of leases.entries()) {
    s.submit(tenant,'w',{...input(tenant),leaseId:l.id})
    s.submit(landlord,'w',{...input(landlord),leaseId:l.id})
    const v = s.view(landlord,'w')
    assert.equal(v.summary.average,i < 2 ? null : 4)
  }
  const v = s.view(landlord,'w')
  assert.equal(v.summary.count,12); assert.equal(v.reviews.length,10); assert.equal(v.summary.distribution.reduce((a,b)=>a+b),12)
  assert.equal(v.summary.verifiedRentals,12); assert.deepEqual(v.summary.categories,[4,4,4,4,4])
  const p2 = s.view(landlord,'w',{page:2})
  assert.equal(p2.reviews.length,2); assert.ok(!p2.reviews.some(r=>v.reviews.some(p=>p.id===r.id)))
  assert.throws(() => s.view(landlord,'w',{page:-1}),status(400))
})
test('SQLite persists uniqueness and review contents across service restarts', () => {
  const dir = mkdtempSync(join(tmpdir(),'fiavel-reviews-'))
  const path = join(dir,'reviews.sqlite')
  let s
  try {
    s = createReviewService({path,leases:[lease],now:()=>start}); s.submit(tenant,'w',input(tenant)); s.close()
    s = createReviewService({path,leases:[lease],now:()=>start})
    assert.throws(() => s.submit(tenant,'w',input(tenant)),status(409))
    assert.equal(s.view(tenant,'w').leases[0].ownReview.text,input(tenant).text)
  } finally { s?.close(); rmSync(dir,{recursive:true,force:true}) }
})
test('rental assistants distinguish unavailable data, fictional opinions and verified relationships', () => {
  assert.equal(classify('When can I review my landlord?'),'reputation')
  const c = context()
  const unavailable = composeReply(request('What do previous tenants say?',{context:c}))
  assert.match(unavailable.text,/unavailable/)
  c.reputation = { provenance:'demo',opinions:[{rating:4,text:'Repairs took three days.',verifiedRental:false}],eligibility:[{id:'finished',state:'Ready to review',reason:'Fictional completed rental.'}],summary:{count:1,verifiedRentals:0,average:null} }
  const reply = composeReply(request('Summarize my published feedback',{context:c}))
  assert.match(reply.text,/Fictional demo/); assert.match(reply.text,/subjective opinions/); assert.match(reply.text,/Repairs took three days/)
})

async function http(t,options = {}) {
  const s = fixture(t,{demo:true,leases:[{...lease,source:'demo'}]})
  const server = createServer(createReviewHandler({service:s,demo:true,...options}))
  server.listen(0,'127.0.0.1'); await once(server,'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)) })
  const base = `http://127.0.0.1:${server.address().port}/api/reviews`
  const send = (path='',body,headers={}) => fetch(base+path,{method:body ? 'POST':'GET',headers:{Origin:'http://localhost:5173','X-Fiavel-Reviews':'1','X-Fiavel-Demo-Role':'tenant','Content-Type':'application/json',...headers},...(body ? {body:JSON.stringify(body)}:{})})
  return {send}
}
test('HTTP sessions enforce auth, CSRF, workspace isolation and hidden-review access', async t => {
  const {send} = await http(t)
  assert.equal((await send()).status,401)
  assert.equal((await send('/session',{}, {Origin:'https://evil.example'})).status,403)
  const session = await send('/session',{}); const cookie = session.headers.get('set-cookie').split(';')[0]
  assert.match(session.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/)
  const headers = {Cookie:cookie}
  const submitted = await send('',input(tenant),headers); assert.equal(submitted.status,201)
  const {id} = await submitted.json()
  const hidden = await send('',undefined,{...headers,'X-Fiavel-Demo-Role':'landlord'})
  assert.equal(hidden.headers.get('cache-control'),'no-store'); assert.ok(!(await hidden.text()).includes(input(tenant).text))
  assert.equal((await send(`/${id}`,undefined,headers)).status,404)
  assert.equal((await send('/moderation',undefined,headers)).status,403)
  assert.equal((await send(`/${id}/moderate`,{state:'clear',reason:'approved'},headers)).status,403)
  assert.equal((await send('',input(tenant),headers)).status,409)
  const second = await send('/session',{}); const otherCookie = second.headers.get('set-cookie').split(';')[0]
  const other = await send('',undefined,{Cookie:otherCookie})
  assert.ok(!(await other.text()).includes(input(tenant).text))
})
test('HTTP live handler fails closed and ignores browser-supplied identities with a trusted adapter', async t => {
  const disabled = await http(t,{demo:false})
  assert.equal((await disabled.send()).status,503)
  const configured = await http(t,{demo:false,authenticate:async()=>tenant})
  const res = await configured.send('',{...input(tenant),reviewerId:'manuel',direction:'landlord'})
  assert.equal(res.status,201)
  const v = await (await configured.send()).json()
  assert.equal(v.leases[0].ownReview.reviewerId,'ana')
})
test('HTTP supports browser same-origin GET metadata and rejects cross-origin reads', async t => {
  const {send} = await http(t)
  const session = await send('/session',{}); const cookie = session.headers.get('set-cookie').split(';')[0]
  const headers = {Cookie:cookie,'sec-fetch-site':'same-origin'}
  assert.equal((await send('',undefined,headers)).status,200)
  assert.equal((await send('',undefined,{...headers,Origin:'https://evil.example'})).status,403)
  assert.equal((await send('?page=bad',undefined,headers)).status,400)
  assert.equal((await send('/assist',{text:'Firsthand feedback.',language:'pt'},headers)).status,200)
})
