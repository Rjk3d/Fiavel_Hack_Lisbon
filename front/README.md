# Fiável — frontend prototype

> AI agents for fair rentals. Smart contracts for trust.

Interactive prototype of an AI-assisted rental escrow app for tenants and landlords in Lisbon.
**Frontend only:** all people, payments and events are fictional demo data. No real funds move,
no backend or AI provider is called, and no Stellar transaction is submitted.

The frontend lives in `front/`; run the commands below from there.

## Run

```bash
cd front
npm install
npm run dev        # http://localhost:5174
npm test           # demo agent + lease logic
npm run build      # type check + production build
```

## Routes

| Route | What |
|---|---|
| `/` | Landing page |
| `/app` | Overview — tenant (Ana) or landlord (Manuel), switch in the sidebar / header |
| `/app/lease`, `/app/leases/:id` | Lease detail (tenant) / lease list + detail (landlord) |
| `/app/payments` | Payments, filters, detail drawer, demo payment / review |
| `/app/deposit` | Protected deposit: lifecycle, release rules, data provenance |
| `/app/assistant` | Tenant Guardian / Landlord Assistant (`?q=` asks a question) |
| `/app/activity` | Filterable activity feed |

## Architecture

- `src/lib/demo-data.ts` — the single seeded scenario (fixed "today": 26 Oct 2026).
- `src/lib/lease-logic.ts` — derived business rules (next payment, claim deadline, lifecycle), shared by UI and agent.
- `src/state/demo-store.tsx` — in-memory state + actions (simulate payment, mark received, save claim draft). Replace action bodies with API calls.
- `src/state/flows.tsx` — the modal flows (payment detail, pay, review, claim), openable from anywhere.
- `src/lib/services/assistant.ts` — `AssistantService` interface. `demo-agent.ts` is the deterministic implementation;
  setting `VITE_ASSISTANT_URL` switches to a backend returning the same `AssistantReply` JSON.
- `src/lib/config.ts` — Stellar settings (`VITE_STELLAR_CONTRACT_ID`, `VITE_STELLAR_LAST_TX`). The UI shows a contract or
  transaction only when one is configured, and builds explorer links only from a well-formed hash.

## Known limitations

- No authentication, persistence (only the demo role is remembered) or file uploads.
- The demo agent is keyword-based, not a language model; it says so in the UI.
- Stellar / Soroban is not connected: the blockchain panel says verification will appear once connected.
