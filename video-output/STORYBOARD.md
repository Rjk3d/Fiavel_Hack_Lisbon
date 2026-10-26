---
format: 1920x1080 · 30 fps · MP4
duration: 158.06 s (2:38.06)
message: Fiável holds a rental guarantee in a Soroban contract whose rules both sides can read; its agents explain and never decide; every screen is real.
arc: doubt (paper lease) → reveal (the guarantee card) → two sides, one record → proof on Stellar → guided, not automated → optional yield, with limits → reputation, honestly labelled → the four promises → the brand
---

# Fiável — storyboard

Timecodes come from `timing.json` (the voice is the clock). Voiceover is verbatim from `narration.json`; see `SCRIPT.md` for claim sources.

## Frame 1 — The problem

- **Scene:** `compositions/s1-problem.html` · 0:00.00 → 0:16.56 (16.56 s)
- **Voiceover:** Finding a home should be exciting. But for tenants and landlords, a rental deposit can create uncertainty, mistrust, and disputes. Fiável starts with a simple question: what if the rules were clear from day one?
- **Reads:** A printed lease on an azulejo tile pattern. The title lands word by word; question marks fall on Held by / Returned when / Disputes decided by; "Your deposit deserves protection." The deposit row turns brand purple and floods the frame.
- **Sound:** voice + cinematic whoosh into the flood
- **Source:** Lease paper drawn (no real photo reachable); rows mirror the app's own terms.
- **Status:** built, checked, reviewed

## Frame 2 — The reveal

- **Scene:** `compositions/s2-reveal.html` · 0:16.56 → 0:31.56 (15.00 s)
- **Voiceover:** Fiável is building a more transparent way to rent. It brings lease conditions, payments, deposit protection, and guided actions into one connected experience.
- **Reads:** The shield-and-check mark is drawn on the purple field, FIÁVEL and the tagline land, then the field shrinks into the app's real guarantee card. Spotlights: lease conditions, payments, deposit protection, guided actions.
- **Sound:** voice + sparkle on the mark, whoosh on the shrink
- **Source:** front/ overview, replay of LeaseVault v5 lease #0 (screens/overview-tenant.png).
- **Status:** built, checked, reviewed

## Frame 3 — One lease, two sides

- **Scene:** `compositions/s3-sides.html` · 0:31.56 → 0:51.56 (20.00 s)
- **Voiceover:** Both sides can follow the rental journey: what was agreed, what has been paid, what is due, and what happens when a problem arises. Less ambiguity. More accountability.
- **Reads:** Tenant and landlord views side by side, then split to one lease: agreed terms, paid months, due deadlines, the damage claim card (100 claimed / offer 50), and the event record with transaction links. "Less ambiguity. More accountability."
- **Sound:** voice + whoosh on the split
- **Source:** front/ lease page and activity (lease-tenant, lease-landlord, lease-disputed-tenant, activity-settled).
- **Status:** built, checked, reviewed

## Frame 4 — The Stellar proof

- **Scene:** `compositions/s4-stellar.html` · 0:51.56 → 1:16.56 (25.00 s)
- **Voiceover:** Underneath Fiável is LeaseVault, a Soroban smart contract on Stellar Testnet. It is designed to hold the rental guarantee and enforce defined rules for payments, claims, deadlines, and releases. When an action happens on-chain, its transaction can be independently verified.
- **Reads:** Push through the activity into a diagram of LeaseVault (Soroban · Stellar Testnet · contract id from deployments/testnet.json): parties, USDC, funds into the contract, four rules, allowed outcomes incl. "an approved mediator decides". Transaction card 51955ee0… with its stellar.expert path, labelled "Hash as recorded in the project's README". Back to the same tx row in the app.
- **Sound:** voice + whoosh on the push, pop on the card
- **Source:** contracts/lease_vault, deployments/testnet.json, README v5 transaction table.
- **Status:** built, checked, reviewed

## Frame 5 — The agents

- **Scene:** `compositions/s5-agents.html` · 1:16.56 → 1:36.56 (20.00 s)
- **Voiceover:** Fiável's agents help tenants and landlords understand their lease, review deadlines, and prepare their next steps. They explain the available rules; they do not replace the contract or take control away from the people involved.
- **Reads:** Tenant Guardian answers "When is my next rent due?" (rule-based); the camera moves to the dated lines and the "Review & sign" action; a claim explanation; the landlord asking to "Seize the whole guarantee now" is refused; the Three locks panel.
- **Sound:** voice + click on the question, pop on the refusal
- **Source:** front/ assistant panel driven by the deterministic agent engine ("Deterministic agent: no language model").
- **Status:** built, checked, reviewed

## Frame 6 — Optional deposit investment

- **Scene:** `compositions/s6-blend.html` · 1:36.56 → 1:53.06 (16.50 s)
- **Voiceover:** Where supported, Fiável explores putting eligible deposit funds to work through Blend, with explicit consent and clear limits. Investment involves risk, and returns are never guaranteed.
- **Reads:** The yield option row in the invitation terms (5 % buffer, 70/20/10), the consent button "Lock … and accept the Blend yield option", the invest card (both approvals, one month stays in the contract), then the app's own risk wording. Tag: Stellar Testnet · Blend test pool · test USDC.
- **Sound:** voice + click on the consent button
- **Source:** front/ join page and lease page; Blend v2 testnet integration.
- **Status:** built, checked, reviewed

## Frame 7 — Reputation

- **Scene:** `compositions/s7-reputation.html` · 1:53.06 → 2:08.06 (15.00 s)
- **Voiceover:** Trust grows through accountable behavior. Fiável is also exploring rental reputation, so both sides can make better-informed decisions using transparent, appropriately verified history.
- **Reads:** The on-chain rating rule in the real app (once per party, after settlement), then a blur swap to the separate frontend/ reputation demo, tagged "Fictional data · live verification not enabled"; spotlight on the two-sided invitations and on "0 verified reviewed rentals".
- **Sound:** voice + pop on the demo label
- **Source:** front/ rate dialog; frontend/ demo (reviews-demo.png).
- **Status:** built, checked, reviewed

## Frame 8 — The big picture

- **Scene:** `compositions/s8-montage.html` · 2:08.06 → 2:26.06 (18.00 s)
- **Voiceover:** By combining rental-focused smart contracts, Stellar payments, guided agents, and a transparent user experience, Fiável brings blockchain technology to a problem people actually understand.
- **Reads:** "Transparent rules." "Verifiable activity." "Guided decisions." "Both sides matter." land one at a time beside hard-cut real shots; the mask opens to the full overview.
- **Sound:** voice + two whooshes
- **Source:** front/ replay screens.
- **Status:** built, checked, reviewed

## Frame 9 — Final reveal

- **Scene:** `compositions/s9-end.html` · 2:26.06 → 2:38.06 (12.00 s)
- **Voiceover:** Fiável. Fair rentals, built on trust. Built on Stellar.
- **Reads:** The guarantee card floods to the full frame; the mark lands; FIÁVEL wipes in; "Trust, built into the lease.", "Built on Stellar.", the repository link and "HackMeridian · LeaseVault on Stellar Testnet"; held to the end.
- **Sound:** voice + riser into impact
- **Source:** Logo from front/src/components/ui/misc.tsx.
- **Status:** built, checked, reviewed
