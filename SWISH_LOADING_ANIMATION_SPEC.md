# SWiSH — Bag-on-Scale Loading Animation
### Motion & Implementation Specification v1.1 — **as built**

> Implemented in [`loader/`](loader/). See [`loader/README.md`](loader/README.md)
> for the API and the asset pipeline. Sections marked **REVISED IN BUILD**
> changed once the code met the real assets; the reasoning is inline.
> Verified by 41 in-browser assertions (`tools/selftest.html`).

---

## 1. Intent

A 3.34-second, seamlessly looping loading animation on a **pure white page**.
A SWiSH kraft paper bag falls vertically, lands on a silver kitchen scale with a
small bounce, the scale settles, and the green digital display progressively
counts up the brand name: `S...` → `SW...` → `SWi...` → `SWiSH`. The final
state holds, then the loop restarts (or hands off to the app).

**Tagline anchor:** *Good food takes a moment.* The animation exists to make
waiting feel intentional, not broken.

---

## 2. The One Rule That Governs Everything

> **This is a composed, continuously interpolated scene — NOT a slideshow of exported frames.**

The 12 assets in the reference sheet (`01_bag_drop_1` … `12_bounce_lines`) are
**keyframe references for the designer**, not playback frames. If we cross-fade
or hot-swap those files, the result will look exactly like what the brief warns
against: *"static, like assets put together."*

**What we actually build:**

| Layer | Source | Animated by |
|---|---|---|
| Bag | `assets/bag.svg` -> `bag-layer.png` (242x315) | `translateY`, `scaleX/scaleY`, `rotate` |
| Scale body | `assets/scale.svg` -> `scale-layer.png` (273x74) | `scaleY` about the feet |
| Display glyphs | Live text / 7-seg paths inside the scale SVG | `textContent` + `opacity` + glow |
| Ground shadow | Single ellipse (`11_shadow`) | `scaleX`, `opacity`, blur |
| Bounce lines | 4 stroked paths (`12_bounce_lines`) | `opacity`, `translate`, `scale` |

Every visual change between reference frames 01→10 must be **derived by
interpolation at 60fps**, never by switching images. One bag. One scale. One
shadow. Moved by transforms.

**REVISED IN BUILD.** The premise held, but the assets were worse than
assumed: *all eight* exports are base64 PNGs inside an SVG pattern fill —
zero vector paths. Six are full composed scenes and are not shipped. Only
`bag.svg` and `scale.svg` are isolated elements, and they carry no shared
registration, so their relationship was measured off the composite render and
reproduced numerically (`swish-loader.js` §1); the built scene matches the
reference within 0.5%. The scale's baked-in green pilot dot is painted out at
build time so the display panel is genuinely blank. Everything else in the
scene — shadow, streaks, bounce lines, all five glyphs — is generated vector
art.

**Hard bans:**
- No `<img src>` swapping, no sprite-sheet stepping, no cross-fading full-scene SVGs.
- No animating `top` / `left` / `width` / `height` / `margin` (layout thrash → jank).
- No `setInterval` driving visuals.
- Only `transform` and `opacity` animate. One `requestAnimationFrame` loop, time-based.

---

## 3. Stage & Coordinate System

```
viewBox = "0 0 400 420"   (single root <svg>, preserveAspectRatio="xMidYMid meet")
```

**REVISED IN BUILD, twice.** These are the values the code actually uses,
derived from the measured layer crops rather than estimated. `SCALE_DRAW_W` is
now the *only* input — everything else, `PLATE_TOP_Y` and `DROP_FROM`
included, derives from it, and hand-tuned lengths are mapped through
`refX`/`refY` and the scale factor `U`.

It was reduced from **300 to 210**. At 300 the bag stood 270 units tall in a
420-unit stage, leaving 51 units of air above it, so any drop worth the name
began off-screen — and for the first half of the fall all the viewer could see
was the bag's tapered **base** poking through the top of the frame. An upright
bag's base, seen alone, reads exactly like a bag lying on its side. The bag
never rotated; it simply could not be seen properly. The scene is now sized so
the bag is whole in every frame, which is what the reference images show and
what the brief was actually describing.

