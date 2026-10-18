"""Clean the shadow-catcher alpha on every concept sprite: shadow-only pixels (near-black) lose a
small ambient floor and fade to zero toward the sprite border, so no sprite box ever shows on the
scene (and the focus glow has no faint rectangle to catch). Object pixels are untouched.
    python3 fixalpha.py"""
import glob
import os
import numpy as np
from PIL import Image

H = os.path.dirname(os.path.abspath(__file__))
for p in sorted(glob.glob(os.path.join(H, "art", "c[12]-*.png"))):
    im = np.asarray(Image.open(p).convert("RGBA")).astype(np.float32)
    h, w = im.shape[:2]
    rgb, a = im[..., :3], im[..., 3]
    shadow = rgb.sum(axis=2) < 24  # catcher pixels are black with alpha = shadow density
    ys = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]
    xs = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
    edge = np.minimum(ys, xs).astype(np.float32)
    F = max(10.0, min(h, w) * 0.09)
    feather = np.clip(edge / F, 0, 1) ** 1.5
    a2 = np.clip((a - 7.0) * (255.0 / 248.0), 0, 255) * feather
    a = np.where(shadow, a2, a)
    out = np.dstack([rgb, a]).round().clip(0, 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(p, optimize=True)
    print("cleaned", os.path.basename(p))
