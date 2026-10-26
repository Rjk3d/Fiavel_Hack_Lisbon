# SPEC — Fiável, HackMeridian product film

GOAL:    A judge ends the film knowing that Fiável holds a rental guarantee in a Soroban contract with rules
         both sides can read, that its agents explain and never decide, and that every claim on screen is real.

OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, MP4 (H.264 + AAC), `fiavel-presentation.mp4`.

TIME:    ~158 s x 30 fps ≈ 4,740 frames (exact length: root `data-duration`, from `timing.json`).
         Narrated: the voice is the clock (Kokoro af_heart, speed 0.90). No music bed (no source reachable).

LOOK:    ground canvas #FAF9FD, flat; ink #171329; accent brand #6338B8 on one word or one object per shot.
         The only gradient is the app's guarantee card (radial #7247CC → #6338B8 → #4F2B98), used for the
         reveal and the end card. Display Inter 700, 68–128 px, −0.03 em; body Inter 400/500 26–30 px;
         JetBrains Mono only for ids and hashes (24–34 px). Medium: product UI captured at 2x, framed as a
         window 1425 x 800 at (248, 60), radius 24, shadow 0 30 60 −24 rgba(23,19,41,.28).
         Focus device: spotlight ring 3 px #9B72E8 with a 45 % ink scrim around it. No grain, no vignette.
         Opening world: a printed lease (white paper, 8 px radius) on an azulejo tile pattern (#F3EEFF / #9B72E8,
         120 px tile, 55 % opacity, masked to the right half).

OBJECTS: the lease on paper (rows: Tenant, Landlord, Monthly rent, Term, Deposit, Held by, Returned when,
         Disputes decided by); the shield-and-check mark from front/; the app window (real screenshots);
         the LeaseVault card with four rules; the USDC asset chip; two party cards; three outcome cards;
         the transaction card (hash, what happened, contract, explorer path).

MOTION:  enter expo.out / power4.out 0.4–0.55 s; camera power2.inOut 0.5–0.7 s; exits power2.in 0.12–0.2 s
         (≈ half the entrance); word reveals blur 6–8 px → 0 in 0.16 s, 0.07–0.09 s apart; marks back.out(1.5);
         holds: landed titles never move; product shots drift ≤ 4 % per shot while held.
         Transitions (5 kinds, each with a cause): object becomes the world (deposit row → field; card → field),
         carry across (field → app card), split to one (two views → the lease), blur swap on one stage,
         push-through (the activity → the contract underneath), mask opening (montage → full screen).

SHOTS:   (scene start · what the viewer reads · sound)
  S1 0.0   lease on azulejo; "Finding a home should feel like a fresh start." → doubts land on Held by /
           Returned when / Disputes; "Your deposit deserves protection."; deposit row turns brand and floods.
           · voice; cinematic whoosh into the flood
  S2 16.6  mark performed on the field; FIÁVEL; tagline; field carried into the app's guarantee card;
           spotlights: lease conditions, payments, deposit protection, guided actions. · sparkle, whoosh
  S3 31.6  tenant and landlord views side by side → the lease: terms (agreed), months (paid), deadlines (due),
           the damage claim (100 / offer 50), then the event record with transactions. · whoosh on the split
  S4 51.6  push through the record → LeaseVault (Soroban · Testnet · id) → parties, USDC, funds into the
           contract → Payments / Claims / Deadlines / Releases → allowed outcomes incl. "an approved mediator
           decides" → transaction card 51955ee0… → the same tx in the app's activity. · whoosh, pop on the card
  S5 76.6  Tenant Guardian answer (rule-based) → deadlines → "Review & sign" → claim explanation → landlord's
           "seize the whole guarantee" refused → Three locks. · click on the question, pop on the refusal
  S6 96.6  yield option row (5 % buffer, 70/20/10) → "Lock 310 USDC and accept the Blend yield option" →
           invest card (both approvals, one month stays) → "The return is variable and not guaranteed."
           Tag: Stellar Testnet · Blend test pool · test USDC. · click on the consent button
  S7 113.1 on-chain rating rule (front/) → separate frontend/ demo, tagged fictional; spotlight on
           "0 verified reviewed rentals". · pop on the demo label
  S8 128.1 words one at a time (Transparent rules. / Verifiable activity. / Guided decisions. / Both sides
           matter.) beside hard-cut real shots; the mask opens on the overview. · two whooshes, rotated
  S9 146.1 the guarantee card floods; mark on the impact; FIÁVEL wipes in; "Trust, built into the lease.",
           "Built on Stellar.", repository link, held ≥ 4 s. · riser tail into impact

BANNED:  dark void grounds; glow, bloom, particles, lens flares; mesh or glass; purple gradients other than the
         app's own guarantee card; cream-paper + serif + mono-caps labels; three cards in a row as a feature
         list; KPI grids; a title over a dimmed screenshot; the logo docked in a corner; UI tilted in 3D;
         generic crypto imagery; invented numbers, hashes, addresses or dashboards; calling the agents
         generative AI; presenting the frontend/ demo or the replay as live production data.

QA:      t=0 (thumbnail: paper + tiles, not empty) · each scene's first frame (no jump at the seam) · every
         spotlight lands on its word · text ≥ 26 px on product punch-ins · captions inside the title-safe band,
         never over a source line · S4 transaction card readable · S6/S7 tags visible · end card holds ≥ 2 s ·
         total length < 180 s · voice −16 LUFS, peaks ≤ −1 dBTP.
