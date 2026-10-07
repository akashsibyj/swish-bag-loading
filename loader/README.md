# SWiSH — Bag-on-Scale Loading Animation

A 3.34-second, seamlessly looping loader on a pure white page. A kraft bag falls
vertically, lands on a silver scale with a small bounce, the scale settles,
and the green digital display fills a fixed five-cell readout,
`.....` → `S....` → `SW...` → `SWi..` → `SWiS.` → `SWiSH`. A progress ring
below the scale tracks the weigh and closes into a green tick when it lands.

Motion spec: [`../SWISH_LOADING_ANIMATION_SPEC.md`](../SWISH_LOADING_ANIMATION_SPEC.md)

---

## Quick start

### Vanilla (no framework, no build step)

```js
import { createSwishLoader } from './loader/swish-loader.js';
import './loader/swish-loader.css';

const loader = createSwishLoader({
  mount: document.getElementById('app-loader'),
  loop: true,
  minDuration: 900,
  onComplete: () => document.getElementById('app-loader').remove()
});

// when the app is ready:
loader.finish();
```

### React

```jsx
import SwishLoader from './loader/react/SwishLoader.jsx';

<SwishLoader ready={isLoaded} overlay onComplete={() => setShowLoader(false)} />
```

`SwishLoader` is the raw component; the default export wraps it in an error
boundary. Prefer the default export.

### Run it

```bash
npm install
npm start          # http://localhost:5173  (opens automatically)
```

That is the whole setup. `index.html` is the loader on a blank page and
nothing else - it is what gets deployed. The controls for scrubbing the
timeline, forcing reduced motion and forcing degraded mode live in the test
harnesses under `tools/`, which `npm test` drives and which are deliberately
left out of the production build.

