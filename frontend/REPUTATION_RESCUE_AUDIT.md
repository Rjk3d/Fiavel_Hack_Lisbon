# Reputation rescue: verified findings and repairs

Scope: the active `frontend/` package. The separate `.funding-integration` escrow checkout is inspected for compatibility; its guest/team browser role is not tenant authentication. No funding, swap, release, dispute or smart-contract implementation was changed.

## Root causes

These findings are verified from the original implementation and/or reproduced in tests. No claim is made that every example in the request was a real defect.

| Severity | Expected / actual behavior | Root cause and affected files | Repair and evidence |
|---|---|---|---|
| P0 | Starting the app should allow a demo review; previously only the UI started and the separate API was disabled by default | `package.json` ran only Vite; `server/server.mjs` required a second process and opt-in | `scripts/dev.mjs` now starts both, connects their actual ports/origin and prints the URL; standalone backend still fails closed for live use. Real-browser submission tests use this exact launcher. |
| P0 | Reviews should survive restarts; previously everything disappeared | Runtime constructed the service with default SQLite `:memory:`; sessions lived in a handler Map | `server/application.mjs`, `server/reviews.mjs`, `server/review-handler.mjs`: durable SQLite reviews, hashed demo session tokens and persisted fixture window. Runtime HTTP test reconstructs the entire server twice, reuses its cookie and verifies reviews, responses, reports and deadline. |
| P0 | Refresh/navigation/role switching should restore saved data; previously the welcome screen returned until Explore was clicked again | `src/pages/reviews.tsx` initialized `view=null` with no loading effect | Abortable mount/resume request, separate loading state and persona-keyed component. Browser tests reload, navigate away/back and switch both personas. |
| P0 (caught during repair) | Private persisted storage must not bypass API authorization | Moving demo SQLite onto disk inside Vite's root made it downloadable; direct request reproduced HTTP 200 | Explicit Vite filesystem denial for `.data`, SQLite and environment files. Same URL returns 403; Playwright tests actual database and `/@fs/` URLs. This was caught and fixed while implementing persistence. |
| P1 | Requests must finish with useful errors; old network/proxy errors could hang or show JSON parse internals | No timeout, transport handling or success-contract checking in the page's fetch helper | `src/lib/review-client.ts`: 10-second abort, actionable transport/API/proxy errors, response shape checks. Unit and browser tests inject connection failure, HTML errors, malformed JSON objects and rejected persistence. |
| P1 | Rapid clicks must cause at most one write attempt | React `busy` state alone was not a synchronous event lock | Immediate ref lock plus disabled controls; browser dispatches two clicks in the same event turn and observes one POST. Database unique constraint remains authoritative. |
| P1 | Mutation success should describe the action and preserve its saved result if refresh fails | Response/report shared a generic report notice; list-refresh errors were conflated with write errors | Action-specific receipts after API acknowledgment; synchronization failure explicitly says the change was saved. No review is appended to local component state as fake persistence. |
| P1 | Author should be able to read a published response to their review | Own-submission invitation displayed text/rating only; received list contains the opposite direction | Invitation now shows the counterparty response. Browser test switches back to author and verifies it. |
| P1 | Reporting status should survive refresh and prevent inviting repeated reports | API stored reports but view omitted the caller's reported status; UI always offered Send report | Server returns `reported` only for the authenticated caller; reported item shows a receipt. Reports leave public aggregates unchanged. Browser and service tests verify persistence. |
| P1 (missing) | Filtering/sorting should operate on published reviews without changing profile aggregates | No controls or backend options existed | Validated exact-rating filter, newest/oldest/highest/lowest ordering and pagination; summary remains over the full eligible published population. Browser filtering and deterministic varied-rating service tests pass. |
| P1 (missing) | Pending count should represent the author's private submissions without leaking the counterparty's submission | No pending summary | Backend computes only caller-owned unpublished records; test checks the other party sees zero before submitting. |
| P2 | Opening a form should make the next action apparent and accessible | Form was appended below invitations without focus management | Focus heading on opening/changing steps, preserve existing native radio inputs, selected-state labels and keyboard behavior. Desktop/mobile browser tests exercise the form. |
| P2 | Setup instructions should reproduce the working system | Old docs required separate processes, said storage reset, and had no browser test command | README, `.env.example`, `REVIEWS.md` now document the integrated launcher, persistent demo, tests and live limitations. |

The original star `onChange`, role-specific category sets, SQLite uniqueness constraint, lease authorization and server-side double-blind rules were present. They were preserved and exercised, rather than replaced or described as broken without evidence. There were no search/edit controls or public profile routes to repair; those are not advertised as implemented. Submission remains final after preview.

## Data flow and file inventory