| Landmark | Y (user units) | Notes |
|---|---|---|
| Bag spawn | `-(BAG_Y - 8)` ≈ `-160` | Bag's TOP sits 8 units inside the frame, so it is whole from the first frame |
| Bag rest — top | `167.8` | Bag drawn `145.0 x 188.8` |
| Bag rest — base | `356.5` | Sits `21.5` below the plate's top edge (the surface recedes) |
| Scale plate top | `335.1` | Contact plane. Scale drawn `210 x 56.9` |
| Scale bottom (feet) | `392` | `scaleY` pivot for the impact compression |
| Display glass | `x 132.7 – 265.0`, `y 362.8 – 384.3` | Centre `(198.9, 373.5)`, font-size 14.7, cell grid 10.15 |
| Standby LED | `(145.3, 373.5)` | `GLASS_X0 + 18·U`, clear of the readout |
| Ground shadow | `396.2` | `rx 99.4`, `ry 7.7`, blur `stdDeviation 4.9` **in user units** |

Everything lives inside **one root SVG** with a viewBox. No fixed pixel sizes
anywhere. No nested absolutely-positioned DOM layers — the SVG *is* the layout.
The SVG must clip (`overflow: hidden`): the bag spawns above the viewBox and
would otherwise paint over whatever sits above the stage on the way in.

---

## 4. Master Timeline (3340 ms, loops seamlessly)

| # | Window | Phase | What moves |
|---|---|---|---|
| 1 | `0 – 600 ms` | **Drop** | Bag falls ~`-160` → `0` straight down, whole and in frame throughout, accelerating then cushioning; no rotation, no scale change; two speed lines trail off the upper corners |
| 2 | `600 – 900 ms` | **Impact + bounce** | Squash, rebound, scale depresses, lines flash |
| 3 | `900 – 1200 ms` | **Settle** | Residual oscillation damps to zero; display wakes |
| 4 | `1200 – 2100 ms` | **Count** | `S` → `SW` → `SWi` → `SWiSH`, 225 ms per step |
| 5 | `2100 – 3340 ms` | **Done + exit** | Ring folds to a check, halts, rays appear; fade out or hand off |

### 4.1 Phase 1 — Drop (0–600 ms)

```
raw        = t / 600
eased      = raw^2 * (2 - raw)     // accelerate, then cushion
bagY       = DROP_FROM * (1 - eased)   // DROP_FROM = -(BAG_Y - 8)
rotation   = 0                     // always
scaleX/Y   = 1                     // unchanged for the whole descent
```

> **The bag falls down a vertical shaft.** Its motion is one string on one
> group — `translate(0 <y>)` — with no x term, no `rotate()` and no `scale()`.
> Sideways drift and rotation are not set to zero; they are *absent*, because
> there is nothing in the document that could express them. The impact squash
> needs a `scale()`, so it lives on a separate inner group
> (`.swish-loader__bag-squash`), symmetric about the stage axis.
>
> §4.1's tilt curve, §4.2's landing correction and the contact-corner lift
> that supported them have all been removed.

**REVISED IN BUILD.** `easeInQuad` was still accelerating hard at the moment
of impact — velocity 2.0 in these units, 18 units of travel in the final
frame. The storyboard asks for the bag to ease as it nears the plate, so the
curve is now `2p² − p³`, whose velocity `4p − 3p²` peaks at `p = 2/3` and
sheds ~25% before contact:

| | peak | at contact |
|---|---|---|
| before | 18.0 u/frame (at contact) | 18.0 |
| after | 11.7 u/frame (at 400 ms) | 9.0 |

It still arrives with real speed — that is what sells the compression — it
just stops gaining. Landing is exact either way: both curves reach 1 at
`p = 1`.

