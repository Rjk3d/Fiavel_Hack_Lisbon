# Crypto-to-USDC escrow funding: audit, implementation and verification

Date: 25 October 2026. Base: `main` at `947d77e`. Implementation branch: `crypto-usdc-yacin`.

This work targets the actual connected application in **`front/`**, not the alternative `frontend/` prototype on `frontend-yacin`. It preserves LeaseVault v3, its generated bindings, current authentication, routes, wallets, investment and settlement rules. No contract was redeployed or changed.

## Verified technical audit

| Question | Verified result | Consequence |
|---|---|---|
| Network | Deployment manifest, Horizon network passphrase and RPC all identify **Stellar Testnet** | New funding flow rejects other networks, including Mainnet |
| Actual accepted token | Live `get_config().token` equals `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` | Destination token is checked against the deployed contract before funding/conversion |
| Classic identity | `USDC:GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56`; SDK-derived SAC ID matches that token | This is **Blend test USDC**, not a claim about Circle Mainnet USDC; symbol alone is insufficient |
| Trustlines | Classic account must hold an authorized trustline for this exact issuer, with sufficient receive capacity | Missing line, revoked authorization, selling/buying liabilities and receive limits block the quote |
| Funding ABI | `fund(id, tenant, accept_yield)` transfers `rent + deposit + optional buffer`, then records tenant and `Funded` | A 1,800 USDC guarantee with 900 rent requires **2,700 USDC**, or 2,790 with an accepted 5% buffer; deposit-only funding is not supported |
| Custody | Contract transfers from the tenant to itself; optional existing Blend rules may supply part of the guarantee | This flow never pays the landlord; co-signed move-in and later settlement rules remain unchanged |
| Wallet | Existing browser-created testnet Keypair per role; no Freighter/passkey signer currently implemented | Explicit UI review gates the existing signer. Only tenant role is allowed. No new key storage, seed requests or key transmission |
| Guarantor | `fund` sets the payer as the lease tenant/refund recipient | A distinct guarantor is **unsupported**; allowing one silently would change ownership/refund rights |
| Atomic routing | No installed/verified Soroban swap router or swap-and-fund entry point; current contract accepts its configured token only | Do not claim atomic swaps; use direct funding or the two-stage approach |
| XLM liquidity | Read-only Horizon Strict Receive queries returned **0 routes for both 1,800 and 2,700** configured test USDC | XLM conversion is unavailable at those amounts at inspection time; selector disables unavailable quotes rather than using a static rate |
| Other assets | Classic assets actually held in the wallet are queried for this exact destination; best returned exact-output route is selected | Asset/issuer identity, balance, authorization and liquidity must all pass before selection |
| External chains / custom Soroban tokens | No bridge, on-ramp, token discovery service or Soroban router is integrated | BTC/ETH on their own chains and arbitrary contract-only tokens are not offered |

