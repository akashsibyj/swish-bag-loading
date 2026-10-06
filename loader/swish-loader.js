/**
 * SWiSH - Bag-on-Scale Loading Animation
 * =====================================================================
 * Framework-free engine. The React wrapper in ./react/SwishLoader.jsx is a
 * thin shell around this same file - there is one implementation of the
 * motion, not two.
 *
 * THE GOVERNING RULE
 * ------------------
 * This is a COMPOSED, CONTINUOUSLY INTERPOLATED scene - not a slideshow of
 * exported frames. Two isolated layers (bag, scale) are moved by transforms
 * at 60fps; the digital readout is live SVG text; the shadow, motion streaks
 * and bounce lines are generated vector art. No full-scene raster is ever
 * displayed, and no asset is ever swapped for another.
 *
 * Every visible value is a pure function of elapsed time. Nothing accumulates
 * frame to frame, so a dropped frame, a throttled background tab, or a GC
 * pause can never desynchronise the animation - it simply resumes at the
 * correct point on the timeline.
 *
 * See SWISH_LOADING_ANIMATION_SPEC.md for the motion spec this implements.
 */

import { BAG_SRC, BAG_W, BAG_H, SCALE_SRC, SCALE_W, SCALE_H } from './swish-assets.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* =====================================================================
 * 1. STAGE GEOMETRY  (all values in viewBox units)
 *
 * The two layers arrive as independent crops with no shared registration,
 * so their relationship is derived from the supplied composite render
 * (assets/swish_loading 1.svg) and reproduced here numerically.
 * ===================================================================== */

const VB_W = 400;
const VB_H = 420;

/**
 * Scene size.
 *
 * Every hand-tuned length below was measured against a reference composition
 * with a 300-unit scale and its plate top at y=290. SCALE_DRAW_W is now the
 * one knob that resizes the whole scene: refX/refY map those reference
 * numbers into the live layout, and U scales the bare lengths.
 *
 * It was reduced from 300 to 210 to buy headroom. At 300 the bag stood 270
 * units tall in a 420-unit stage, leaving 51 units of air above it - so any
 * drop worth the name began off-screen, and for the first half of the fall
 * all you could see was the bag's tapered BASE poking through the top of the
 * frame. An upright bag's base, alone, looks exactly like a bag lying on its
 * side. The bag never rotated; it just could not be seen properly. Now it is
 * whole and level from the first frame to the last.
 */
const REF_SCALE_W = 300;
const REF_PLATE_TOP = 290;

const SCALE_DRAW_W = 210;
const SCALE_DRAW_H = (SCALE_DRAW_W * SCALE_H) / SCALE_W;   // 56.92
const SCALE_X = (VB_W - SCALE_DRAW_W) / 2;                 // 95
/** Scene bottom, leaving room beneath the feet for the ground shadow. */
const SCENE_BOTTOM_Y = 392;
const PLATE_TOP_Y = SCENE_BOTTOM_Y - SCALE_DRAW_H;         // 335.08
const SCALE_BOTTOM_Y = SCENE_BOTTOM_Y;

/** Scene scale relative to the reference composition, and its mappings. */
const U = SCALE_DRAW_W / REF_SCALE_W;                      // 0.7
const refX = (x) => VB_W / 2 + (x - REF_SCALE_W / 2 - 50) * U;
const refY = (y) => PLATE_TOP_Y + (y - REF_PLATE_TOP) * U;

/**
 * Measured off the composite: bag width is 0.6906x the scale width, and the
 * bag's base sits 0.1022x the scale width below the plate's top edge (the
 * plate surface recedes in perspective, so the base sits "back" on it).
 *
 * Only the WIDTH ratio is authored. The height follows from the bag layer's
 * own aspect, so swapping the raster cannot stretch the bag: it keeps its
 * proportions and the numbers below re-derive around it.
 */
const BAG_TO_SCALE_W = 0.6906;
const BAG_SINK_RATIO = 0.1022;

const BAG_DRAW_W = SCALE_DRAW_W * BAG_TO_SCALE_W;          // 145.03
const BAG_DRAW_H = (BAG_DRAW_W * BAG_H) / BAG_W;           // 219.05
const BAG_X = (VB_W - BAG_DRAW_W) / 2;                     // 127.49
const BAG_REST_BOTTOM = PLATE_TOP_Y + SCALE_DRAW_W * BAG_SINK_RATIO; // 356.54
const BAG_Y = BAG_REST_BOTTOM - BAG_DRAW_H;                // 137.49

/** Squash/stretch and tilt pivot: the bag's base, dead centre. */
const PIVOT_X = VB_W / 2;
const PIVOT_Y = BAG_REST_BOTTOM;

/**
 * THE BAG FALLS DOWN A VERTICAL SHAFT.
 *
 * Its motion is one string - `translate(0 <y>)` - on one group. There is no
 * x term, no rotate() and no scale() anywhere in it, so sideways drift and
 * rotation are not "set to zero", they are absent: there is nothing in the
 * document that could express them.
 *
 * The impact squash needs a scale(), so it lives on a SEPARATE inner group
 * (.swish-loader__bag-squash) where it cannot contaminate the fall. Splitting
 * the two is what turns "the bag does not move sideways" from a claim into
 * something you can read off the element in devtools.
 *
 * An earlier revision swayed the bag +6.2deg to -4.6deg on the way down and
 * rocked it upright on landing. All of it is gone.
 *
 * THE OTHER HALF OF THIS IS THE RASTER, and it is easy to miss. For a while
 * the transform above was already `translate(0 y)` and the fall still read
 * as diagonal, because the bag layer was a THREE-QUARTER photograph: visible
 * side panel, handles on a diagonal, body axis leaning. Geometry cannot
 * straighten a picture of a tilted bag. The layer is now a flat-on, mirror-
 * symmetric bag (assets/bag straight.svg), and tools/build-assets.py fails
 * loudly if a future swap reintroduces a lean. A vertical shaft only looks
 * vertical if the thing falling down it is upright to begin with.
 */

/**
 * Fraction of the bag's own height showing at t=0. The rest of it is above
 * the top of the frame, and the frame is what hides it: an SVG clips to its
 * viewBox, so the bag is simply drawn at negative y and the edge cuts it.
 *
 * That is the mechanism on purpose. Nothing fades, nothing is masked and no
 * opacity is touched - the bag is whole and fully opaque for every frame of
 * its fall, and more of it is on screen each frame only because it has moved
 * further down. Reveal and motion are the same single fact.
 */
const ENTRY_VISIBLE = 0.22;

/**
 * Drop distance, measured so the bag ENTERS THE FRAME FROM ABOVE IT rather
 * than starting whole inside it: at t=0 only its base is in view, and the
 * body, handles, tapes and feedback label come down into the frame behind it.
 *
 * Derived, not a literal - the bag's own resting base and its own height are
 * the only inputs, so this stays true if the bag's proportions or the stage
 * change. Everything here is in viewBox units, which is what makes the entry
 * identical on every screen: the viewBox is scaled to whatever box the loader
 * is given, so "22% of the bag showing" is 22% at any height, aspect ratio or
 * DPR. There is not a pixel measurement anywhere in the path.
 *
 * ~-308 units against the old ~-160: the shaft is now the full height of the
 * stage plus the bag's hidden body. T_DROP_END is deliberately NOT changed to
 * match - a longer fall in the same time is simply a faster fall, which is
 * what dropping from higher up means, and it keeps contact at exactly 600ms
 * so every later beat (impact, settle, the SWiSH count) lands where it did.
 *
 * The whole bag clears the top edge at ~64% of the drop, leaving the last
 * ~215ms with it fully in view before it touches down - handles, red tapes
 * and QR label all readable just before the landing, as the reference shows.
 *
 * The motion streaks are anchored to the bag's shoulders and ride its
 * transform, so they enter with it and stay above it; they are drawn before
 * the bag, so the bag paints over them exactly as before.
 */
const DROP_FROM = ENTRY_VISIBLE * BAG_DRAW_H - BAG_REST_BOTTOM;  // ~-308.3

/**
 * Display glass.
 *
 * The scale export has a glass baked into it at x 49..221, y 36..64 of the
 * 273x74 crop. What is drawn is a slightly WIDER pill over that one, so the
 * panel's width stops being whatever the raster happened to bake in: 38..232,
 * same 36..64 vertically.
 *
 * WIDTH ONLY, and the numbers say so. The vertical pair is the baked pair,
 * unchanged, so the height and the vertical position are the same values they
 * have always been - there is no rounding to drift and nothing to re-centre.
 * Sideways the baked pill left 49 rows of metal on each side of a 272-wide
 * body; 38 is a deliberately small step, taking the panel from 63% of the
 * body's width to 71%. Enough to read as more prominent, not enough to turn
 * the bezel into a rim.
 *
 * Centred on x=135, exactly where the baked one is, so GLASS_CX does not move
 * and neither does the readout: the panel grows symmetrically around the text
 * rather than shifting it.
 *
 * Raster coordinates mapped through K, not pixels - the scene is laid out in
 * viewBox units and scaled to whatever box the loader is given, so the panel
 * keeps its proportion to the scale on every screen by construction, and can
 * no more overflow the body than the scale can overflow itself.
 */