**REVISED IN BUILD (twice).** Cubic over a long drop put ~28 viewBox units of
travel into the last frame before contact, which strobes at 60Hz; quadratic is
both physically correct and visibly smoother.

The distance was then cut from `-334.66` to `-260`. A fully-off-stage spawn
looked identical for the first half of the fall — the bag was simply not in
frame — while leaving the shoulder-anchored motion streaks only ~150 ms of
visibility, which registers as a flicker rather than as speed. A 140 ms intro
fade (`T_INTRO`) now covers the sliver of bag that is in frame at `t = 0`, so
the loop seam still reads as blank white.

Concurrent, all derived from the same `p`:

- **Motion stretch: removed.** Scale is `1` for the whole descent. The speed
  cue is carried by the streaks instead.
- **No tilt, no stretch.** `rotation = 0` and `scale = 1` for the entire
  descent. The only pivot still in use is the bag's base, and the only thing
  that reads it is the impact squash, which compresses toward the plate.

  **REVISED IN BUILD.** This reverses an earlier revision that added a
  two-cosine sway (`+6.2° → −4.6°`), a rotation centre migrating from the
  centre of mass to the base, a damped landing correction, and a
  `(w/2)·sin θ` corner lift to keep the low corner out of the plate. The
  brief now calls for a clean vertical drop, so all four are gone. What
  remains is a single axis of motion.
- **Shadow anticipation.** A shadow that grows as the bag nears the ground is
  the single cheapest cue that sells real depth. It never starts at zero: the
  scale is already sitting on the ground and casts its own.

  **REVISED IN BUILD.** It is now driven by the bag's **height**, not by the
  clock — previously a separate time curve re-derived the descent and
  hand-wrote its own rebound counter-beat, which is two descriptions of one
  motion, free to drift apart. Feed it where the bag actually is and the
  counter-beat falls out of the geometry.

  ```
  far  = clamp01(1 - lowY / DROP_FROM)   // the whole descent
  near = clamp01(1 + lowY / 40)          // contact hardening
  scale   = 0.86 + 0.084*far + 0.056*near
  opacity = 0.10 + 0.060*far + 0.040*near
  ```

  Two terms because one cannot do both jobs: measured against the full
  330-unit drop the 14-unit rebound is 4% and would be invisible, so the
  near-field term carries the contact beat. `lowY` is the height of the bag's
  lowest contact point above its resting line — 0 at touchdown.
- **Motion streaks** — **two** thin vertical speed lines, one off each of the
  bag's upper corners, peak `opacity 0.50`, **gone before contact**. A streak
  visible in a settled frame is exactly the "assets put together" tell we are
  avoiding.

  | Property | Value |
  |---|---|
  | Count | Two — one upper-left, one upper-right |
  | Coordinate space | The bag's rest space — never viewport coordinates, so there is nothing to recompute on resize, orientation change or zoom |
  | Transform | **The bag's entire transform, reused verbatim** — translate, tilt and squash. Not a synced copy; the same string, so drift is impossible |
  | Paint order | Before the bag, so the bag always covers them and they can never cross its front |
  | x positions | `88` and `312` reference units via `refX` → `121.6` / `278.4`, just outside the bag silhouette and clear of the handles |
  | Extent | `y −75 → 340` and `y −58 → 328` in reference units, mapped through `refY`; tops clear the bag's own top edge |
  | Stroke | `1.6` and `1.3`, each with its own `userSpaceOnUse` gradient dissolving at **both** ends and peaking across the bag's top edge and shoulders |
  | Opacity | `0.55 · smoothstep(rise) · fall`, `rise` from `p 0.08`, `fall` to zero by `p 1.0`; hard `0` outside the drop |

  The lines run well below the bag's shoulders, with the gradient tailing off
  down its upper sides. That tail is load-bearing: the shoulders are off-stage
  until `p ≈ 0.75`, so lines drawn strictly above them would be invisible for
  three quarters of the fall. With it, the lower tip is inside the frame from
  the first frame and the effect reads for the whole descent.

  **REVISED IN BUILD, three times — each pass caught by a test rather than by
  inspection.**

  1. An early version detached them from the bag entirely, because streaks
     welded to a 334-unit drop sat above the viewBox almost the whole way
     down. Shortening the drop made the attached version viable.
  2. A six-line version carried the bag's *translate only*, to keep the lines
     true vertical. That let the bag's −4° entry tilt swing its silhouette
     across the static line positions: the left line spent the first half of
     its life hidden behind the bag while the right one showed. Sharing the
     full transform fixes it, and the residual lean is under 1.2° by the time
     the lines are visible.
  3. `easeOutCubic` on the fade-in leaves zero at 3× slope, which put 0.148 of
     alpha into a single frame — a pop, caught by the flicker guard.
     `smoothstep` is flat at both ends and is the correct curve for fading
     something in from nothing.

  Both gradient ends dissolve, which does three jobs: no visible caps, the
  frame edge crops the top through the faintest part of the ramp, and the
  lines read as trails rather than as bars. Lengths, weights and stops differ
  between the two deliberately — a matched pair reads as decoration.

