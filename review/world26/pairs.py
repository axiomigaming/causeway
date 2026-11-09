"""World round 26: before/after pairs of the side views (review/world26/frames, prefixes a and b) into
review/world26/sheets/<name>.jpg — each row a shot, before on the left, after on the right.

    python3 review/world26/pairs.py <name> <frame-stem>...    (stem e.g. high-w7-t2.5-S)
"""
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, "frames")
OUT = os.path.join(HERE, "sheets")
os.makedirs(OUT, exist_ok=True)
name, stems = sys.argv[1], sys.argv[2:]
W, H = 640, 360
rows = []
for st in stems:
    a, b = os.path.join(FR, f"a-{st}.png"), os.path.join(FR, f"b-{st}.png")
    if os.path.exists(a) and os.path.exists(b):
        rows.append((st, a, b))
img = Image.new("RGB", (2 * W + 6, len(rows) * (H + 20)), (18, 18, 18))
d = ImageDraw.Draw(img)
for i, (st, a, b) in enumerate(rows):
    y = i * (H + 20)
    d.text((6, y + 4), f"{st}  before (b82421e)", fill=(230, 230, 230))
    d.text((W + 12, y + 4), f"{st}  after", fill=(230, 230, 230))
    for k, p in enumerate((a, b)):
        im = Image.open(p).convert("RGB")
        im.thumbnail((W, H))
        img.paste(im, (k * (W + 6), y + 20))
out = os.path.join(OUT, f"{name}.jpg")
img.save(out, quality=86)
print(out, len(rows))