const K = SCALE_DRAW_W / SCALE_W;                          // 1.0989
const GLASS_X0 = SCALE_X + 38 * K;
const GLASS_X1 = SCALE_X + 232 * K;
const GLASS_Y0 = PLATE_TOP_Y + 36 * K;                     // baked, untouched
const GLASS_Y1 = PLATE_TOP_Y + 64 * K;                     // baked, untouched
const GLASS_W = GLASS_X1 - GLASS_X0;
const GLASS_H = GLASS_Y1 - GLASS_Y0;                       // unchanged
const GLASS_R = 6 * K;                                     // the baked corner
const GLASS_CX = (GLASS_X0 + GLASS_X1) / 2;                // 198.85, unmoved
const GLASS_CY = (GLASS_Y0 + GLASS_Y1) / 2;                // unmoved

/**
 * Standby indicator, at the left end of the glass.
 *
 * The source asset had its pilot dot dead centre, and centred is where this
 * one started - but the readout is centred too. From 1200ms the dot showed
 * through the gaps in the text: a stray fourth dot beside the "..." at
 * 1300ms, a doubled tittle on the "i" at 1700ms. It only looked right on
 * "SWiSH", where the "i" happened to cover it.
 *
 * LED_X is 18 units inside the glass; the readout never reaches further left
 * than ~147 at any step, so the two can never collide. This is also simply
 * where a standby light lives on real hardware - beside the readout, not
 * underneath it.
 */
const LED_X = GLASS_X0 + 18 * U;
const LED_Y = GLASS_CY;
const LED_R = 2 * U;

/**
 * Processing ring: the indeterminate indicator that runs while the bag is in
 * the air and on its way to rest.
 *
 * Sits below the scale, on PIVOT_X, so it is centred on the scale by sharing
 * the scale's own centre line rather than by a number that has to be kept in
 * step with it. All three values are multiples of U, the scene scale, so the
 * ring holds its proportion to the scale at every size the loader is drawn
 * at - the same mechanism everything else here uses.
 *
 * Sizes measured OFF THE REFERENCE rather than picked: there the stroke is
 * 34px on a 145-156px centreline radius, i.e. 0.228 of the radius, and that
 * ratio is what makes it read as "thin, clean" at any diameter. RING_W is
 * derived from RING_R so the two can never drift apart.
 *
 * The radius is then the largest that fits the band between the scale's feet
 * and the bottom of the stage with a margin to spare, so the ring is as
 * legible as the space allows and still cannot be cropped on any viewport.
 */
const RING_CY = SCALE_BOTTOM_Y + (VB_H - SCALE_BOTTOM_Y) / 2;   // 406
const RING_R = 16 * U;                                     // 11.2 centreline
const RING_W = 0.228 * RING_R;                             // 2.55, the ref ratio
const RING_C = 2 * Math.PI * RING_R;                       // circumference
/** Outer edge of the stroke - what actually has to fit inside the stage. */
const RING_OUTER = RING_R + RING_W / 2;
/** Inner edge - the hole the morph has to close. */
const RING_INNER = RING_R - RING_W / 2;
/**
 * Sampled off the reference. Its progress arc and its finished disc are NOT
 * the same green: the arc is a bright #02E44C, the disc a deeper #01C334,
 * with the bright green reappearing as the glow around it. So the stroke
 * crosses from one to the other as the ring fills, which is why the badge
 * reads as lit from within rather than as a flat green coin.
 */
const RING_GREEN = '#02E44C';
const DONE_GREEN = '#01C334';
const RING_TRACK = '#D8D7D7';

/**
 * DONE badge - the reference's third state, shown once the readout finishes
 * spelling SWiSH. A green disc with a white rim and a white tick, inside a
 * soft green halo.
 *
 * Sized DOWNWARD from the band under the scale rather than outward from a
 * chosen radius, because the halo is the widest thing the loader draws down
 * there and the stage has a hard edge at VB_H. Everything below is derived
 * from (VB_H - RING_CY), so the badge, its halo AND the overshoot of its
 * pop-in are all guaranteed to fit - there is no combination of them that
 * can reach the edge.
 *
 * The halo is a radial GRADIENT, not a blurred filter. A blur's falloff has
 * no definite radius, so it would have been clipped by the stage edge into a
 * hard line; a gradient stops exactly where it is told to. It also costs
 * nothing in degraded mode and survives forced-colours, neither of which is
 * true of a filter.
 *
 * Proportions are the reference's, measured off it: rim centreline at 0.86
 * of the disc radius with a 0.117 stroke, disc 1/1.24 of the halo.
 */
// THE DISC IS THE RING - the same circle element, stroke thickened inward
// until the hole closes. There is no second shape to line up.
//
// It settles a little inside the ring's outer edge, and that is what buys the
// glow. The reference's halo reaches 1.24x its disc; the band under the scale
// is fixed, so the only way to get that ratio is for the disc to end slightly
// smaller than the ring it grew from. The inset is under 10%, it eases in
// over the fill rather than stepping, and the OVERALL footprint is unchanged
// because the halo takes up exactly what the disc gives back.
//
// Exactly the band under the scale. The outermost stop is fully transparent,
// so the halo reaching the stage edge is invisible by construction - there is
// no radius at which it could be cut into a hard line.
const DONE_HALO_R = VB_H - RING_CY;
const DONE_HALO_TO_DISC = 1.24;              // measured off the reference
const DONE_R = DONE_HALO_R / DONE_HALO_TO_DISC;
const DONE_RIM_R = 0.858 * DONE_R;           // white rim, centreline
const DONE_RIM_W = 0.117 * DONE_R;           // the reference's 14px on 120
const DONE_TICK_W = 0.17 * DONE_R;
/** Tick path, in fractions of DONE_R: down-stroke then up-stroke. */
const DONE_TICK = [[-0.40, 0.00], [-0.12, 0.30], [0.44, -0.28]];
/** Its drawn length, computed rather than measured off the live DOM. */
const DONE_TICK_LEN = DONE_TICK.slice(1).reduce(
  (sum, pt, i) => sum + Math.hypot(pt[0] - DONE_TICK[i][0], pt[1] - DONE_TICK[i][1]), 0
) * DONE_R;

/** Ground shadow. */
const SHADOW_CY = SCALE_BOTTOM_Y + 6 * U;
const SHADOW_RX = 142 * U;
const SHADOW_RY = 11 * U;
const SHADOW_BLUR = 7 * U;

/* =====================================================================
 * 2. TIMELINE  (ms)
 * ===================================================================== */

/** Cycle-start fade-in. Mirrors the exit fade so the loop seam stays clean. */
const T_INTRO = 140;
const T_DROP_END = 600;
/** Compression window at contact. Bag and plate share it, so they move as one. */
const SQUASH_MS = 90;
const T_IMPACT_END = 900;
const T_SETTLE_END = 1200;
const T_COUNT_START = 1200;

/**
 * The ring runs from the first frame through the fall, the impact and the
 * settle, then hands over to the readout.
 *
 * It fades across exactly the window the placeholder dots fade IN over
 * (T_DOTS_IN before the count), so the handover is a crossfade between the
 * two loading states rather than one disappearing and the other arriving.
 * Expressed off T_COUNT_START, so it cannot drift from the sequence.
 *
 * The arc is DETERMINATE, which is what the reference shows: its two states
 * differ only in how far the head has swept, and both start from the same
 * place at twelve o'clock. So the tail is anchored there and the head runs
 * clockwise as the weigh proceeds. Nothing spins; the segment grows.
 *
 * It grows in two legs. The first covers the weigh and ends on the
 * reference's "Weighing" state as the bag settles; the second runs under the
 * readout and closes the circle exactly as SWiSH finishes, which is what the
 * morph then has to work with.
 *
 * THE RING IS NEVER HIDDEN. There is no fade-out and no second element: one
 * indicator runs from the first frame through to the tick, and the tick is
 * that same circle with its stroke thickened shut. An earlier pass faded it
 * at the handover and popped a separate badge in later, which is exactly the
 * "disappears and is replaced" reading this avoids.
 */
/** How long the ring takes to become the tick, once the readout is done. */
const T_DONE_IN = 420;

// Measured off the reference: its "Processing" arc sweeps 85deg (24% of the
// circle) and its "Weighing" arc 204deg (57%).
const PROC_MIN = 0.24;                   // arc at t=0, as a fraction of C
const PROC_MID = 0.57;                   // arc at the settle
/**
 * One step per cell. Five cells now take a turn each, where the old readout
 * fired the last two 70ms apart as a finale flourish - at that spacing
 * "SWis." was four frames long, which is a flicker, not a state. Spacing is
 * 202.5 so the fifth reveal COMPLETES exactly on T_COUNT_END; the count
 * still starts and ends where it always did.
 */
