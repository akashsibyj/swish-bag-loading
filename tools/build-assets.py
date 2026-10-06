#!/usr/bin/env python3
"""
Rebuild the loader's layer assets from the source SVGs in ../assets.

    python tools/build-assets.py

WHAT THIS EXISTS FOR
--------------------
Every file in assets/ is a Figma export that wraps ONE base64 PNG in an SVG
pattern fill - there is not a single vector path among them. Six of the eight
are full composed scenes (bag already sitting on the scale, display already
reading "SWi..."). Those are reference renders, not animation layers: playing
them in sequence is the "static assets put together" failure mode.

Only two exports are isolated elements, and those are the ones we use:

    assets/bag straight.svg -> a kraft bag alone, transparent background
    assets/scale.svg        -> the silver scale alone, transparent background

BAG SOURCE: WHY "bag straight.svg" AND NOT "bag.svg"
----------------------------------------------------
assets/bag.svg is a three-quarter view. Its side panel is visible, its
handles run on a diagonal and its body axis leans, so the bag reads as
tilted no matter what the animation does with it - and a tilted bag
travelling straight down reads, to the eye, as a bag falling at an angle.
The fall was already a pure `translate(0 y)`; the angle was baked into the
pixels.

assets/bag straight.svg is the same bag shot flat-on: bilaterally
symmetric (measured centre line is constant to within 0.4% of its width
from handles to base), handles horizontal, body edges vertical. Dropping
THIS raster down a vertical shaft is what actually looks vertical.

This script extracts both, tight-crops them, paints out the scale's baked-in
green pilot dot (so the display panel is blank and can be driven by live SVG
text), tamper-seals the bag (see TAMPER SEAL below), and emits
loader/swish-assets.js with each layer inlined as a data URI.

Requires:  pip install pillow segno
(segno generates the feedback QR; it is a real symbol, not drawn art.)
"""

import base64
import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("This script needs Pillow:  pip install pillow")

try:
    import segno
except ImportError:  # pragma: no cover
    sys.exit("This script needs segno for the feedback QR:  pip install segno")

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets")
OUT_PNG = os.path.join(ROOT, "loader", "assets")
OUT_JS = os.path.join(ROOT, "loader", "swish-assets.js")

# The scale export's canvas is 523x477 and this crop was taken from its alpha
# bounding box; it is stable for the supplied file.
SCALE_CROP = (125, 197, 398, 271)  # -> 273 x 74

# The bag is autocropped to its alpha bounding box instead of a hardcoded box,
# because the two bag exports do not share a canvas (523x477 vs 1134x1263) and
# a stale literal here is a silently-misplaced bag. Autocropping also
# guarantees the "flush to its base" contract the loader relies on: the bag's
# rest position is computed from its BASE, so a strip of transparent padding
# under the bag would float it above the plate.
BAG_SRC_SVG = "bag straight.svg"

# The straight bag's raster is 692x1045 after autocrop - far more than the
# ~145 stage units it draws at. Downscaled to 3.3x oversample, which stays
# crisp on a 3x-DPR phone, and palette-reduced: it is one kraft brown in a
# hundred shades, so 256 colours are indistinguishable from truecolour
# (measured mean error under 2/255) at a sixth of the bytes. This matters -
# it is inlined into a LOADING screen, where weight is the whole point.
BAG_OUT_W = 600
BAG_COLORS = 256

# ---------------------------------------------------------------------------
# TAMPER SEAL
# ---------------------------------------------------------------------------
# The bag ships to the loader already sealed: two red tamper tapes over the
# folded top and a red feedback label carrying a QR between the handles. They
# are composited into the RASTER rather than drawn as SVG beside it, and that
# is a deliberate call:
#
#   * They cannot drift. The loader gives the bag one transform; if the seals
#     were separate nodes they would need that transform applied identically
#     and could disagree by a subpixel. Baked in, "the seals move with the
#     bag" is not a thing that can fail - they ARE the bag.
#   * They can be lit by the bag. Each patch is multiplied against the kraft
#     underneath it, so the paper's grain, its creases and the shadow under
#     the top fold all read THROUGH the tape. That is the difference between
#     tape stuck to a bag and a red rectangle floating over a photo of one.
#   * Nothing downstream changes. Same single <image>, same two exports.
#
# Every coordinate is a fraction of the bag layer's own box, measured off the
# straight bag's landmarks (front fold at y=141/725, handle straps at
# x=107..157 and 320..368 of 480, strap tips at y=240/725). Fractions, so the
# geometry survives any BAG_OUT_W and any viewport the loader is drawn into.

