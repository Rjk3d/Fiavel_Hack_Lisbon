# Integration of rental reputation

The `frontend-yacin` branch contains the rental reputation changes from `37bc9b9` plus a normal merge of `main` at `18481c6`. No rebase, force push, hard reset or replacement of the existing application is involved.

## Architecture and preservation

- `front/` remains the existing React 18 / Vite 5 application connected to LeaseVault v5. Its wallet, funding, messaging, inventory, disputes and contract-rating paths are preserved.
- `frontend/` remains the independent React 19 / Vite 8 reputation demo, with its own package lock, local API, private SQLite store and explicit fictional provenance. Dependencies are installed separately; there is no root package migration or shared React runtime.
- The new off-chain review workflow is **not** a replacement for `front/`'s existing ratings, nor is it automatically exposed by the existing production deployment. Launch it from `frontend/`; see `frontend/REVIEWS.md`.
- `contracts/`, `agents/`, `packages/`, `deployments/`, `front/`, existing root scripts and the existing `ci.yml` are preserved byte-for-byte against this main baseline. Only the additive reputation CI workflow, integration report and README navigation are introduced at the repository level.
- Trusted production identity and completed-tenancy evidence still require host integration before live reputation can be enabled. No financial contract or transaction method is called by the new review API.

## Validation commands

For reputation, run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` from `frontend/`. Chrome is the local default; `PLAYWRIGHT_CHANNEL=chromium` selects Playwright's installed Chromium in CI.

For the preserved application and agents, first install/build `packages/lease-vault-client`, then use the existing `front/` and `agents/` scripts. Contract validation follows `AGENTS.md`: host tests with `cargo test -p lease_vault`, WASM with `stellar contract build`.

`.github/workflows/reputation.yml` adds reputation checks using Node 22 and a browser installed by Playwright. Existing CI jobs are left intact. Local results and environment limitations are recorded below before publication; no unexecuted check is treated as passing.

## Executed results before publication

- Reputation (`frontend/`): 82 unit/integration tests passed, lint passed, TypeScript/production build passed, all 5 Chrome browser tests passed (42.4 seconds on the final run).
- Existing app (`front/`): 82 tests in 9 Vitest files passed; existing production build, including the generated client's prebuild and TypeScript checks, passed.
- Existing agents: all 22 tests and the TypeScript check passed.
- Existing contract: all 52 LeaseVault host tests passed. `stellar contract build --package lease_vault` succeeded. Nothing was deployed or signed.
- Generated Stellar client: installation and TypeScript build passed without changing its source or package lock.
- Preservation: `git diff --quiet origin/main -- front contracts packages agents deployments scripts .github/workflows/ci.yml AGENTS.md Cargo.toml Cargo.lock` returned zero. There are no deletions relative to main. Local uncommitted work in the original workspace was not reset, stashed or overwritten.

An initial browser run timed out while closing Chrome during concurrent Rust builds; the complete isolated rerun passed. An initial agents test failed before executing business assertions because the sandbox could not resolve its Windows account (`uv_os_get_passwd`); the rerun with the normal account passed. An optional local YAML parser was unavailable; the workflow uses the same GitHub Actions structure as the existing CI and its hosted result is not claimed here.

The integration was first published to `frontend-yacin`. On 26 October 2026, the user explicitly requested its publication to `main`. The existing main commit `18481c6` is an ancestor of the tested integration commit `1ca4bfa`, so integration into main uses a fast-forward and preserves all existing history. Only these publication notes change after that tested integration.

Publishing to main does not by itself deploy the alternate demo or activate live reputation in `front/`. The reputation workflow is available under `frontend/`; production activation requires a separate authenticated integration and review of verified tenancy evidence.