const T_STEP = 202.5;
const T_COUNT_END = 2100;
/** Placeholder dots ramp up just before the count, so "....." is seen. */
const T_DOTS_IN = 120;
const T_HOLD_END = 2700;
const T_FADE = 240;
const T_CYCLE = 3000;

/**
 * A FIXED FIVE-CELL DISPLAY.
 *
 *   cell:   1 2 3 4 5
 *           . . . . .
 *           S . . . .
 *           S W . . .
 *           S W i . .
 *           S W i S .
 *           S W i S H
 *
 * Every cell holds both a placeholder dot and its letter, pinned to the same
 * x. Revealing cell i crossfades that pair in place: the dot goes out as the
 * letter comes in, and nothing else on the display is touched. So a letter
 * cannot shift when its neighbour arrives - there is no layout to redo.
 *
 * This replaces a trailing "..." that lived beside the letters and marched
 * one cell right per step. That version had to move to stay adjacent to a
 * growing word, and moving is precisely what a readout must not do.
 */
const GLYPHS = ['S', 'W', 'i', 'S', 'H'];
const REVEAL_AT = GLYPHS.map((_, i) => T_COUNT_START + i * T_STEP);
const REVEAL_MS = 90;

/**
 * Monospace cell grid. Cell i is fixed at CELL0_CX + i * CELL_W and never
 * moves, so the readout types left-to-right: the "S" lands on cell 0 and
 * stays there while W, i, S, H fill the cells to its right.
 *
 * The grid is laid out so the finished "SWiSH" is optically centred in the
 * glass, which fixes where cell 0 - and therefore the left edge of every
 * intermediate state - sits.
 *
 * An earlier version re-centred the whole block on each step, because the
 * trailing "..." makes the *lit* run (letters + 3 cells) grow off-centre.
 * That traded a centred block for a moving one: the "S" slid ~4px left when
 * the "i" appeared and slid back when it left. A readout that repositions
 * text the reader has already started reading is worse than one whose lit
 * run sits a little right of centre, so the block is now pinned.
 */
const CELL_W = 14.5 * U;
const FONT_SIZE = 21 * U;
const CELL0_CX = GLASS_CX - (GLYPHS.length * CELL_W) / 2 + CELL_W / 2;

/* =====================================================================
 * 3. EASING
 * ===================================================================== */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Channel-wise blend of two #rrggbb strings. */
