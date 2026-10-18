"""Debug: which faces of the face gate make the whole bake come out empty? (bisection)

    python3 blender/look_gate_bisect.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
import numpy as np
from common import reset, ensure_uvs_packed_weighted
import meso as X

sc = reset()
sc.cycles.samples = 1
gate, gold = X.face_gate("face_gate_0", 950)
bpy.data.objects.remove(gold)
src = gate.data.copy()
mat = bpy.data.materials.new("m")
mat.use_nodes = True
nt = mat.node_tree
tex = nt.nodes.new("ShaderNodeTexImage")
im = bpy.data.images.new("t", 64, 64)
tex.image = im
nt.nodes.active = tex


def bakes(keep):
    me = src.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    drop = [f for i, f in enumerate(bm.faces) if not keep[0] <= i < keep[1]]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bm.to_mesh(me)
    bm.free()
    gate.data = me
    me.materials.clear()
    me.materials.append(mat)
    ensure_uvs_packed_weighted([gate], 64, margin_px=1)
    bpy.ops.object.select_all(action="DESELECT")
    gate.select_set(True)
    bpy.context.view_layer.objects.active = gate
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=0, use_clear=True)
    px = np.array(im.pixels[:], np.float32).reshape(-1, 4)
    return float((px[:, :3].sum(1) > 0.01).mean())


n = len(src.polygons)
lo, hi = 0, n
print("ALL", n, bakes((0, n)), flush=True)
while hi - lo > 1:
    mid = (lo + hi) // 2
    a = bakes((lo, mid))
    b = bakes((mid, hi))
    print("RANGE", lo, mid, a, mid, hi, b, flush=True)
    if a == 0.0:
        hi = mid
    elif b == 0.0:
        lo = mid
    else:
        break
print("CULPRIT", lo, hi)
if hi - lo == 1:
    f = src.polygons[lo]
    print("FACE", lo, len(f.vertices), [tuple(round(c, 4) for c in src.vertices[v].co) for v in f.vertices], f.area)
