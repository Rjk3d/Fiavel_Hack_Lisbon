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
| `contracts/lease_vault/` | **LeaseVault**, the Soroban contract (Rust), with its unit tests and a mock Blend pool |
| `contracts/hello_world/` | Pre-hack toolchain check |
| `packages/lease-vault-client/` | TypeScript client generated from the contract (`stellar contract bindings typescript`), for the front and the agents |
| `agents/` | Deterministic agents: rule engine, tools, guards, Lease Coordinator, testnet demo |
| `deployments/` | Contract IDs and accounts per network, and the transaction links of the last demo run |
| `scripts/` | `deploy-testnet.sh` (accounts, test assets, deploy), `cargo.cmd` (Windows helper) |
| `docs/PLAN.md` | Feature plan and checkpoints |

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

```
 Tenant (Ana)        Landlord (Manuel)        Arbiter
 smart account       smart account            (named in the lease)
      │  fund, pay_rent,     │  create_lease,          │ resolve
      │  respond, end_lease  │  claim_unpaid, claim_damage
      ▼                      ▼                         ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ LeaseVault (Soroban)                                         │
 │  lease state · deadlines · bounded arbitration · bonds       │
 │  public calls: release, execute_claim, refund_no_keys,       │
 │                exit_blend (only when the position is at risk)│
 └───────┬───────────────────────────────┬──────────────────────┘
         │ USDC (SAC)                    │ submit supply / withdraw
         ▼                               ▼
   USDC token contract           Blend v2 pool (one, fixed at deploy)
         ▲
         │ public calls when a deadline passes
 Lease Coordinator (own wallet, fees only) ◄── agents/ rule engine
```

