"""Contact sheets from review/world24/frames (world round 24).

    python3 review/world24/montage.py <prefix> <tier: high|low> <out.jpg> [seeds...]
    python3 review/world24/montage.py --pair <before> <after> <tier> <out.jpg> [seeds...]

One row per seed, one column per run time (t3 start, t25 middle, t55 late), labelled; --pair puts
the same seed's before and after side by side (before | after for each time).
"""
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, "frames")
SEEDS = [3, 7, 11, 19, 23, 31, 42, 58, 64, 77, 83, 97, 105, 118, 126, 141]
TS = [3, 25, 55]


def cell_size(tier):
    return (480, 270) if tier == "high" else (180, 390)


def load(prefix, tier, w, t, size):
    p = os.path.join(FR, f"{prefix}-{tier}-w{w}-t{t}.png")
    if not os.path.exists(p):
        return Image.new("RGB", size, (60, 0, 0))
    return Image.open(p).convert("RGB").resize(size, Image.LANCZOS)


def sheet(prefixes, tier, out, seeds):
    cw, ch = cell_size(tier)
    cols = [(p, t) for t in TS for p in prefixes]
    lab = 22
    per_row = 2 if tier == "low" and len(prefixes) == 1 else 1
    nrows = (len(seeds) + per_row - 1) // per_row
    W = cw * len(cols) * per_row + 8 * (per_row - 1)
    H = (ch + lab) * nrows
    im = Image.new("RGB", (W, H), (20, 20, 20))
    d = ImageDraw.Draw(im)
    for i, w in enumerate(seeds):
        r, c0 = divmod(i, per_row)
        y = r * (ch + lab)
        x0 = c0 * (cw * len(cols) + 8)
        for j, (p, t) in enumerate(cols):
            x = x0 + j * cw
            im.paste(load(p, tier, w, t, (cw, ch)), (x, y + lab))
            d.text((x + 4, y + 5), f"w{w} t{t}" + (f" {p}" if len(prefixes) > 1 else ""), fill=(255, 230, 160))
    im.save(out, quality=86)
    print(out, im.size)


args = sys.argv[1:]
if args[0] == "--pair":
    _, b, a, tier, out, *rest = args
    sheet([b, a], tier, out, [int(s) for s in rest] or SEEDS)
else:
    pre, tier, out, *rest = args
    sheet([pre], tier, out, [int(s) for s in rest] or SEEDS)