### 4.2 Phase 2 — Impact + bounce (600–900 ms)

The moment of contact is the entire credibility of the animation. Three things
must happen within ~80 ms of each other, not simultaneously:

```
impact = t - 600
squash = impact < 90 ? sin((impact / 90) * PI) : 0   // compress: peaks at 45ms
rq     = clamp01((impact - 60) / 240)                // rebound: released at 60ms
bounce = sin(rq * PI) * easeOutCubic(1 - rq)

bagY      =  3 * squash - 14 * bounce      // DOWN into the plate, then up
bagScaleX =  1 + 0.06 * squash + 0.03 * bounce
bagScaleY =  1 - 0.08 * squash - 0.04 * bounce
```

**REVISED IN BUILD.** The v1.0 formulation ran squash and rebound
concurrently, which meant the bag was already travelling *upward* at peak
compression — it bobbed instead of landing. Compression now leads: the bag is
driven 3 units down into the plate and squats, and the rebound is released at
60 ms while that compression is still unwinding. Measured on the built scene:
bag bottom `396px -> 402px` (down) at peak squash, width `217 -> 229`, then
`382px` at the top of the rebound.

- `t = 600–690 ms` — **Squash.** Bag compresses *before* it rebounds
  (`scaleY 0.92`, `scaleX 1.06`), peaking at 45 ms. Origin bottom centre. This
  is what separates "animated" from "a PNG that moved". Purely vertical: the
  bag squats and springs, it does not roll, and it does not leave centre.
- `t = 600–690 ms` — **Plate depression.** Scale compresses `3.5%` on `scaleY`
  about the feet, sharing the squash window so plate and bag move as one. The
  scale *reacts*; a rigid scale kills the weight.
- `t = 610–760 ms` — **Bounce lines** (frame 12): 4 green strokes, staggered
  `0 / 25 / 25 / 50 ms`, each `opacity 0 → 1 → 0` over 180 ms while translating
  outward `6` units and scaling `0.7 → 1.05`. Never all four in lockstep.
- **Shadow counter-beat:** shadow is *tightest and darkest* at contact
  (`scale 1.0`, `opacity 0.20`), relaxes to `0.979 / 0.185` at the top of the
  rebound, and recovers. Nothing computes this — it is what §4.1's
  height-driven shadow does when the bag climbs away from the floor.
- **Handle lag:** bag handles trail the body by ~40 ms with a `±2deg` rotation
  on their own group. Small, but it is the difference between paper and plastic.
  **NOT IMPLEMENTED.** The supplied bag is one flat raster with no separable
  handle layer. Needs a layered re-export; nothing else would change.

### 4.3 Phase 3 — Settle (900–1200 ms)

