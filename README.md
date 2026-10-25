# Fiável

> AI agents for fair rentals. Smart contracts for trust.

Rental escrow for tenants and landlords in Lisbon: deposits held under transparent rules,
AI assistants that explain and prepare, Stellar Soroban for supported fund movements.
Built for HackMeridian.

## Branches

| Branch | Content |
|---|---|
| `main` | Stable base of the project |
| `front` | Frontend prototype (`front/`, Vite + React + TypeScript + Tailwind, demo data) |

## Repository layout

| Path | Content |
|---|---|
| `front/` | Frontend (on the `front` branch for now) |
| `contracts/` | Soroban contracts (Rust). `hello_world` is the pre-hack toolchain check. |
| `docs/PLAN.md` | Feature plan (v2) and checkpoints |

## Problem

In Portugal there is no neutral deposit-protection scheme. Landlords demand a Portuguese *fiador* or up to 12 months of rent upfront from foreign tenants; tenants often lose their deposit. Whoever holds the cash makes the rules.

## Solution

A Soroban contract, **LeaseVault**, holds the guarantee for the whole lease:
- objective cases (unpaid rent, silence after a deadline) are settled by code;
- only the disputed amount goes to a bounded arbitrator;
- the deposit is returned by default.

Target users: foreign students and expats in Lisbon, and small good-faith landlords.
Track: **Genesis + Stellar Composed**.

## Architecture — how Stellar is used

_TODO: diagram._

| Component | Role | ID / link |
|---|---|---|
| LeaseVault (Soroban, built during the hack) | Holds rent + guarantee, enforces lease rules | _TODO_ |
| OpenZeppelin smart accounts (passkeys) | Face ID wallets for tenant and landlord | _TODO_ |
| OpenZeppelin policy | Limits the landlord's agent to `claim_unpaid` | _TODO_ |
| Coordinator agent wallet (Stellar CLI) | Calls public deadline functions | _TODO_ |
| USDC (SAC, testnet) | Rent and guarantee asset | _TODO_ |
| Blend (testnet pool) | Optional yield on the guarantee | _TODO_ |

## Setup

Prerequisites: Rust with the `wasm32v1-none` target, Stellar CLI, Node 20+.
On Windows, Visual Studio Build Tools with the "Desktop development with C++" workload is required.

```bash
# Contracts
cargo test
stellar contract build
```

_TODO: front and agent backend setup._

## Environment variables

See [`.env.example`](.env.example).

## Demo

_TODO: public URL, video link, demo script (demo mode: 1 month = 1 minute)._

## On-chain evidence (testnet)

- Pre-hack toolchain check — `hello_world` contract: [CA4U4VVU…KJX5](https://stellar.expert/explorer/testnet/contract/CA4U4VVURIG54YYGN5SJUQZT3GZIRRTPQM3NUGEP4YKIGGHA3ZQGKJX5)

_TODO: Stellar Expert links for funding, unpaid-rent claim, refusal, release, Blend deposit._

## Prior work disclosure

Before the hackathon: product research and planning (`docs/PLAN.md`), repository scaffolding (Soroban workspace via `stellar contract init`) and a hello-world contract to verify the toolchain. _TODO: list front prototype status at event start._ All LeaseVault code is written during the event.

## Use of AI

- **In the product:** AI agents (Claude API with tools) explain lease rules and prepare unsigned transactions; they never sign for users.
- **To build:** AI-assisted coding. _TODO: link to prompt log._