| Component | Role | Testnet ID |
|---|---|---|
| LeaseVault (Soroban, built during the hack) | Holds the first rent and the guarantee, enforces every lease rule | [`CCPX4XT2EJQQKG2JCFPIWHQDFLO46QTBN5BP7VQQW22HEMZO7NTBTKMD`](https://stellar.expert/explorer/testnet/contract/CCPX4XT2EJQQKG2JCFPIWHQDFLO46QTBN5BP7VQQW22HEMZO7NTBTKMD) |
| USDC (SAC) | Rent and guarantee asset. On testnet this is Blend's test USDC (`USDC:GATALT…F5V56`), the asset its pool lends | [`CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU`](https://stellar.expert/explorer/testnet/contract/CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU) |
| Blend v2 pool | Opt-in yield, accepted by both parties. Guarantee minus one month is supplied; one month and a 5 % tenant buffer stay liquid | [`CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`](https://stellar.expert/explorer/testnet/contract/CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF) |
| Lease Coordinator wallet (Stellar CLI) | Calls the public deadline functions; pays fees only, holds no user funds | see [`deployments/testnet.json`](deployments/testnet.json) |
| OpenZeppelin smart accounts (passkeys) | Face ID wallets for tenant and landlord | _front, next step_ |
| OpenZeppelin policy | Limits the landlord's agent to `claim_unpaid` | _front, next step_ |

### LeaseVault rules

| Function | Who | Condition | Effect |
|---|---|---|---|
| `create_lease` | landlord | valid terms (guarantee ≥ 1 month) | records rent, guarantee, deadlines, arbiter, yield option |
| `fund` | tenant | before the move-in deadline | locks first rent + guarantee (+ 5 % buffer with yield); supplies guarantee − 1 month to Blend if both parties opted in |
| `confirm_move_in` | both | same inventory hash, before the deadline | releases the first rent, starts the lease |
| `refund_no_keys` | anyone | deadline passed without move-in | everything back to the tenant |
| `pay_rent` | tenant | months left | rent straight to the landlord |
| `claim_unpaid` | landlord | due date + grace passed | one month from the guarantee: liquid part first, then Blend |
| `end_lease` | either party | lease term reached | records the exit hash, opens the claim window |
| `claim_damage` | landlord | inside the claim window, ≤ guarantee, posts a bond | undisputed part refunded to the tenant at once |
| `respond` / `accept_counter` | tenant / landlord | inside the response window | settle at the claim or at the counter-offer |
| `execute_claim` | anyone | tenant silent | claim paid |
| `resolve` | arbiter | dispute open | splits the disputed amount between the two parties only; bond forfeited if the landlord gets < 50 % |
| `release` | anyone | claim window passed, no claim | guarantee + tenant's yield share to the tenant |
| `exit_blend` | parties anytime; anyone if at risk | loss > 0.1 % or pool utilization ≥ 95 % | brings the position back; gain shared 70 / 20 / 10 |

Durations are lease parameters, so the demo runs with 1 month = 60 seconds.

## Setup

Prerequisites: Rust with the `wasm32v1-none` target, Stellar CLI, Node 20+.
On Windows, Visual Studio Build Tools with the "Desktop development with C++" workload is required.

```bash
# Contract: 23 unit tests (lease lifecycle, disputes, Blend yield and loss)
cargo test -p lease_vault          # Windows: scripts\cargo.cmd test -p lease_vault
stellar contract build --package lease_vault

# Testnet: demo accounts, Blend test assets, deploy → deployments/testnet.json
bash scripts/deploy-testnet.sh

# Typed client for the front and the agents
stellar contract bindings typescript --wasm target/wasm32v1-none/release/lease_vault.wasm \
  --output-dir packages/lease-vault-client --overwrite
cd packages/lease-vault-client && npm install && npm run build && cd ../..

# Agents
cd agents && npm install
npm test                           # rule engine and guards, offline
```

_Front setup: on the `front` branch._

## Environment variables

See [`.env.example`](.env.example). The agents read `deployments/<network>.json` and take each role's key from `<ROLE>_SECRET_KEY` (`LANDLORD_SECRET_KEY`, `TENANT_SECRET_KEY`, `COORDINATOR_SECRET_KEY`…). In local development they fall back to the `stellar keys` identity `fiavel-<role>` created by the deploy script. Secrets never go in the repo.

## Demo

_TODO: public URL and video link._

The full pitch scenario runs against testnet in about 5 minutes (1 month = 60 s):

```bash
cd agents
npm run demo                 # offer → funding with Blend deposit → co-signed move-in → refusal scene
                             # → rent paid → unpaid month taken from the guarantee → end → release by the coordinator
npm run status -- 0 tenant   # what a role sees and can do on lease #0
npm run explain -- 0 "what if Blend gets hacked?"
npm run history -- 0         # payments and settlements, rebuilt from contract events
npm run coordinator          # the Lease Coordinator loop (every 10 s)
```

The agents are deterministic: `src/rules.ts` mirrors every condition of the contract, `src/explain.ts` has one template per rule filled with on-chain values, `src/guards.ts` refuses any call outside the rules before a transaction is even built. In the refusal scene, the guard refuses "seize the whole guarantee now", then a forced call is rejected by the contract (`WrongStatus`).

## On-chain evidence (testnet)

Last demo run (lease #0 on LeaseVault `CCPX4XT2…TKMD`), from [`deployments/testnet-demo.json`](deployments/testnet-demo.json):

| Step | Transaction |
|---|---|
| Landlord creates the lease (yield offered) | [2ff3fff2…](https://stellar.expert/explorer/testnet/tx/2ff3fff2f1d3932e7a3ce308bac47373e9744c8fcc56626b7f8ef7093fba1ca2) |
| Tenant funds; 100 USDC supplied to Blend | [b8679d06…](https://stellar.expert/explorer/testnet/tx/b8679d0697b4d948a951aef1b6004f96ed5dd569170ae94b1d58b609350f0855) |
| Move-in co-signed, first rent released | [8b9311ed…](https://stellar.expert/explorer/testnet/tx/8b9311edd5dc1197d98fa33c6d99c9c43bb0247345c9c6d7ad0838b6c14c9cfc) |
| Rent paid | [170e73c8…](https://stellar.expert/explorer/testnet/tx/170e73c83a32bbecc27a654a0d88bd1d1d737649061d8b7ed1885086aa758291) |
| Unpaid month taken from the guarantee | [30b73464…](https://stellar.expert/explorer/testnet/tx/30b73464869e6837d45929d969c745a9f3f9f79ce6c31d558b7580e47cd50ac2) |
| Lease ended, exit inventory recorded | [62722076…](https://stellar.expert/explorer/testnet/tx/627220765acacb9a5edd4d1653b5d39b9b70fa9e02018d16691f6470e67910f3) |
| Coordinator releases: Blend withdrawal + refund to the tenant | [2ee01ef7…](https://stellar.expert/explorer/testnet/tx/2ee01ef72c591f0780a2f9b63a883ce363feae392164d5fca3a969ec3c2cdc5c) |

On an earlier deployment (`CBYE4L4L…Z2ZU`), a funded lease with no move-in was refunded by `refund_no_keys` after 15 minutes on Blend, with a real yield of 1,075 stroops split 70 / 20 / 10: [4aa30b10…](https://stellar.expert/explorer/testnet/tx/4aa30b108e8fb4a886b7dc6981991c0d22a1842a2f6a88d38528b55abe822b31).

Pre-hack toolchain check — `hello_world` contract: [CA4U4VVU…KJX5](https://stellar.expert/explorer/testnet/contract/CA4U4VVURIG54YYGN5SJUQZT3GZIRRTPQM3NUGEP4YKIGGHA3ZQGKJX5)

### Testnet notes

- Testnet resets every quarter: `scripts/deploy-testnet.sh` recreates everything.
- Testnet storage rent is currently very high (extending an entry to 120 days cost ~50k XLM), so LeaseVault keeps entries at the 7-day network minimum and every call on a lease extends it. A mainnet build would extend for longer.
- Over a 5-minute demo the real Blend yield is a few stroops; the app shows the real balance and a projection, never a simulated yield.

## Prior work disclosure

Before the hackathon: product research and planning (`docs/PLAN.md`), repository scaffolding (Soroban workspace via `stellar contract init`) and a hello-world contract to verify the toolchain. _TODO: list front prototype status at event start._ All LeaseVault code is written during the event.

## Use of AI

- **In the product:** none. Fiável agents are deterministic (rule engine, no LLM): they explain lease rules from templates filled with on-chain values and prepare unsigned transactions; they never sign for users.
- **To build:** AI-assisted coding. _TODO: link to prompt log._
