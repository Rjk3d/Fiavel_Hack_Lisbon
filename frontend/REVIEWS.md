# Rental reputation: run, verify and integrate

The repaired reputation workflow lives in the active `frontend/` package. It uses a real local Node API and durable SQLite for clearly fictional demo rentals. Live identity, real completed tenancies and blockchain verification are not configured. Existing active leases remain ineligible.

Read [REPUTATION_RESCUE_AUDIT.md](REPUTATION_RESCUE_AUDIT.md) for verified P0/P1/P2 findings, root causes, repairs, full file inventory, data flow and remaining boundaries.

## Start the application

Requires Node 22.20+ and npm. On PowerShell, use `npm.cmd` to avoid the script execution-policy restriction.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

One command starts Vite and the API, selects a free API port, connects the proxy and matches the actual browser origin. Use the exact `/app/reviews` URL printed in the terminal. Vite tries another frontend port if 5173 is occupied. To choose a fixed port, set `$env:DEV_PORT='5182'` (and optionally `$env:DEV_STRICT_PORT='true'`) before starting. No separate assistant-server command is needed for the demo.

Development defaults to the explicitly fictional review service. `REVIEWS_DEMO=false` disables it; `.env.example` opts into demo. Production/standalone `npm.cmd run dev:assistant` still requires `REVIEWS_DEMO=true` for demo or trusted host adapters for live operation. `npm.cmd run dev:frontend` starts only Vite when deliberately connecting an independently managed API with `FIAVEL_API_TARGET`.

## Manual end-to-end walkthrough

1. Open the printed URL and choose **Explore review demo** once. Your current active rental says **Not eligible**. The existing separate **A completed chapter - Demo** fixture is ready to review.
2. In Tenant view, choose **Write review**. Select one 1-to-5 rating for every category. Continue, optionally write firsthand feedback, preview, and choose **Submit demo review**. The success receipt appears only after persistence.
3. Close the confirmation. The invitation says **Awaiting other party** and pending count is one. Refresh, or navigate to Overview and back to Reputation: the saved submission is restored automatically.
4. Switch the top-bar demo role to Landlord. The tenant review's hidden text/rating is absent and is not sent in the API response. Write the landlord-to-tenant review independently and submit.
5. Both publish. Landlord profile receives the tenant's feedback; Tenant profile receives the landlord's. Switch views and refresh to verify. Review count/distribution update; verified count stays zero for all fictional records. An average/category aggregate is intentionally withheld until at least three published reviews.
6. On received feedback, expand **Respond thoughtfully**, enter a response and publish. Refresh to verify it persisted. The author can also see this response in their submitted-review invitation.
7. Expand **Report this review**, select a reason and send. A persistent receipt replaces the report control. Reports queue human review; they do not automatically remove feedback or change aggregates.
8. Filter by rating and change sort order. Empty filters say **No reviews match this filter**; global profile statistics remain unchanged. Pagination uses the filtered result set.
9. Stop and restart `npm.cmd run dev`, then revisit the same hostname in the same browser. Reviews, session, responses, reports and the original deadline persist. Do not clear cookies if you want to resume this workspace.
10. At a mobile width, use **Toggle navigation** to navigate away/back. Native stars, preview, submission and local writing help are covered at 375px by Chrome tests.

## Persistence and privacy

The development store defaults to `.data/reviews-demo.sqlite`, configurable with `REVIEWS_DB_PATH`. Reviews, reports, moderation events, hashed demo-session tokens and the configured fictional window persist. Browser session cookies are HttpOnly, SameSite=Strict, and valid for 30 days (Secure on HTTPS). Clearing/expiring the cookie starts a new isolated workspace; there is no real login/logout or account-recovery system. Payment/claim/chat demo state retains its original behavior.

`.data` and SQLite/environment files are blocked by Vite and excluded from Git. Production databases should be outside public serving directories with appropriate filesystem permissions, retention and backups. Demo/live database modes and lease sources cannot be mixed. Do not reuse the demo database for live data.

