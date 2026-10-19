"""Dump one piece's raw vertex positions and colours (for diffing two processes).

    python3 blender/check_determinism_dump.py <out.npz> [piece]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import numpy as np
from common import reset
import kit_geo as K

from mathutils import noise as _n
import detnoise
if "--det" in sys.argv:
    detnoise.install()
if "--seed" in sys.argv:
    _n.seed_set(0)
print("N", tuple(_n.noise_vector((0.3, 0.2, 0.1))), tuple(_n.noise_vector((0.3, 0.2, 0.1))), tuple(_n.noise_vector((5.3, 0.2, 0.1))), tuple(_n.noise_vector((0.3, 0.2, 0.1))))
reset()
import setpieces as S
o = S.colossal_head("head_0", 700, size=1.9) if "--head" in sys.argv else K.drum("drum_0", 250)
me = o.data
co = np.zeros(len(me.vertices) * 3, np.float32)
me.vertices.foreach_get("co", co)
c = np.zeros(len(me.color_attributes[0].data) * 4, np.float32)
me.color_attributes[0].data.foreach_get("color", c)
np.savez(sys.argv[-1], co=co, c=c)
print("DUMPED", len(co), len(c))
