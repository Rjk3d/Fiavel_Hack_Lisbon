# REVIEW — Fiável film

## Creative calls

- **Structure.** The film follows the user's 9-part storyboard and voiceover verbatim. Storylines not built:
  - one dispute told from claim to settlement;
  - the film told only through the contract's event log.

  The storyboard asked for the whole product, and these would have covered one corner of it.
- **One world: the app itself.** Every scene but S1 and the S4 diagram is a real `front/` screen.
  - The camera moves inside it: punch-ins and pans, with a spotlight ring and a scrim.
  - We did not lay titles over dimmed screenshots.
- **Lease #0 replay.** The screens replay LeaseVault v5 lease #0 on the real contract code (see `README.md`), so every amount on screen matches the README's testnet record.
  - Nothing was mocked in the UI. Only the two chain modules are swapped.
- **Transitions with a cause:**
  - the deposit row floods the frame and becomes the brand field;
  - the field shrinks into the app's guarantee card;
  - push-through from the activity log to the contract;
  - blur swaps where the next scene keeps the window in the same place;
  - mask opening in S8;
  - the card floods into the end card.
- **Labels on what is not live:**
  - "Testnet" on every Stellar and Blend mention;
  - "Fictional data · live verification not enabled" on the `frontend/` demo;
  - "Rule-based" on the agents;
  - "Hash as recorded in the project's README" on the transaction card.
- **Agent prompt changed.** "Explain the deposit release conditions." is not used.
  - The engine reads "release" as a request to act and refuses it, so on screen it would show a refusal, not an explanation.
  - The film uses "When is my next rent due?" and "What happens if a claim is raised?", plus the landlord's refused "Seize the whole guarantee now".

## Measured vs looked at

- **Measured:**
  - `check --json` → ok, 0 errors, 1 warning (below).
  - Voice loudness: loudnorm −16 LUFS, −1.5 dBTP.
  - Total length: 158.06 s (from `timing.json`, and on the render with ffprobe).
  - Caption times: exact sums of synthesised clause durations.
- **Looked at:**
  - `snapshot --review` beat sheets and all eight scene seams.
  - Targeted frames at the S4→S5, S5→S6 and S6→S7 seams after the fix, and the S7 framing.
  - The draft render's key frames.
- **Not checked by anyone:**
  - **The sound was measured, not heard:** the mix of voice and SFX levels, and whether the Kokoro voice sounds natural to a listener.
  - The stellar.expert page for the hash: not reachable from the build machine.

## Fixed in this pass

- **Blank frames at the S4→S5 cut.**
  - S5 faded its window in from opacity 0 at 0.1 s, so the frames at 76.56 and 76.66 s were empty canvas. S6 and S7 had the same pattern.
  - All three now start visible and swap by blur on the same stage, because the previous scene ends on a window in the same place.
- **S7 rate dialog.** Recentred: framing [560,260] → [510,250].
- **Earlier passes:** frame-0 initial states, layout-property tweens, caption collisions with source lines, text sizes, the S9 colour jump (see the transcript of the build).

## Weakest shot

S1. The lease is a drawn paper card on an azulejo pattern, a stand-in for a real Lisbon photograph that we could not fetch. It reads clearly, but it is the one shot without a real source.

With more time:
- a licensed photograph of a Lisbon façade behind the paper;
- a music bed;
- a recorded human voice instead of Kokoro.

## Warnings kept on purpose

- **`text_below_floor` (S4).** The four rule descriptions in the LeaseVault card are 26 px. At 28 px they wrap to three lines and push the card past the caption band. They are secondary to the 30 px bold rule names and stay on screen for about 6 s.
- **Layout infos `container_overflow` / `escaped_container`.** These are the 1920-wide screenshots inside 1425-wide clipped windows. The cropping is the camera.

## Blockers (reported, not hidden)

- **No music.** No source reachable (MusicGen / Hugging Face, HeyGen and Lyria all unavailable).
- **No location photograph.**
- **Explorer not opened.**
- **Kokoro weights from a third-party npm redistribution.** The sha256 matches the value that package publishes.
- **Live app and testnet RPC unreachable.** The live app (`fiavel-hack-lisbon.vercel.app`) and the testnet RPC could not be reached, hence the local replay.
