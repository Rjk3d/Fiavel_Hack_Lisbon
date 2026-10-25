# Fiável frontend prototype

A local React 19 + Vite + strict TypeScript rental demo. Uses React Router, Tailwind CSS v4, Lucide icons, and bespoke responsive CSS with the supplied brand tokens. The contextual assistant includes an optional server adapter, disabled until trusted session/data adapters and a model gateway are configured. No live backend, wallet, AI provider, or Soroban contract is connected.

See [AI_AUDIT.md](AI_AUDIT.md) for verified findings and fixes, and [AI_SETUP.md](AI_SETUP.md) for setup, environment configuration and evaluation. Node 22.20+ is required for the server and tests. Use this workspace's `frontend/` to test these changes. Publication uses the isolated clone on the `frontend-yacin` branch.

## Run

From `frontend`:

```sh
npm install
npm run dev
npm run build
npm run lint
npm test
node scripts/check-demo.cjs
```

On Windows PowerShell with restricted script execution, use `npm.cmd` instead of `npm`.

## Routes

- `/`: public landing with product preview and mobile menu.
- `/app`: distinct tenant / landlord overview; role switcher is shared across routes.
- `/app/lease`: lease facts, lifecycle, claims, activity, and expandable blockchain configuration. Landlord can select either lease via `?id=lease-alvalade`.
- `/app/payments`: status filters, accessible native detail dialog, tenant payment review and explicit simulation confirmation.
- `/app/deposit`: primary Arroios deposit, release explanation and state distinctions.
- `/app/assistant`: contextual French/English chat, authorized demo lease selection, current session payment/claim state, private drafts and action cards; `?q=...` prefills a question for review before sending, `?id=...` selects an authorized lease. Optional backend mode requires explicit configuration and consent.
- `/app/activity`: filterable Arroios events plus session simulations.
- `/app/disputes`: landlord claim preparation, native form validation, review, edit and local confirmation. Tenant receives contextual guidance.
- Unknown paths show a recovery link.

## Architecture

- `src/app/`: routing layout, shared session state and role preference hook.
- `src/components/ui.tsx`: brand, cards, badges, lifecycle, deposit hero, accessible native modal and technical details.
- `src/pages/`: landing, dashboards, rental workflows and assistant.
- `src/lib/types.ts`: Lease, User, Transaction, Dispute, Review and assistant types.
- `src/lib/demo-data.ts`: single fictional dataset, fixed scenario date **25 October 2026**. Ana: €900 rent / €1,800 deposit; Leo: €1,100 / €2,200. Next rent: **1 November 2026**.
- `src/lib/ai/`: structured context, role/record visibility, multilingual contextual responses, bounded private chat memory, runtime schemas and backend client. `demo-agent.ts` retains compatibility exports.
- `server/`: optional HTTP/session/data adapter boundary and configurable JSON model gateway. The default launcher rejects live use until real trusted adapters are supplied.
- `src/lib/services/contracts.ts`: backend, assistant and Stellar interfaces; Stellar adapter explicitly disconnected.
- `src/lib/formatters.ts`: consistent euro and UTC date presentation.
- `src/index.css`: exact palette, reusable component styling and responsive breakpoints. Tailwind is enabled through Vite.

Only the selected demo role persists in browser storage. Payment simulations, claim drafts and chat history are in-memory and reset on refresh. Chat survives route changes, is scoped by user/role/lease and has a clear control. Prepared landlord drafts are private in assistant context. Seeded activity refers to Arroios and is labeled accordingly in landlord view. Payment simulations are separately identified from original records. No fabricated transaction addresses, hashes, explorer links, confirmations, or legal/audit claims are used.

## Integration and remaining work

Connect the provided assistant handler to authenticated backend records and a configured gateway before enabling model-assisted intent interpretation. Wallet authorization, Soroban reads/writes, verified transaction state, real evidence uploads, final contract-specific deadlines, production authentication, public reviews, human arbitration and end-to-end browser tests remain integration work. The prototype does not invent lease release deadlines or execute transfers. Deep-link hosting must serve `index.html` for application routes.

Validation: production build, ESLint, and domain assertions are available above. Desktop/mobile CSS is implemented; visual browser QA must still be performed in a browser-capable environment.
