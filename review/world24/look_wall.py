"""World round 24 look-dev: the stoneA parapets close up, the old moss and the ragged one.

    python3 review/world24/look_wall.py <out_prefix>     (writes <out_prefix>_old.png, <out_prefix>_new.png)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "blender"))
from common import reset, preview
import kit_geo as K
import materials as M
import materials_scan as MS

out = sys.argv[-1]
for tag in ("old", "new"):
    reset()
    st = M.stone("stoneA", moss=0.7) if tag == "old" else MS.stone_ragged("stoneA", 0.7)
    fl = M.floor()
    for i in range(3):
        f = K.floor(f"floor{i}", 300 + i)
        f.location = (0, i * 4, 0)
        f.data.materials.append(fl)
        for side in (-1, 1):
            h, ruin = [(1.3, 0.35), (1.6, 0.55), (1.15, 0.7)][(i + (side > 0)) % 3]
            w = K.wall(f"wall{i}{side}", 100 + (i + (side > 0)) % 4, height=h, ruin=ruin)
            w.location = (side * 2.56, i * 4, 0)
            w.data.materials.append(st)
    preview(f"{out}_{tag}.png", (0.9, -1.2, 1.5), (2.6, 3.4, 0.7), lens=26, sun=(28, 0, 150), samples=12)