SEAL_FOLD_Y = 141 / 725          # front panel's top edge: the fold being sealed

# Left tape. Outboard of the left handle strap, clear of it by ~5px at 480w,
# so neither has to be drawn over the other. The right tape is this mirrored
# about the bag's centre line, which is what keeps the pair symmetric at any
# width without a second set of numbers to keep in sync.
# Kept a touch squarer than tall. The reference bag's handles sit further
# inboard than this one's, so a tape of the reference's exact width would run
# into the strap; the height comes down instead, which holds the proportion
# the eye actually reads without either piece having to overlap a handle.
SEAL_TAPE_X = (24 / 480, 104 / 480)
SEAL_TAPE_Y = (132 / 725, 222 / 725)   # starts above the fold: it wraps it

# Feedback label, centred between the straps.
SEAL_LABEL_X = (179 / 480, 301 / 480)
SEAL_LABEL_Y = (155 / 725, 267 / 725)

# Where the label actually points.
#
# UPPERCASE ON PURPOSE, and it is not a style choice. A QR encoding lowercase
# has to fall back to byte mode, which needs a version-2 symbol (25x25). The
# same URL in uppercase is entirely within QR's alphanumeric charset, so it
# encodes as version 1 - 21x21 - and the modules come out ~19% larger in the
# same label. On a code this small that is the difference between a symbol a
# phone can lock onto and one it cannot.
#
# It costs nothing: a URL's scheme and host are case-insensitive (RFC 3986),
# so HTTPS://WWW.SWISHHH.NET opens https://www.swishhh.net. Were a path ever
# added here that rule would stop applying - paths ARE case-sensitive - and
# this would have to go back to lowercase and version 2.
SEAL_QR_DATA = "HTTPS://WWW.SWISHHH.NET"
SEAL_QR_CAPTION = "FEEDBACK"

SEAL_RED = (196, 22, 28)         # a printed vinyl red, not a screen red
SEAL_SS = 3                      # supersampling for edges and caption

# The scale ships with a lit green pilot dot in the middle of the display.
# It has to go: the readout is driven by live text, and a baked-in dot would
# show through "S...".
DOT_BOX = (252, 236, 271, 258)          # x0, y0, x1, y1 to repaint
CLEAN_COLS = list(range(195, 245)) + list(range(280, 330))  # glass to sample


def extract_png(svg_path):
    """Pull the single embedded base64 PNG out of a Figma SVG export."""
    with open(svg_path, encoding="utf-8") as fh:
        markup = fh.read()
    match = re.search(r"base64,([A-Za-z0-9+/=]+)", markup)
    if not match:
        raise ValueError(f"{svg_path}: no embedded raster found")
    return Image.open(io_bytes(base64.b64decode(match.group(1)))).convert("RGBA")


def io_bytes(data):
    import io

    return io.BytesIO(data)