function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = '#';
  for (let sh = 16; sh >= 0; sh -= 8) {
    const va = (pa >> sh) & 255;
    const v = Math.round(va + (((pb >> sh) & 255) - va) * k);
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * The fall: accelerate, then cushion into contact.
 *
 *   2p^2 - p^3      position
 *   4p  - 3p^2      velocity: 0 at release, peaks 1.333 at p=2/3, 1.0 at contact
 *
 * Pure gravity (p*p) is still accelerating hard at the moment of
 * impact - 2.0 in these units, 18 units of travel in the final frame. The
 * storyboard asks for the bag to ease as it nears the plate, so velocity
 * peaks two thirds of the way down and sheds ~25% before it lands. It still
 * arrives with real speed, which is what sells the compression; it just
 * stops gaining.
 */
const easeFallCushion = (p) => p * p * (2 - p);
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInOutQuad = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
/** Flat slope at BOTH ends - the right curve for fading something in from
 *  nothing. easeOutCubic leaves the ground at 3x, which shows as a pop. */
const smoothstep = (p) => p * p * (3 - 2 * p);
const lerp = (a, b, p) => a + (b - a) * p;

/* =====================================================================
 * 4. PHASE SOLVERS - each is a pure function of elapsed time
 * ===================================================================== */

/** Bag vertical position and impact squash. A pure vertical drop. */
function solveBag(t) {
  let y = 0;
  let sx = 1;
  let sy = 1;

  if (t < T_DROP_END) {
    // --- Phase 1: straight down. Accelerate, then cushion into the plate.
    //
    // Nothing but y changes here. No tilt, and no stretch either - the bag is
    // released level, at its natural size, and arrives that way. It begins
    // above the frame and the frame's own edge crops it (see ENTRY_VISIBLE);
    // this single y is both the fall and the reveal.
    y = DROP_FROM * (1 - easeFallCushion(t / T_DROP_END));
  } else if (t < T_IMPACT_END) {
    // --- Phase 2: compress, THEN rebound. The ordering is the whole point:
    // the bag must be driven down into the plate and squat before anything
    // lifts it. Overlap the two and you get a bag that bobs, not one that
    // lands. This is the detail that separates "animated" from "a picture
    // that moved".
    const impact = t - T_DROP_END;

    // Compression: down and wide over 90ms, peaking at 45ms.
    const squash = impact < SQUASH_MS ? Math.sin((impact / SQUASH_MS) * Math.PI) : 0;

    // Rebound: released at 60ms, while the compression is still unwinding.
    const rq = clamp01((impact - 60) / 240);
    const bounce = Math.sin(rq * Math.PI) * easeOutCubic(1 - rq);

    // Vertical only: the bag compresses downward and springs back up. It
    // does not roll, and it does not move off centre while doing it.
    y = (3 * squash - 14 * bounce) * U;
    sx = 1 + 0.06 * squash + 0.03 * bounce;
    sy = 1 - 0.08 * squash - 0.04 * bounce;
  } else if (t < T_SETTLE_END) {
    // --- Phase 3: damped residual wobble, decayed to sub-pixel by
    // T_SETTLE_END.
    //
    // sin, not cos. A cosine is 1 at r=0, so this phase used to open 3 units
    // above wherever the bounce had just left the bag - a 3-unit teleport
    // every cycle, on the exact frame the impact hands over to the settle.
    // sin starts at zero and the seam is continuous.
    const r = (t - T_IMPACT_END) / (T_SETTLE_END - T_IMPACT_END);
    y = -3 * U * Math.exp(-5 * r) * Math.sin(12 * r);
  }
  // else - phases 4 and 5: dead level, dead still, flush on the plate.
  // No float here on purpose: the lit readout and standby LED carry the
  // "still working" signal, and anything that lifts the bag off the plate would
  // show as a gap in the one frame the whole animation exists to arrive at.

  // lowY: height of the bag's contact edge above its resting line, 0 = down.
  // The base is flat and stays flat, so it equals y - but the shadow reads it
  // by name, and that contract should not depend on the bag happening to be
  // level today.
  return { y, lowY: y, sx, sy };
}

/**
 * Plate compression. The scale must visibly react to the impact - a rigid
 * scale destroys any sense of the bag having weight.
 * Returns a 0..1 amount; the caller converts it to a scaleY about the feet.
 */
function solvePlate(t) {
  const impact = t - T_DROP_END;
  if (impact < 0 || impact > SQUASH_MS) return 0;
  return Math.sin((impact / SQUASH_MS) * Math.PI);
}

/**
 * Ground shadow: grows and darkens as the bag descends, tightest at contact.
 *
 * Driven by the bag's ACTUAL height, not by a clock. This used to be a
 * separate time curve that re-derived the descent and hand-wrote its own
 * rebound counter-beat - two descriptions of one motion, free to disagree.
 * Now there is one: feed it where the bag is and the counter-beat falls out,
 * because a rebounding bag is by definition climbing away from the floor.
 *
 * Two terms, because one cannot do both jobs:
 *   far  - the whole descent, over the full 330 units. Broad, slow growth.
 *   near - contact hardening, over the last 40 units. This is what makes the
 *          14-unit rebound legible; against the full drop it is 4% and would
 *          vanish.
 *
 * @param {number} lowY  height of the bag's contact point above rest; 0 = down
 */
function solveShadow(lowY) {
  const far = clamp01(1 - lowY / DROP_FROM);
  const near = clamp01(1 + lowY / (40 * U));
  return {
    s: 0.86 + 0.084 * far + 0.056 * near,
    o: 0.1 + 0.06 * far + 0.04 * near
  };
}

/**
 * Motion streaks - thin vertical lines trailing up off the bag's shoulders.
 *
 * Coordinates are in the bag's REST space, and the group is translated by the
 * bag's live `y` every frame, so the lines are positioned from the bag's
 * actual animated position rather than from anything viewport-relative. They
 * therefore hold their spacing and offset at every stage size and aspect
 * ratio, with no per-breakpoint tuning.
 *
 * The x values are measured against the bag's real silhouette: its shoulders
 * only span x 151-268 above y~105, while the body flares to x 96-302 below
 * that. Every line sits in the clear space outside the silhouette. As a
 * second guarantee the whole group paints BEFORE the bag, so even an overlap
 * would be hidden behind it rather than drawn across it.
 *
 * Bottoms are staggered (212 / 168 / 100) so the lines enter the frame in
 * sequence as the bag accelerates down into it, instead of all switching on
 * together.
 */
/**
 * The two speed lines, in the bag's own rest coordinates.
 *
 * x is set just outside the bag's widest point (its silhouette spans
 * x 96-302), so each line clears the bag by a few units at every height.
 * Because the group now carries the bag's FULL transform, that clearance is
 * fixed - it cannot drift as the bag tilts, stretches or scales.
 *
 * Tops reach above the bag's own top edge (y=51); bottoms sit around its
 * upper-mid body. Both ends dissolve into the gradient, so neither terminates
 * in a visible cap.
 *
 * Lengths and weights differ between the two on purpose - a matched pair
 * reads as decoration, an unmatched pair reads as motion.
 */
const STREAKS = [
  { x: 88, y1: -75, y2: 340, w: 1.6 },   // upper-left
  { x: 312, y1: -58, y2: 328, w: 1.3 }   // upper-right
].map((S) => ({ x: refX(S.x), y1: refY(S.y1), y2: refY(S.y2), w: S.w * U }));

/**
 * Streak opacity, as one continuous curve: in with the acceleration, out by
 * the moment of contact. Returning a hard 0 outside the drop is what
 * guarantees no line can survive into a landed frame, none can appear before
 * the fall starts, and a restarted loop begins clean.
 *
 * Peak is deliberately low. These are a speed cue, not a graphic element.
 */
function solveStreaks(t) {
  if (t <= 0 || t >= T_DROP_END) return 0;
  const p = t / T_DROP_END;
  // In early - the lines are readable from the first frames of the fall -
  // and back to zero by contact.
  const rise = clamp01((p - 0.08) / 0.35);
  // Fade-out spans ~108ms. A shorter one blinks: at this amplitude a 60ms
  // fade moves 0.13 of alpha per frame, which the flicker guard rejects.
  const fall = 1 - clamp01((p - 0.82) / 0.18);
  return 0.55 * smoothstep(rise) * fall;
}

/**
 * Processing ring. Like everything else here, a pure function of t: the arc's
 * position and length are computed from the clock, never accumulated frame to
 * frame, so a backgrounded tab or a scrub lands on exactly the right frame.
 *
 * Returns the arc as fractions of the circumference, leaving the stroke
 * arithmetic to the renderer.
 */
function solveRing(t) {
  // Eased, not linear: a progress ring that advances at a dead constant rate
  // reads as a clock rather than as work being done.
  if (t < T_SETTLE_END) {
    return {
      arc: PROC_MIN + (PROC_MID - PROC_MIN) *
        easeInOutQuad(clamp01(t / T_SETTLE_END))
    };
  }
  return {
    arc: PROC_MID + (1 - PROC_MID) *
      easeInOutQuad(clamp01((t - T_SETTLE_END) / (T_COUNT_END - T_SETTLE_END)))
  };
}

/**
 * Done badge. Zero until the readout has finished spelling SWiSH, then pops
 * in. Pure in t like everything else, so a scrub lands on the right frame.
 *
 * Opacity arrives faster than the scale so the badge is already visible as it
 * springs, rather than fading in at its final size.
 */
function solveDone(t) {
  // 0 = still a ring, 1 = fully the completed tick. Every part of the morph
  // is a phase of this one number, so nothing can get out of step, and
  // scrubbing backwards unwinds it exactly.
  const p = easeInOutQuad(clamp01((t - T_COUNT_END) / T_DONE_IN));

  // FILL, expressed as the stroke's two EDGES rather than as a radius and a
  // width, because the edges are what the eye reads and what has to behave:
  //
  //   inner  closes to the centre, and gets there at 70% of the fill - early,
  //          so the last of the fill cannot leave a pinhole showing through
  //          the middle of the badge.
  //   outer  eases from the ring's rim to the disc's, never outward.
  //
  // r and w are then just the midpoint and the span. Deriving them this way
  // also keeps r comfortably above zero: a circle with r = 0 paints NOTHING
  // however wide its stroke, which is what made the disc vanish at the end of
  // the morph and left only the halo showing - a pale ghost, not a badge.
  const fill = clamp01(p / 0.5);
  const inner = RING_INNER * (1 - clamp01(fill / 0.7));
  const outer = RING_OUTER + (DONE_R - RING_OUTER) * fill;
  return {
    p,
    r: (outer + inner) / 2,
    w: outer - inner,
    outer,
    green: fill,
    // The track has to go as the disc insets. While the arc is at full width
    // the track is hidden behind it, but the finished disc is smaller than
    // the ring was, and a grey hoop would be left standing around it.
    track: 1 - fill,
    halo: clamp01((p - 0.15) / 0.5),
    rim: clamp01((p - 0.42) / 0.33),
    tick: clamp01((p - 0.5) / 0.5)
  };
}

/**
 * Digital readout. Computed analytically from `t` rather than driven by
 * step events, so resuming mid-phase after a backgrounded tab lands on
 * exactly the right frame.
 */
function solveDisplay(t) {
  const reveal = REVEAL_AT.map((at) => clamp01((t - at) / REVEAL_MS));

  // Placeholder dots: all five ramp up together just before the count, then
  // each is extinguished by its own letter. Dot i and letter i share a cell,
  // so this is a crossfade in place, not a move.
  const dotsIn = clamp01((t - (T_COUNT_START - T_DOTS_IN)) / T_DOTS_IN);
  const dots = reveal.map((r) => dotsIn * (1 - r));

  // The final step overshoots to the hot green. There is deliberately no
  // blur term here - the readout is flat typography, and its only per-step
  // emphasis is colour.
  const finalP = clamp01((t - REVEAL_AT[GLYPHS.length - 1]) / 120);
  const hot = finalP > 0 && finalP < 1 ? Math.sin(finalP * Math.PI) : 0;

  return { reveal, dots, hot };
}

/**
 * Impact marks: two per side, dark grey, thrown off the moment the bag lands.
 *
 *        \\   BAG   //        upper pair: 45 deg, outer end HIGHER
 *        --  BAG  --         lower pair: near-horizontal
 *
 * Replaces an earlier set of four green dashes. Those read as speed trails
 * rather than impact: the steeper line sat low, the shallow one high, and the
 * outer ends pointed down. Colour, angle, length, spacing and placement are
 * all different here, not just the fill.
 *
 * Coordinates are the reference composition's, mapped through refX/refY, so
 * they scale with the scene like everything else - no viewport pixels, no
 * breakpoints. Inner ends sit 13-16 units clear of the bag's silhouette
 * (which spans x 96.4-303.6) and every line stays above the plate's top edge
 * at y=290, so they touch neither the bag nor the scale.
 *
 * The pair on each side is kept well apart vertically. Butted closer they
 * merge into a single chevron pointing at the bag, which is a different mark
 * altogether - the reference has two clearly separate strikes.
 *
 * The stagger is in time only; placement is mirror-symmetric.
 */
const LINES = [
  { x1: 52, y1: 228, x2: 80, y2: 256, d: 0 },    // left  upper diagonal
  { x1: 348, y1: 228, x2: 320, y2: 256, d: 20 }, // right upper diagonal
  { x1: 45, y1: 279, x2: 77, y2: 276, d: 40 },   // left  lower, near-flat
  { x1: 355, y1: 279, x2: 323, y2: 276, d: 55 }  // right lower, near-flat
].map((L) => ({
  x1: refX(L.x1), y1: refY(L.y1), x2: refX(L.x2), y2: refY(L.y2), d: L.d
}));
/** Long enough to cover the bounce and be gone before the readout starts. */
const LINE_MS = 260;
const LINE_COLOR = '#3a3a3a';

/**
 * One appearance only, at contact. An earlier version flashed the marks a
 * second time on the "SWiSH" reveal as a success beat; that put impact marks
 * on screen a second after the bag had finished settling, which is exactly
 * what they are not.
 */
function solveLine(t, i) {
  const p = (t - (T_DROP_END + 10 + LINES[i].d)) / LINE_MS;
  if (p < 0 || p > 1) return null;
  const best = p;
  return {
    o: Math.sin(best * Math.PI),
    push: 6 * U * easeOutCubic(best),
    s: lerp(0.7, 1.05, easeOutCubic(best))
  };
}

/* =====================================================================
 * 5. DOM CONSTRUCTION
 * ===================================================================== */

function el(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

let uid = 0;

function buildStage() {
  const id = `swish-${++uid}`;
  const svg = el('svg', {
    viewBox: `0 0 ${VB_W} ${VB_H}`,
    xmlns: SVG_NS,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'swish-loader__svg',
    'aria-hidden': 'true',
    focusable: 'false'
  });

  const defs = el('defs', {});

  // Shadow blur is expressed in USER UNITS, so it scales with the artwork.
  // A CSS `filter: blur(Npx)` would not, and would visibly break at size.
  const sf = el('filter', {
    id: `${id}-shadow`,
    x: '-50%', y: '-200%', width: '200%', height: '500%'
  });
  sf.appendChild(el('feGaussianBlur', { stdDeviation: SHADOW_BLUR.toFixed(2) }));
  defs.appendChild(sf);

  // Halo for the STANDBY LED ONLY. This used to sit on the whole display
  // group, which meant the readout was painted through a Gaussian blur and
  // every letter carried a soft green duplicate of itself. The lettering is
  // now flat: no filter anywhere on its ancestry, so what rasterises is the
  // glyph outline and nothing else, at whatever DPR the device asks for.
  //
  // The LED keeps its bloom because a lit indicator behind glass is exactly
  // what a halo is for, and unlike type it has no edges to lose. Its
  // stdDeviation is fixed - nothing writes it at runtime.
  const gf = el('filter', {
    id: `${id}-led`,
    x: '-260%', y: '-260%', width: '620%', height: '620%'
  });
  gf.appendChild(el('feGaussianBlur', { stdDeviation: (2.2 * U).toFixed(2), result: 'b' }));
  const merge = el('feMerge', {});
  merge.appendChild(el('feMergeNode', { in: 'b' }));
  merge.appendChild(el('feMergeNode', { in: 'b' }));
  merge.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  gf.appendChild(merge);
  defs.appendChild(gf);

  // Glass fill. The baked panel is not flat - it is ~#111 at the left,
  // #131313 across the middle and lifts toward #2a2a2a at its right end, a
  // faint sheen off the bezel. Sampled from the raster and reproduced so the
  // wider panel reads as the same piece of glass rather than as a flat black
  // rectangle pasted over the scale.
  const gg = el('linearGradient', {
    id: `${id}-glass`, x1: '0', y1: '0', x2: '1', y2: '0'
  });
  for (const [o, c] of [['0', '#101010'], ['0.45', '#131313'],
                        ['0.85', '#1b1b1b'], ['1', '#262626']]) {
    gg.appendChild(el('stop', { offset: o, 'stop-color': c }));
  }
  defs.appendChild(gg);

  // Done halo. Opaque-ish at the disc's edge, gone by the gradient's own
  // radius - which is set so it lands inside the stage, so the glow fades out
  // rather than being cut off by it.
  const hg = el('radialGradient', { id: `${id}-halo` });
  // Almost all of this sits BEHIND the disc, so the stops that matter are the
  // last few. They are bunched up against the rim to put the whole falloff in
  // the narrow band that is actually visible - the band under the scale is
  // only so deep, and a gradient spread evenly over the full radius would
  // spend its gradient where nothing can see it.
  for (const [o, c, a] of [['0', RING_GREEN, '1'], ['0.86', RING_GREEN, '1'],
                           ['0.92', RING_GREEN, '0.62'], ['0.97', RING_GREEN, '0.22'],
                           ['1', RING_GREEN, '0']]) {
    hg.appendChild(el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }));
  }
  defs.appendChild(hg);

  // One gradient per streak, spanning that line's own length, so each fades
  // to nothing at its top end. This is what stops them reading as solid bars:
  // there is no drawn end up there, just a trail thinning out. It also means
  // the frame edge crops each line through a faint part of its ramp rather
  // than through a hard stroke.
  STREAKS.forEach((S, i) => {
    const sg = el('linearGradient', {
      id: `${id}-streak-${i}`,
      gradientUnits: 'userSpaceOnUse',
      x1: 0, y1: S.y1, x2: 0, y2: S.y2
    });
    // Uneven stops, and different per line, so neither reads as a clean
    // mechanical ramp.
    // Transparent at BOTH ends, peaking across the bag's top edge and
    // shoulders - which is what puts the weight of the effect ABOVE the bag
    // while still leaving a faint tail running down past its upper sides.
    //
    // The tail is what makes the lines readable for the whole fall rather
    // than only its last third: the bag's shoulders are off-stage until
    // ~450ms, so anything drawn strictly above them is invisible until then.
    // The tail's lower tip is inside the frame from the first frame.
    //
    // Transparent ends also mean neither line terminates in a visible cap,
    // and the frame edge crops the top through its faintest part. Uneven and
    // different per line, so neither reads as a mechanical ramp.
    // Offsets re-derived for the longer tails; the peak still lands across
    // the bag's top edge and shoulders.
    const stops = i === 0
      ? [[0, 0], [0.15, 0.28], [0.31, 0.95], [0.46, 1], [0.64, 0.42], [1, 0]]
      : [[0, 0], [0.13, 0.24], [0.29, 0.9], [0.44, 1], [0.62, 0.38], [1, 0]];
    for (const [off, op] of stops) {
      sg.appendChild(
        el('stop', { offset: String(off), 'stop-color': '#111111', 'stop-opacity': String(op) })
      );
    }
    defs.appendChild(sg);
  });

  svg.appendChild(defs);

  /* --- ground shadow ------------------------------------------------ */
  const shadow = el('ellipse', {
    cx: PIVOT_X, cy: SHADOW_CY, rx: SHADOW_RX, ry: SHADOW_RY,
    fill: '#111111', filter: `url(#${id}-shadow)`, opacity: '0.1'
  });
  svg.appendChild(shadow);

  /* --- processing ring, which becomes the tick ------------------------
     ONE indicator, five layers, bottom to top:

        halo   soft green glow, off until the morph
        track  the full light-grey ring
        arc    the green progress segment - and, once its stroke is
               thickened shut, the green disc the tick sits on
        rim    white ring inside the disc edge, off until the morph
        tick   white check, drawn on by its own dash

     The arc IS the disc. Not a second shape of the same size: the same
     circle element, so the tick cannot land anywhere but exactly where the
     ring was, at exactly the size it was. Nothing is ever swapped out.

     The -90deg rotation puts the dash origin at twelve o'clock, where the
     reference anchors both of its progress states. Nothing rotates and
     nothing is offset at runtime: the segment grows clockwise from that
     anchor while the tail stays put.

     On the svg root, NOT in the scale group, so the plate's compression at
     impact cannot squash it - it is on the ground. */
  const ringG = el('g', { class: 'swish-loader__ring' });
  const ringHalo = el('circle', {
    class: 'swish-loader__done-halo',
    cx: PIVOT_X, cy: RING_CY, r: DONE_HALO_R,
    fill: `url(#${id}-halo)`, opacity: '0'
  });
  ringG.appendChild(ringHalo);
  const ringTrack = el('circle', {
    cx: PIVOT_X, cy: RING_CY, r: RING_R,
    fill: 'none', stroke: RING_TRACK, 'stroke-width': RING_W
  });
  ringG.appendChild(ringTrack);
  const ringArc = el('circle', {
    cx: PIVOT_X, cy: RING_CY, r: RING_R,
    fill: 'none', stroke: RING_GREEN, 'stroke-width': RING_W,
    'stroke-linecap': 'round',
    'stroke-dashoffset': '0',
    transform: `rotate(-90 ${PIVOT_X} ${RING_CY})`
  });
  ringG.appendChild(ringArc);
  const ringRim = el('circle', {
    cx: PIVOT_X, cy: RING_CY, r: DONE_RIM_R,
    fill: 'none', stroke: '#FFFFFF', 'stroke-width': DONE_RIM_W, opacity: '0'
  });
  ringG.appendChild(ringRim);
  const ringTick = el('polyline', {
    points: DONE_TICK
      .map(([x, y]) => `${(PIVOT_X + x * DONE_R).toFixed(3)},${(RING_CY + y * DONE_R).toFixed(3)}`)
      .join(' '),
    fill: 'none', stroke: '#FFFFFF', 'stroke-width': DONE_TICK_W,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'stroke-dasharray': `0 ${(DONE_TICK_LEN + 1).toFixed(3)}`, opacity: '0'
  });
  ringG.appendChild(ringTick);
  svg.appendChild(ringG);

  /* --- scale (its own group so it can compress under the impact) ----- */
  const scaleG = el('g', { class: 'swish-loader__scale' });
  scaleG.appendChild(
    el('image', {
      href: SCALE_SRC, x: SCALE_X, y: PLATE_TOP_Y,
      width: SCALE_DRAW_W, height: SCALE_DRAW_H
    })
  );

  /* --- digital readout: live text, never a raster ------------------- */
  const displayG = el('g', { class: 'swish-loader__display' });

  /**
   * The panel itself, drawn over the one baked into the scale raster. It is
   * wider than the baked pill and exactly as tall, so it hides it completely.
   *
   * A child of displayG, which is a child of scaleG, so it inherits every
   * transform the scale takes - the plate's compression at impact included.
   * It cannot drift from the metal it sits in, and the readout cannot drift
   * from it: both are positioned off the same GLASS_* box.
   *
   * Drawn FIRST, so the LED and the glyphs paint on top of it.
   */
  const glass = el('rect', {
    class: 'swish-loader__glass',
    x: GLASS_X0, y: GLASS_Y0, width: GLASS_W, height: GLASS_H,
    rx: GLASS_R, ry: GLASS_R,
    fill: `url(#${id}-glass)`
  });
  displayG.appendChild(glass);

  /**
   * Standby indicator. Lit at construction and never written again at
   * runtime - not by the timeline, not by the impact, not by reduced motion.
   * Being absent from the render loop is what makes "it cannot blink,
   * cannot wait for the bag, cannot be re-coloured" a structural property
   * rather than something to keep remembering.
   *
   * It lives inside the display, inside the scale group, so it inherits
   * every transform the scale does - including the compression at impact -
   * and is positioned in viewBox units like everything else. See LED_X for
   * why it sits at the left of the glass rather than dead centre.
   */
  const pilot = el('circle', {
    class: 'swish-loader__led',
    cx: LED_X, cy: LED_Y, r: LED_R, fill: '#00C853', opacity: '1',
    filter: `url(#${id}-led)`
  });
  displayG.appendChild(pilot);

  // Groups the readout only; it carries no transform and must not acquire
  // one. Anything applied here moves letters that are already on screen.
  const blockG = el('g', {});
  const glyphs = GLYPHS.map((ch, i) => {
    const t = el('text', {
      x: 0, y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': FONT_SIZE,
      class: 'swish-loader__glyph',
      opacity: '0'
    });
    t.textContent = ch;
    const g = el('g', { transform: `translate(${CELL0_CX + i * CELL_W} ${GLASS_CY})` });
    g.appendChild(t);
    blockG.appendChild(g);
    return { outer: g, text: t, i };
  });

  /**
   * One placeholder dot per cell, on the same x as the letter it waits for.
   *
   * They are appended AFTER all five letter cells rather than interleaved
   * with them, which keeps the letters at text indices 0..4 for anything
   * walking the DOM, and keeps them out of the letters' cell groups - those
   * take a scale() during the reveal pop, and a dot has no business popping
   * on its way out. It only fades.
   */
  const dotsG = el('g', {});
  const dots = GLYPHS.map((_, i) => {
    const d = el('text', {
      x: 0, y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': FONT_SIZE,
      class: 'swish-loader__glyph',
      opacity: '0'
    });
    d.textContent = '.';
    const g = el('g', { transform: `translate(${CELL0_CX + i * CELL_W} ${GLASS_CY})` });
    g.appendChild(d);
    dotsG.appendChild(g);
    return d;
  });
  blockG.appendChild(dotsG);

  displayG.appendChild(blockG);
  scaleG.appendChild(displayG);
  svg.appendChild(scaleG);

  /* --- motion streaks -------------------------------------------------
     Two thin vertical speed lines, one off each of the bag's upper corners.

     Appended BEFORE the bag, so the bag always paints over them - they can
     never appear across its front.

     They are given the bag's ENTIRE transform every frame - translate, tilt
     and squash alike - so their position relative to the bag is fixed by
     construction rather than maintained by arithmetic. An earlier pass gave
     them the translate only, to keep them true vertical; that let the bag's
     -4deg entry tilt swing its silhouette across the lines, and the left one
     spent the first half of its life hidden behind the bag while the right
     one showed. Sharing the transform is what makes them survive rotation and
     scale. The residual lean is under 1.2deg by the time they are visible. */
  const streakG = el('g', { class: 'swish-loader__streaks', opacity: '0' });
  STREAKS.forEach((S, i) => {
    streakG.appendChild(
      el('line', {
        x1: S.x, y1: S.y1, x2: S.x, y2: S.y2,
        stroke: `url(#${id}-streak-${i})`,
        'stroke-width': S.w,
        'stroke-linecap': 'butt'
      })
    );
  });
  svg.appendChild(streakG);

  /* --- bag -------------------------------------------------------------
     Two nested groups, deliberately:

       .swish-loader__bag         translate(0 y)   <- the entire fall
       .swish-loader__bag-squash  scale(sx sy)     <- impact only

     The outer group is the vertical shaft. Nothing else is ever written to
     it, so the bag cannot drift sideways or rotate even by accident. */
  const bagG = el('g', { class: 'swish-loader__bag' });
  const bagSquash = el('g', { class: 'swish-loader__bag-squash' });
  bagSquash.appendChild(
    el('image', {
      href: BAG_SRC, x: BAG_X, y: BAG_Y, width: BAG_DRAW_W, height: BAG_DRAW_H
    })
  );
  bagG.appendChild(bagSquash);
  svg.appendChild(bagG);

  /* --- impact marks ----------------------------------------------------
     In their own group, which carries the bag's transform, so they are tied
     to the bag rather than to the stage and cannot drift from it at any size.
     Inserted BEFORE the bag, so the bag paints over them and they can never
     appear across it. */
  const impactG = el('g', { class: 'swish-loader__impact' });
  const lineEls = LINES.map((L) => {
    const g = el('g', { opacity: '0' });
    g.appendChild(
      el('line', {
        x1: L.x1, y1: L.y1, x2: L.x2, y2: L.y2,
        stroke: LINE_COLOR, 'stroke-width': 4 * U, 'stroke-linecap': 'round'
      })
    );
    impactG.appendChild(g);
    return g;
  });
  svg.insertBefore(impactG, bagG);

  return { svg, shadow, scaleG, displayG, pilot, blockG, glyphs, dots, dotsG, streakG, bagG, bagSquash, impactG, glass, ringG, ringArc, ringTrack, ringHalo, ringRim, ringTick, lineEls, filterIds: [`${id}-led`] };
}