The fixture's 14-day review window is created once, stored and never silently reset by a restart. If it expires, it remains expired. A new explicitly chosen demo database path creates an independent fresh demo; it does not alter previous records.

## Eligibility and publication

The authenticated user ID and role must match a lease participant; tenant and landlord must be distinct. Trusted records must establish a completed tenancy with a past completion timestamp, explicit completion verification and a configured valid review window. No funding-only or active lease qualifies.

Backend-verified leases can use backend completion records. `leasevault` and `trustless_work` evidence additionally requires matching provider/lease/contract/network identity and independently confirmed settled state. The existing escrow registry reader is reused through `server/escrow-review-adapter.mjs`. Its current provider-API reports are not promoted to RPC proof. Live readers and authenticated account mapping must be connected by the host. No funds or smart contracts are changed.

There is one final review per direction per lease, enforced by SQLite uniqueness and server authorization. Submitted reviews remain private to their author until both submit or the explicit closing deadline passes. Moderation pending/removed records stay hidden. Publication reconciles on authorized reads/writes. Hidden feedback is excluded from received lists, summaries and assistant context. Written text stays off-chain. Negative ratings never move funds or automatically remove feedback.

## API

All routes require `X-Fiavel-Reviews: 1`; writes require JSON and the configured Origin. Reads accept that Origin or same-origin browser fetch metadata. Trusted live identity comes only from the host's server authentication adapter. Demo persona headers work only in explicit demo mode, within an isolated cookie workspace. Rate and request-size limits apply.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/reviews/session` | Start/reuse an explicit fictional session |
| GET | `/api/reviews?page=1&rating=all&sort=newest` | Authorized invitations, own submissions, published received feedback and complete-population statistics |
| POST | `/api/reviews` | Submit `{ leaseId, ratings, text }`; response contains saved ID |
| GET | `/api/reviews/context` | Authorized published opinions/eligibility for rental assistants |
| POST | `/api/reviews/assist` | Local demo formatting/privacy guidance `{ text, language: en/fr/pt }` |
| POST | `/api/reviews/:id/response` | Reviewee's one response `{ text }` |
| POST | `/api/reviews/:id/report` | Participant report `{ reason }` |
| GET | `/api/reviews/moderation` | Trusted moderator-only queue/reports/audit events |
| POST | `/api/reviews/:id/moderate` | Moderator-only `{ state: clear/pending/removed, reason }` |

Ratings: `all` or `1`-`5`. Sort: `newest`, `oldest`, `highest`, `lowest`. Pages contain up to 10 reviews. Summary is over all published clear received reviews, irrespective of filter. Pending count includes only the caller's unpublished submissions. Responses are limited to 1,000 characters, reviews to 2,000. Report reasons: Private information, Harassment, Not firsthand, Manipulation. There is no arbitrary hidden-review lookup endpoint.

## Executable validation

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

Node tests exercise authorization, identity, duplicate/concurrent submission, eligibility, both provider adapters, deadlines, hidden access, moderation, response/report storage, statistics, filtering/sorting, database-mode separation, malformed responses and reconstructing the actual runtime across restarts. Playwright uses installed Google Chrome in an isolated headless profile and a dedicated test database/server; it does not operate your personal browser profile. It exercises both directions, stars, preview, private publication, real API/storage, responses, reports, refresh/navigation, roles, mobile, transport errors and database-file denial. Screenshots/traces go to ignored `test-results/`. Set Playwright's channel in `playwright.config.mjs` if Chrome is unavailable.

## Remaining integration limits

This is a functional persistent demo, not an authenticated live rental service. To enable real users, inject trusted authentication into `createReviewHandler`, provide real completed lease evidence to `createReviewService` with a private durable database, and connect the existing provider readers. Use `service.assistantContext(user, 'live')` for live assistant context. No live AI prose provider is configured; writing help is clearly local formatting/guidance, not model rewriting or translation. Privacy detection is heuristic; human moderation remains necessary. A moderator dashboard and public/shared profile discovery are not implemented. Reviews cannot be edited after final submission.
