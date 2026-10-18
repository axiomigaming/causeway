"""Look-dev: render the leaf atlas (with the scanned cells) into a scratch folder.

    python3 blender/look_scanned.py <out_dir> [size]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from common import reset
import foliage as F

out = sys.argv[1]
size = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
os.makedirs(out, exist_ok=True)
F.CACHE = out  # never touch blender/cache while a kit bake may be reading it
reset()
t = time.time()
F.render_atlas(size)
print("atlas", size, f"{time.time() - t:.0f}s")
