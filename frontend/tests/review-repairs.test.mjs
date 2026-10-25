import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createReviewService } from '../server/reviews.mjs'
import { createApplication } from '../server/application.mjs'
import { reviewRequest, ReviewApiError } from '../src/lib/review-client.ts'

const user = {id:'ana',role:'tenant'}
const other = {id:'manuel',role:'landlord'}
const time = Date.parse('2026-10-25T12:00:00Z')
const completed = {id:'complete',tenantId:'ana',landlordId:'manuel',source:'backend',status:'completed',completionVerified:true,completedAt:'2026-10-20T00:00:00Z',reviewOpensAt:'2026-10-20T00:00:00Z',reviewClosesAt:'2026-11-03T00:00:00Z',provider:'backend'}
const input = (role,rating=4,leaseId='complete')=>({leaseId,ratings:Array(role==='tenant'?5:4).fill(rating),text:'Firsthand rental feedback.'})

test('filters and all sort orders use published reviews; aggregates retain the full population', t=>{
  let now=time
  const leases=[0,1,2,3].map(n=>({...completed,id:`complete-${n}`}))
  const s=createReviewService({leases,now:()=>now}); t.after(()=>s.close())
  const scores=[2,5,3,4]
  leases.forEach((l,i)=>{s.submit(user,'w',input('tenant',scores[i],l.id));s.submit(other,'w',input('landlord',5,l.id));now+=1000})
  assert.deepEqual(s.view(other,'w',{sort:'oldest'}).reviews.map(r=>r.rating),scores)
  assert.deepEqual(s.view(other,'w',{sort:'newest'}).reviews.map(r=>r.rating),[4,3,5,2])
  assert.deepEqual(s.view(other,'w',{sort:'highest'}).reviews.map(r=>r.rating),[5,4,3,2])
  assert.deepEqual(s.view(other,'w',{sort:'lowest'}).reviews.map(r=>r.rating),[2,3,4,5])
  const filtered=s.view(other,'w',{rating:'5',page:99})
  assert.equal(filtered.total,1);assert.equal(filtered.page,1);assert.equal(filtered.summary.count,4)
  assert.equal(filtered.summary.average,3.5);assert.deepEqual(filtered.summary.distribution,[0,1,1,1,1])
  for(const options of [{rating:'6'},{sort:'random'}])assert.throws(()=>s.view(other,'w',options),e=>e.status===400)
})
test('pending counts include only the author’s unpublished reviews, never the other party’s',t=>{
  const s=createReviewService({leases:[completed],now:()=>time});t.after(()=>s.close())
  s.submit(user,'w',input('tenant'))
  assert.equal(s.view(user,'w').summary.pending,1)
  assert.equal(s.view(other,'w').summary.pending,0)
  s.submit(other,'w',input('landlord'))
  assert.equal(s.view(user,'w').summary.pending,0)
})
test('reported status persists in responses without hiding the review or changing statistics',t=>{
  const s=createReviewService({leases:[completed],now:()=>time});t.after(()=>s.close())
  const {id}=s.submit(user,'w',input('tenant'));s.submit(other,'w',input('landlord'))
  s.report(other,'w',id,'Not firsthand')
  assert.equal(s.view(other,'w').reviews[0].reported,true)
  assert.equal(s.view(other,'w').summary.count,1)
})
test('demo and live database modes cannot be mixed or mislabeled',()=>{
  const dir=mkdtempSync(join(tmpdir(),'fiavel-mode-'));const path=join(dir,'reviews.sqlite')
  try{
    const s=createReviewService({leases:[{...completed,source:'demo'}],demo:true,path,now:()=>time});s.close()
    assert.throws(()=>createReviewService({leases:[completed],path}),/separate/)
    assert.throws(()=>createReviewService({leases:[completed],demo:true}),/match the service mode/)
  }finally{rmSync(dir,{recursive:true,force:true})}
})

test('actual runtime preserves cookie, private submissions, original window, publication and reports across restarts',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fiavel-runtime-'))
  const env={REVIEWS_DEMO:'true',REVIEWS_DB_PATH:join(dir,'reviews.sqlite')}
  const origin='http://localhost:5173'
  let server
  let base
  async function start(){server=createApplication({env,origin});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}/api/reviews`}
  async function stop(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  async function send(role,body,path='',cookie=''){
    return fetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,'X-Fiavel-Reviews':'1','X-Fiavel-Demo-Role':role,'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})})
  }
  try{
    await start()
    const session=await send('tenant',{},'/session');const cookie=session.headers.get('set-cookie').split(';')[0]
    const before=await (await send('tenant',undefined,'',cookie)).json()
    const deadline=before.leases.find(l=>l.id==='demo-completed-rental').closesAt
    const saved=await send('tenant',input('tenant',4,'demo-completed-rental'),'',cookie);assert.equal(saved.status,201)
    const {id}=await saved.json()
    await stop();await start()
    const resumed=await send('tenant',undefined,'',cookie);assert.equal(resumed.status,200)
    const v=await resumed.json()
    const invitation=v.leases.find(l=>l.id==='demo-completed-rental')
    assert.equal(invitation.closesAt,deadline);assert.equal(invitation.state,'Awaiting other party')
    assert.equal(invitation.ownReview.reviewerRole,'tenant');assert.equal(invitation.ownReview.revieweeRole,'landlord')
    const hidden=await (await send('landlord',undefined,'',cookie)).json()
    assert.equal(hidden.reviews.length,0);assert.ok(!JSON.stringify(hidden).includes('Firsthand rental feedback'))
    assert.equal((await send('landlord',input('landlord',5,'demo-completed-rental'),'',cookie)).status,201)
    assert.equal((await send('landlord',{text:'Thank you for your feedback.'},`/${id}/response`,cookie)).status,200)
    assert.equal((await send('landlord',{reason:'Not firsthand'},`/${id}/report`,cookie)).status,200)
    await stop();await start()
    const published=await (await send('landlord',undefined,'',cookie)).json()
    assert.equal(published.reviews[0].revieweeId,'manuel');assert.equal(published.reviews[0].reported,true)
    assert.equal(published.reviews[0].response,'Thank you for your feedback.')
    assert.equal(published.summary.count,1);assert.equal(published.summary.verifiedRentals,0)
  }finally{if(server?.listening)await stop();rmSync(dir,{recursive:true,force:true})}
})

test('client gives actionable errors for network failure, malformed proxy output and API rejection',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original})
  globalThis.fetch=async()=>{throw new TypeError('fetch failed')}
  await assert.rejects(()=>reviewRequest('tenant'),e=>e instanceof ReviewApiError && /Cannot reach/.test(e.message))
  globalThis.fetch=async()=>new Response('<html>proxy</html>',{status:502})
  await assert.rejects(()=>reviewRequest('tenant'),/invalid response/)
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'Duplicate submission.'}),{status:409})
  await assert.rejects(()=>reviewRequest('tenant'),e=>e.status===409 && e.message==='Duplicate submission.')
  globalThis.fetch=async()=>new Response('{}',{status:201})
  await assert.rejects(()=>reviewRequest('tenant','',input('tenant')),/invalid response/)
  globalThis.fetch=async()=>new Response('{}',{status:200})
  await assert.rejects(()=>reviewRequest('tenant'),/invalid response/)
})
