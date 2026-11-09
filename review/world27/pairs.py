"""World round 27: before/after pairs (review/world27/frames, prefixes a and b) into
review/world27/sheets/<name>.jpg — each row a shot, before on the left, after on the right.

    python3 review/world27/pairs.py <name> [--cell WxH] [--cols N] [--zoom x0,y0,x1,y1,k] <frame-stem>...

--cell sets each picture's box (default 640x360; portrait e.g. 234x506). --cols puts N pairs on a
row. --zoom crops that pixel box out of each frame and blows it up k times with no filtering, so a
1x frame's texels stay visible (the leaf cut-outs).
"""
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, "frames")
OUT = os.path.join(HERE, "sheets")
os.makedirs(OUT, exist_ok=True)
args = sys.argv[1:]
name = args.pop(0)
W, H, cols, zoom = 640, 360, 1, None
while args and args[0].startswith("--"):
    k = args.pop(0)
    v = args.pop(0)
    if k == "--cell":
        W, H = (int(x) for x in v.split("x"))
    elif k == "--cols":
        cols = int(v)
    elif k == "--zoom":
        zoom = [int(x) for x in v.split(",")]
rows = []
for st in args:
    a, b = os.path.join(FR, f"a-{st}.png"), os.path.join(FR, f"b-{st}.png")
    if os.path.exists(a) and os.path.exists(b):
        rows.append((st, a, b))
LAB = 18
PW = 2 * W + 4
n = (len(rows) + cols - 1) // cols
img = Image.new("RGB", (cols * PW + (cols - 1) * 12, max(1, n) * (H + LAB)), (18, 18, 18))
d = ImageDraw.Draw(img)
for i, (st, a, b) in enumerate(rows):
    x0, y = (i % cols) * (PW + 12), (i // cols) * (H + LAB)
    d.text((x0 + 4, y + 3), f"{st} before (7011da2)", fill=(230, 230, 230))
    d.text((x0 + W + 8, y + 3), "after", fill=(230, 230, 230))
    for k, p in enumerate((a, b)):
        im = Image.open(p).convert("RGB")
        if zoom:
            c = im.crop(tuple(zoom[:4]))
            im = c.resize((c.width * zoom[4], c.height * zoom[4]), Image.NEAREST)
            im = im.crop((0, 0, min(W, im.width), min(H, im.height)))
        else:
            im.thumbnail((W, H), Image.LANCZOS)
        img.paste(im, (x0 + k * (W + 4), y + LAB))
out = os.path.join(OUT, f"{name}.jpg")
img.save(out, quality=86)
print(out, len(rows))