def _load_font(size):
    """
    Any bold grotesque will do - the caption renders only a few pixels tall in
    the finished loader. Falls back to Pillow's bitmap font so a machine
    without these files still builds, just with a plainer caption.
    """
    for name in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "Helvetica-Bold.ttf",
                 "LiberationSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _patch_mask(w, h, tilt, seed):
    """
    The silhouette of one applied patch: a near-rectangle, very slightly
    rotated, with edges that wander by a fraction of a pixel.

    Tape applied by hand is never square to the bag and never perfectly
    straight-edged. The wander is sub-pixel on purpose - enough that the eye
    stops reading "rectangle drawn on top", not so much that it reads as
    damaged.
    """
    rng = np.random.default_rng(seed)
    ss = SEAL_SS
    pad = int(6 * ss)
    mask = Image.new("L", (w * ss + 2 * pad, h * ss + 2 * pad), 0)
    draw = ImageDraw.Draw(mask)

    # Edge wander as a smooth low-frequency wobble rather than noise: a
    # hand-laid edge undulates, it does not fizz.
    def wobble(n, amp):
        base = rng.normal(0, 1, 5)
        return np.interp(np.linspace(0, 4, n), np.arange(5), base) * amp * ss

    steps = 64
    top, bot = wobble(steps, 0.5), wobble(steps, 0.5)
    lef, rig = wobble(steps, 0.7), wobble(steps, 0.7)
    xs = np.linspace(0, w * ss, steps)
    ys = np.linspace(0, h * ss, steps)

    poly = [(pad + xs[i], pad + top[i]) for i in range(steps)]
    poly += [(pad + w * ss + rig[i], pad + ys[i]) for i in range(steps)]
    poly += [(pad + xs[steps - 1 - i], pad + h * ss + bot[steps - 1 - i])
             for i in range(steps)]
    poly += [(pad + lef[steps - 1 - i], pad + ys[steps - 1 - i])
             for i in range(steps)]
    draw.polygon(poly, fill=255)

    if tilt:
        mask = mask.rotate(tilt, resample=Image.BICUBIC,
                           center=(mask.width / 2, mask.height / 2))
    return mask.resize((mask.width // ss, mask.height // ss),
                       Image.LANCZOS), pad // ss


def _apply_patch(bag, box, ink, seed, tilt, fold_y=None, art=None):
    """
    Lay one red patch onto the bag.

    The colour is the ink MULTIPLIED by the paper's own luminance, which is
    what carries the kraft grain, the creases and the shadow under the top
    fold straight through the tape. A flat fill here - however well shaped -
    reads as a sticker pasted onto a photograph, because every real surface
    under a vinyl seal still shows its own shading.

    `art` is an optional RGBA overlay in patch space (caption and QR),
    composited after the tape is lit, so it is printed ON the tape rather
    than lit as though it were paper.
    """
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    mask, pad = _patch_mask(w, h, tilt, seed)

    rx0, ry0 = x0 - pad, y0 - pad
    region = bag.crop((rx0, ry0, rx0 + mask.width, ry0 + mask.height))
    arr = np.array(region).astype(np.float32)
    m = np.array(mask).astype(np.float32) / 255.0

    # Clip the patch to the bag's OWN coverage. A patch may overhang the
    # silhouette, and the bag's edge pixels are partly transparent - paint
    # red into those and the bag grows a red fringe hanging in mid-air, which
    # is visible against any background the loader is dropped onto. Weighting
    # by the bag's alpha means the tape can only exist where the bag does.
    m *= arr[:, :, 3] / 255.0

    # --- the paper underneath, as a multiplier around its own mid-tone -----
    lum = arr[:, :, :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    lit = lum[m > 0.5]
    mid = float(np.median(lit)) if lit.size else 170.0
    # Ceiling near 1 on purpose: a saturated red has almost no headroom
    # before the channel clips, and a clipped tape loses the grain this
    # whole multiply exists to carry.
    shade = np.clip(lum / max(mid, 1.0), 0.58, 1.10)
    tape = np.array(ink, np.float32).reshape(1, 1, 3) * shade[:, :, None]

    yy, xx = np.mgrid[0:mask.height, 0:mask.width].astype(np.float32)
    u = (xx - pad) / max(w, 1)
    v = (yy - pad) / max(h, 1)

    # --- sheen: broad, low, off-centre. Vinyl is satin, not chrome, and at
    # the size this renders any real highlight just reads as a blown-out
    # patch - so it is kept to a few levels.
    tape += 11.0 * np.exp(-(((u - 0.34) / 0.62) ** 2
                            + ((v - 0.30) / 0.85) ** 2))[:, :, None]

    # --- the crease where the tape rides over the folded top ---------------
    # A tape bridging a fold gets a shadowed valley with a lit lip below it,
    # because the paper turns towards the light there.
    if fold_y is not None:
        d = yy - (fold_y - ry0)
        tape -= 46.0 * np.exp(-((d + 0.6) / 1.5) ** 2)[:, :, None]
        tape += 30.0 * np.exp(-((d - 2.3) / 1.9) ** 2)[:, :, None]

    # --- slack creases: a couple of soft vertical valleys -------------------
    rng = np.random.default_rng(seed + 977)
    for _ in range(2):
        cu = rng.uniform(0.18, 0.82)
        tape -= rng.uniform(5, 9) * np.exp(-((u - cu) / 0.075) ** 2)[:, :, None]

    tape = np.clip(tape, 0, 255)

    # --- printed art, on top of the lit tape -------------------------------
    if art is not None:
        ov = np.zeros((mask.height, mask.width, 4), np.float32)
        ov[pad:pad + h, pad:pad + w] = np.array(art).astype(np.float32)
        oa = ov[:, :, 3:4] / 255.0
        tape = tape * (1 - oa) + ov[:, :, :3] * oa

    # --- contact shadow on the paper just outside the edge ------------------
    # Without this the patch has no thickness and floats. Only a couple of
    # levels deep; tape is thin.
    halo = np.array(mask.filter(ImageFilter.GaussianBlur(1.6))
                    ).astype(np.float32) / 255.0
    arr[:, :, :3] *= (1.0 - 0.20 * np.clip(halo - m, 0, 1))[:, :, None]

    # Alpha is left untouched on purpose. A patch may overhang the bag's
    # silhouette, and painting there would grow a red fringe in mid-air; the
    # bag's own cutout is what clips the seal.
    a3 = m[:, :, None]
    arr[:, :, :3] = arr[:, :, :3] * (1 - a3) + tape * a3
    bag.paste(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA"),
              (rx0, ry0))


def _feedback_art(w, h):
    """
    What is printed on the centre label: the caption over a real QR.

    The QR is generated, not drawn - a genuine symbol with true finder
    patterns and timing rows, verified to decode. Its modules are
    snapped to whole pixels and it is deliberately NOT supersampled, because
    every resample of a fine binary grid trades crispness for mush. The
    caption, which wants smooth letterforms, is supersampled instead.
    """
    matrix = np.array(segno.make(SEAL_QR_DATA, error="L", micro=False).matrix,
                      dtype=bool)
    n = len(matrix)

    # WHITE MODULES STRAIGHT ONTO THE RED - no white backing panel. The label
    # is one flat red sticker with the code knocked out of it, which is the
    # look the design calls for.
    #
    # That inverts the symbol, and a strict decoder wants dark-on-light. The
    # data is bit-perfect either way; what changes is how readily a scanner
    # locks on. Phone cameras that invert and retry (iOS Camera, Google Lens)
    # read it; a naive library will not without being told to invert. The
    # quiet zone below is what buys back most of that margin, so it stays
    # even though nothing is painted into it.
    #
    # Quiet zone: 4 clear modules on every side, per spec - part of the
    # symbol, not packaging round it. Here "clear" means clear RED: the
    # patch is transparent there and the sticker shows through. Without it
    # the label's edge crowds the finder patterns and locating the code gets
    # unreliable.
    QUIET = 4
    span = n + 2 * QUIET

    # Modules are whole pixels, so the symbol only grows in steps of `span`
    # px and the remainder is dead space. Trade the caption band and margins
    # down through a few legal settings and keep whichever yields the biggest
    # module.
    module, margin, cap_h = 0, 0, 0
    for mg_f, cap_f in ((0.05, 0.15), (0.045, 0.13), (0.035, 0.115),
                        (0.03, 0.105)):
        mg = max(2, round(w * mg_f))
        cp = max(4, round(h * cap_f))
        avail = min(w - 2 * mg, h - cp - 2 * mg)
        m = max(1, avail // span)
        if m > module:
            module, margin, cap_h = m, mg, cp

    field = module * span
    px0 = (w - field) // 2
    py0 = cap_h + margin + (h - cap_h - 2 * margin - field) // 2

    layer = np.zeros((h, w, 4), np.uint8)
    block = np.kron(matrix, np.ones((module, module), bool))
    q = QUIET * module
    layer[py0 + q:py0 + q + module * n,
          px0 + q:px0 + q + module * n][block] = (255, 255, 255, 255)
    art = Image.fromarray(layer, "RGBA")

    ss = SEAL_SS
    cap = Image.new("RGBA", (w * ss, cap_h * ss), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cap)
    size = max(6, int(cap_h * ss * 0.62))
    font = _load_font(size)
    tw = cd.textlength(SEAL_QR_CAPTION, font=font)
    while tw > (w - 2 * margin) * ss and size > 6:
        size -= 1
        font = _load_font(size)
        tw = cd.textlength(SEAL_QR_CAPTION, font=font)
    cd.text(((w * ss - tw) / 2, cap_h * ss * 0.5), SEAL_QR_CAPTION,
            font=font, fill=(255, 255, 255, 255), anchor="lm")
    art.alpha_composite(cap.resize((w, cap_h), Image.LANCZOS),
                        (0, max(1, round(h * 0.035))))
    return art


def seal_bag(bag):
    """
    Close the bag: two tamper tapes over the folded top, feedback label
    between the handles. Returns a new image; `bag` is left alone.
    """
    bag = bag.convert("RGBA").copy()
    W, H = bag.size
    px = lambda fx: round(fx * W)
    py = lambda fy: round(fy * H)

    fold = SEAL_FOLD_Y * H
    ty0, ty1 = py(SEAL_TAPE_Y[0]), py(SEAL_TAPE_Y[1])
    lx0, lx1 = px(SEAL_TAPE_X[0]), px(SEAL_TAPE_X[1])

    # Left, then its mirror about the bag's centre line - which is what keeps
    # the pair symmetric at any width without a second set of numbers to keep
    # in sync. Different seeds and opposite tilts, so they read as two pieces
    # of tape rather than one stamped twice.
    _apply_patch(bag, (lx0, ty0, lx1, ty1), SEAL_RED, seed=11, tilt=-0.8,
                 fold_y=fold)
    _apply_patch(bag, (W - lx1, ty0, W - lx0, ty1), SEAL_RED, seed=29,
                 tilt=0.6, fold_y=fold)

    bx0, bx1 = px(SEAL_LABEL_X[0]), px(SEAL_LABEL_X[1])
    by0, by1 = py(SEAL_LABEL_Y[0]), py(SEAL_LABEL_Y[1])
    _apply_patch(bag, (bx0, by0, bx1, by1), SEAL_RED, seed=53, tilt=0.0,
                 art=_feedback_art(bx1 - bx0, by1 - by0))
    return bag


def autocrop_alpha(img, threshold=8):
    """
    Crop to the alpha bounding box. `threshold` ignores the near-zero fringe
    that survives an export, which would otherwise pad the crop by a pixel or
    two and lift the bag off the plate.
    """
    alpha = np.array(img)[:, :, 3]
    rows, cols = np.nonzero(alpha > threshold)
    if not len(rows):
        raise ValueError("image is fully transparent")
    return img.crop((cols.min(), rows.min(), cols.max() + 1, rows.max() + 1))


def compress_bag(img):
    """Downscale to BAG_OUT_W and palette-reduce, preserving alpha."""
    height = round(img.height * BAG_OUT_W / img.width)
    small = img.resize((BAG_OUT_W, height), Image.LANCZOS)
    # FASTOCTREE is the one Pillow quantiser that keeps an alpha channel;
    # MEDIANCUT would flatten the cutout into a hard-edged rectangle.
    return small.quantize(colors=BAG_COLORS, method=Image.FASTOCTREE)


def bag_symmetry(img):
    """
    How far the bag's silhouette is from being mirror-symmetric, as the
    fraction of its area that does not survive a horizontal flip.

    This, and not "is the bounding box centred", is what separates a flat-on
    bag from a three-quarter one: a 3/4 view can sit dead centre in its own
    box while its visible side panel, diagonal handles and leaning body axis
    all fail to mirror. The straight bag scores near zero; assets/bag.svg,
    the 3/4 export this pipeline used to ship, scores an order of magnitude
    higher. Reported so a future asset swap that reintroduces a lean is
    caught here rather than in the animation.
    """
    alpha = np.array(img.convert("RGBA"))[:, :, 3] > 8
    mirrored = alpha[:, ::-1]
    union = (alpha | mirrored).sum()
    return float((alpha ^ mirrored).sum() / union) if union else 0.0


def erase_pilot_dot(img):
    """
    Repaint the pilot dot with the glass colour sampled from the same row.
    Row-wise rather than a flat fill, because the glass carries a vertical
    gradient that a single colour would visibly flatten.
    """
    arr = np.array(img).astype(int)
    x0, y0, x1, y1 = DOT_BOX
    for y in range(y0, y1):
        median = np.median(arr[y, CLEAN_COLS, :3], axis=0)
        for x in range(x0, x1):
            if arr[y, x, 3] > 0:
                arr[y, x, 0:3] = median
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def residual_green(img):
    """Sanity check: how much green tint survives the repaint."""
    arr = np.array(img).astype(int)
    return int((arr[:, :, 1] - (arr[:, :, 0] + arr[:, :, 2]) / 2).max())


def main():
    os.makedirs(OUT_PNG, exist_ok=True)

    # Seal AFTER the downscale, not before: the QR is a fine binary grid and
    # resampling one is what turns a readable symbol into grey mush. Sealing
    # last means every module lands on whole pixels exactly as authored.
    bag = seal_bag(compress_bag(autocrop_alpha(
        extract_png(os.path.join(SRC, BAG_SRC_SVG)))).convert("RGBA"))
    bag = bag.quantize(colors=BAG_COLORS, method=Image.FASTOCTREE)
    bag_path = os.path.join(OUT_PNG, "bag-layer.png")
    bag.save(bag_path, optimize=True)

    lean = bag_symmetry(bag)
    if lean > 0.04:
        print(f"WARNING: {lean:.1%} of the bag's silhouette does not mirror - "
              f"is this a three-quarter view? The loader drops the bag "
              f"straight down, and a leaning raster reads as an angled fall.")

    scale = erase_pilot_dot(extract_png(os.path.join(SRC, "scale.svg"))).crop(SCALE_CROP)
    scale_path = os.path.join(OUT_PNG, "scale-layer.png")
    scale.save(scale_path, optimize=True)

    leftover = residual_green(scale)
    if leftover > 24:
        print(f"WARNING: pilot dot may still be visible (residual green {leftover})")

    layers = {
        "BAG": (bag_path, bag.size,
                "Isolated kraft bag, straight-on and upright, tamper-sealed "
                "with two red tapes and a feedback QR label, transparent, "
                "cropped flush to its base."),
        "SCALE": (scale_path, scale.size,
                  "Isolated silver scale, transparent, cropped flush to the "
                  "plate top edge, pilot dot removed."),
    }

    with open(OUT_JS, "w", encoding="utf-8", newline="\n") as fh:
        fh.write('''/**
 * SWiSH loader - inlined layer assets.
 * GENERATED by tools/build-assets.py - do not edit by hand.
 *
 * Two isolated, tightly-cropped layers extracted from
 * assets/bag straight.svg and assets/scale.svg. Inlined as data URIs so the
 * loader has ZERO network
 * dependencies - a loading screen that itself fails to load is the one bug
 * you cannot recover from.
 *
 * The scale layer has had its baked-in green pilot dot painted out, so the
 * display is a blank panel driven entirely by live SVG text.
 *
 * The bag layer is the STRAIGHT-ON bag, not the three-quarter one. The
 * loader drops it down a pure vertical shaft, and a leaning raster would
 * make that vertical fall read as an angled one.
 */
''')
        for key, (path, (w, h), desc) in layers.items():
            with open(path, "rb") as src:
                b64 = base64.b64encode(src.read()).decode()
            fh.write(f"\n/** {desc} {w}x{h} */\n")
            fh.write(f"export const {key}_W = {w};\nexport const {key}_H = {h};\n")
            fh.write(f'export const {key}_SRC =\n  "data:image/png;base64,{b64}";\n')

    for key, (path, size, _) in layers.items():
        print(f"{key:6s} {size[0]}x{size[1]}  {os.path.getsize(path) / 1024:6.1f} KB  {path}")
    print(f"{'JS':6s} {'':9s}  {os.path.getsize(OUT_JS) / 1024:6.1f} KB  {OUT_JS}")


if __name__ == "__main__":
    main()