```
r    = (t - 900) / 300
bagY = -3 * e^(-5r) * sin(12r)        // damped wobble, starts and ends at 0
```

**REVISED IN BUILD — a real defect, found by a numeric probe rather than by
eye.** This phase used `cos`, which is `1` at `r = 0`, so it opened 3 units
above wherever the bounce had just left the bag: a 3-unit teleport on the
exact frame the impact handed over to the settle, every cycle. `sin` starts at
zero and the seam is continuous. Peak per-frame travel is now 18 units at
contact, which is terminal velocity on a 420-unit stage, not a discontinuity.

The settle is purely vertical now — the tilt curve that used to run alongside
it has been removed with the rest of the rotation.

Amplitude `3` units, fully decayed by 1200 ms. The eye reads *settling*, not
*stopping*.

**REVISED IN BUILD.** The specced power-up pulse at `t ≈ 1050 ms` is gone.
The green indicator is now an **initial-state** property of the scale, not a
timeline event: lit at construction, never written again at runtime, so it is
already on when the scale first appears and stays on for the whole cycle. It
cannot blink, cannot wait for the bag, and cannot be re-coloured, because
nothing in the render loop touches it.

It sits at the left end of the display glass (`LED_X = GLASS_X0 + 18`), inside
the display, inside the scale group — so it inherits every transform the scale
does, including the compression at impact. Dead centre, where the source asset
had its own baked-in dot, it showed through the gaps in the readout from
1200 ms: a stray fourth dot beside the `...`, a doubled tittle on the `i`.

### 4.4 Phase 4 — Count (1200–2100 ms)

900 ms ÷ 4 steps = **225 ms per step**.

| Step | Shown | Window |
|---|---|---|
| 1 | `S...` | 1200 – 1425 ms |
| 2 | `SW...` | 1425 – 1650 ms |
| 3 | `SWi...` | 1650 – 1875 ms |
| 4 | `SWiSH` | 1875 – 2100 ms |

**REVISED IN BUILD.** The final step adds *two* glyphs, so they are staggered
70 ms apart (`S` at 1875, `H` at 1945) rather than popping in together — the
readout spells `SWiS` then `SWiSH`. Reveals are driven off an absolute
per-glyph schedule, not step events, so scrubbing or resuming mid-step lands
on exactly the right frame.

Per-step micro-motion — this is what stops it looking like four static frames:

- Each **newly added glyph** fades `opacity 0 → 1` over 90 ms with a
  `translateY(2 → 0)` and `scale(0.92 → 1)`. Already-shown glyphs do not move.
- The trailing `...` is a **separate element** that animates independently and
  is removed on the final step — it never jumps sideways as letters push it
  right. Use a fixed-width / tabular display font so nothing reflows.
- **Glow pump:** on each step the display's outer glow (`drop-shadow`) pulses
  `4px → 7px → 4px` over 120 ms.
- On the final step (`SWiSH`) only: a 120 ms brightness overshoot
  (`#00C853` → `#3DFF8A` → `#00C853`) plus one extra bounce-line flash
  (frame 10 — the success state).

### 4.5 Phase 5 — Done & exit (2100–3340 ms)

- `2100 – 3040 ms` — full `SWiSH` holds while the status indicator finishes:
  the ring folds into the check (2100–2420), the check is held perfectly
  still for 300 ms (2420–2720), the rays ease out and fade in (2720–2860),
  and the Done state holds (2860–3040). The halt is deliberate and total —
  nothing anywhere on the stage moves across it.

  **REVISED IN BUILD.** This phase was originally a 1.2 s glow breathe on the
  readout plus a `±0.5` unit vertical float on the bag, on the reasoning that
  absolute stillness reads as a crashed animation. Both are gone. The float
  went first: anything that lifts the bag off the plate is a gap in the one
  frame the whole animation exists to arrive at, so the bag holds dead level
  and flush. The breathe went with the readout's glow, which had to go for the
  lettering to be crisp. What carries the "still working" signal now is the
  status indicator, and the stillness is the point rather than a problem —
  the 300 ms halt is what makes the rays read as a separate beat.
