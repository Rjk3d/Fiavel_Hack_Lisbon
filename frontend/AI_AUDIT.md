# Fiável assistant audit and implementation

Audit date: 25 October 2026. Scope: the active workspace's `frontend/`, not the isolated Git clone in `.frontend-integration/`.

## Verified findings before changes

The shipped assistant was entirely deterministic (`demo-agent.ts`), not an LLM or hybrid. There were no model dependencies, AI environment reads, network calls, system prompts, server routes, authentication, document parsing, or connected database. `stellarService` always returned `disconnected`. No AI key was found in the inspected source or environment files. Absence of a provider is not an invalid-key or CORS diagnosis: no provider request existed to fail.

| Problem | Root cause | Severity | File(s), original | Recommended fix / implemented result |
|---|---|---|---|---|
| **1. Wrong or stale rental answers** | Every answer used primary lease constants, including landlord summaries | High | `src/lib/demo-agent.ts` | Context service reads selected authorized lease, actual payment rows and session simulations |
| **2. No conversation continuity** | Service accepted only question and role; history never passed | High | `src/pages/assistant.tsx`, `services/contracts.ts` | Structured interface, last 12 turns, follow-up intent and user-stated claim amount, lease/user-scoped memory |
| **3. Claim answers contradicted session state** | Assistant ignored `claims` and `paid` from DemoProvider | High | `demo-agent.ts`, `app/demo-context.tsx` | Read current state; distinguish private prepared drafts, allegations, evidence notes and simulated payments |
| No genuine generative provider | Keyword routes with static paragraphs | Medium | `demo-agent.ts` | Explicit contextual demo; optional model-assisted intent gateway, never mislabeled as generative answers |
| No enforceable live authorization | Browser role preference was the only identity | High for live deployment | `app/use-demo.ts`, `app/demo-context.tsx` | Server handler requires injected trusted session and data adapters; refuses until supplied |
| No record visibility filter | Assistant had no authorized context boundary | High for live deployment | `demo-agent.ts` | Ownership plus per-record `visibleTo`; private landlord draft withheld from tenant chat |
| Claimed no submitted claim regardless of question | Claim, evidence and dispute requests shared one fixed answer | Medium | `demo-agent.ts` | Draft-aware neutral brief, evidence checklist, missing positions, private communication drafts |
| No French interpretation | English substring tests and fixed English UI | Medium | `demo-agent.ts`, `pages/assistant.tsx` | Explicit language selector, common French intent detection, localized dates, EUR cents and replies |
| No selected lease in chat | Service had no lease parameter | High | `pages/assistant.tsx` | Authorized selector and `?id=...`; unknown/forbidden IDs fail closed |
| Role switch discarded all chat | Component keyed only by role, all state local | Medium | `pages/assistant.tsx` | Per-user/role/lease in-memory history survives route changes; clear control; reload clears private messages |
| Duplicate retry risk, no cancellation | Failed question was reinserted as a new user turn; loading guard used asynchronous state | Medium (race was a code risk, not observed in browser) | `pages/assistant.tsx` | Synchronous pending-request guard, AbortController, reuse failed turn ID on retry, abort on unmount |
| Network errors/timeouts unhandled for future integrations | No network implementation at all | Medium for integration | `services/contracts.ts` | Bounded server/client timeouts, rate limit, abort, bounded bodies, strict wire schema, safe errors; no silent demo fallback |
| No useful action cards | Only global claim link | Low | `pages/assistant.tsx` | Whitelisted lease/payment/evidence links, reviewable draft and existing claim review flow; no financial action |
| No document or evidence analysis | No parser/uploads existed | Medium | `pages/rental.tsx` | Explain structured fields only, label notes unverified; never invent clauses or attachment analysis |
| Inadequate evaluation | A few happy-path English assertions; no package test command | Medium | `scripts/check-demo.cjs`, `package.json` | Executable multilingual evaluation cases, context/permission/protocol/HTTP/gateway tests and documented manual matrix |
| Browser/mobile behavior unverified | Responsive CSS existed, no browser tests | Medium | `src/index.css` | Responsive additions and accessible controls; browser inventory unavailable in this session, so visual QA remains manual |