| Script | Does |
|---|---|
| `npm start` / `npm run dev` | Vite dev server + demo, hot reload |
| `npm run build` | Static bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm test` | Both browser suites, headless, across viewports |
| `npm run test:install` | One-time Playwright browser download |
| `npm run assets` | Regenerate the layer assets (needs Python + Pillow) |

**The loader itself has no runtime dependencies.** Vite and Playwright are dev
tooling only — nothing in `loader/` imports either, and the built output is
plain ES modules plus CSS. Port 5173 busy? Vite takes the next free one and
prints it, rather than refusing to start.

---

## API

| Option | Default | Meaning |
|---|---|---|
| `mount` | — | Container element. Required. |
| `loop` | `true` | `false` plays once and holds the final state. |
| `minDuration` | `900` | ms the loader must stay visible before it may exit. |
| `onComplete` | — | Fires once, after the exit fade. |
| `reducedMotion` | media query | Force the static state. |
| `size` *(React)* | CSS clamp | Stage size; number is treated as px. |
| `overlay` *(React)* | `false` | Fixed full-screen cover. |

Returned: `{ finish(), destroy(), isDone(), root }`.

`finish()` is the app-is-ready signal. It never hard-cuts and never flashes —
it waits out `minDuration`, then plays the exit fade.

---

## What was done with the supplied assets

This is the part worth reading before changing anything.

**Every file in `../assets/` is a base64 PNG wrapped in an SVG pattern fill.**
There is not one vector path among the eight. Six of them are *full composed
scenes* — bag already resting on the scale, display already reading `SWi…`.

Those six are reference renders, not animation layers. Playing them in
sequence is precisely the "static, like assets put together" failure this
loader exists to avoid. They are **not shipped and not loaded**.

Only two exports are isolated elements, and those are the entire raster
payload:

| Source | Becomes | Size |
|---|---|---|
| `assets/bag.svg` | `loader/assets/bag-layer.png` (242×315) | 63 KB |
| `assets/scale.svg` | `loader/assets/scale-layer.png` (273×74) | 11 KB |

`tools/build-assets.py` regenerates both: it extracts the embedded rasters,
tight-crops them, and **paints out the green pilot dot baked into the scale's
display** so the panel is blank and can be driven by live text. Both layers
are then inlined into `swish-assets.js` as data URIs — a loading screen that
itself fails to load is the one bug you cannot recover from.

Everything else in the scene is generated vector art: the ground shadow, the
motion streaks, the bounce lines, and all five display glyphs.

**One knob sizes the scene.** `SCALE_DRAW_W` sets the scale's width and
everything else follows: the bag, the drop height, the glass, the readout
grid, the shadow, the streaks and the bounce lines. Lengths that were
hand-tuned against a reference composition (a 300-unit scale with its plate
top at y=290) are mapped through `refX`/`refY` and the scale factor `U`, so
they keep their measured relationships at any size. `GEOMETRY` exports the
resulting layout, and the test harnesses assert against that rather than
against copied numbers.

The two layers arrive with no shared registration, so their relationship was
measured off the supplied composite render and is reproduced numerically in
`swish-loader.js` §1 — bag width is `0.6906×` the scale width, and its base
sits `0.1022×` the scale width below the plate's top edge. Verified: the
built scene matches the reference within 0.5%.

---

## How the motion works

One composed scene, continuously interpolated. Two raster layers moved by
transforms; nothing is ever swapped for anything else.

**Every visible value is a pure function of elapsed time.** Nothing
accumulates frame to frame, which is what makes pause/resume, reduced motion
and the scrubber all fall out for free — and what makes a dropped frame
cost one frame instead of desynchronising the animation.

| Window | Phase |
|---|---|
| 0 – 600 ms | Drop — 160 units straight down, bag whole and in frame the entire way, accelerating then cushioning into contact; two speed lines trailing off the upper corners |
| 600 – 900 ms | Compress **then** rebound — plate depresses with the bag, staggered bounce lines |
| 900 – 1200 ms | Settle — damped vertical wobble, flush and still by 1200 ms |
| 1200 – 2100 ms | Count — 225 ms/step, per-glyph fade+rise, dots nudged along one cell at a time |
| 2100 – 2420 ms | The status ring folds into the check mark |
| 2420 – 2720 ms | **Halt** — the finished check held perfectly still. Nothing on the stage moves. |
| 2720 – 2860 ms | The success rays ease out from their own points and fade in |
| 2860 – 3040 ms | Done state holds |
| 3040 – 3340 ms | Seam — fade to blank white, then restart. The loop is invisible because the first and last frames are both empty. |

Details that carry the weight, in rough order of how much they matter:

- **The bag is never clipped.** It is whole in every frame of the fall. This
  is not cosmetic: the bag is a tapered three-quarter view, so when only its
  base showed through the top of the frame it read unmistakably as a bag lying
  on its side — even at exactly 0°. The scene was sized down from a 300-unit
  scale to 210 to buy the headroom, which is the single knob `SCALE_DRAW_W`;
  everything else derives from it.
- **The bag falls down a vertical shaft.** Its motion is one string on one
  group:

  ```
  .swish-loader__bag          transform="translate(0 -99.853)"   <- the entire fall
  .swish-loader__bag-squash   transform="translate(200 356.54) scale(1 1) translate(-200 -356.54)"
  ```

  There is no x term, no `rotate()` and no `scale()` in the outer transform,
  so sideways drift and rotation are not *set to zero* — they are **absent**.
  Nothing in the document could express them. The impact squash needs a
  `scale()`, so it lives on the inner group where it cannot contaminate the
  fall, and it is symmetric about the stage axis so widening cannot shift the
  bag either.

  Splitting the two is what turns "the bag does not move sideways" from a
  claim into something you can read off the element in devtools.
- **The bag compresses into the plate before anything lifts it.** Squash peaks
  45 ms after contact, pressed 3 units *down*; the rebound is released at
  60 ms. Overlap the two and you get a bag that bobs, not one that lands.
- **The plate depresses with it** (3.5% scaleY about the feet), and the bag
  rides that displacement so the two never separate.
- **The shadow is a function of the bag's height**, not of the clock. It used
  to be a second time curve that re-derived the descent and hand-wrote its own
  rebound counter-beat — two descriptions of one motion, free to disagree.
  Now you feed it where the bag is, and the counter-beat falls out for free,
  because a rebounding bag is by definition climbing away from the floor.
  Two terms: one over the whole 330-unit descent, one over the last 40 units
  for contact hardening — against the full drop, the 14-unit rebound is 4%
  and would vanish.
- **Bounce lines are staggered** 0 / 25 / 25 / 50 ms. Four lines firing
  together read as a graphic; staggered they read as an impact.
- **Revealed glyphs never move.** They sit on a fixed cell grid; the block
  offset that keeps `SWiSH` optically centred is interpolated, never jumped.
- **A green standby indicator is lit from the first frame.** A small circle
  at the left end of the display glass, inside the scale group. It is set once
  at construction and never written again at runtime — not by the timeline,
  not by the impact, not by reduced motion. Being absent from the render loop
  is what makes "it cannot blink, cannot wait for the bag, cannot be
  re-coloured" structural rather than something to keep remembering.

  It sits at the *left* of the glass, not dead centre where the source asset
  had its own baked-in dot. Centred, it showed through the gaps in the
  readout from 1200 ms — a stray fourth dot beside the `...`, a doubled
  tittle on the `i`. It only looked right on `SWiSH`, where the `i` happened
  to cover it. The left end is also simply where a standby light lives on
  real hardware: beside the readout, not underneath it.

- **Two speed lines trail off the bag's upper corners.** Thin vertical
  strokes (`1.6` and `1.3` units) at `x 88` and `x 312` — just outside the
  bag's silhouette, which spans `x 96–302` — reaching from its upper-mid body
  up past its top edge. Each gradient peaks across the bag's top edge and
  shoulders, putting the weight of the effect above the bag, and tails off
  down its upper sides. That tail is what makes them readable for the *whole*
  fall: the shoulders are off-stage until ~450 ms, so anything drawn strictly
  above them would be invisible until then.

  They are **given the bag's entire transform each frame**, the same string
  the bag itself uses: translate, tilt and squash alike. Not a copy kept in
  sync — literally the same value, so drift is impossible at any stage size,
  aspect ratio or zoom level, and there is nothing to recompute on resize.

  Each is stroked with its own gradient that dissolves at **both** ends, so
  neither terminates in a visible cap and the frame edge crops the top
  through its faintest part. Lengths, weights and gradient stops differ
  between the two on purpose: a matched pair reads as decoration, an
  unmatched pair reads as motion.

  Opacity is one continuous curve — `smoothstep` in, linear out, hard `0`
  outside the drop window. They paint *before* the bag, so the bag always
  covers them and they can never appear across its front.

---

## Exceptions handled

| Case | Behaviour |
|---|---|
| `prefers-reduced-motion` | Static final state, rAF never starts. Watched **live** — toggling it mid-session switches both ways. |
| Tab hidden | rAF cancelled; the timeline re-anchors on return so it resumes mid-phase instead of snapping. |
| Frame drops | Per-frame delta clamped to 100 ms. Sustained sub-30fps sheds the glow filter and bounce lines; motion and streaks stay (six gradient strokes cost almost nothing). |
| `saveData` / `prefers-reduced-data` | Starts in degraded mode. |
| App ready too early | `minDuration` (900 ms) prevents a flash. |
| App ready mid-cycle | Never hard-cuts — always plays the exit fade. |
| **rAF never fires** | A `setTimeout` safety net finalises the exit regardless. Without it, a hidden tab or throttled webview traps the app behind the loader permanently. |
| Load exceeds 15 s / 30 s | Caption, then a retry affordance emitting a `swish-retry` event. Live region updated **once** per stage, not once per loop. |
| Layer decode failure | Falls back to a breathing `SWiSH` wordmark. |
| Render error | Error boundary (React) / try-catch (vanilla) → same wordmark. |
| Throwing `onComplete` | Caught; the loader still tears down cleanly. |
| `destroy()` mid-wait | Cancels pending timers; no callback fires into a dead loader. |
| Repeated `finish()` | Completes exactly once. |
| SSR / no `window` | All browser access is inside the effect; no hydration mismatch. |
| Screen readers | SVG is `aria-hidden`; a single visually-hidden string carries the meaning. The glyph sequence is never announced. |
| Forced colors | Filters dropped, glyphs fall back to `CanvasText`. |
| Narrow containers | Stage is `min(100%, clamp(170px, 42vmin, 340px))` — `vmin` alone would overflow a card narrower than the viewport-derived size. |
| Print | Hidden. |

---

## Tests

```bash
npm run test:install   # once - downloads a headless Chromium (~120 MB)
npm test
```

Or open them by hand against the dev server:
`/tools/selftest.html` and `/tools/responsive.html`.

`selftest.html` — 69 in-browser assertions covering structure, accessibility,
timeline purity, impact physics, the motion lines, the green indicator,
reduced motion, degraded mode, lifecycle, and responsive sizing.

`responsive.html` — 14 assertions that measure the indicator's offset from the
scale and each speed line's offset from the bag **as a fraction of the stage
box**, then compare those fractions across 200 / 360 / 820 px containers and
across live resize and orientation-change events. If anything were pinned to
pixels or to the viewport, the fractions would drift.

`npm test` runs `selftest` at desktop and `responsive` at mobile (360×740),
tablet (820×1180) and desktop (1600×900), boots its own Vite server on a free
port, tears everything down on exit or Ctrl-C, fails on any console error as
well as any failed assertion, and exits non-zero — so it works as a CI gate.

`tools/frame.html?t=<ms>` renders a single scrubbed frame, for visual diffing.

---

## Known limitations

These are asset constraints, not code ones. Each is a one-line change here
once better art exists.

1. **The supplied bag carries no SWiSH logo.** Neither `bag.svg` nor the
   composite renders have one, though the reference sheet mockup shows it. If
   a branded bag is wanted, re-export and drop it in — geometry is unchanged.
2. **Handle lag is not implemented.** Trailing the handles ~40 ms behind the
   body is what makes a paper bag read as paper. It needs the handles as a
   separate layer; the current bag is one flat raster.
3. **Raster resolution caps at 1×.** The source bag is 242 px wide; on a 2×
   display at 340 px the bag upscales ~2.8×. It holds up (soft photographic
   art, no hard edges) but a 2× export would be sharper. There is nothing the
   code can do about this.
4. **The display font is monospace, not dot-matrix.** The glyph grid assumes a
   fixed advance width. Drop DSEG14 or Digital-7 at the front of the
   `.swish-loader__glyph` font stack and nothing else needs to change.
5. **`--swish-silver` is specced `#C0C020`**, which is olive. Nothing reads it
   at runtime — the scale is a photograph — so it is documentation-only until
   confirmed.