- `3040 – 3340 ms` — **loop seam.** The whole stage fades `opacity 1 → 0` over
  240 ms (`easeInOutQuad`), 60 ms of blank white, then the cycle restarts with
  the bag already off-stage. Because the first and last rendered frames are both
  *empty white*, the loop is genuinely seamless — no visible snap-back.
- If the app is ready, the same fade doubles as the hand-off transition. Do not
  cut mid-cycle (see §7.4).

---

## 5. Design Tokens

| Token | Value | Use |
|---|---|---|
| `--swish-green` | `#00C853` | Display glyphs, bounce lines |
| `--swish-green-hot` | `#3DFF8A` | Final-step overshoot only |
| `--swish-display-bg` | `#111111` | Display panel |
| `--swish-silver` | `#C0C020` *(as specced — see note)* | Scale body |
| `--swish-kraft` | `#C89563` | Bag body (mid-tone) |
| `--swish-shadow` | `rgba(17,17,17,0.22)` | Ground shadow at peak |
| `--swish-stage-bg` | `#FFFFFF` | Page — **stays pure white throughout** |

> **Note:** `#C0C020` reads as olive, not silver. The reference sheet labels
> it "Scale Silver". **Nothing reads this token at runtime** — the scale is a
> photograph, not tinted vector art — so it stays documentation-only until
> confirmed. Same for `--swish-kraft`. The tokens that *are* live are
> `--swish-green`, `--swish-green-hot`, `--swish-ink` and `--swish-stage-bg`.

The background is `#FFFFFF` and never changes: no gradients, no vignette, no
tinted overlay at any point in the timeline.

---

## 6. Responsiveness

| Rule | Implementation |
|---|---|
| Fluid scaling | Root `<svg>` has `viewBox`, `width: 100%`, `height: auto`. No px `width`/`height` attributes. |
| Container-driven | Stage width = `min(100%, clamp(170px, 42vmin, 340px))`. **REVISED IN BUILD:** `vmin` measures the *viewport*, so the bare clamp overflowed any container narrower than it — a 340px stage inside a 240px card. The `min(100%, …)` is what makes this safe in a sidebar, modal or card, not only a full-screen overlay. |
| Centering | Wrapper: `position: fixed; inset: 0; display: grid; place-items: center;` on a white ground. |
| Proportional strokes | All strokes in user units inside the viewBox — they scale automatically. Do **not** use `vector-effect: non-scaling-stroke` here; it would thin out on large screens. |
| Shadow & blur | `<feGaussianBlur stdDeviation>` in user units, so blur scales with the art. CSS `filter: blur(px)` would **not** scale — avoid it inside the stage. |
| Orientation | `vmin`-based sizing means landscape phones and portrait tablets both behave. |
| Small screens (<360px) | Stage floors at 160px; display tracking tightens so `SWiSH` never clips. |
| Large screens | Caps at 360px — a full-viewport bag looks absurd. The loader is an accent, not a hero. |
| Text zoom / 200% | Stage is `vmin`-based, immune to root font scaling. Any caption uses `rem`. |
| Safe areas | Wrapper padding uses `env(safe-area-inset-*)` so notches never clip the stage. |
| DPR | SVG is resolution-independent; nothing to do. Do **not** rasterise to canvas. |

---

## 7. Exception & Edge-Case Handling

Every one of these is mandatory, not optional hardening.

### 7.1 `prefers-reduced-motion: reduce`
Skip all motion. Render the **final composed state immediately**: bag resting on
the scale, display reading `SWiSH`, no bounce lines, no streaks. A gentle
opacity breathe (2 s, `±4%`) is the only permitted movement — it signals
"working" without vestibular risk. Listen to the media query *live*
(`matchMedia().addEventListener('change')`), not once at mount.

