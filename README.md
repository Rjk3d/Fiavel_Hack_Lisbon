# Fiável

> AI agents for fair rentals. Smart contracts for trust.

Rental escrow for tenants and landlords in Lisbon: deposits held under transparent rules,
AI assistants that explain and prepare, Stellar Soroban for supported fund movements.
Built for HackMeridian.

## Run the current rental reputation demo

From `frontend/`, run `npm.cmd ci` and `npm.cmd run dev` (use `npm` on shells without PowerShell's script restriction). Open the exact `/app/reviews` URL printed in the terminal. This starts both the frontend and the persistent fictional review API.

See [the review walkthrough](frontend/REVIEWS.md) and [the rescue audit](frontend/REPUTATION_RESCUE_AUDIT.md). Run `npm.cmd run test:e2e` for the Chrome browser tests. Live rental verification remains disabled until trusted authentication and completed-lease evidence are connected.

## Branches

| Branch | Content |
|---|---|
| `main` | Stable base of the project |
| `front` | Frontend prototype (`front/`, Vite + React + TypeScript + Tailwind, demo data) |
