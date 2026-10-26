# Fiável — HackMeridian presentation film

A 2:38 product film (1920 × 1080, 30 fps, H.264 + AAC) made with [HyperFrames](https://github.com/heygen-com/hyperframes):
HTML, CSS and GSAP, rendered frame by frame. No Remotion.

| File | What it is |
| --- | --- |
| `fiavel-presentation.mp4` | the rendered film |
| `fiavel-captions.srt` | English captions (the same groups burnt into the film) |
| `SCRIPT.md` | the narration, scene by scene, with the source of every claim |
| `STORYBOARD.md` | the nine frames: timecodes, voiceover, what the viewer reads, sound, source |
| `DESIGN.md` · `SPEC.md` | brand tokens and the shot-by-shot spec |
| `REVIEW.md` | the review pass: what was checked, what was fixed, what is still weak |
| `index.html` | root composition: nine scene hosts, the voice, the sound effects, the captions |
| `compositions/` | one HTML file per scene (`s1-problem` … `s9-end`) + `captions.html` |
| `assets/screens/` | real screenshots of the app (2× DPR) |
| `assets/voice/` | narration, one WAV per scene |
| `assets/sfx/` | sound effects (Pixabay licence, see `CREDITS.md`) |
| `capture/` | how the screenshots were made (contract replay + app replay) |
| `scripts/` | narration/caption builder and root-composition builder |

## What is on screen, and how real it is

- **`front/`, the real app.** The app is shown replaying LeaseVault v5 lease #0, step by step, as recorded in the repository README ("On-chain evidence (testnet)").
  - The Rust crate in `capture/replay/` runs those steps on the real contract code (`contracts/lease_vault`) in the Soroban test host, with the repo's mock Blend pool.
  - Every view-function result and event is exported as XDR.
  - The app runs unchanged, except its two chain modules (`stellar/vault`, `stellar/wallets`), which are aliased to read that XDR (`capture/replay-app/`). It decodes them with its own generated client.
  - Amounts match the README. Timestamps (25 Oct 2026, 15:00 UTC onwards) and wallet addresses are local and deterministic, not the testnet ones.
  - Demo mode: 1 month = 1 minute.
- **Stellar proof.**
  - The contract id comes from `deployments/testnet.json`.
  - The transaction hash `51955ee0…` is shown "as recorded in the project's README": stellar.expert could not be reached from the build machine, so it was not re-checked on the explorer.
- **Agents.** The agents are rule-based (the app says "Deterministic agent: no language model"). The film never calls them generative AI.
- **Blend.** Tagged "Stellar Testnet · Blend test pool · test USDC".
- **Reputation.**
  - The on-chain rating is from `front/`.
  - The profile and reviews are from the separate `frontend/` demo, tagged "Fictional data · live verification not enabled".

## Preview, check, render

Run these from this folder. The CLI is pinned to 0.8.202.

```bash
npx hyperframes@0.8.202 browser ensure            # once: the headless Chrome used to render
npx hyperframes@0.8.202 preview --background      # Studio preview (stop it with: preview --stop)
npx hyperframes@0.8.202 check --json              # lint + runtime + layout + motion + contrast
npx hyperframes@0.8.202 snapshot --review         # contact sheets of beats and scene seams
npx hyperframes@0.8.202 snapshot --at 20,60,100   # frames at given seconds
npx hyperframes@0.8.202 render --quality draft -o renders/draft.mp4
npx hyperframes@0.8.202 render --quality delivery -o fiavel-presentation.mp4
```

GSAP is vendored in `assets/vendor/` (gsap 3.14.2 from npm), so preview and render need no CDN.

## Rebuilding the narration and captions

The voice is Kokoro-82M (voice `af_heart`, speed 0.9), run locally with `kokoro-onnx`. Synthesis is deterministic.

1. Get the weights. The model comes from the npm package `kokoro-q8-shards@1.0.0` (a third-party redistribution of Kokoro-82M; Hugging Face was not reachable from the build machine). The voices come from `kokoro-local-runtime@0.1.0`.

   ```bash
   KOKORO_DIR=~/kokoro && mkdir -p $KOKORO_DIR/x && cd $KOKORO_DIR
   npm pack kokoro-q8-shards@1.0.0 kokoro-local-runtime@0.1.0
   tar -xzf kokoro-q8-shards-1.0.0.tgz -C x && mv x/package x/shards
   tar -xzf kokoro-local-runtime-0.1.0.tgz -C x && mv x/package x/runtime
   cat x/shards/kokoro-q8.part{0..5}.bin > model_quantized.onnx
   sha256sum model_quantized.onnx   # must be fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478
   pip install kokoro-onnx soundfile
   python3 -c "import numpy as np,glob,os; np.savez('voices.npz', **{os.path.basename(f)[:-4]: np.fromfile(f, dtype=np.float32).reshape(-1,1,256) for f in glob.glob('x/runtime/voices/*.bin')})"
   ```

2. Build the narration (about 3 minutes), then the root composition:

   ```bash
   KOKORO_DIR=~/kokoro python3 scripts/build_narration.py   # assets/voice/*.wav, timing.json, fiavel-captions.srt
   python3 scripts/build_root.py                            # index.html, compositions/captions.html, assets/cues.js
   ```

   - The text is in `narration.json`. "Fiável" is forced to /fiˈɑːvɛl/.
   - Each clause is synthesised on its own, so caption times are exact sums of measured audio durations, not a speech-to-text alignment.
   - Loudness is normalised to −16 LUFS, peaks ≤ −1.5 dBTP.
   - The scenes read their timings from `assets/cues.js` (`window.filmCue(scene, textPrefix)`), so changing the narration re-times the animation.

## Rebuilding the screenshots

You need Rust plus the repository's `front/` and `frontend/` with their dependencies installed.

```bash
# 1. Replay lease #0 on the real contract (from video-output/capture/replay)
cd capture/replay
TENANT=GDP5JTPNI4XLYCI4TF5BKFP2QCNYPEM655N2IUX2RVTN756IZQAT6B44 \
LANDLORD=GAIYXWTBXPATL7XF3MLTNFVDUDCUF3N5K5YMR2H6LBDNQX7KBTWAAKWM \
ARBITER=GAADUXPKU73N733WZJEOZ4TDDUMC4HAOT7COXAB3CO2GWAYT44PPWHFJ \
T0=1792940400 cargo run -q > ../replay-lease0.json
cd ../..

# 2. Serve the real front/ app on the replay (port 5195)
ln -s ../../../front/node_modules capture/replay-app/node_modules   # once
(cd ../front && npx vite --config ../video-output/capture/replay-app/vite.config.ts) &

# 3. Shoot (Playwright, 1920×1080 at 2× DPR)
node capture/shoot-app.cjs
(cd ../frontend && DEV_PORT=5182 npm run dev) &   # the separate reputation demo, fictional data
node capture/shoot-reviews.cjs
```

The three addresses are local test keys derived in `capture/keys.mjs`. They are never funded and never used on a network.

## Known limits

- **No music bed.** No royalty-safe music source was reachable from the build machine. The film carries the voice and sound effects only; a bed can be added as one more `<audio>` in `index.html` at about −20 dB under the voice.
- **The opening is a drawn lease**, not a photograph of Lisbon: no image library was reachable.
- **The explorer link was not opened.** The hash is the one written in the README.
- **The replay is not live data.**
  - Timestamps, wallet addresses and inventory hashes are local.
  - The tenant's starting balance of 1,000 test USDC is assumed.
  - The Blend gain reads 0 until the claim step.
