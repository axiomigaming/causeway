"""Debug: bake only the temple group (pyramids, face gate, idol) small and report coverage.

    python3 blender/look_temple.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import numpy as np
from mathutils import Vector
from common import reset, bake_group, ensure_uvs_packed_weighted
import common
import materials as M
import meso as X

common.CACHE = "/tmp"
SZ = int([a for a in sys.argv if a.startswith("--size=")][0][7:]) if any(a.startswith("--size=") for a in sys.argv) else 512
reset()
objs = [X.step_pyramid("temple_0", 930), X.step_pyramid("temple_1", 931, base=12.0, tiers=4, ruin=0.6)]
s_, g_ = X.face_gate("face_gate_0", 950)
objs.append(s_)
s2, g2 = X.idol("idol_0", 940)
objs.append(s2)
for o in (g_, g2):
    bpy.data.objects.remove(o)
for i, o in enumerate(objs):
    o.location = Vector((i * 40.0, 0, 0))
    print("VL", o.name in bpy.context.view_layer.objects, [c.name for c in o.users_collection], o.type, o.parent)
    print(o.name, len(o.data.polygons), [m.name for m in o.data.materials], set(p.material_index for p in o.data.polygons), o.hide_render, o.hide_get(), tuple(round(x, 1) for x in o.dimensions))
ensure_uvs_packed_weighted(objs, SZ, margin_px=4)
hi = 0.0
for o in objs:
    uv = np.zeros(len(o.data.loops) * 2, np.float32)
    o.data.uv_layers.active.data.foreach_get("uv", uv)
    hi = max(hi, float(uv.max()))
for o in objs:
    uv = np.zeros(len(o.data.loops) * 2, np.float32)
    o.data.uv_layers.active.data.foreach_get("uv", uv)
    o.data.uv_layers.active.data.foreach_set("uv", uv / max(hi, 1.0))
for o in objs:
    uv = np.zeros(len(o.data.loops) * 2, np.float32)
    o.data.uv_layers.active.data.foreach_get("uv", uv)
    print(o.name, "uv", uv.min(), uv.max(), len(o.data.uv_layers), o.data.uv_layers.active.name)
if "--tri" in sys.argv:
    import bmesh
    for o in objs:
        bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()
if "--clean" in sys.argv:
    import bmesh
    for o in objs:
        bm = bmesh.new(); bm.from_mesh(o.data); n0 = len(bm.faces); bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges[:]); print("CLEAN", o.name, n0, len(bm.faces)); bm.to_mesh(o.data); bm.free()
bpy.context.view_layer.update()
print("VL2", [o.name in bpy.context.view_layer.objects for o in objs])
if "--cube" in sys.argv:
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, -60, 0))
    cube = bpy.context.active_object
    pick = [a for a in sys.argv if a.startswith("--pick=")]
    if pick:
        objs = [objs[int(pick[0][7:])]]
    objs = [cube] + ([] if "--only" in sys.argv else objs)
    ensure_uvs_packed_weighted(objs, SZ, margin_px=4)
if "--reorder" in sys.argv:
    objs = objs[1:] + objs[:1]
SIMPLE = "--simple" in sys.argv
if SIMPLE:
    mt = bpy.data.materials.new("simple")
    mt.use_nodes = True
    mt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.2, 0.1, 1)
bake_group(objs, mt if SIMPLE else M.stone("temple", moss=0.5, glyphs=False), "tdbg", SZ, ao_samples=2)
im = bpy.data.images["tdbg_color"]
px = np.array(im.pixels[:], np.float32).reshape(-1, 4)
print("COVER", float((px[:, :3].sum(1) > 0.01).mean()), px[:, :3].mean(0))
