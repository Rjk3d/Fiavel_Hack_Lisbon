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
npm test           # landing demo agent
npm run build      # type check + production build (prebuild rebuilds the contract client)
```

The contract IDs come from `../deployments/testnet.json`. `VITE_LEASE_VAULT_ID`, `VITE_STELLAR_RPC_URL`,
`VITE_STELLAR_HORIZON_URL` and `VITE_BLEND_FAUCET_URL` override them.

## Routes

| Route | What |
|---|---|
| `/` | Landing page (illustrative preview with demo data) |
| `/app` | Overview for the current role: guarantee, actions, next rent, activity |
| `/app/lease`, `/app/leases/:id` | Leases, and one lease: actions, deadlines, terms, months, claim, history, on-chain links |
| `/app/join/:id` | Invite link: the Tenant Guardian explains the terms, the tenant funds |
| `/app/payments` | Months of every lease, pay rent or take an unpaid month |
| `/app/deposit` | Guarantee: liquid part, Blend part, yield so far, projection |
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

## Wallets

The three wallets are testnet keypairs generated in the browser so one person can play every role. They hold
testnet assets only. The `Wallet` interface (`src/stellar/wallets.ts`) is the seam for passkey smart accounts
(OpenZeppelin), which is the next step.