Stellar [Strict Receive](https://developers.stellar.org/docs/data/apis/horizon/api-reference/list-strict-receive-payment-paths) discovers routes for a fixed destination amount. The [protocol's Soroban transaction rules](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-07.md) require a single operation, so adding a classic path payment and a Soroban invocation as two operations is not an atomic solution. A verified contract router/composition would be needed for an atomic contract-only route; none is supplied here.

## Implemented architecture

1. Verify Testnet, the issuer-derived SAC, and LeaseVault's live token configuration.
2. Read the actual lease, funding deadline, wallet balances, liabilities, account reserve and trustline authorization/capacity. Required amount follows the existing `fund` ABI, not a new deposit rule.
3. **Direct USDC:** if enough spendable configured USDC exists, skip conversion. Simulate the real Soroban funding call, enforce a fee ceiling, sign using the existing tenant wallet, and submit.
4. **Classic asset conversion:** quote only the USDC shortfall after applying existing spendable USDC. Query Horizon Strict Receive, choose the lowest source amount among exact-output routes, and add an integer-rounded maximum spend. The signed payment receives USDC into the payer's own classic account, never the landlord's wallet or an app custodian.
5. Persist the signed envelope/hash before submission. Confirm the swap using the immutable transaction reference. **Do not automatically sign funding**: the user must review and approve the second transaction.
6. Persist the funding envelope/hash before submission, then read RPC status and the actual lease. Success requires transaction success **and** `Funded`, the intended tenant, matching lease creation identity, first-rent escrow and guarantee/buffer principal.

Amounts use 7-decimal `bigint` units throughout the funding engine. No exchange-rate or financial amount calculation uses floating-point arithmetic. Displayed source/rate data comes from the executable route. Horizon does not supply an independent price-impact/LP-fee breakdown; the UI states that limitation rather than inventing one.

Default slippage: **50 basis points**, hard cap **100 basis points**. Quote lifetime: **30 seconds**. The swap's on-chain maximum time matches quote expiry. Immediately before signing the engine refreshes lease, network, balances, fee and route: an expired quote, changed route, or source requirement above the approved maximum is rejected. On-chain `sendMax` protects the source amount if liquidity changes after signing. See [Strict Receive failure codes](https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/result-codes/operation-specific/path-payment-strict-receive) for trust, reserve and liquidity failures.

Classic fee uses Horizon's current p90, capped at 0.1 XLM. Funding has an explicitly disclosed **10 XLM fee ceiling**. This ceiling is a budget, not an estimated charge; a simulated Soroban fee above it is refused. The initial quote reserves that budget plus the classic fee in spendable XLM. Exact Soroban resource fees cannot always be simulated before a shortfall conversion, since the unfunded transfer would fail. This is a deliberate two-stage limitation disclosed on review; after conversion a refused funding fee leaves USDC in the payer account.

## Recovery and duplicate prevention

- Scope includes network passphrase, vault, token, payer and lease ID. Lease creation time and total are rechecked to guard against stale/reset deployment state.
- `localStorage` holds a versioned attempt plus a transaction-reference journal containing signed envelopes, hashes and expirations. It never receives private keys from this engine. Storage failure stops execution before broadcast; it is never swallowed.
- A pending transaction blocks a new conversion. An in-process guard and browser Web Locks (when available) block concurrent requests for the same scope. Chain timebounds/sequence and the contract's Created-only transition provide additional protection.
- Submission errors/timeouts are **uncertain**, not proof of failure. Check the saved hash; a manual rebroadcast submits exactly the same signed envelope/hash. No automatic fresh transaction, price change or additional swap is created.
- Missing hashes stay pending until an ingested ledger has passed their signed timebound, with an additional grace interval. A chain-reported failure permits a reviewed retry. Prior identifiers remain in the journal.
- If the swap confirms but the second approval is cancelled or funding fails, the conversion reference is retained. Reopening the deposit page offers **Check status or resume funding**, even if the lease has moved to Funded. It never trusts a locally cached success without new chain checks.
- If the deadline passes, the engine refuses funding and explains that converted USDC belongs to the payer wallet. It never transfers assets elsewhere as an automatic “recovery”. Check current balance if that wallet has been used outside this flow.

Recovery relies on the same existing demo wallet/browser storage. Clearing its key storage can lose access to that test wallet, an existing architectural limitation. This is not a production custody solution. Production requires a real externally controlled wallet adapter and durable account-scoped attempt storage, in addition to the existing network guards. Mainnet remains deliberately blocked.

## UI integration and files

| File | Purpose |
|---|---|
| `front/src/stellar/funding/domain.ts` | Exact amounts, funding requirements, quote/asset/attempt interfaces and validation |
| `engine.ts` | Discovery, exact-output quotes, revalidation, duplicate guards, two-stage execution and recovery |
| `stellar.ts` | Existing SDK/client/wallet adapter; Horizon discovery, reserves, trustlines, XDR preparation/validation, RPC submission/state reads |
| `storage.ts` | Scoped attempt and reference-journal persistence |
| `front/src/components/live/FundingDialog.tsx` | Select asset, quote review, separate approvals, progress, verified success and recovery |
| `ActionPanel.tsx` | Routes every existing fund dialog, including assistant-prepared actions, through the new engine |
| `front/src/pages/live/MoneyPages.tsx` | Deposit-page funding and saved-attempt entry points |
| `front/scripts/check-funding-network.mjs` | Repeatable **read-only** network/token/liquidity probe |
| `funding.test.ts`, `stellar.test.ts`, `FundingDialog.test.tsx` | Deterministic engine, real SDK envelope and initial render tests with injected network replies |

The existing purple design tokens and accessible responsive `Dialog` are reused. No replacement router, authentication flow, external wallet framework or smart contract was introduced. A build-script fix uses locked `npm ci` for the generated client; the original prefix-based `npm install` added an unintended circular local dependency during validation. That generated manifest change was removed.

## Run this implementation

From the workspace root, this branch is in the isolated worktree `.funding-integration/`:

```sh
cd .funding-integration/front
npm ci
npm run build
npm test
npm run typecheck
npm run dev                # http://localhost:5174/app/deposit
npm run audit:funding      # read-only Testnet probe; no wallet or signature
```

In a standalone checkout of `crypto-usdc-yacin`, use `cd front` instead of the workspace worktree path.

Use `npm.cmd` in restricted Windows PowerShell. Build prepares the existing generated client. Configuration remains centralized in `src/stellar/config.ts` and `deployments/testnet.json`; no new key or environment variable is required. Changing RPC/Horizon/vault through existing public overrides cannot bypass network or accepted-token checks. No new secret-bearing VITE variable is added.

## What was tested

Read-only live verification executed:

- Issuer/SAC derivation matched the deployment.
- RPC `get_config` returned the configured escrow token.
- Horizon/RPC identified Testnet; Horizon reported protocol 29.
- The script found **0** XLM paths for 1,800 and 2,700 configured test USDC.
- No wallet was funded, no offer was created, no swap was signed/submitted, and no escrow funding transaction was executed by this audit.

Deterministic tests cover direct USDC, XLM conversion, minimal shortfall conversion, best route, insufficient XLM/USDC, reserves/liabilities, no route, underdelivery, expiry, excessive slippage, changed route limits, rejected signatures, uncertain swap submission, confirmed swap plus rejected/failed funding, verified success, unverified success refusal, duplicate calls, network mismatch, trustline/authorization/limit failures, wrong issuer, invalid contract configuration, timeout/pending recovery, identical-envelope rebroadcast, storage failure and scope separation. SDK tests inspect real encoded/signed test envelopes against injected network replies. Render tests verify totals, network/signer/guarantor disclosures and initial success gating. These tests do not establish live financial execution.

There is no lint script in the existing `front/package.json`; validation uses strict TypeScript and the available Vitest suite. No contract code changed, so no new contract build/deployment was performed. The production bundle includes the existing SDK and emits Vite's large-chunk advisory.

### Manual end-to-end checklist (not executed here)

1. On Testnet, create a lease through the existing landlord flow and fund the existing tenant test wallet using the existing setup. Confirm the exact issuer/trustline and allow enough funding time. Follow the invite as tenant.
2. On Deposit select direct USDC. Review first rent + guarantee (+ buffer only when explicitly accepted), fee ceiling and tenant/refund identity. Approve; verify the real transaction and Funded lease before treating it as locked.
3. For a wallet lacking enough USDC, select XLM or a held classic asset **only if** Horizon offers sufficient liquidity. With the current zero-route observation, the expected behavior is a disabled conversion, not a success demonstration.
4. When liquidity is available, approve conversion, close before the second approval, reload, reopen the saved attempt and resume. Confirm the first hash is unchanged and the swap is not repeated. Then approve funding and verify contract state.
5. Test network loss after submission and before confirmation; use Check status and identical-envelope rebroadcast. Verify failure/expiry on chain before retrying.
6. At 390×844 and desktop width, check no horizontal overflow, readable issuer/transaction wrapping, accessible dialog focus/escape/return, visible buttons/input and scrolling through quote/recovery content. Keyboard and mobile interaction were **not browser-verified** because the available browser inventory was empty.

## Remaining requirements for broader support

- A real quote route/liquidity to the configured Blend test asset is needed for live conversion. This change does not invent a market or create artificial offers.
- A distinct guarantor needs a reviewed contract/API extension separating payer authorization from tenant/refund ownership (for example a properly designed `fund_for`), updated bindings and contract tests. The current method cannot provide it safely.
- Atomic conversion requires a verified compatible router, liquidity, authorization tree and funded contract composition, with contract-level tests. The classic-plus-Soroban transaction combination is not used.
- External chains need explicit bridge/on-ramp settlement adapters, destination asset/network checks and additional recovery semantics before being advertised as supported.
- Mainnet, externally controlled wallet signing, production custody, browser/mobile end-to-end execution and actual financial network execution remain unverified/unsupported here.
