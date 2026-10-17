"""Round 11: scanned plants (Poly Haven, CC0; tools/fetch-polyhaven.mjs → blender/cache/polyhaven/models).

The leaf atlas used to be modelled: flat-shaded polygon leaves with no veins, which read as plastic up
close and as cotton balls from afar. The cluster, broadleaf, fine-leaf and fern cells are now renders
of real photoscanned plants (their own leaf colour, alpha cut-outs and veins), lit the same way as the
rest of the atlas, so every bush, canopy and wall drape built from those cells carries real foliage.

The downloaded glTF files are data: they are parsed by Blender's glTF importer and nothing in them is
executed. If they are missing the atlas falls back to the modelled cells.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import CACHE, N, L, link, nodes_clear

MODELS = os.path.join(CACHE, "polyhaven", "models")

# cell → (asset, tilt of the view from straight above in degrees, spin about the plant's up axis,
#         colour gain (r, g, b))
PLANTS = {
    "cluster": ("shrub_04", 35.0, 0.0, (0.72, 0.92, 0.62)),
    "broad": ("nettle_plant", 30.0, 40.0, (0.95, 1.0, 0.9)),
    "cluster_s": ("shrub_04", 25.0, 110.0, (0.78, 0.98, 0.66)),
    "fern": ("fern_02", 65.0, 0.0, (0.95, 1.0, 0.9)),
}
# cell → (copies, how many of the asset's largest plants to draw from, dome radius (plant heights), seed)
COMPOSE = {
    "cluster": (16, 3, 0.42, 11),
    "broad": (16, 4, 0.3, 12),
    "cluster_s": (22, 4, 0.5, 13),
    "fern": (1, 1, 0.0, 14),
}


def available(key):
    p = PLANTS.get(key)
    return bool(p) and os.path.exists(os.path.join(MODELS, p[0], f"{p[0]}.gltf"))


def _material(asset, gain):
    d = os.path.join(MODELS, asset)
    m = bpy.data.materials.new(f"scan_{asset}")
    nt = nodes_clear(m)
    out = N(nt, "ShaderNodeOutputMaterial")
    uv = N(nt, "ShaderNodeUVMap")
    col = N(nt, "ShaderNodeTexImage", _image=bpy.data.images.load(os.path.join(d, f"{asset}_diff_2k.png")))
    al = N(nt, "ShaderNodeTexImage", _image=bpy.data.images.load(os.path.join(d, f"{asset}_alpha_2k.png")))
    al.image.colorspace_settings.name = "Non-Color"
    L(nt, uv.outputs[0], col.inputs["Vector"])
    L(nt, uv.outputs[0], al.inputs["Vector"])
    g = N(nt, "ShaderNodeMix")
    g.data_type = "RGBA"
    g.blend_type = "MULTIPLY"
    g.inputs[0].default_value = 1.0
    L(nt, col.outputs[0], g.inputs[6])
    g.inputs[7].default_value = (*gain, 1.0)
    # Same light response as the modelled clusters: diffuse with a little light through the leaves.
    df = N(nt, "ShaderNodeBsdfDiffuse")
    tr = N(nt, "ShaderNodeBsdfTranslucent")
    L(nt, g.outputs[2], df.inputs[0])
    L(nt, g.outputs[2], tr.inputs[0])
    lit = N(nt, "ShaderNodeMixShader", Fac=0.25)
    L(nt, df.outputs[0], lit.inputs[1])
    L(nt, tr.outputs[0], lit.inputs[2])
    tp = N(nt, "ShaderNodeBsdfTransparent")
    cut = N(nt, "ShaderNodeMath", _operation="GREATER_THAN")
    cut.inputs[1].default_value = 0.5
    L(nt, al.outputs[0], cut.inputs[0])
    fin = N(nt, "ShaderNodeMixShader")
    L(nt, cut.outputs[0], fin.inputs[0])
    L(nt, tp.outputs[0], fin.inputs[1])
    L(nt, lit.outputs[0], fin.inputs[2])
    L(nt, fin.outputs[0], out.inputs[0])
    return m


def _import_parts(asset):
    """Import the asset; return one mesh object per plant in it (transforms baked, unparented).
    Some scans hold several plants in one mesh, laid out along x: those are split at the gaps."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, asset, f"{asset}.gltf"))
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = []
    for o in new:
        if o.type == "MESH":
            me = o.data.copy()
            me.transform(o.matrix_world)
            ob = bpy.data.objects.new(o.name, me)
            link(ob)
            meshes.append(ob)
    for o in new:
        bpy.data.objects.remove(o)
    parts = []
    for ob in meshes:
        xs = sorted(v.co.x for v in ob.data.vertices)
        span = xs[-1] - xs[0]
        cuts = [(a + b) / 2 for a, b in zip(xs, xs[1:]) if b - a > 0.04 * span]
        if not cuts:
            parts.append(ob)
            continue
        edges = [-1e9] + cuts + [1e9]
        for lo, hi in zip(edges, edges[1:]):
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not (lo <= v.co.x < hi)], context="VERTS")
            me = bpy.data.meshes.new(f"{ob.name}_{len(parts)}")
            bm.to_mesh(me)
            bm.free()
            if len(me.polygons) > 50:
                p = bpy.data.objects.new(me.name, me)
                link(p)
                parts.append(p)
        bpy.data.objects.remove(ob)
    # Each part: base centred at the origin, height normalised to 1 (shape kept).
    for p in parts:
        me = p.data
        zs = [v.co.z for v in me.vertices]
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        h = max(1e-3, max(zs) - min(zs))
        me.transform(Matrix.Scale(1.0 / h, 4) @ Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    parts.sort(key=lambda p: -len(p.data.polygons))
    return parts


def plant_object(key, aspect):
    """Build the cell's plant mass from scanned plants, pose it for the cell's view and fit it to
    x ∈ [-aspect, aspect], y ∈ [-1, 1] (the atlas camera looks down −Z)."""
    asset, tilt, spin, gain = PLANTS[key]
    n, keep, spread, seed = COMPOSE[key]
    rng = random.Random(seed)
    parts = _import_parts(asset)
    pool, rest = parts[:keep], parts[keep:]
    for p in rest:
        bpy.data.objects.remove(p)
    copies = []
    for i in range(n):
        src = pool[i % len(pool)] if i < len(pool) else rng.choice(pool)
        c = src.copy()
        link(c)
        if n == 1:
            pos, lean, s = Vector((0, 0, 0)), 0.0, 1.0
        else:
            # On a low dome: the outer plants lean out and sit lower, the middle ones stand tallest.
            a = 2 * math.pi * i / n + rng.uniform(-0.4, 0.4)
            r = spread * (0.25 + 0.75 * math.sqrt(rng.random())) if i >= 3 else spread * 0.12 * i
            pos = Vector((math.cos(a) * r, math.sin(a) * r, -0.35 * r * r))
            lean = 0.8 * r / max(spread, 1e-3)
            s = rng.uniform(0.75, 1.1) * (1.15 if i == 0 else 1.0)
        rot = (Matrix.Rotation(math.atan2(pos.y, pos.x) if pos.length > 1e-6 else 0.0, 4, "Z")
               @ Matrix.Rotation(lean, 4, "Y")
               @ Matrix.Rotation(rng.uniform(0, 2 * math.pi), 4, "Z"))
        c.matrix_world = Matrix.Translation(pos) @ rot @ Matrix.Scale(s, 4)
        copies.append(c)
    for p in pool:
        bpy.data.objects.remove(p)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for c in copies:
        c.data = c.data.copy()
        c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = f"leaf_{key}"
    me = ob.data
    me.materials.clear()
    me.materials.append(_material(asset, gain))
    for p in me.polygons:
        p.material_index = 0
    # Pose: spin about up (Z), then tip the plant's top towards the top of the cell (+Y)
    # (tilt 0: seen from straight above; 90: side on, top up).
    R = Matrix.Rotation(-math.radians(tilt), 4, "X") @ Matrix.Rotation(math.radians(spin), 4, "Z")
    me.transform(R)
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    s = 0.97 * min(2 * aspect / max(1e-3, max(xs) - min(xs)), 2.0 / max(1e-3, max(ys) - min(ys)))
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -max(zs))))
    return ob
