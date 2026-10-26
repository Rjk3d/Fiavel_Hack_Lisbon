---
colors:
  brand: "#6338B8"        # front/tailwind.config.ts brand.DEFAULT — accent, rationed
  brand-dark: "#4F2B98"   # brand.dark — deep end of the guarantee card gradient
  brand-soft: "#9B72E8"   # brand.soft — lines, secondary marks
  brand-tint: "#F3EEFF"   # brand.tint — lavender fields, chips
  canvas: "#FAF9FD"       # canvas — warm white ground
  ink: "#171329"          # ink — every word meant to be read
  ink-muted: "#777487"    # ink.muted — secondary text
  line: "#EAE7F1"         # line — hairlines, card borders
  success: "#12866A"      # success — verified states only
  warning: "#B97924"      # warning — risk notes only
typography:
  display: { family: "Inter", weights: [700, 900], tracking: "-0.03em" }
  body: { family: "Inter", weights: [400, 700] }
  mono: { family: "JetBrains Mono", use: "contract ids and transaction hashes only" }
radius: { card: 28, window: 24, chip: 999 }
shadow:
  card: "0 2px 4px rgba(23,19,41,0.05), 0 18px 40px -16px rgba(23,19,41,0.18)"  # shadow.lift
  brand: "0 18px 40px -18px rgba(99,56,184,0.55)"                                # shadow.brand
logo: "assets/brand/fiavel-mark.svg (front/src/components/ui/misc.tsx Logo, copied verbatim)"
---

# Fiável film — design

## Source

Every value above is copied from the product: `front/tailwind.config.ts` (palette, radii, shadows),
`front/src/components/ui/misc.tsx` (the shield-and-check mark and the "Fiável" wordmark, Inter 600,
−0.02em) and the live app screens in `assets/screens/`. The app sets Inter Variable; the film uses the
bundled Inter. Nothing is invented: when the film needs a colour the app does not have, it does not use one.

## Intent

A European fintech launch: calm, warm white, one deep purple. The product is the hero; the film's own
graphics only explain what a screen cannot show (the contract, the flow of funds).

- **Ground**: canvas `#FAF9FD`, never a dark void. Lavender (`brand-tint`) for fields behind product.
  The only gradient is the app's own guarantee card (`brand` → `brand-dark`), used for the reveal and the
  end card because the product uses it.
- **Accent**: `brand` on one word or one object per shot.
- **Product shots**: real screenshots captured at 2× (`assets/screens/`), framed as a window with radius 24
  and `shadow.card`, pushed in to 1.4–2× so text stays above 26 px.
- **Diagrams**: hairline `line` borders, `ink` labels, `brand` for the moving thing (the funds, the event).
- **Lisbon**: the opening has no photograph (no image source was reachable from the build machine). The
  world is a printed lease on paper with an azulejo tile pattern in `brand-tint` / `brand-soft` — an object
  and a motif, not a drawing of a real place.
- **Labels of truth**: every product shot carries a small, honest source line (`Real app · replay of
  LeaseVault v5 lease #0`, `Separate demo · fictional data`, `Stellar Testnet`).

## Do

- Land titles and hold them dead still; move the camera, not the type.
- Mono only for ids and hashes, shortened the way the app shortens them (`CB3R…H3JO`, `51955ee0…`).
- Captions: Inter 700, 44–52 px, ink on a soft white scrim, bottom title-safe band.

## Don't

- No glow, particles, neon, mesh gradients, glass cards, 3D-tilted UI, crypto stock imagery.
- No invented numbers: amounts and hashes come from the README record and the replayed contract states.
- No dashboard that does not exist in `front/`.
