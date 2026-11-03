"""World round 24: the final review sheets from review/world24/frames into review/world24/sheets.

    python3 review/world24/sheets.py
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, "frames")
OUT = os.path.join(HERE, "sheets")
os.makedirs(OUT, exist_ok=True)
M = os.path.join(HERE, "montage.py")
for args in (["a", "high", "high-before.jpg"], ["b", "high", "high-after.jpg"], ["a", "low", "phone-before.jpg"], ["b", "low", "phone-after.jpg"],
             ["--pair", "a", "b", "high", "high-before-after.jpg"], ["--pair", "a", "b", "low", "phone-before-after.jpg"]):
    args[-1] = os.path.join(OUT, args[-1])
    subprocess.run([sys.executable, M, *args], check=True)


def tile(pairs, out, label):
    W = Image.new("RGB", (1280, 382 * len(pairs)), (20, 20, 20))
    d = ImageDraw.Draw(W)
    for i, (files, lab) in enumerate(pairs):
        for c, f in enumerate(files):
            p = os.path.join(FR, f)
            im = Image.open(p).convert("RGB").resize((640, 360)) if os.path.exists(p) else Image.new("RGB", (640, 360), (60, 0, 0))
            W.paste(im, (c * 640, i * 382 + 22))
            d.text((c * 640 + 4, i * 382 + 5), f"{lab} - {label[c]}", fill=(255, 230, 160))
    W.save(os.path.join(OUT, out), quality=85)
    print(out, W.size)


tile([((f"a-near-w{w}-{f}.png", f"b-near-w{w}-{f}.png"), f"w{w} {f}") for w in (3, 23, 64, 105) for f in ("t8-L", "t8-R", "t30-L", "t30-R")], "near-before-after.jpg", ("before", "after"))
P = [("overgrown", "overgrown plaza: chase"), ("overgrown-side", "overgrown plaza, high side"), ("overgrown-l-side", "overgrown plaza, lower terrace side"),
     ("islets-side", "approach: shrubs on islets"), ("cutting-side", "cutting floor and rocks"), ("log", "jump log"), ("start", "w126 opening"), ("ravine-side", "ravine parapet (glyph stone)")]
tile([((f"pa-{p}.png", f"pb-{p}.png"), lab) for p, lab in P], "proofs-before-after.jpg", ("before", "after"))
