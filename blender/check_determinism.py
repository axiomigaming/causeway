"""Determinism check for the kit's procedural pieces: build them and print a digest per piece (the same
data build_kit's cache hashes: rounded vertex positions, loop/face counts, vertex colours).

    python3 blender/check_determinism.py [--twice]

Run it twice (separate processes) and diff the output; --twice also rebuilds in the same process.
"""
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import numpy as np
import detnoise

detnoise.install()
from common import reset
import kit_geo as K
import meso as X
import obstacle_geo as OG
import setpieces as S


def digest(o):
    me = o.data
    h = hashlib.sha256()
    co = np.zeros(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    h.update(np.round(co, 4).tobytes())
    h.update(np.array([len(me.loops), len(me.polygons)], np.int64).tobytes())
    for ca in me.color_attributes:
        c = np.zeros(len(ca.data) * 4, np.float32)
        ca.data.foreach_get("color", c)
        h.update(np.round(c, 3).tobytes())
    return f"{h.hexdigest()[:16]} v{len(me.vertices)} f{len(me.polygons)}"


def build():
    objs = [
        X.square_pier("pillar_0", 200, height=5.0),
        X.square_pier("pillar_1", 201, height=5.0, broken=True),
        X.square_pier("pillar_2", 202, height=3.0, broken=True),
        X.stele_glyph("stele_0", 240),
        X.stele_glyph("stele_1", 241, w=1.1, h=2.4),
        K.drum("drum_0", 250),
        OG.beam_lintel("beam_lintel_0", 1410),
        OG.pillar_topple("pillar_topple_0", 1420),
        K.column_lone("column_lone_0", 1040),
        X.carved_wall("wall_carved_0", 1300),
        X.carved_wall("wall_carved_1", 1301, ruin=0.5),
        X.serpent_post("serpent_0", 1310),
        X.pillar_cap("pillar_cap_0", 1320),
        X.step_pyramid("temple_0", 930),
        X.step_pyramid("temple_1", 931, base=12.0, tiers=4, ruin=0.6),
        X.face_gate("face_gate_0", 950)[0],
        X.idol("idol_0", 940)[0],
        S.colossal_head("head_0", 700, size=1.9),
        S.guardian("guardian_0", 710),
        S.fallen_column("column_fallen_0", 720),
    ]
    out = {}
    for o in objs:
        out[o.name.split(".")[0]] = digest(o)
    return out


reset()
a = build()
for k, v in a.items():
    print("DIGEST", k, v)
if "--twice" in sys.argv:
    reset()
    b = build()
    for k in a:
        print("SAME" if a[k] == b.get(k) else "DIFF", k, a[k], b.get(k))
