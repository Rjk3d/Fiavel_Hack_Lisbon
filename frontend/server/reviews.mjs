import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { reviewCategories, reviewEligibility, sensitiveReviewText, reviewWritingHelp } from '../src/lib/reputation.ts'

const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
export function createReviewService({ leases, demo = false, path = ':memory:', now = Date.now } = {}) {
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, lease_id TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('tenant','landlord')), data TEXT NOT NULL, UNIQUE(workspace,lease_id,direction));
    CREATE INDEX IF NOT EXISTS review_workspace ON reviews(workspace,lease_id);
    CREATE TABLE IF NOT EXISTS review_reports (workspace TEXT NOT NULL, review_id TEXT NOT NULL REFERENCES reviews(id), reporter TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace,review_id,reporter));
    CREATE TABLE IF NOT EXISTS review_events (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, review_id TEXT NOT NULL REFERENCES reviews(id), actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS review_demo_sessions (token_hash TEXT PRIMARY KEY, workspace TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS review_settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);`)
  // A database can never be reopened in the other mode accidentally.
  const storedMode = db.prepare('SELECT data FROM review_settings WHERE key=?').get('mode')
  const mode = demo ? 'demo' : 'live'
  if (storedMode && JSON.parse(storedMode.data) !== mode) { db.close(); throw new Error('Demo and live review databases must be separate.') }
  if (!storedMode) db.prepare('INSERT INTO review_settings VALUES(?,?)').run('mode', JSON.stringify(mode))
  // Demo fixtures and their explicit windows must survive server restart as well.
  if (demo) {
    const stored = db.prepare('SELECT data FROM review_settings WHERE key=?').get('demo-leases')
    if (stored) leases = JSON.parse(stored.data)
    else db.prepare('INSERT INTO review_settings VALUES(?,?)').run('demo-leases', JSON.stringify(leases))
  }
  if (!Array.isArray(leases) || leases.some(l => l.source !== (demo ? 'demo' : 'backend'))) { db.close(); throw new Error('Review lease evidence must match the service mode.') }
  const records = workspace => db.prepare('SELECT data FROM reviews WHERE workspace=?').all(workspace).map(row => JSON.parse(row.data))
  const save = (workspace, review) => db.prepare('UPDATE reviews SET data=? WHERE id=? AND workspace=?').run(JSON.stringify(review), review.id, workspace)
  const stamp = () => new Date(now()).toISOString()
  const event = (workspace, review, actor, action, reason = '') => db.prepare('INSERT INTO review_events VALUES(?,?,?,?,?,?,?)').run(randomUUID(), workspace, review.id, actor, action, reason, stamp())
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  function authorized(user, workspace) {
    if (!user?.id || !['tenant', 'landlord', 'moderator'].includes(user.role)) fail(401, 'Sign in required.')
    if (!workspace) fail(403, 'Session required.')
  }
  const participant = (lease, user) => user.role === 'tenant' ? lease.tenantId === user.id : user.role === 'landlord' && lease.landlordId === user.id
  function publish(workspace) {
    const all = records(workspace)
    for (const lease of leases) {
      const pair = all.filter(r => r.leaseId === lease.id)
      const deadline = Date.parse(lease.reviewClosesAt ?? '')
      // Publication can only follow persisted submissions; moderation does not reveal a held text.
      if (pair.length === 2 || (Number.isFinite(deadline) && now() >= deadline)) for (const r of pair) {
        if (!r.publishedAt) { r.publishedAt = stamp(); save(workspace, r); event(workspace, r, 'system', 'published') }
      }
    }
  }
  function view(user, workspace, { page = 1, rating = 'all', sort = 'newest' } = {}) {
    authorized(user, workspace)
    if (!Number.isInteger(page) || page < 1 || page > 10000) fail(400, 'Invalid page.')
    if (!['all','1','2','3','4','5'].includes(rating) || !['newest','oldest','highest','lowest'].includes(sort)) fail(400, 'Invalid review filter or sort order.')
    return transaction(() => {
      publish(workspace)
      const permitted = leases.filter(l => participant(l, user))
      const ids = new Set(permitted.map(l => l.id))
      const all = records(workspace).filter(r => ids.has(r.leaseId))
      const visible = all.filter(r => r.publishedAt && r.moderation === 'clear')
      const received = visible.filter(r => r.revieweeId === user.id)
      const own = all.filter(r => r.reviewerId === user.id)
      const summary = {
        count: received.length, verifiedRentals: new Set(received.filter(r => r.eligibility === 'verified').map(r => r.leaseId)).size,
        average: received.length >= 3 ? received.reduce((sum,r) => sum + r.rating, 0) / received.length : null,
        distribution: [1,2,3,4,5].map(n => received.filter(r => Math.round(r.rating) === n).length),
        categories: reviewCategories[user.role === 'tenant' ? 'landlord' : 'tenant'].map((_,i) => received.length >= 3 ? received.reduce((sum,r) => sum + r.ratings[i],0) / received.length : null),
        pending: own.filter(r => !r.publishedAt && r.moderation !== 'removed').length,
      }
      const filtered = received.filter(r => rating === 'all' || r.rating === Number(rating)).sort((a,b) => {
        const primary = sort === 'highest' ? b.rating - a.rating : sort === 'lowest' ? a.rating - b.rating : sort === 'oldest' ? a.publishedAt.localeCompare(b.publishedAt) : b.publishedAt.localeCompare(a.publishedAt)
        return primary || a.id.localeCompare(b.id)
      })
      const pages = Math.max(1, Math.ceil(filtered.length / 10))
      const currentPage = Math.min(page, pages)
      return { mode: demo ? 'demo' : 'live', leases: permitted.map(l => {
        const eligibility = reviewEligibility(l, user, now(), demo)
        const review = own.find(r => r.leaseId === l.id)
        return { id: l.id, revieweeId: user.role === 'tenant' ? l.landlordId : l.tenantId, revieweeRole: user.role === 'tenant' ? 'landlord' : 'tenant', verified: eligibility.verified, reason: eligibility.reason, closesAt: l.reviewClosesAt,
          state: review ? review.moderation !== 'clear' ? 'Under moderation' : review.publishedAt ? 'Published' : 'Awaiting other party' : eligibility.allowed ? 'Ready to review' : eligibility.reason === 'Review window expired.' ? 'Review window expired' : 'Not eligible',
          ...(review ? { ownReview: review } : {}) }
      }), reviews: filtered.slice((currentPage-1)*10,currentPage*10).map(r => ({ ...r, reported: !!db.prepare('SELECT 1 FROM review_reports WHERE workspace=? AND review_id=? AND reporter=?').get(workspace,r.id,user.id) })), total: filtered.length, page: currentPage, summary }
    })
  }
  return {
    view,
    getDemoSession(hash, timestamp) {
      if (!demo) return null
      return db.prepare('SELECT workspace FROM review_demo_sessions WHERE token_hash=? AND expires_at>?').get(hash,timestamp)?.workspace ?? null
    },
    createDemoSession(hash, timestamp) {
      if (!demo) fail(403, 'Demo sessions are disabled.')
      return transaction(() => {
        db.prepare('DELETE FROM review_demo_sessions WHERE expires_at<=?').run(timestamp)
        if (db.prepare('SELECT COUNT(*) AS count FROM review_demo_sessions').get().count >= 500) fail(429, 'Demo session limit reached.')
        const workspace = randomUUID()
        db.prepare('INSERT INTO review_demo_sessions VALUES(?,?,?)').run(hash,workspace,timestamp + 30*86400000)
        return workspace
      })
    },
    moderationQueue(user, workspace) {
      authorized(user, workspace)
      if (user.role !== 'moderator') fail(403, 'Moderator access required.')
      return { reviews: records(workspace).filter(r => r.moderation !== 'clear').slice(0,100), reports: db.prepare('SELECT * FROM review_reports WHERE workspace=? ORDER BY created_at DESC LIMIT 100').all(workspace), events: db.prepare('SELECT * FROM review_events WHERE workspace=? ORDER BY created_at DESC LIMIT 100').all(workspace) }
    },
    // The same privacy-filtered interface is suitable for Tenant Guardian / Landlord Assistant.
    assistantContext(user, workspace) { const v = view(user, workspace); return { provenance: v.mode, opinions: v.reviews.map(r => ({ rating: r.rating, text: r.text, verifiedRental: r.eligibility === 'verified' })), eligibility: v.leases.map(({ id, state, reason }) => ({ id, state, reason })), summary: v.summary } },
    submit(user, workspace, input) {
      authorized(user, workspace)
      return transaction(() => {
        const lease = leases.find(l => l.id === input.leaseId)
        if (!lease) fail(403, 'Rental unavailable.')
        const eligible = reviewEligibility(lease, user, now(), demo)
        if (!eligible.allowed) fail(403, eligible.reason)
        if (records(workspace).some(r => r.leaseId === lease.id && r.direction === user.role)) fail(409, 'You have already reviewed this rental.')
        const categories = reviewCategories[user.role]
        if (!Array.isArray(input.ratings) || input.ratings.length !== categories.length || input.ratings.some(n => !Number.isInteger(n) || n < 1 || n > 5) || typeof input.text !== 'string' || input.text.length > 2000) fail(400, 'Provide a rating from 1 to 5 for every category and at most 2,000 characters.')
        const review = { id: randomUUID(), leaseId: lease.id, reviewerId: user.id, revieweeId: user.role === 'tenant' ? lease.landlordId : lease.tenantId, reviewerRole: user.role, revieweeRole: user.role === 'tenant' ? 'landlord' : 'tenant', direction: user.role, ratings: input.ratings, rating: input.ratings.at(-1), text: input.text.trim(), submittedAt: stamp(), publishedAt: null, eligibility: eligible.verified ? 'verified' : 'demo', moderation: sensitiveReviewText(input.text) ? 'pending' : 'clear' }
        db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?)').run(review.id, workspace, lease.id, user.role, JSON.stringify(review))
        event(workspace, review, user.id, 'submitted')
        publish(workspace)
        return { id: review.id, state: 'Review submitted' }
      })
    },
    respond(user, workspace, id, text) {
      authorized(user, workspace)
      return transaction(() => {
        publish(workspace)
        const r = records(workspace).find(r => r.id === id)
        if (!r || r.revieweeId !== user.id || !r.publishedAt || r.moderation !== 'clear') fail(403, 'Published review unavailable.')
        if (r.response) fail(409, 'A response already exists.')
        if (typeof text !== 'string' || !text.trim() || text.length > 1000 || sensitiveReviewText(text)) fail(400, 'Use 1–1,000 characters without contact details, links or private information.')
        r.response = text.trim(); save(workspace, r); event(workspace, r, user.id, 'responded'); return { ok: true }
      })
    },
    report(user, workspace, id, reason) {
      authorized(user, workspace)
      return transaction(() => {
        publish(workspace)
        const r = records(workspace).find(r => r.id === id)
        const lease = leases.find(l => l.id === r?.leaseId)
        if (!r || !lease || !participant(lease, user) || !r.publishedAt || r.moderation !== 'clear') fail(403, 'Published review unavailable.')
        if (!['Private information', 'Harassment', 'Not firsthand', 'Manipulation'].includes(reason)) fail(400, 'Select a reporting reason.')
        if (db.prepare('SELECT 1 FROM review_reports WHERE workspace=? AND review_id=? AND reporter=?').get(workspace,id,user.id)) fail(409, 'Already reported.')
        db.prepare('INSERT INTO review_reports VALUES(?,?,?,?,?)').run(workspace,id,user.id,reason,stamp())
        // Reporting queues human review; it never automatically suppresses negative feedback.
        event(workspace, r, user.id, 'reported', reason); return { ok: true }
      })
    },
    moderate(user, workspace, id, state, reason) {
      authorized(user, workspace)
      if (user.role !== 'moderator') fail(403, 'Moderator access required.')
      if (!['clear', 'pending', 'removed'].includes(state) || typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 500) fail(400, 'A moderation state and reason are required.')
      return transaction(() => {
        const r = records(workspace).find(r => r.id === id)
        if (!r) fail(404, 'Review unavailable.')
        r.moderation = state; save(workspace, r); event(workspace, r, user.id, `moderation:${state}`, reason); return { ok: true }
      })
    },
    assist(user, workspace, text, language) {
      authorized(user, workspace)
      if (typeof text !== 'string' || text.length > 2000 || !['en','fr','pt'].includes(language)) fail(400, 'Invalid assistance request.')
      return reviewWritingHelp(text, language)
    },
    close() { db.close() },
  }
}