### 7.2 Tab hidden / backgrounded
`requestAnimationFrame` is throttled or halted by the browser. Because the loop
is **time-based** (`elapsed % 3340` from a stored start timestamp) and not
frame-counted, it resumes at the correct point rather than fast-forwarding.
Additionally: on `visibilitychange → hidden`, cancel the rAF; on `→ visible`,
re-anchor the start timestamp so the cycle resumes mid-phase cleanly instead of
snapping.

### 7.3 Frame drops / low-end devices
- Derive **all** state from `performance.now()` deltas. Never accumulate per frame.
- Clamp any single frame's delta to `≤ 100 ms` so a GC pause cannot teleport the bag.
- Batch per-frame writes into one transform string per layer; never trigger
  layout or read `getBoundingClientRect()` inside the loop.
- If mean frame time exceeds 32 ms over 30 frames, drop to **degraded mode**:
  disable bounce lines, streaks, and glow filters (filters are the expensive
  part); keep bag, scale, shadow, and display. Motion stays smooth; only
  garnish is shed.

### 7.4 Load finishes before / after the cycle
- **Finishes early (< 1 cycle):** enforce a **minimum visible time of 900 ms**.
  A loader that flashes for 120 ms is worse than none. If the app is ready
  before that, still play Phases 1–2, then cut to the exit fade.
- **Finishes mid-cycle:** never hard-cut. Jump to the nearest exit fade (240 ms)
  and hand off. Guarantee: the user always sees the bag land.
- **Never finishes (>15 s):** keep looping seamlessly and, after 15 s, fade in a
  small caption below the stage — *"Still working…"* — at `rgba(17,17,17,0.5)`,
  0.875rem. After 30 s, surface a retry affordance. A loader that loops forever
  with no escalation is a dead end.

### 7.4b requestAnimationFrame never fires
**ADDED IN BUILD — missing from v1.0, and the most dangerous case in this
list.** The exit fade is normally driven by the rAF loop. But rAF is not
guaranteed to run: the tab may be hidden when the app signals ready, the page
may be in a throttled webview, or the compositor may simply not be producing
frames. If completion depended on it, the app would stay trapped behind a
loading screen permanently. A `setTimeout(finalise, fade + 80)` safety net is
armed alongside every exit; `finalise()` is idempotent, so whichever path
arrives first wins. Found by the self-test suite, not by inspection.

### 7.5 Asset / font load failure
- Inline the SVG art in the bundle (JSX components, not `<img src>`). This
  removes the failure mode entirely — no network request, no FOUC, no broken
  image icon.
- If the digital display font fails to load, fall back to
  `ui-monospace, "SF Mono", Consolas, monospace` with matching `letter-spacing`.
  The display must be legible in fallback; never rely on the webfont for glyph
  width.
- Wrap the component in an **error boundary**. On any render error, fall back to
  a plain centered `SWiSH` wordmark on white — the page must never show a blank
  void or a React error overlay while loading.

### 7.6 Unmount / cleanup
`cancelAnimationFrame` on unmount. Remove all `matchMedia` and
`visibilitychange` listeners. Null out refs. No `setState` after unmount (guard
with a mounted ref) — this is the classic loader memory leak.

### 7.7 SSR / no `window`
All `window`, `matchMedia`, and `performance` access happens inside
`useEffect`, never during render. Server-rendered markup is the
**reduced-motion final state**, so the first paint is already correct and motion
enhances it. No hydration mismatch.

### 7.8 Accessibility
- Wrapper: `role="status"`, `aria-live="polite"`, `aria-label="Loading"`.
- The counting display is **decorative** — `aria-hidden="true"` on the SVG so
  screen readers do not announce `S`, `SW`, `SWi`, `SWiSH` in sequence.
- A single visually-hidden `<span>Loading, please wait</span>` carries the
  semantics.
- On the >15 s escalation, update the live region **once** — not on every loop.
- `forced-colors: active` (Windows High Contrast): provide a
  `@media (forced-colors: active)` block that keeps shapes legible via
  `stroke: CanvasText` and drops filters.