---

## Files

```
package.json           scripts + dev dependencies (vite, playwright)
vite.config.js         dev server and multi-page build
index.html             the deployed page — Vite's entry point
vercel.json            deploy config: build command, output dir, headers
loader/
  swish-loader.js      engine — geometry, timeline, solvers, lifecycle
  swish-loader.css     layout, responsive envelope, a11y/print/contrast
  swish-assets.js      GENERATED — the two layers as data URIs
  assets/              GENERATED — the two cropped PNGs
  react/SwishLoader.jsx  React binding + error boundary
tools/
  run-tests.mjs        headless runner: in-process Vite + Playwright
  build-assets.py      regenerates swish-assets.js from ../assets/*.svg
  build-harness.mjs    build that ALSO emits the harnesses below
  selftest.html        in-browser assertions (timeline, readout, indicator)
  responsive.html      cross-width / resize attachment assertions
  frame.html           single-frame renderer for visual diffing
```

## Importing it

`package.json` exposes the loader through `exports`, so a consumer in the same
workspace can do:

```js
import { createSwishLoader } from 'swish-bag-loader';
import 'swish-bag-loader/style.css';
import SwishLoader from 'swish-bag-loader/react';   // needs react >= 17
```

React is an **optional peer dependency** — it is only required if you import
the React binding, and nothing else in the package references it.
