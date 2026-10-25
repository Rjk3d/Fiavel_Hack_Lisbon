# Fiável frontend prototype

A local, frontend-only React 19 + Vite + strict TypeScript rental demo. Uses React Router, Tailwind CSS v4, Lucide icons, and bespoke responsive CSS with the supplied brand tokens. No backend, wallet, AI provider, or Soroban contract is connected.

## Run

From `frontend`:

```sh
npm install
npm run dev
npm run build
npm run lint
node scripts/check-demo.cjs
```

On Windows PowerShell with restricted script execution, use `npm.cmd` instead of `npm`.

## Routes

- `/`: public landing with product preview and mobile menu.
- `/app`: distinct tenant / landlord overview; role switcher is shared across routes.
- `/app/lease`: lease facts, lifecycle, claims, activity, and expandable blockchain configuration. Landlord can select either lease via `?id=lease-alvalade`.
- `/app/payments`: status filters, accessible native detail dialog, tenant payment review and explicit simulation confirmation.
- `/app/deposit`: primary Arroios deposit, release explanation and state distinctions.
- `/app/assistant`: deterministic, role-aware demo chat; `?q=...` prefills a question for review before sending.
- `/app/activity`: filterable Arroios events plus session simulations.
- `/app/disputes`: landlord claim preparation, native form validation, review, edit and local confirmation. Tenant receives contextual guidance.
- Unknown paths show a recovery link.

## Architecture

- `src/app/`: routing layout, shared session state and role preference hook.
- `src/components/ui.tsx`: brand, cards, badges, lifecycle, deposit hero, accessible native modal and technical details.
- `src/pages/`: landing, dashboards, rental workflows and assistant.
- `src/lib/types.ts`: Lease, User, Transaction, Dispute, Review and assistant types.
- `src/lib/demo-data.ts`: single fictional dataset, fixed scenario date **25 October 2026**. Ana: €900 rent / €1,800 deposit; Leo: €1,100 / €2,200. Next rent: **1 November 2026**.
- `src/lib/demo-agent.ts`: deterministic replies, separate from rendering; includes a read-only rental adapter.
- `src/lib/services/contracts.ts`: backend, assistant and Stellar interfaces; Stellar adapter explicitly disconnected.
- `src/lib/formatters.ts`: consistent euro and UTC date presentation.
- `src/index.css`: exact palette, reusable component styling and responsive breakpoints. Tailwind is enabled through Vite.

Only the selected demo role persists in browser storage. Payment simulations and claim drafts are in-memory and reset on refresh. Seeded activity refers to Arroios and is labeled accordingly in landlord view. Payment simulations are separately identified from original records. No fabricated addresses, hashes, explorer links, confirmations, or legal/audit claims are used.

## Integration and remaining work

Implement adapters for authenticated backend records, wallet authorization, Soroban reads/writes and verified transaction state. Replace the deterministic assistant through `AssistantService`. Add real evidence uploads, final contract-specific deadlines and permissions, production authentication and authorization, public reviews, human arbitration, and end-to-end browser tests. The prototype deliberately does not invent lease release deadlines or execute transfers. Deep-link hosting must serve `index.html` for application routes.

Validation: production build, ESLint, and domain assertions are available above. Desktop/mobile CSS is implemented; visual browser QA must still be performed in a browser-capable environment.

## Team login

`/app/*` requires a sign-in at `/login`; the landing page stays public. Sessions last 8 hours (tab session), and 5 wrong attempts lock the form for 30 seconds.

The password is not in the repository: only its PBKDF2-SHA256 hash (`src/lib/auth.ts`). To change it:

```sh
node scripts/hash-password.mjs "<new password>"   # prints VITE_ADMIN_SALT / VITE_ADMIN_HASH / VITE_ADMIN_ITERATIONS
```

Put the output in `frontend/.env.local` (git-ignored), optionally with `VITE_ADMIN_USER`, then rebuild.

This is a client-side gate for demos. A static site cannot enforce real access control: protect real data on a server.
