# Escrow domain and persistence boundary

Shared TypeScript under `src/` has no SDK wallet, secret, signing or submission dependency. `front/src/escrow/leasevault.ts` adapts existing SDK reads/guards. `TrustlessWorkAdapter` supports injected shadow reads and rejects financial preparation until deployment, permissions, fees and independent verification are approved. See [migration audit and rollout gates](../../docs/HYBRID_ESCROW_MIGRATION.md).

`EscrowProviderRegistry` binds a lease to exactly one provider. The deployment mode applies only to new selection, not an existing binding. `EscrowCapabilityResolver` accepts only verified required capabilities from a rollout-ready adapter. API/indexer data never constitutes an independent funding proof.

## Host-owned durable storage

The browser demo uses guarded localStorage. A production host must wire its own authenticated backend and durable store; this package does not establish an authenticated database connection automatically.

The included SQLite adapters accept an opened database. Node 22's built-in SQLite is experimental; pin and validate the production runtime before use. A host initialization can use:

```js
import { DatabaseSync } from 'node:sqlite'
import { sqliteBindingStore, sqliteAttemptStore } from './server/sqlite-store.mjs'

// Host creates a private directory and supplies this path; never serve the file.
const db = new DatabaseSync(process.env.ESCROW_DB_PATH)
db.exec('PRAGMA foreign_keys = ON')
const bindings = sqliteBindingStore(db) // applies schema and identity constraints
const attempts = sqliteAttemptStore(db)
```

Persist binding before payment preparation. `attempts.save(idempotencyKey, binding, stage, attempt, transactionRefs)` atomically saves the attempt and transaction journal. Each transaction ref contains `hash`, `kind`, `xdr`, `status`; the XDR may be signed, never a seed or private key. A key/ref cannot be reused for a different escrow. Enforce host authorization before every read/write; neither a binding nor a browser-supplied address proves participation.

## Read-only Trustless Work transport

`createTrustlessWorkServerReader(apiKey)` calls only the documented beta Testnet V2 single-release GET. Supply `TW_API_KEY` in the server process. Redirects, non-2xx responses, oversized/malformed bodies and timeouts fail closed. No financial POST route is implemented.

`front/server/shadow-handler.mjs` requires three host-owned dependencies:

* `authenticate(req)` returns a trusted server-session user, not the frontend demo password state.
* `loadAuthorizedBinding(user, leaseId)` returns the original binding only if that authenticated user may read it.
* `readOnChain(contractId)` uses the server-only reader and original authorized binding contract.

The default deployed route returns 503 until these dependencies are provided. It rejects HTTP writes. Its per-process limiter needs a shared equivalent for multiple server instances. Raw provider response carries `provider-api` provenance; validate/normalize it and do not convert it into an RPC funding badge.

## Verification

From `front/`, `npm test` runs domain, adapter, SQLite and actual local HTTP boundary tests alongside the existing funding tests. Test fixtures and synthetic verified provider ports are not evidence of live Trustless Work funding. Never activate the real adapter solely because these tests pass.
