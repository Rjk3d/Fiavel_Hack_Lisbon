# Fiável — web app

> Fair rentals. Enforced by Stellar, explained by agents.

React + Vite + TypeScript + Tailwind app for tenants, landlords and arbiters, connected live to the
**LeaseVault** contract on Stellar Testnet. Every number on screen is read from the chain; every action
is a real, signed testnet transaction.

## Run

```bash
# once, from the repo root: build the generated contract client
cd packages/lease-vault-client && npm install && npm run build && cd ../..

cd front
npm install
npm run dev        # http://localhost:5174/app
npm test           # demo agent, funding engine, SDK envelopes and initial payment rendering
npm run build      # type check + production build (prebuild rebuilds the contract client)
npm run audit:funding # read-only network/token/real liquidity verification; no transactions
```

The contract IDs come from `../deployments/testnet.json`. `VITE_LEASE_VAULT_ID`, `VITE_STELLAR_RPC_URL`,
`VITE_STELLAR_HORIZON_URL` and `VITE_BLEND_FAUCET_URL` override them.

## Routes

| Route | What |
|---|---|
| `/` | Landing page (illustrative preview with demo data) |
| `/welcome` | Optional sign-in: team account (unlocks demo tools) or continue as a guest |
| `/app` | Overview for the current role: guarantee, actions, next rent, activity |
| `/app/lease`, `/app/leases/:id` | Leases, and one lease: actions, deadlines, terms, investment, parties & reputation, months, claim, history, on-chain links |
| `/app/join/:id` | Invite link: the Tenant Guardian explains the terms, the tenant funds |
| `/app/payments` | Months of every lease, pay rent or take an unpaid month |
| `/app/deposit` | Guarantee: liquid part, Blend part, yield so far, investment proposal and approvals, projection |
| `/app/assistant` | Tenant Guardian / Landlord Assistant / Arbiter Desk (`?q=` asks a question) |
| `/app/activity` | Contract events, filterable, each with its transaction |

## Architecture

- `src/stellar/` — network config, testnet wallets (one keypair per role in localStorage, funded by Friendbot and
  Blend's faucet), contract reads (simulations), signed writes, events.
- `src/state/live.tsx` — the store: wallets, balances, every lease involving them (polled every 5 s), events, and
  `run()` which signs with the current role and submits.
- `@agents/rules`, `@agents/explain`, `@agents/guards` — the agents' rule engine, imported from `../agents/src`.
  The app proposes exactly the calls the contract accepts and refuses the others before building a transaction.
- `src/components/live/` — action panel and dialogs (one per contract function), cards, lease mappings, the
  deterministic assistant.
- `api/blend-faucet.ts` + `vercel.json` — production relay for Blend's faucet (the dev server proxies it).
- `src/stellar/chat.ts` + `src/components/live/LeaseChat.tsx` — tenant-landlord messages: encrypted on the device
  (Stellar keys → X25519, HKDF per lease, XChaCha20-Poly1305), sent with `send_message`, thread hash recomputed and
  checked against `get_thread`. Messages seen are kept in localStorage so they outlive the RPC's event window.
- `server/assistant.ts` — AI language help for the chat (Claude via `@anthropic-ai/sdk`: translate, polish,
  summarize). Served by `api/assistant.ts` on Vercel and by a Vite middleware in dev/preview. Needs `ANTHROPIC_API_KEY`
  (Vercel env var or `front/.env.local`); without it the app says the AI is off. No tools, input limits, a per-IP
  limit, and a code check that flags any number changed by a rewrite.
- `src/stellar/inventory.ts` + `src/pages/live/InventoryPages.tsx` + `src/components/live/InventoryCard.tsx` — the photo
  inventory: rooms, photos (resized, SHA-256), canonical hash signed on-chain, IndexedDB, file export/import with full
  verification, move-out checks done by code, and the claim evidence hash. `server/inventory.ts` (served by
  `api/inventory.ts`) is the AI part: describe a room at move-in, compare a room at move-out, structured output.

## Sign-in (optional)

Entering `/app` shows `/welcome` once per tab: sign in as the team, or continue as a guest. Both get the full app;
the team session adds demo tools (fund the three wallets in one click). The password is stored only as a PBKDF2-SHA256
hash in `src/lib/auth.ts`; rotate it with `node scripts/hash-password.mjs "<password>"` and put the printed
`VITE_ADMIN_*` values in `front/.env.local`. This is a client-side check for demos, not access control.

## Ratings and investing during the lease (LeaseVault v2)

Both need LeaseVault v2 or later (`rate`, `propose_yield`, `approve_yield`, `cancel_yield`). On an older deployment the
reads fail, the snapshot says `v2: false`, and the app hides these actions instead of inventing data.
Redeploy with `scripts/deploy-testnet.sh` after `stellar contract build`, then regenerate the client
(`stellar contract bindings typescript --wasm target/wasm32v1-none/release/lease_vault.wasm --output-dir packages/lease-vault-client --overwrite`).

## Wallets

The deposit page and existing funding actions include a supported-crypto funding flow: direct configured USDC, or a real exact-output Stellar conversion into the tenant wallet followed by separately approved escrow funding. See [the audit, recovery design and test status](../docs/CRYPTO_FUNDING.md). The current Testnet USDC route has no observed XLM liquidity at 1,800/2,700 USDC; unavailable conversions are disabled. Distinct guarantors and Mainnet are unsupported. Success requires confirmed funding plus a fresh contract-state read.

The three wallets are testnet keypairs generated in the browser so one person can play every role. They hold
testnet assets only. The `Wallet` interface (`src/stellar/wallets.ts`) is the seam for passkey smart accounts
(OpenZeppelin), which is the next step.