Priorities 1–3 were implemented first in `src/lib/ai/context.ts`, `policy.ts`, and `reply.ts`, then connected to the UI. Existing routing, demo state, purple styling, contract interface and disconnected Stellar adapter remain in place.

## Hypotheses and limitations

- No production CORS, commercial model latency, provider rate-limit or invalid-key incident was reproduced: the original code never called a provider.
- No on-chain funding, deployed contract, wallet transaction, signed lease parsing or legal outcome has been verified. The assistant states these limits. The context builder intentionally never promotes a funding record to verified blockchain state.
- All bundled fixture identities and records are public demo data in browser JavaScript. Frontend filtering is a demo UX boundary, not protection for real tenant data. Real records must be retrieved only by the server with trusted sessions and ownership checks.
- The current domain supports `Prepared` claims only. It has no submitted claims, opposing-party responses, arbitration decisions, private message store or upload storage. Missing positions and rules are reported as missing, not synthesized. Drafts stay private; no publish/send endpoint exists.
- The live adapter uses an explicit JSON classification gateway contract. It is not an untested direct commercial API integration, and model-assisted mode does not promise unrestricted generated prose. Factual responses and communication drafts remain locally composed from authorized records.
- Pattern-based demo intent routing remains limited for arbitrary phrasing and complex multi-intent questions. A configurable model can improve intent selection once the real backend is connected. Missing critical information prompts clarification rather than factual invention.

## Implementation map

| Files | Purpose |
|---|---|
| `src/lib/ai/context.ts` | Identity/lease filtering, claim/evidence visibility, payment status overlay, provenance, minimal external context, bounded history |
| `src/lib/ai/policy.ts`, `reply.ts` | Intent routing, French/English, contextual facts, deposit/lease explanations, neutral dispute brief, evidence checklist, review-only drafts |
| `src/lib/ai/protocol.ts`, `client.ts` | Runtime validation, same-origin backend request, error and timeout handling |
| `src/lib/ai/session.ts` | Bounded memory only, isolated by demo user/role/lease |
| `src/components/assistant-conversation.tsx`, `src/pages/assistant.tsx` | Role identity, lease/language/service selectors, suggestions, history, action cards, retry/stop/clear and draft review |
| `src/index.css`, `src/pages/rental.tsx` | Chat-only styling and evidence section anchor |
| `server/handler.mjs`, `gateway.mjs`, `server.mjs`, `.env.example`, `vite.config.ts` | Optional secure backend boundary and documented gateway, disabled until configured |
| `tests/`, `scripts/check-demo.cjs`, `package.json`, `eslint.config.js` | Evaluations, regression/HTTP/mock integration checks and commands |

## Validation

Original baseline: build, lint and original domain assertions passed. After implementation, use `npm run build`, `npm run lint`, `npm test` and `node scripts/check-demo.cjs`. Test output is the authority for counts. Gateway tests inject a fake HTTP response and do not establish that an external model works. Local HTTP tests exercise real request parsing, status codes, authorization, consent, rate limits and timeouts.

Executed results for this change:

- Production build: passed (TypeScript and Vite).
- ESLint: passed, including the server and test modules.
- Final compatibility suite (`node scripts/check-demo.cjs`): 56 passed, 0 failed, including 27 question evaluations and 5 server-rendered component checks. `npm test` also ran successfully before the final additional selected-lease regression case.
- `git diff --check`: passed; existing staged files in the active workspace were preserved during validation.
- Local runtime smoke: `/app/assistant` returned HTTP 200; `/api/assistant` through the Vite proxy returned HTTP 503 with the expected missing-session/data-adapter message.
- No configured AI environment-variable names were found in the execution environment. The server started without a `.env` file. No API credential values were printed; the built client contained no server AI key/configuration references.
- Browser inventory was empty. Server rendering is tested; interactive desktop/mobile appearance and keyboard interaction are not browser-verified.

See [AI_SETUP.md](AI_SETUP.md) for setup, model gateway contract, integration prerequisites and the repeatable evaluation procedure.