### 7.9 Print
`@media print { .swish-loader { display: none } }` — a loader has no business on
paper.

### 7.10 Stacking & interaction
- Full-screen overlay: `position: fixed; inset: 0; z-index: 9999;` with
  `pointer-events: none` on the art, and `pointer-events: auto` on the backdrop
  only if it must block input.
- Lock body scroll only if the loader is a blocking overlay; always restore the
  previous `overflow` value on unmount.

### 7.11 Battery / data saver
Respect `navigator.connection.saveData` and `prefers-reduced-data: reduce` —
behave as degraded mode (§7.3).

---

## 8. Performance Budget

| Metric | Target |
|---|---|
| Animated properties | `transform`, `opacity` only |
| Layout / paint per frame | Zero layout, zero paint outside the stage |
| Compositor layers | ≤ 5 (bag, scale, shadow, lines, display) |
| Frame budget | < 4 ms scripting per frame |
| Bundle cost | ~75 KB of inlined raster (**REVISED**: the 40 KB vector budget was unreachable — there are no vector paths to optimise) |
| rAF loops | Exactly 1 |

**Asset debt — resolved.** The eight exports total **~3.9 MB**, all of it
base64 raster. Six are full composed scenes and are not shipped. The two
isolated elements are cropped to their alpha bounds and inlined: **63 KB**
(bag, 242x315) and **11 KB** (scale, 273x74), ~100 KB as base64 in
`swish-assets.js`. That is the entire payload, and it is a hard floor until
the art is redrawn as vectors — there is nothing to optimise, only pixels to
carry. One consequence worth naming: at 1x source, a 340 px stage on a 2x
display upscales the bag ~2.8x. It holds up because the art is soft and
photographic, but a 2x export would be sharper.

Apply `will-change: transform` to moving layers **only for the duration of the
animation**, and remove it on hold/unmount; a permanently promoted layer costs
memory for no benefit.

---

## 9. Component API

```jsx
<SwishLoader
  size={260}                 // base px, clamped responsively — not a hard size
  loop={true}                // false → play once, then hold final state
  onComplete={fn}            // fires at the end of the exit fade
  minDuration={900}          // ms, see §7.4
  reducedMotion={undefined}  // override; defaults to the media query
/>
```

---

## 10. Acceptance Checklist

- [ ] At no point does a single exported frame get swapped for another.
- [ ] Bag visibly **squashes** on contact and the plate visibly **depresses**.
- [ ] The shadow grows/darkens on descent and tightens at impact.
- [ ] Bounce lines are staggered, not simultaneous.
- [ ] Letters appear one at a time with their own fade+rise; existing letters never shift.
- [ ] The loop seam is invisible when watched for 30 s straight.
- [ ] Background is `#FFFFFF` in every frame.
- [ ] Holds 60 fps on a mid-tier Android phone.
- [ ] Reduced-motion renders the final state with no movement.
- [ ] Resizing from 320 px to 2560 px never clips, blurs, or distorts.
- [ ] Backgrounding the tab for 10 s and returning resumes cleanly.
- [ ] Screen reader announces "Loading" once, not the letter sequence.
- [ ] No console errors; no rAF left running after unmount.

---

## 11. Open Questions

1. **`--swish-silver` = `#C0C020`?** Reads olive, labelled silver. Building
   against `#C0C0C0`; confirm.
2. **Loop vs. one-shot default** — is this a route-transition loader (one-shot +
   hand-off) or an app-boot loader (looping)? The spec supports both; default is
   looping.
3. **Escalation copy** at 15 s / 30 s — currently *"Still working… good food
   takes a moment."*, then *"This is taking longer than usual."* plus a Retry
   affordance. Confirm or replace.
4. **The bag carries no SWiSH logo** in any supplied asset, though the
   reference sheet mockup shows one. Built without it. Is a branded bag
   export coming?