/* =====================================================================
 * 6. THE LOADER
 * ===================================================================== */

/**
 * @param {object}      opts
 * @param {HTMLElement} opts.mount        container to render into (required)
 * @param {boolean}    [opts.loop=true]   false = play once, hold final state
 * @param {number}     [opts.minDuration=900]  ms the loader must stay visible
 * @param {Function}   [opts.onComplete]  fired after the exit fade
 * @param {boolean}    [opts.reducedMotion] force the static state
 * @returns {{finish:Function, destroy:Function, isDone:Function}}
 */
export function createSwishLoader(opts = {}) {
  const {
    mount,
    loop = true,
    minDuration = 900,
    onComplete = null,
    reducedMotion: forcedReduced
  } = opts;

  if (!mount || typeof mount.appendChild !== 'function') {
    throw new TypeError('createSwishLoader: `mount` must be a DOM element');
  }
  // --- SSR / non-browser guard. Nothing below touches `window` before this.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { finish() {}, destroy() {}, isDone: () => true };
  }

  /* ---- root DOM --------------------------------------------------- */
  const root = document.createElement('div');
  root.className = 'swish-loader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');

  const stage = document.createElement('div');
  stage.className = 'swish-loader__stage';
  root.appendChild(stage);

  const note = document.createElement('p');
  note.className = 'swish-loader__note';
  note.hidden = true;
  root.appendChild(note);

  // The glyph sequence is decorative; the SVG is aria-hidden so a screen
  // reader never announces "S, SW, SWi, SWiSH". This carries the meaning.
  const sr = document.createElement('span');
  sr.className = 'swish-loader__sr';
  sr.textContent = 'Loading, please wait';
  root.appendChild(sr);

  mount.appendChild(root);

  let parts = null;
  let destroyed = false;
  let done = false;

  /* ---- motion preference (watched live, not sampled once) ---------- */
  const mqReduce = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  const mqData = window.matchMedia
    ? window.matchMedia('(prefers-reduced-data: reduce)')
    : null;

  let reduced = forcedReduced !== undefined ? !!forcedReduced : !!(mqReduce && mqReduce.matches);

  // Save-Data / reduced-data behave as degraded mode, not as no-motion:
  // the motion is the point, the garnish is what costs.
  const conn = navigator.connection || navigator.webkitConnection;
  let degraded = !!(conn && conn.saveData) || !!(mqData && mqData.matches);

  /* ---- runtime state ----------------------------------------------- */
  let rafId = 0;
  let originTs = 0;        // performance.now() at cycle start
  let pausedAt = null;     // elapsed value captured when the tab hid
  let mountedTs = now();
  let exiting = false;
  let exitFrom = 0;
  let exitTimer = 0;
  let finishTimer = 0;
  let escalated = 0;

  const frameTimes = [];
  let lastFrameTs = 0;

  // Skip redundant attribute writes - the cheapest optimisation available.
  // The last value is cached on the node itself, so it is collected with the
  // node and there is no shared map to clear or to leak.
  function setAttr(node, name, value) {
    const cache = node.__swishLast || (node.__swishLast = Object.create(null));
    if (cache[name] === value) return;
    cache[name] = value;
    node.setAttribute(name, value);
  }

  function now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  /* =================================================================
   * Render one frame from an elapsed-time value. Pure: same `t` in,
   * same picture out. This is what makes pause/resume and reduced
   * motion fall out for free.
   * ================================================================= */
  function render(t, alpha) {
    if (!parts) return;

    const bag = solveBag(t);
    const plate = solvePlate(t);
    const shadow = solveShadow(bag.lowY);
    // Streaks survive degraded mode: six gradient-stroked lines cost far less
    // than the display glow, and they are load-bearing for the fall reading
    // as a fall.
    const streak = solveStreaks(t);
    const disp = solveDisplay(t);
    const ring = solveRing(t);
    const done = solveDone(t);

    // Plate compression, applied about the feet so they stay planted.
    const plateSquash = 1 - 0.035 * plate;
    setAttr(
      parts.scaleG,
      'transform',
      `translate(${PIVOT_X} ${SCALE_BOTTOM_Y}) scale(1 ${plateSquash.toFixed(4)}) ` +
        `translate(${-PIVOT_X} ${-SCALE_BOTTOM_Y})`
    );

    // The bag rides the plate down so the two never separate at contact.
    const plateDropY = SCALE_DRAW_H * 0.035 * plate;
    // THE FALL. One axis, one term. If anything ever needs to move the bag
    // horizontally or turn it, it does not belong in this string.
    const bagShift = `translate(0 ${(bag.y + plateDropY).toFixed(3)})`;
    setAttr(parts.bagG, 'transform', bagShift);

    // Impact squash, on the inner group, about the bag's base so the feet
    // stay planted. Symmetric about PIVOT_X, so widening does not shift the
    // bag's centre.
    setAttr(
      parts.bagSquash,
      'transform',
      `translate(${PIVOT_X} ${PIVOT_Y}) ` +
        `scale(${bag.sx.toFixed(4)} ${bag.sy.toFixed(4)}) ` +
        `translate(${-PIVOT_X} ${-PIVOT_Y})`
    );

    setAttr(parts.shadow, 'opacity', shadow.o.toFixed(3));
    setAttr(
      parts.shadow,
      'transform',
      `translate(${PIVOT_X} ${SHADOW_CY}) scale(${shadow.s.toFixed(4)}) ` +
        `translate(${-PIVOT_X} ${-SHADOW_CY})`
    );

    setAttr(parts.streakG, 'opacity', streak.toFixed(3));
    if (streak > 0) {
      // Literally the bag's own shift string, reused. Not a copy kept in
      // sync - the same value, so the streaks cannot drift from the bag at
      // any size or aspect ratio. They take the translate only; the squash
      // belongs to the bag's body, not to the air beside it.
      setAttr(parts.streakG, 'transform', bagShift);
    }

    /* --- readout --------------------------------------------------- */
    // NOTE: parts.pilot is deliberately not touched here. See buildStage().

    for (let i = 0; i < parts.glyphs.length; i++) {
      const p = disp.reveal[i];
      const gl = parts.glyphs[i];
      setAttr(gl.text, 'opacity', p.toFixed(3));
      if (p > 0 && p < 1) {
        const e = easeOutCubic(p);
        const s = lerp(0.92, 1, e);
        setAttr(
          gl.outer,
          'transform',
          `translate(${(CELL0_CX + i * CELL_W).toFixed(3)} ${(GLASS_CY + 2 * (1 - e)).toFixed(3)}) ` +
            `scale(${s.toFixed(4)})`
        );
      } else if (p >= 1) {
        setAttr(gl.outer, 'transform', `translate(${(CELL0_CX + i * CELL_W).toFixed(3)} ${GLASS_CY})`);
      }
    }

    // Each dot is pinned to its cell; only its alpha changes.
    for (let i = 0; i < parts.dots.length; i++) {
      setAttr(parts.dots[i], 'opacity', disp.dots[i].toFixed(3));
    }

    // Nothing to pump: the letters are flat, so the only thing that changes
    // as each one lands is its colour.
    const fill = disp.hot > 0.02 ? mixGreen(disp.hot) : '#00C853';
    for (const gl of parts.glyphs) setAttr(gl.text, 'fill', fill);
    for (const d of parts.dots) setAttr(d, 'fill', '#00C853');

    /* --- processing ring -> tick --------------------------------------
       One continuous element. Before the readout finishes only the dash
       length moves; after it the stroke thickens shut and the tick draws on.

       BOTH branches write EVERY attribute they share. An earlier version
       only wrote the morph attributes inside the morph branch, which made
       the indicator depend on which frames had already been drawn: scrubbing
       back from the finished tick left a filled disc sitting over the
       loading ring. Writing both sides unconditionally is what makes this a
       function of t rather than of history. */
    if (t < T_COUNT_END) {
      // Only a lower clamp. An upper one would stop the arc short of closed,
      // and closing is exactly what the morph has to start from.
      const lit = Math.max(RING_C * ring.arc, RING_W);
      setAttr(parts.ringArc, 'stroke-dasharray',
        `${lit.toFixed(3)} ${Math.max(RING_C - lit, 0).toFixed(3)}`);
      setAttr(parts.ringArc, 'r', RING_R.toFixed(3));
      setAttr(parts.ringArc, 'stroke-width', RING_W.toFixed(3));
      setAttr(parts.ringArc, 'stroke', RING_GREEN);
      setAttr(parts.ringTrack, 'opacity', '1');
      setAttr(parts.ringHalo, 'opacity', '0');
      setAttr(parts.ringRim, 'opacity', '0');
      setAttr(parts.ringTick, 'opacity', '0');
      setAttr(parts.ringTick, 'stroke-dasharray', `0 ${(DONE_TICK_LEN + 1).toFixed(3)}`);
    } else {
      // The circle is closed now, so a dash could only chip a gap back into it.
      //
      // Written as "none" through setAttr rather than removed. setAttr caches
      // the last value it wrote; a bare removeAttribute goes behind that
      // cache, so the next setAttr of the same value is skipped as a no-op
      // and the attribute stays gone. That is how scrubbing back from the
      // tick left the ring with no dash at all.
      setAttr(parts.ringArc, 'stroke-dasharray', 'none');
      setAttr(parts.ringArc, 'r', done.r.toFixed(3));
      setAttr(parts.ringArc, 'stroke-width', done.w.toFixed(3));
      setAttr(parts.ringArc, 'stroke', mixHex(RING_GREEN, DONE_GREEN, done.green));
      setAttr(parts.ringTrack, 'opacity', done.track.toFixed(3));
      setAttr(parts.ringHalo, 'opacity', done.halo.toFixed(3));
      setAttr(parts.ringRim, 'opacity', done.rim.toFixed(3));
      setAttr(parts.ringTick, 'opacity', done.tick.toFixed(3));
      setAttr(parts.ringTick, 'stroke-dasharray',
        `${(DONE_TICK_LEN * done.tick).toFixed(3)} ${(DONE_TICK_LEN + 1).toFixed(3)}`);
    }

    /* --- impact marks ----------------------------------------------- */
    // Same shift string the bag uses, so they ride with it exactly.
    setAttr(parts.impactG, 'transform', bagShift);
    for (let i = 0; i < parts.lineEls.length; i++) {
      const g = parts.lineEls[i];
      if (degraded) {
        setAttr(g, 'opacity', '0');
        continue;
      }
      const L = solveLine(t, i);
      if (!L) {
        setAttr(g, 'opacity', '0');
        continue;
      }
      const src = LINES[i];
      const dx = src.x2 - src.x1;
      const dy = src.y2 - src.y1;
      const len = Math.hypot(dx, dy) || 1;
      setAttr(g, 'opacity', L.o.toFixed(3));
      setAttr(
        g,
        'transform',
        `translate(${((dx / len) * L.push).toFixed(2)} ${((dy / len) * L.push).toFixed(2)}) ` +
          `translate(${src.x1} ${src.y1}) scale(${L.s.toFixed(3)}) translate(${-src.x1} ${-src.y1})`
      );
    }

    stage.style.opacity = alpha.toFixed(3);
  }

  function mixGreen(p) {
    // #00C853 -> #3DFF8A overshoot on the final reveal only.
    const r = Math.round(lerp(0x00, 0x3d, p));
    const g = Math.round(lerp(0xc8, 0xff, p));
    const b = Math.round(lerp(0x53, 0x8a, p));
    return `rgb(${r},${g},${b})`;
  }

  /* =================================================================
   * Main loop
   * ================================================================= */
  function frame(ts) {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);

    if (!originTs) originTs = ts;

    // Clamp the per-frame delta so a GC pause or a resumed tab can never
    // teleport the bag - it just costs a little timeline drift instead.
    if (lastFrameTs) {
      const dt = ts - lastFrameTs;
      if (dt > 100) originTs += dt - 100;
      if (!degraded) {
        frameTimes.push(dt);
        if (frameTimes.length > 30) {
          frameTimes.shift();
          const mean = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          // Sustained sub-30fps: shed the filters and garnish, keep the motion.
          if (mean > 32) setDegraded();
        }
      }
    }
    lastFrameTs = ts;

    const total = ts - originTs;

    if (exiting) {
      const p = clamp01((ts - exitFrom) / T_FADE);
      render(Math.min(total % T_CYCLE, T_HOLD_END), 1 - easeInOutQuad(p));
      if (p >= 1) finalise();
      return;
    }

    let t;
    if (loop) {
      t = total % T_CYCLE;
      // Seam: fade out over the tail, fade back in over the head, so the
      // cycle restarts from blank white even though the bag's base is
      // already just inside the frame at t=0.
      const alpha =
        t >= T_HOLD_END
          ? 1 - easeInOutQuad(clamp01((t - T_HOLD_END) / T_FADE))
          : easeInOutQuad(clamp01(t / T_INTRO));
      render(Math.min(t, T_HOLD_END), alpha);
    } else {
      t = Math.min(total, T_COUNT_END);
      render(t, easeInOutQuad(clamp01(total / T_INTRO)));
      if (total >= T_CYCLE) {
        beginExit(ts);
        return;
      }
    }

    // Long-load escalation. The live region is updated ONCE per stage, not
    // once per loop - otherwise a screen reader recites it every 3 seconds.
    const visible = now() - mountedTs;
    if (escalated === 0 && visible > 15000) {
      escalated = 1;
      note.hidden = false;
      note.textContent = 'Still working… good food takes a moment.';
      sr.textContent = 'Still loading, please wait';
    } else if (escalated === 1 && visible > 30000) {
      escalated = 2;
      note.textContent = 'This is taking longer than usual.';
      note.appendChild(document.createTextNode(' '));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swish-loader__retry';
      btn.textContent = 'Retry';
      btn.addEventListener('click', () => {
        root.dispatchEvent(new CustomEvent('swish-retry', { bubbles: true }));
      });
      note.appendChild(btn);
      sr.textContent = 'Loading is taking longer than usual';
    }
  }

  function setDegraded() {
    if (degraded) return;
    degraded = true;
    root.classList.add('is-degraded');
    for (const g of parts.lineEls) g.setAttribute('opacity', '0');
  }

  /* ---- static (reduced-motion / degraded-to-still) state ----------- */
  function renderStatic() {
    // Past the badge's pop, not at the instant the count ends: the still is
    // meant to be the FINISHED state, and at T_COUNT_END the badge has not
    // arrived yet. Nothing else moves between the two.
    render(T_COUNT_END + T_DONE_IN, 1);
    root.classList.add('is-static');
  }

  /* ---- lifecycle ---------------------------------------------------- */
  function start() {
    if (destroyed) return;
    root.classList.add('is-ready');
    if (reduced) {
      renderStatic();
      return;
    }
    root.classList.add('is-animating');
    originTs = 0;
    lastFrameTs = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopRaf() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function beginExit(ts) {
    if (exiting || done) return;
    exiting = true;
    exitFrom = ts || now();

    if (reduced) {
      stage.style.transition = `opacity ${T_FADE}ms ease`;
      stage.style.opacity = '0';
    } else if (!rafId) {
      rafId = requestAnimationFrame(frame);
    }

    // Safety net. The exit fade is normally driven by the rAF loop, but rAF
    // is not guaranteed to fire: the tab may be hidden, the page may be in a
    // throttled webview, or the compositor may simply not be producing
    // frames. If completion depended on it, the app would stay trapped
    // behind a loading screen forever - the worst failure this component
    // has available to it. finalise() is idempotent, so whichever path
    // arrives first wins.
    exitTimer = window.setTimeout(finalise, T_FADE + 80);
  }

  function finalise() {
    if (done) return;
    done = true;
    stopRaf();
    if (exitTimer) {
      window.clearTimeout(exitTimer);
      exitTimer = 0;
    }
    stage.style.opacity = '0';
    root.classList.remove('is-animating');
    root.classList.add('is-complete');
    if (typeof onComplete === 'function') {
      try {
        onComplete();
      } catch (err) {
        // A throwing callback must not leave the loader half-torn-down.
        console.error('[swish-loader] onComplete threw:', err);
      }
    }
  }

  /**
   * Call when the app is ready. Honours `minDuration` so the loader can
   * never flash - a 120ms appearance is worse than no loader at all - and
   * never hard-cuts: it always plays out through the exit fade.
   */
  function finish() {
    if (done || exiting || finishTimer) return;
    const visible = now() - mountedTs;
    const wait = Math.max(0, minDuration - visible);
    finishTimer = window.setTimeout(() => {
      finishTimer = 0;
      if (!destroyed) beginExit(now());
    }, wait);
  }

  /* ---- exception handling: listeners ------------------------------- */
  function onVisibility() {
    if (document.hidden) {
      pausedAt = originTs ? now() - originTs : 0;
      stopRaf();
    } else if (!destroyed && !reduced && !done) {
      // Re-anchor so the timeline resumes exactly where it paused rather
      // than snapping forward by however long the tab was buried.
      originTs = now() - (pausedAt || 0);
      lastFrameTs = 0;
      frameTimes.length = 0;
      if (!rafId) rafId = requestAnimationFrame(frame);
    }
  }

  function onReduceChange(e) {
    if (forcedReduced !== undefined) return;
    reduced = e.matches;
    if (reduced) {
      stopRaf();
      root.classList.remove('is-animating');
      renderStatic();
    } else {
      root.classList.remove('is-static');
      root.classList.add('is-animating');
      originTs = 0;
      lastFrameTs = 0;
      if (!rafId) rafId = requestAnimationFrame(frame);
    }
  }

  document.addEventListener('visibilitychange', onVisibility);
  if (mqReduce) {
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduceChange);
    else if (mqReduce.addListener) mqReduce.addListener(onReduceChange); // Safari < 14
  }

  /* ---- boot: decode both layers before first paint ------------------ */
  function fallbackWordmark() {
    stage.innerHTML = '';
    const mark = document.createElement('div');
    mark.className = 'swish-loader__fallback';
    mark.textContent = 'SWiSH';
    stage.appendChild(mark);
    root.classList.add('is-ready', 'is-fallback');
  }

  try {
    parts = buildStage();
    stage.appendChild(parts.svg);
    render(0, 0);
  } catch (err) {
    console.error('[swish-loader] stage build failed:', err);
    fallbackWordmark();
    return {
      finish() {
        if (typeof onComplete === 'function') onComplete();
      },
      destroy: teardown,
      isDone: () => true
    };
  }

  // Data URIs cannot 404, but they can still fail to decode on a memory-
  // starved device. Either way the page must show something.
  Promise.all(
    [BAG_SRC, SCALE_SRC].map(
      (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('decode failed'));
          img.src = src;
        })
    )
  ).then(start, (err) => {
    console.error('[swish-loader] layer decode failed:', err);
    fallbackWordmark();
  });

  function teardown() {
    if (destroyed) return;
    destroyed = true;
    stopRaf();
    if (exitTimer) window.clearTimeout(exitTimer);
    if (finishTimer) window.clearTimeout(finishTimer);
    exitTimer = finishTimer = 0;
    document.removeEventListener('visibilitychange', onVisibility);
    if (mqReduce) {
      if (mqReduce.removeEventListener) mqReduce.removeEventListener('change', onReduceChange);
      else if (mqReduce.removeListener) mqReduce.removeListener(onReduceChange);
    }
    if (root.parentNode) root.parentNode.removeChild(root);
    parts = null;
  }

  return {
    finish,
    destroy: teardown,
    isDone: () => done,
    root,
    /** Development affordance: freeze the loop and scrub the timeline by hand. */
    __debug: {
      scrub(t) {
        stopRaf();
        root.classList.remove('is-animating');
        render(Math.max(0, Math.min(t, T_HOLD_END)), 1);
      },
      resume() {
        if (reduced || done || destroyed) return;
        root.classList.add('is-animating');
        originTs = 0;
        lastFrameTs = 0;
        if (!rafId) rafId = requestAnimationFrame(frame);
      },
      setDegraded
    }
  };
}

/** Layout the test harnesses assert against, so they cannot drift from it. */
export const GEOMETRY = {
  VB_W,
  VB_H,
  SCALE_DRAW_W,
  PLATE_TOP_Y,
  BAG_Y,
  BAG_DRAW_H,
  BAG_REST_BOTTOM,
  DROP_FROM,
  ENTRY_VISIBLE,
  GLASS_CX,
  GLASS_CY,
  RING_CY,
  RING_R,
  RING_W,
  DONE_R,
  DONE_HALO_R,
  RING_OUTER,
  LED_X,
  LED_Y,
  SINK: BAG_REST_BOTTOM - PLATE_TOP_Y,
  U
};

export const TIMELINE = {
  INTRO: T_INTRO,
  DROP_END: T_DROP_END,
  IMPACT_END: T_IMPACT_END,
  SETTLE_END: T_SETTLE_END,
  COUNT_START: T_COUNT_START,
  COUNT_END: T_COUNT_END,
  HOLD_END: T_HOLD_END,
  CYCLE: T_CYCLE
};

export default createSwishLoader;
