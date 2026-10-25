# Fiável

[![CI](https://github.com/Rjk3d/fiavel_hack_lisbon/actions/workflows/ci.yml/badge.svg)](https://github.com/Rjk3d/fiavel_hack_lisbon/actions/workflows/ci.yml)

> Fair rentals. Enforced by Stellar, explained by agents.

Rental escrow for tenants and landlords in Lisbon: the guarantee is held by a Soroban contract under
transparent rules, deterministic agents explain and prepare every action, and nothing moves without a signature.
Built for HackMeridian.

## Run the current rental reputation demo

From `frontend/`, run `npm.cmd ci` and `npm.cmd run dev` (use `npm` on shells without PowerShell's script restriction). Open the exact `/app/reviews` URL printed in the terminal. This starts both the frontend and the persistent fictional review API.

See [the review walkthrough](frontend/REVIEWS.md) and [the rescue audit](frontend/REPUTATION_RESCUE_AUDIT.md). Run `npm.cmd run test:e2e` for the Chrome browser tests. Live rental verification remains disabled until trusted authentication and completed-lease evidence are connected.

This additional `frontend/` demo does not replace the existing `front/` application or its on-chain ratings. See [the integration and preservation report](docs/REPUTATION_INTEGRATION.md) for the branch architecture and verification scope.

## Branches

| Branch | Content |
|---|---|
| `main` | Contract, agents and the web app connected to Stellar Testnet. Everything to judge is here |
| `frontend-yacin` | An alternative front-end prototype (`frontend/`, demo data), not merged: `front/` was kept as the base |

## Repository layout

| Path | Content |
|---|---|
| `front/` | Web app (React + Vite + Tailwind), connected live to LeaseVault on testnet. See [`front/README.md`](front/README.md) |
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
- only the disputed amount goes to a bounded arbitrator, chosen from the contract's registry of approved mediators;
- the deposit is returned by default.

Target users: foreign students and expats in Lisbon, and small good-faith landlords.
Track: **Genesis + Stellar Composed**.

### What we compose on Stellar

| Building block | What it does in Fiável | Status |
|---|---|---|
| **Soroban** (LeaseVault, written during the hack) | Holds the first rent and the guarantee, enforces every lease rule, bounded arbitration, on-chain reputation | Live on testnet |
| **USDC** through the Stellar Asset Contract | Rent and guarantee asset, moved by the contract | Live on testnet |
| **Blend v2** lending pool (a live protocol) | Opt-in yield on the guarantee, approved by both parties, one month always kept liquid | Live on testnet, real yield |
| **Agent wallet** (Stellar CLI keys) | The Lease Coordinator calls the public deadline functions and keeps leases alive; it pays fees only and can never receive funds | Live on testnet |
| **Contract events + RPC** | The app's history, payments and activity are rebuilt from events, every action links to Stellar Expert | Live on testnet |

Roadmap: passkey smart accounts and sponsored fees (no seed phrase, no XLM), EURC for euro rents, an anchor (SEP-24) to cash out the guarantee to a bank account.

## Architecture — how Stellar is used

```
 Tenant (Ana)        Landlord (Manuel)        Arbiter
 wallet              wallet                   (approved mediator)
      │  fund, pay_rent,     │  create_lease,          │ resolve
      │  respond, end_lease  │  claim_damage,          │
      │                      │  accept_counter         │
      ▼                      ▼                         ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ LeaseVault (Soroban)                                         │
 │  lease state · deadlines · bounded arbitration · bonds       │
 │  public calls: claim_unpaid, release, execute_claim,         │
 │                expire_dispute, refund_no_keys,               │
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
| LeaseVault (Soroban, built during the hack) | Holds the first rent and the guarantee, enforces every lease rule | [`CB3RTZPIIKNJFNR6S5DUY37RUPBTEWFLFCHO5Y7YORPSAC5EDFYWH3JO`](https://stellar.expert/explorer/testnet/contract/CB3RTZPIIKNJFNR6S5DUY37RUPBTEWFLFCHO5Y7YORPSAC5EDFYWH3JO) (v5) |
| USDC (SAC) | Rent and guarantee asset. On testnet this is Blend's test USDC (`USDC:GATALT…F5V56`), the asset its pool lends | [`CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU`](https://stellar.expert/explorer/testnet/contract/CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU) |
| Blend v2 pool | Opt-in yield, accepted by both parties. Guarantee minus one month is supplied; one month and a 5 % tenant buffer stay liquid | [`CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`](https://stellar.expert/explorer/testnet/contract/CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF) |
| Lease Coordinator wallet (Stellar CLI) | Calls the public deadline functions; pays fees only, holds no user funds | see [`deployments/testnet.json`](deployments/testnet.json) |
| OpenZeppelin smart accounts (passkeys) | Face ID wallets for tenant and landlord | _front, next step_ |
| OpenZeppelin policy | Limits what an agent may sign on a smart account | _next step_ (no longer needed for unpaid rent: `claim_unpaid` is public) |

### LeaseVault rules

| Function | Who | Condition | Effect |
|---|---|---|---|
| `create_lease` | landlord | valid terms (guarantee ≥ 1 month); every window between the deploy's `min_window` and `max_window`; arbiter in the mediator registry | records rent, guarantee, deadlines, arbiter, yield option |
| `fund` | tenant | before the move-in deadline, arbiter still approved | locks first rent + guarantee (+ 5 % buffer with yield); supplies guarantee − 1 month to Blend if both parties opted in |
| `confirm_move_in` | both | same inventory hash, before the deadline | releases the first rent, starts the lease |
| `refund_no_keys` | anyone | deadline passed without move-in | everything back to the tenant |
| `pay_rent` | tenant | months left, during the lease or late after it ended | rent straight to the landlord |
| `claim_unpaid` | anyone (the coordinator) | due date + grace passed | one month from the guarantee to the landlord, the only possible recipient: liquid part first, then Blend |
| `end_lease` | either party | lease term reached | records the exit hash, opens the claim window |
| `claim_damage` | landlord | inside the claim window, ≤ the guarantee minus the months taken from it (`max_claim`: the tenant's buffer and yield share are never claimable), posts a bond | unpaid months paid to the landlord first, undisputed part refunded to the tenant at once |
| `respond` / `accept_counter` | tenant / landlord | inside the response window | settle at the claim or at the counter-offer |
| `execute_claim` | anyone | tenant silent | claim paid |
| `resolve` | arbiter | dispute open | splits the disputed amount between the two parties only; bond forfeited if the landlord gets < 50 % |
| `expire_dispute` | anyone | arbiter silent past the arbitration window | settles at the tenant's offer, bond back to the landlord: a guarantee can never stay locked, and inflating a claim earns nothing |
| `approve_arbiter` / `revoke_arbiter` | admin | — | curates the mediator registry; a revoked mediator can no longer be named or funded |
| `register_arbiter` | the mediator | registry open (testnet only) | joins the registry by signing, so judges can play the mediator; refused on a curated registry |
| `release` | anyone | claim window passed, no claim | months still unpaid to the landlord, then the rest + the tenant's yield share to the tenant |
| `exit_blend` | parties anytime; anyone if at risk | loss > 0.1 % or pool utilization ≥ 95 % | brings the position back; gain shared 70 / 20 / 10 |
| `propose_yield` | tenant or landlord | lease active, nothing invested, keeps ≥ 1 month liquid | records how much stays in the contract and the yield split; the tenant's buffer is locked if the tenant proposes, and never a second time if it is already in the contract |
| `approve_yield` | the other party | a proposal is pending | second approval lends `liquid − keep` on Blend; nothing moves before both approved |
| `cancel_yield` | tenant or landlord | a proposal is pending | drops it and refunds a locked buffer (also done automatically by `end_lease`) |
| `rate` | tenant or landlord | lease closed (no claim left open), once per party | scores the other party 1–5, recorded on the lease. It counts towards public reputation (`get_reputation`: score, leases, distinct counterparties, time rented) only if the lease met the minimum length and guarantee set at deploy (testnet: 180 s and 100 USDC) |
| `send_message` | tenant or landlord | the tenant is known (lease funded), payload 1–1,024 bytes | publishes the message, encrypted in the app for the two parties, and chains it into the thread hash (`get_thread`): no message can be dropped or edited afterwards. Moves no money |
| `bump` | anyone (the coordinator, daily) | lease exists | extends the storage life of the lease and its records, so a long lease is never archived between two payments |

Views: `get_lease`, `get_claim`, `guarantee_value`, `blend_at_risk`, `get_yield_proposal`, `get_ratings`, `get_reputation`, `max_claim` and `get_arbiter_record` (cases decided and share awarded to landlords, shown to the tenant before funding), `get_thread` (message count and thread hash).

Durations are lease parameters, so the demo runs with 1 month = 60 seconds. LeaseVault bounds them at deploy (testnet: 30 s to 90 days; a mainnet deployment would use days).

### Who decides a dispute

The parties sign everything that commits them. A human only steps in for one case: the tenant counters a damage claim and the landlord does not accept the counter-offer. That human is a mediator from the contract's registry, not someone the landlord picks: `create_lease` and `fund` refuse any other arbiter. The arbiter can only split the disputed amount between the two parties. If the arbiter stays silent, the dispute settles at the tenant's offer: the claimant carries the burden of proof, the guarantee comes back by default, and claiming the whole guarantee to anchor a split earns nothing. The agents never decide: they explain the rules and prepare transactions that the contract checks.

On testnet the registry is open (`openRegistry` in `deployments/testnet.json`) so anyone can try the mediator role; a production deployment sets it to false and the arbitration fund's operator approves mediators.

## Setup

Prerequisites: Rust with the `wasm32v1-none` target, Stellar CLI, Node 20+.
On Windows, Visual Studio Build Tools with the "Desktop development with C++" workload is required.

```bash
# Contract: 52 unit tests (lease lifecycle, unpaid rent, disputes, mediator registry and arbiter timeout, Blend yield and loss,
# mid-lease investment, ratings, bounded terms, arbiter records, damage cap, storage bump, messages)
cargo test -p lease_vault          # Windows: scripts\cargo.cmd test -p lease_vault
stellar contract build --package lease_vault

# Testnet: demo accounts, Blend test assets, deploy → deployments/testnet.json
bash scripts/deploy-testnet.sh

# Typed client for the front and the agents
stellar contract bindings typescript --wasm target/wasm32v1-none/release/lease_vault.wasm \
  --output-dir packages/lease-vault-client --overwrite
cd packages/lease-vault-client && npm install && npm run build && cd ../..
# after regenerating the client, restart the web app with `npm run dev -- --force` (Vite caches it)

# Agents
cd agents && npm install
npm test                           # rule engine and guards, offline
cd ..

# Web app (needs the client above)
cd front && npm install
npm run dev                        # http://localhost:5174/app
```

## Environment variables

See [`.env.example`](.env.example). The agents read `deployments/<network>.json` and take each role's key from `<ROLE>_SECRET_KEY` (`LANDLORD_SECRET_KEY`, `TENANT_SECRET_KEY`, `COORDINATOR_SECRET_KEY`…). In local development they fall back to the `stellar keys` identity `fiavel-<role>` created by the deploy script. Secrets never go in the repo.

The web app's AI language help (translate, polish, summarize in the chat) needs `ANTHROPIC_API_KEY` on the server: a Vercel environment variable in production, or `front/.env.local` for `npm run dev`. It is read only by `front/api/assistant.ts` and the dev server, never sent to the browser. Without it, messages work and the AI buttons say the AI is off.

## Demo

- **Public app:** _URL to add after the Vercel deployment_ (root directory `front`, no environment variable needed)
- **Video (2–4 min):** _link to add_

The public demo runs without an Anthropic API key: the two optional AI helpers (chat language help, photo inventory analysis) show that they are off, and everything else works, including the agents, which never used a language model.

### In the web app

Run `npm run dev` in `front/` and open http://localhost:5174/app. The app creates three testnet wallets in the browser (tenant, landlord, arbiter) and switches between them from the sidebar, so one person can play the whole lease:

1. **Get test funds** for each role (Friendbot XLM and Blend test USDC).
2. **Landlord → New lease** (demo mode: 1 month = 1 minute, yield option on), then copy the invite link.
3. Open the invite: the **Tenant Guardian** explains every rule with the lease's own values. **Lock** the first rent and the guarantee, with or without the Blend option.
4. **Move-in inventory** (lease page → Inventory → Start): photos room by room; **Analyse with AI** lists the defects already there, which you check and edit. Save, send the file to the other party, then both **confirm move-in** with the same inventory hash. Photos stay on the device; only the hash goes on-chain.
5. Pay rent from **Payments**. Leave a month unpaid: after the grace period the **Landlord Assistant** proposes to take it from the guarantee. Ask it to "seize the whole guarantee now" to see the refusal.
6. Open the lease and write in **Messages**: switch roles to answer. Each message is encrypted for the two parties and chained on-chain; the receiver can **translate** it, the writer can **polish** a draft, and either can **summarize** the thread with AI. A rule mentioned in a message links to the rule engine's explanation.
7. Do the **move-out inventory** (same rooms), **end the lease** with it, then **Compare move-in and move-out**: the AI sorts new damage from wear and pre-existing defects, the landlord ticks what they claim for, and the evidence hash is filled in the claim.
8. Let anyone **release** the guarantee after the claim window, or file a **damage claim**, answer with a counter-offer, and let the **arbiter** split the disputed amount.

Every action shows a toast with its Stellar Expert link. The Activity page is rebuilt from contract events.

### From the command line

The full pitch scenario runs against testnet in about 5 minutes (1 month = 60 s):

```bash
cd agents
npm run demo                 # offer → funding with Blend deposit → co-signed move-in → refusal scene
                             # → rent paid → unpaid month taken from the guarantee → end → release by the coordinator
npm run status -- 0 tenant   # what a role sees and can do on lease #0
npm run explain -- 0 "what if Blend gets hacked?"
npm run history -- 0         # payments and settlements, rebuilt from contract events
npm run risks -- 0           # red flags in the terms of lease #0 (windows, guarantee, arbiter's record)
npm run coordinator          # the Lease Coordinator loop (every 10 s; keeps open leases alive once a day)
```

The agents are deterministic: `src/rules.ts` mirrors every condition of the contract, `src/explain.ts` has one template per rule filled with on-chain values, `src/guards.ts` refuses any call outside the rules before a transaction is even built. In the refusal scene, the guard refuses "seize the whole guarantee now", then a forced call is rejected by the contract (`WrongStatus`).

## On-chain evidence (testnet)

**LeaseVault v5 (current, `CB3R…H3JO`)**, lease #0 played end to end in the web app on 25 October (demo mode, 1 month = 1 minute):

| Step | Transaction |
|---|---|
| Landlord creates the lease, naming an approved mediator from the registry | [8291b5f2…](https://stellar.expert/explorer/testnet/tx/8291b5f28d62bbfd83c695625e26c451230f30d86be632a77742bf3cf368ea77) |
| Tenant funds 310 USDC with the yield option: 100 USDC supplied to Blend in the same transaction | [51955ee0…](https://stellar.expert/explorer/testnet/tx/51955ee077d063a17f2db9f933daaff2174ba95df287871f58a1079bf8bb6740) |
| Move-in co-signed with the same inventory hash, first rent released | [97ac3e66…](https://stellar.expert/explorer/testnet/tx/97ac3e664a017a7bffdee3c4d818c90b49ab2ed470d34a93b4d5fa5e51c4a9d0) |
| Rent paid | [0d82efe4…](https://stellar.expert/explorer/testnet/tx/0d82efe431158b9235e7326fef4fbe05bc0a6bae33d41c2c8e73f8f1fddfca34) |
| Unpaid month taken from the liquid part, Blend untouched | [f4ad87dc…](https://stellar.expert/explorer/testnet/tx/f4ad87dc47996acdb771ee42172bb0585bb7d3b82eac36804adc826a71c88b35) |
| Lease ended, exit inventory hash recorded | [71a2376a…](https://stellar.expert/explorer/testnet/tx/71a2376ac1c1b1f4b2f92b413cd7406ac2603865c822af7822dcbc2b090b3a03) |
| Damage claim of 100 USDC (the cap: guarantee minus the month taken). Blend withdrawn (gain 588 stroops); the 10 USDC buffer and the tenant's 70 % of the gain refunded at once | [73aab042…](https://stellar.expert/explorer/testnet/tx/73aab042b7e18d7330547797a0dbe7f4085fd71b080bd29e7b8f2eb4d4964553) |
| Tenant counters at 50 USDC | [101f7174…](https://stellar.expert/explorer/testnet/tx/101f7174c017f8f12e4fb549e6f3536753a4f4043f974dec1df2819561f01ca8) |
| Arbiter silent for 2 minutes: settled at the tenant's offer, 50 USDC to the landlord and 50 to the tenant (halfway would have been 75 / 25) | [f70951d3…](https://stellar.expert/explorer/testnet/tx/f70951d3a713a4a14b28c5bd5b8d728ee271c13413f3d2b223a639bc922fa499) |
| Mediator registry: deploy's mediator, then the web app's arbiter wallet joining by signing (open registry on testnet) | [b6e12f23…](https://stellar.expert/explorer/testnet/tx/b6e12f2378e748246fca9f481749943f5905777c6d4451d1da7b4e1b4c6b92cc), [07b66a5e…](https://stellar.expert/explorer/testnet/tx/07b66a5e4db92c23c266273c353eab367b28a676d8e9f05fa45b1b14947f2fb1) |

Earlier versions, kept as history.

LeaseVault v3 (`CCSWLUOQ…SEJAZ`), two leases played in the web app:

| Step | Transaction |
|---|---|
| Lease #0: an unpaid month paid to the landlord, triggered from the arbiter's wallet (no landlord signature) | [b3b318a9…](https://stellar.expert/explorer/testnet/tx/b3b318a9d96eb4ec8dbc8ff0aa7d336268e823f40822f800f40a9a2207885da8) |
| Lease #0: release with the last month unpaid: 100 USDC to the landlord first, the rest to the tenant | [4ba60edd…](https://stellar.expert/explorer/testnet/tx/4ba60edd07891696a5ae0dc0fca7c1c116b8c259b5520511c316c1ec381c2895) |
| Lease #1: claim of 150, offer of 75, arbiter silent for 2 min: settled halfway (112.50 / 37.50), the v3 rule, since replaced by the tenant's offer | [053063f6…](https://stellar.expert/explorer/testnet/tx/053063f62d895a0b0e1a3e62bce00ba6109b9be3dcb8756bad7888f940540e36) |

LeaseVault v2 (`CDR2QYEL…GBRXP`), lease #0 played in the web app, then lease #1 for a rating below the thresholds:

| Step | Transaction |
|---|---|
| Landlord proposes to invest 100 USDC mid-lease | [a11139a7…](https://stellar.expert/explorer/testnet/tx/a11139a74ab75e19ad6cf23a4c6171e5933e6e954acd87ecb851f0bb93babbc7) |
| Tenant approves: buffer locked, 100 USDC supplied to Blend | [5056e64b…](https://stellar.expert/explorer/testnet/tx/5056e64b2ba6ae52422a8becc3816f92842b6fd38a5b7d0b92c83323456618e6) |
| Tenant stops the option (Blend withdrawal, real gain of 59 stroops) | [a61980a4…](https://stellar.expert/explorer/testnet/tx/a61980a4526da3fd2d359b76cba75543cb56153c8118dd675292903eddca776f) |
| New proposal: no second buffer asked | [c9214da1…](https://stellar.expert/explorer/testnet/tx/c9214da102db66a424024fc30a0912a33dac2bb62440f565112050f694f93c79) |
| Landlord approves: 110 USDC supplied | [c092611f…](https://stellar.expert/explorer/testnet/tx/c092611f0e0cdefd96c9717547d0b6a9d766cf2af47281caa22848e85023b9be) |
| Unpaid month taken from the liquid part | [0f3c41e4…](https://stellar.expert/explorer/testnet/tx/0f3c41e468cb6e48d1ce544f1a782cd867b6c7ad3f4dfb244b8ca3a09a75c23e) |
| Ratings, counted (3-month lease) | [ec91d1aa…](https://stellar.expert/explorer/testnet/tx/ec91d1aa6f19c5027a7ac4b2ed16142dd0c062211aca5b839633bc114dc6abe5), [327b125a…](https://stellar.expert/explorer/testnet/tx/327b125a514e52c2c99d98644f20f80a641f2210a5d7e2d30d4e51c5af673da6) |
| Release: back from Blend, refund to the tenant | [bed082ad…](https://stellar.expert/explorer/testnet/tx/bed082ada5e1f0e78713c5b83546e4779637908601408e61af90a36017b0811c) |
| Rating on a 1-minute lease: recorded, not counted | [cd13c0c0…](https://stellar.expert/explorer/testnet/tx/cd13c0c0e28573a93471c27b84560264e5f5c407711f2ab85f8486dcff80f9c9) |

Earlier demo run (lease #0 on LeaseVault v1 `CCPX4XT2…TKMD`, by the agents' CLI), from [`deployments/testnet-demo.json`](deployments/testnet-demo.json):

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

### LeaseVault v5

v5 (deployed, `CB3R…H3JO`) merges the two v4 branches: the mediator registry and the tenant's-offer rule on arbiter silence (`main`), plus bounded
lease windows, a public record of every arbiter's decisions, `bump` and tenant-landlord messages (`audit-p0`, `messaging`).
Both cap a damage claim at the guarantee minus the months taken from it. The app shows the Messages card only on a contract
that answers `get_thread`.

### Inventory with photos (état des lieux)

Most deposit disputes are "it was already there" against "it was not". Fiável makes the move-in inventory precise and the move-out comparison neutral:

- **Room by room, with photos.** Each room has up to 6 photos (resized in the browser), notes and a list of defects. At move-in,
  **Analyse with AI** lists what is already damaged or worn and what the photos do not show; the author checks and edits every line.
- **One hash for everything.** The inventory hash commits to every room, note, defect and photo (each photo by its SHA-256), and is
  what `confirm_move_in` and `end_lease` record. The inventory travels as a file between the parties; the app accepts a file only
  if its hash and every photo check out, and warns before anyone co-signs a hash whose photos they have not seen.
- **Move-out comparison.** Rooms are paired by name; code flags rooms documented on one side only and move-out photos that are
  byte-for-byte move-in photos. The AI compares each room and labels every change: new damage, normal wear, already at move-in,
  cleaning, missing item or unclear, with a confidence and the photos it relies on.
- **The AI never decides.** It does not price damage, assign blame or give legal advice (`front/server/inventory.ts`, structured
  output validated by code). The landlord picks the items they claim for and adds an invoice reference; the evidence hash of the
  claim commits to those items and the report, so the tenant and the arbiter can check exactly what is claimed. The amount still
  goes through the contract: answer, counter-offer, bounded arbiter.

### Messages between tenant and landlord

- **Encrypted end to end.** Both parties already have a Stellar key; the app converts them to X25519, derives a key per lease
  (HKDF, bound to the lease id) and encrypts with XChaCha20-Poly1305, authenticating the sender's address. The other party's
  public key is its address on the lease, so there is nothing to exchange. The contract, the RPC and the arbiter only see ciphertext.
- **Tamper-evident.** `send_message` keeps `sha256(previous || sender || seq || payload)` on-chain. The app recomputes it and shows
  "All N messages match the thread hash"; the same test vector is checked in Rust (`thread_hash_matches_the_app`) and in the app.
- **Hybrid AI, bounded.** Lease rules keep coming from the deterministic rule engine. Claude only rewrites text the user picks
  (`front/server/assistant.ts`: translate, polish, summarize, in English, French or Portuguese), with no tools and no access
  to keys or the chain. Every rewrite is shown for review before sending, and code compares the numbers in the original and the
  rewrite: a changed amount or date is flagged.

### Known limits

- The two AI helpers (chat language help, photo inventory analysis) need `ANTHROPIC_API_KEY` on the server. The public demo runs without one to stay at zero cost: they report that they are off. Their code and tests are in the repo (`front/server/`).
- Testnet only. Wallets are test keypairs kept in the browser (`localStorage`); real use needs passkey smart accounts.
- The optional team sign-in is a client-side check for demos, not access control.
- `react-router-dom` 6.30 has two moderate advisories (SSR hydration, open redirect through user-supplied paths). The app is client-side only and navigates to paths it builds itself; moving to v7 is planned after the event.
- Inventory photos are kept on the device that took or imported them (IndexedDB). Each party should keep the file: it is the evidence
  the on-chain hash proves. AI analysis sends a room's photos to the Claude API when a party clicks it.
- Messages: who wrote, when and the length are public; only the content is encrypted. A device keeps the messages it has seen;
  a new device sees only what the RPC's event history still holds. Losing a wallet key means losing access to its messages.
- Reputation is costly, not impossible, to fake: ratings only count above a minimum lease length and guarantee, and the number of distinct counterparties is shown.

### Testnet notes

- Testnet resets every quarter: `scripts/deploy-testnet.sh` recreates everything.
- Testnet storage rent is currently very high (extending an entry to 120 days cost ~50k XLM), so LeaseVault keeps entries at the 7-day network minimum and every call on a lease extends it. A mainnet build would extend for longer.
- Over a 5-minute demo the real Blend yield is a few stroops; the app shows the real balance and a projection, never a simulated yield.

## Prior work disclosure

Before the hackathon: product research and planning (`docs/PLAN.md`), repository scaffolding (Soroban workspace via `stellar contract init`) and a hello-world contract to verify the toolchain. The web app (`front/`) was also written during the event: the repository's first commit is on 25 October at 11:08, and every commit since is in the history. All LeaseVault code is written during the event.

## Use of AI

- **In the product:** Fiável agents are deterministic (rule engine, no LLM): they explain lease rules from templates filled with on-chain values and prepare unsigned transactions; they never sign for users. LLM use is limited to two helpers, both on the user's click, with no tools and no access to keys, funds or lease rules (Claude through the Anthropic API): language help in the tenant-landlord chat (translate, polish, summarize; changed figures are flagged by code), and the photo inventory (defects at move-in, changes at move-out; never a price or a decision, every line reviewed by a party).
- **To build:** most of the code was written with an AI coding assistant (Claude Code), reviewed and tested by the team. Every commit produced in an AI session carries a `Co-Authored-By: Claude` trailer and a link to the session (`Claude-Session:`), which serves as the prompt log; `git log --grep "Claude-Session"` lists them. Product research and planning (design thinking, scoring against the rubric) were also done with Claude.