1. `src/App.tsx` routes `/app/reviews`; `src/app/layout.tsx` supplies desktop/mobile navigation and the explicitly fictional role switcher. `src/app/demo-context.tsx` / `use-demo.ts` store that preference, not authentication.
2. `src/pages/reviews.tsx`: persona-keyed page loads existing session, selects lease invitation, updates native radio/textarea state, validates required categories, previews, locks and submits. Drafts are deliberately not persisted as reviews. Cards, profile summaries, responses and reporting live in this file and reuse `src/components/ui.tsx` and `src/index.css`.
3. `src/lib/review-client.ts`: same-origin API requests, bounded time, typed errors, success validation. No fallback to local success.
4. `scripts/dev.mjs` starts Vite + `server/application.mjs` with a private persistent fictional database; `vite.config.ts` supplies API proxy and private-file denial. `server/server.mjs` remains the standalone entry. `.env.example`, `package.json` and `.gitignore` cover configuration, commands and untracked private data/artifacts.
5. `server/review-handler.mjs`: Origin/fetch-metadata/header validation, size and rate limits, HttpOnly session token, fixed demo persona mapping or injected live authentication. Browser identity fields cannot replace live session identity. Each demo workspace is isolated.
6. `src/lib/reputation.ts`: shared categories, types, eligibility, common private-information detection, explicit local demo writing guidance. `src/lib/demo-data.ts` / `types.ts` remain the original active-lease data/model. Review-specific `ReviewRecord` is separate from the unused legacy `Review` interface.
7. `server/reviews.mjs`: SQLite transactions, unique direction per lease, trusted participant/completion/window checks, derived counterparty, stored roles, moderation and off-chain text. It reconciles publication before serving safe views; only published/clear received feedback enters statistics. Own private feedback is returned only to its author. SQL settings preserve the original demo window; records and tokens persist after restarting.
8. `server/escrow-review-adapter.mjs`: structural reader for the existing registry in `.funding-integration/packages/escrow-domain`; independent completion is still required. Funding, provider-API claims, binding mismatch and missing RPC settlement fail closed. `src/lib/services/contracts.ts` remains disconnected; no new provider or transaction logic was invented.
9. `src/lib/ai/context.ts`, `policy.ts`, `reply.ts`, `client.ts`, `server/handler.mjs` and `gateway.mjs`: authorized reputation context, demo/unavailable labels, no hidden opinions in external model context. The configured gateway is an intent classifier, not a prose-rewrite model. Review assistance remains labeled local formatting/guidance with explicit acceptance; no translation claim.
10. `tests/reviews.test.mjs`, `tests/review-repairs.test.mjs`: eligibility, authorization, providers, deadlines, moderation, statistics, filters, persistence, runtime restarts and errors. `tests/e2e/reviews.spec.mjs` + `playwright.config.mjs`: real Chrome/UI/API/SQLite integration, mobile, navigation, error injection and private-file denial. `tests/render.test.cjs`, `assistant.test.mjs`, `server.test.mjs`, `fixtures.mjs`, `evaluation-cases.mjs` retain existing regression coverage. `scripts/check-demo.cjs` runs both review test files too.

## Trust boundaries and remaining limits

The repaired executable workflow uses the existing fictional completed-rental example, not new fabricated live evidence. It is a real local API and durable SQLite store for fictional data. Both demo personas share one browser workspace; role switching is intentionally allowed only in demo mode. Cookies last 30 days. Clearing cookies or expiration creates a new isolated workspace; there is no real tenant login/logout or account recovery. Real authentication, tenant-to-lease identity mapping, fresh trusted completion records, deployed escrow readers and moderator UI are still host-integration work. Live mode remains disabled without adapters. Stored demo and live modes and lease provenance are checked to prevent mixing.

The configured window is persisted once and is not silently extended on restart. Single-review publication is reconciled when an authorized read/write occurs, rather than by a background job. Negative feedback never triggers money movement or automatic deletion. Common personal-information detection is heuristic and needs human moderation. No public tenant search, credit score, automatic screening or sensitive property/evidence exposure is added.

See `REVIEWS.md` for current commands and exact demonstration steps. Validation results should be taken from the most recent executed test run, not inferred from this audit.

## Final executed validation

On 25 October 2026: `npm.cmd test` passed 82/82 tests; `npm.cmd run test:e2e` passed 5/5 headless Google Chrome tests (39.4 seconds), including a 375px mobile journey and direct/`@fs` SQLite download denial. `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` were executed successfully. Earlier browser attempts exposed a test-selector mismatch and an overstrict check on a nonexistent file's SPA fallback; both were corrected before the final passing run. No real blockchain or model provider was called.

## Files changed during this rescue

Application: `src/pages/reviews.tsx`, `src/lib/review-client.ts` (new), `src/lib/reputation.ts`, `src/index.css`.

Runtime/persistence: `server/application.mjs` (new), `server/server.mjs`, `server/reviews.mjs`, `server/review-handler.mjs`, `server/handler.mjs`, `scripts/dev.mjs` (new), `vite.config.ts`, `.env.example`, `.gitignore`.

Validation/configuration: `tests/review-repairs.test.mjs` (new), `tests/e2e/reviews.spec.mjs` (new), `playwright.config.mjs` (new), `scripts/check-demo.cjs`, `eslint.config.js`, `package.json`, `package-lock.json`.

Documentation: root `README.md`, `frontend/README.md`, `REVIEWS.md`, this audit. Pre-existing changes were preserved. No financial contracts or other checkout files were modified.
