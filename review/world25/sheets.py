"""World round 25: review sheets (before = f5eef6b, prefix a25; after, b25) into review/world25/sheets.

    python3 review/world25/sheets.py
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FR24 = os.path.join(HERE, "..", "world24", "frames")
FR25 = os.path.join(HERE, "frames")
OUT = os.path.join(HERE, "sheets")
os.makedirs(OUT, exist_ok=True)
M = os.path.join(HERE, "..", "world24", "montage.py")
for args in (["a25", "high", "high-before.jpg"], ["b25", "high", "high-after.jpg"], ["a25", "low", "phone-before.jpg"], ["b25", "low", "phone-after.jpg"],
             ["--pair", "a25", "b25", "high", "high-before-after.jpg"], ["--pair", "a25", "b25", "low", "phone-before-after.jpg"]):
    args[-1] = os.path.join(OUT, args[-1])
    subprocess.run([sys.executable, M, *args], check=True)

SEEDS = [3, 7, 11, 19, 23, 31, 42, 58, 64, 77, 83, 97, 105, 118, 126, 141]


def openings(pre, tier, out):
    cw, ch, cols = (400, 225, 4) if tier == "high" else (195, 422, 8)
    rows = len(SEEDS) // cols
    W = Image.new("RGB", (cols * cw, rows * (ch + 22)), (20, 20, 20))
    d = ImageDraw.Draw(W)
    for i, w in enumerate(SEEDS):
        x, y = (i % cols) * cw, (i // cols) * (ch + 22)
        W.paste(Image.open(os.path.join(FR24, f"{pre}-{tier}-w{w}-t3.png")).convert("RGB").resize((cw, ch)), (x, y + 22))
        d.text((x + 4, y + 5), f"w{w}", fill=(255, 230, 160))
    W.save(os.path.join(OUT, out), quality=85)
    print(out, W.size)


for pre, lab in (("a25", "before"), ("b25", "after")):
    openings(pre, "high", f"openings-high-{lab}.jpg")
    openings(pre, "low", f"openings-phone-{lab}.jpg")


def tile(pairs, out, label):
    W = Image.new("RGB", (1280, 382 * len(pairs)), (20, 20, 20))
    d = ImageDraw.Draw(W)
    for i, (files, lab) in enumerate(pairs):
        for c, f in enumerate(files):
            im = Image.open(f).convert("RGB").resize((640, 360)) if os.path.exists(f) else Image.new("RGB", (640, 360), (60, 0, 0))
            W.paste(im, (c * 640, i * 382 + 22))
            d.text((c * 640 + 4, i * 382 + 5), f"{lab} - {label[c]}", fill=(255, 230, 160))
    W.save(os.path.join(OUT, out), quality=85)
    print(out, W.size)


tile([((os.path.join(FR24, f"a25-near-w{w}-{f}.png"), os.path.join(FR24, f"b25-near-w{w}-{f}.png")), f"w{w} {f}") for w in (3, 23, 64, 105) for f in ("t8-L", "t8-R", "t30-L", "t30-R")], "near-before-after.jpg", ("before", "after"))
P = [("ravine", "ravine banks (w7)"), ("seam", "ravine meeting other land (w23)"), ("seam-side", "ravine meeting other land, close-up"), ("open126", "w126 opening"), ("open141", "w141 opening")]
tile([((os.path.join(FR25, f"pa-{p}.png"), os.path.join(FR25, f"pb-{p}.png")), lab) for p, lab in P], "proofs-before-after.jpg", ("before", "after"))
