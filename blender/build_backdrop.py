"""The far world as an equirectangular Cycles render → public/assets/backdrop.webp + env.hdr.

Everything beyond ~250 m lives here: sky, clouds, cliffs, jungle ridges, distant
temples and open water. The game draws it on a camera-locked sphere, so it never
parallaxes, and uses the HDR version for image-based lighting so the sky and the
light on the stones agree. The sun direction is measured from the render and
written to backdrop.json for the realtime sun.

    python3 blender/build_backdrop.py [--fast]
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Vector, noise

from common import reset, N, L, nodes_clear, hexcol, link, new_mesh_obj, mix, ramp, maprange, math_node, OUT, CACHE

FAST = "--fast" in sys.argv
sc = reset()
rng = random.Random(11)

SUN_EL = 20.0  # low and ahead: the sun sits in the top of the chase frame and walls throw long shadows back along the floor
SUN_AZ = 76.0  # degrees from +X toward +Y (the run direction is +Y): just right of straight ahead
SUN_ROT = 90.0 - SUN_AZ  # Nishita: dir = (sin r·cos e, cos r·cos e, sin e)

# ---------------------------------------------------------------- world
w = bpy.data.worlds.new("sky")
sc.world = w
w.use_nodes = True
nt = w.node_tree
bg = nt.nodes["Background"]
sky = nt.nodes.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA"
sky.sun_elevation = math.radians(SUN_EL)
sky.sun_rotation = math.radians(SUN_ROT)
sky.sun_size = math.radians(1.2)
sky.sun_intensity = 0.4
sky.altitude = 200
sky.air_density = 1.35  # round 9: a bluer sky overhead (portrait frames see a lot of it)
sky.dust_density = 0.8  # round 8: less white veil around the sun
sky.ozone_density = 2.2
_tc = nt.nodes.new("ShaderNodeTexCoord")
_sep = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(_tc.outputs["Generated"], _sep.inputs[0])
_hz = maprange(nt, _sep.outputs[2], 0.0, 0.38, 0.0, 1.0)
# A warm band of haze on the horizon under a clear blue zenith.
_warm = ramp(nt, _hz, [(0.0, (1.12, 1.0, 0.84, 1)), (0.22, (0.98, 1.0, 1.02, 1)), (1.0, (0.7, 0.9, 1.22, 1))])
nt.links.new(mix(nt, 1.0, sky.outputs[0], _warm, "MULTIPLY"), bg.inputs[0])
bg.inputs[1].default_value = 0.22

# Haze colour for aerial perspective: warm near the sun side, cooler away.
HAZE = hexcol("#93aeb4")  # cool, a little green: the jungle breathes it
HAZE_FAR = hexcol("#bccfdd")  # round 17: far layers go bluer and paler


def aerial(ntm, col, near=150.0, far=2600.0, strength=0.6):
    """Round 17: aerial perspective that turns bluer and lighter with distance (each layer of the
    shore, the hills and the mesas a paler, cooler step back), not one flat grey veil."""
    cam = N(ntm, "ShaderNodeCameraData")
    fac = maprange(ntm, cam.outputs["View Distance"], near, far, 0.0, min(0.86, strength * 1.3), smooth=False)
    fac = math_node(ntm, "POWER", fac, 0.85)
    tint = maprange(ntm, cam.outputs["View Distance"], 200.0, 2400.0, 0.0, 1.0, smooth=False)
    haze = mix(ntm, tint, HAZE, HAZE_FAR, "MIX")
    return mix(ntm, fac, col, haze, "MIX")


def terrain_mat(name, low, high, green=0.0, near=150, far=2600):
    m = bpy.data.materials.new(name)
    t = nodes_clear(m)
    out = N(t, "ShaderNodeOutputMaterial")
    bsdf = N(t, "ShaderNodeBsdfPrincipled")
    L(t, bsdf.outputs[0], out.inputs[0])
    tc = N(t, "ShaderNodeTexCoord")
    nz = N(t, "ShaderNodeTexNoise", Scale=0.02, Detail=8.0, Roughness=0.6)
    L(t, tc.outputs["Object"], nz.inputs["Vector"])
    sep = N(t, "ShaderNodeSeparateXYZ")
    L(t, tc.outputs["Object"], sep.inputs[0])
    h = maprange(t, sep.outputs[2], 0.0, 260.0)
    col = mix(t, h, low, high, "MIX")
    col = mix(t, 1.0, col, ramp(t, nz.outputs[0], [(0.3, (0.75, 0.75, 0.75)), (0.7, (1.15, 1.12, 1.08))]), "MULTIPLY")
    if green:
        geo = N(t, "ShaderNodeNewGeometry")
        sn = N(t, "ShaderNodeSeparateXYZ")
        L(t, geo.outputs["Normal"], sn.inputs[0])
        g = maprange(t, sn.outputs[2], 0.45, 0.8, 0.0, green)
        gn = N(t, "ShaderNodeTexNoise", Scale=0.08, Detail=6.0)
        L(t, tc.outputs["Object"], gn.inputs["Vector"])
        g = math_node(t, "MULTIPLY", g, maprange(t, gn.outputs[0], 0.35, 0.55))
        # Vegetation clings to the faces in vertical streaks and fills the base.
        mpv = N(t, "ShaderNodeMapping")
        mpv.inputs["Scale"].default_value = (0.09, 0.09, 0.025)
        L(t, tc.outputs["Object"], mpv.inputs[0])
        vn = N(t, "ShaderNodeTexNoise", Scale=1.0, Detail=8.0, Roughness=0.65)
        L(t, mpv.outputs[0], vn.inputs["Vector"])
        face = maprange(t, vn.outputs[0], 0.4, 0.55, 0.0, green)
        base = maprange(t, sep.outputs[2], 60.0, 5.0, 0.0, 1.0)
        g = math_node(t, "MAXIMUM", g, math_node(t, "MAXIMUM", face, base))
        col = mix(t, g, col, ramp(t, gn.outputs[0], [(0.3, hexcol("#1d3a12")), (0.7, hexcol("#3f6a1e"))]), "MIX")
    col = aerial(t, col, near, far)
    L(t, col, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bump = N(t, "ShaderNodeBump", Strength=0.6, Distance=4.0)
    L(t, nz.outputs[0], bump.inputs["Height"])
    L(t, bump.outputs[0], bsdf.inputs["Normal"])
    return m


def ridge(name, r0, r1, hmax, seed, mat, steps_a=720, steps_r=40, cliff=0.0, gap=None):
    """A ring of terrain between radii r0..r1 around the origin."""
    bm = bmesh.new()
    off = Vector((seed * 13.1, seed * 7.3, 0))
    rows = []
    for i in range(steps_r + 1):
        r = r0 + (r1 - r0) * (i / steps_r) ** 1.3
        row = []
        for j in range(steps_a):
            a = 2 * math.pi * j / steps_a
            p = Vector((math.cos(a) * r, math.sin(a) * r, 0))
            q = p * 0.0022 + off
            n = noise.fractal(q, 0.55, 2.1, 5)
            # Round 8: three octaves, not five — single-vertex needles on the far ridges read as spires.
            n2 = noise.ridged_multi_fractal(q * 1.7, 0.9, 2.0, 3, 1.0, 2.0)
            env = math.sin(math.pi * i / steps_r) ** 0.6
            h = hmax * max(0.0, 0.45 + 0.55 * n + 0.05 * (n2 - 1.0)) * env
            if cliff:
                # Terraced mesas: quantise heights, keep the walls steep.
                step = hmax * 0.18
                h = math.floor(h / step) * step + (h % step) * (1 - cliff)
            if gap and abs(((math.degrees(a) - gap[0] + 180) % 360) - 180) < gap[1]:
                h *= 0.08
            row.append(bm.verts.new((p.x, p.y, h - 2.0)))
        rows.append(row)
    for i in range(steps_r):
        for j in range(steps_a):
            k = (j + 1) % steps_a
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][k], rows[i][k]))  # normals up
    ob = new_mesh_obj(name, bm)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.materials.append(mat)
    return ob


rock_far = terrain_mat("farrock", hexcol("#8a4e34"), hexcol("#b77a52"), green=1.0, near=300, far=3200)
jungle = terrain_mat("jungle", hexcol("#1f3a14"), hexcol("#3f6420"), green=0.0, near=150, far=1600)
rock_near = terrain_mat("nearrock", hexcol("#7e4630"), hexcol("#b0714a"), green=1.0, near=200, far=2200)

# Mesas and cliff walls far away, a gap toward the sun so the light pours over the water.
ridge("mesas", 1100, 2600, 620, 3, rock_far, cliff=0.6, gap=(SUN_AZ, 16))
# Jungle-topped cliffs nearer, terraced like the limestone in the references.
ridge("hills", 380, 1000, 210, 7, rock_near, steps_a=900, cliff=0.7, gap=(SUN_AZ, 11))


def karst(name, loc, radius, height, seed):
    """A tropical limestone tower: steep fluted sides, a green cap."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    off = Vector((seed * 5.3, seed * 2.1, seed * 3.7))
    for v in bm.verts:
        p = v.co.copy()
        z = (p.z + 1) / 2
        # Round 17: sheer, fluted sides and a blunt, broken top (the old profile read as an egg).
        prof = (1 - z ** 10) ** 0.22
        flute = 1 + 0.38 * noise.noise(Vector((p.x * 5, p.y * 5, z * 0.35)) + off) + 0.16 * noise.fractal(p * 3.0 + off, 0.65, 2, 5)
        ledge = 1 + 0.12 * math.floor(noise.noise(Vector((z * 6.0, seed * 0.3, 0.0))) * 3) / 3
        v.co = Vector((p.x * radius * (0.45 + 0.55 * prof) * flute * ledge, p.y * radius * (0.45 + 0.55 * prof) * flute * ledge, z * height))
    ob = new_mesh_obj(name, bm)
    for q in ob.data.polygons:
        q.use_smooth = True
    ob.location = loc
    ob.data.materials.append(rock_near)
    KARST_TOPS.append((loc, radius, height))
    return ob


KARST_TOPS = []
for k in range(26):
    az = rng.uniform(0, 360)
    if abs(((az - SUN_AZ + 180) % 360) - 180) < 9:
        continue
    d = rng.uniform(320, 1500)
    karst(f"karst{k}", Vector((math.cos(math.radians(az)) * d, math.sin(math.radians(az)) * d, -4)),
          rng.uniform(25, 60) * (d / 700) ** 0.4, rng.uniform(90, 260) * (d / 700) ** 0.5, k)

# Canopy bumps on the hills: instanced icospheres read as tree crowns at distance.
canopy = bpy.data.materials.new("canopy")
t = nodes_clear(canopy)
out = N(t, "ShaderNodeOutputMaterial")
bsdf = N(t, "ShaderNodeBsdfPrincipled")
L(t, bsdf.outputs[0], out.inputs[0])
oi = N(t, "ShaderNodeObjectInfo")
col = ramp(t, oi.outputs["Random"], [(0.0, hexcol("#18331a")), (0.5, hexcol("#2c5418")), (1.0, hexcol("#56782a"))])
L(t, aerial(t, col, 120, 1500), bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.9

# ---------------------------------------------------------------- distant temples (stacked-block silhouettes)
stone_far = bpy.data.materials.new("stonefar")
t = nodes_clear(stone_far)
out = N(t, "ShaderNodeOutputMaterial")
bsdf = N(t, "ShaderNodeBsdfPrincipled")
L(t, bsdf.outputs[0], out.inputs[0])
tc = N(t, "ShaderNodeTexCoord")
nz = N(t, "ShaderNodeTexNoise", Scale=0.3, Detail=6.0)
L(t, tc.outputs["Object"], nz.inputs["Vector"])
col = mix(t, 1.0, hexcol("#b8845a"), ramp(t, nz.outputs[0], [(0.3, (0.7, 0.72, 0.6)), (0.7, (1.1, 1.05, 1.0))]), "MULTIPLY")
L(t, aerial(t, col, 150, 2200), bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.9


def _frustum(bm, w0, w1, z0, h, cx=0.0, cy=0.0, d0=None, d1=None):
    import mathutils
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    d0, d1 = d0 or w0, d1 or w1
    for v in t.verts:
        top = v.co.z > 0
        v.co = mathutils.Vector((cx + v.co.x * (w1 if top else w0), cy + v.co.y * (d1 if top else d0), z0 + (h if top else 0.0)))
    me = bpy.data.meshes.new("_f")
    t.to_mesh(me)
    t.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def step_pyramid(name, loc, scale, tiers=6, comb=True):
    """Round 8: a Mesoamerican step pyramid (talud tiers, a stair on the face toward the causeway, a shrine
    and roof comb on top) instead of the old stacked blocks with a spire, which read as Gothic."""
    bm = bmesh.new()
    w = 60 * scale
    z = 0.0
    h = 8 * scale
    for i in range(tiers):
        _frustum(bm, w, w - 4 * scale, z, h * 0.7)
        _frustum(bm, w - 4 * scale, w - 4 * scale, z + h * 0.7, h * 0.3)
        z += h
        w -= 9 * scale
    # Stair toward the origin (the causeway), as a ramp up the face.
    run = 9 * scale * tiers / 2
    sw = 12 * scale
    _frustum(bm, sw, sw, 0, z, cy=0, d0=60 * scale + 6 * scale, d1=w + 2 * scale)
    # Shrine and roof comb.
    _frustum(bm, w * 0.8, w * 0.75, z, 9 * scale)
    if comb:
        _frustum(bm, w * 0.6, w * 0.5, z + 9 * scale, 7 * scale, d0=3 * scale, d1=2 * scale)
    ob = new_mesh_obj(name, bm)
    ob.location = loc
    # Turn the stair face toward the causeway (the camera at the origin).
    ob.rotation_euler.z = math.atan2(loc.y, loc.x) - math.pi / 2
    ob.data.materials.append(stone_far)
    del run
    return ob


def at(az_deg, dist, z=0.0):
    a = math.radians(az_deg)
    return Vector((math.cos(a) * dist, math.sin(a) * dist, z))


# Toward the run direction (+Y is 90°) the eye expects a destination: a great pyramid, lesser ones about.
step_pyramid("temple_a", at(97, 700, -2), 1.9, tiers=7)
step_pyramid("temple_b", at(80, 520, -2), 0.9, tiers=5)
step_pyramid("temple_c", at(128, 1150, 30), 0.9, tiers=6)
step_pyramid("temple_d", at(250, 800, -2), 0.8, tiers=5, comb=False)
step_pyramid("temple_e", at(70, 460, -2), 0.7, tiers=6)
step_pyramid("temple_f", at(112, 540, -2), 0.8, tiers=5, comb=False)
step_pyramid("temple_g", at(160, 620, -2), 1.1, tiers=6)
# (Round 8: the needle spires that stood about the lagoon are gone: they read as church spires.)

# ---------------------------------------------------------------- far vegetation (round 17)
# The far jungle used to be one icosphere per tree: rows of round "lollipop" domes and an even green
# wall. Now: lumpy multi-lobed crowns of many sizes, emergent giants and palms breaking the skyline,
# gaps where the bank thins, more karst close in, and mist banks between the layers.


def _merge_into(bm, t):
    me = bpy.data.meshes.new("_m")
    t.to_mesh(me)
    t.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def crown_mesh(name, seed, lobes=6, spread=1.0, flat=0.8):
    """A cauliflower crown: several noise-displaced lobes, one higher, an irregular top."""
    r = random.Random(seed)
    bm = bmesh.new()
    for i in range(lobes):
        t = bmesh.new()
        bmesh.ops.create_icosphere(t, subdivisions=3, radius=1.0)
        sz = r.uniform(0.45, 1.0) if i else 1.0
        c = Vector((r.uniform(-spread, spread), r.uniform(-spread, spread), r.uniform(0.0, 0.7) * spread + (0.35 if i == 0 else 0.0)))
        off = Vector((seed * 3.1 + i, i * 1.7, seed * 0.7))
        for v in t.verts:
            q = v.co.copy()
            # Round 18: a crinkled, leafy edge (clusters on clusters), so the silhouette is not a soft puff.
            d = 1 + 0.38 * noise.fractal(q * 2.3 + off, 0.6, 2.0, 3) + 0.14 * noise.noise(q * 6.0 + off) + 0.09 * abs(noise.noise(q * 13.0 + off))
            # (Round 17b: no flat underside — that read as mushrooms; lobes sag into each other.)
            v.co = c + Vector((q.x * sz * d, q.y * sz * d, max(q.z, -0.75) * sz * d * flat))
        _merge_into(bm, t)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    return me


def trunk_mesh(name, r0, lean=0.0):
    """A unit-height trunk (scaled to height per instance), tapering, with a slight lean."""
    bm = bmesh.new()
    segs = 6
    rings = []
    for k in range(segs + 1):
        z = k / segs
        x = lean * z * z
        rad = r0 * (1 - 0.6 * z)
        rings.append([bm.verts.new((x + math.cos(a) * rad, math.sin(a) * rad, z)) for a in [2 * math.pi * j / 6 for j in range(6)]])
    for k in range(segs):
        for j in range(6):
            bm.faces.new((rings[k][j], rings[k][(j + 1) % 6], rings[k + 1][(j + 1) % 6], rings[k + 1][j]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def palm_mesh(name, seed, h=18.0):
    """A palm silhouette: a curved, leaning trunk and a star of drooping fronds (two-sided strips)."""
    r = random.Random(seed)
    bm = bmesh.new()
    lean = r.uniform(0.12, 0.3)
    segs = 8
    rings = []
    for k in range(segs + 1):
        t = k / segs
        cx = lean * h * t * t
        rad = 0.45 * (1 - 0.45 * t)
        rings.append([bm.verts.new((cx + math.cos(a) * rad, math.sin(a) * rad, h * t)) for a in [2 * math.pi * j / 5 for j in range(5)]])
    for k in range(segs):
        for j in range(5):
            bm.faces.new((rings[k][j], rings[k][(j + 1) % 5], rings[k + 1][(j + 1) % 5], rings[k + 1][j]))
    top = Vector((lean * h, 0, h))
    n = r.randint(8, 11)
    for f in range(n):
        a = 2 * math.pi * f / n + r.uniform(-0.2, 0.2)
        ln = r.uniform(5.5, 8.0)
        up = r.uniform(0.15, 0.6)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0))
        pts = []
        for k in range(7):
            t = k / 6
            p = top + d * (ln * t) + Vector((0, 0, ln * (up * t - 0.75 * t * t)))
            w = 1.1 * math.sin(math.pi * min(1.0, t * 1.15 + 0.05))
            pts.append((bm.verts.new(p - side * w * 0.5), bm.verts.new(p + side * w * 0.5)))
        for k in range(6):
            bm.faces.new((pts[k][0], pts[k + 1][0], pts[k + 1][1], pts[k][1]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


bark_far = bpy.data.materials.new("barkfar")
t = nodes_clear(bark_far)
out = N(t, "ShaderNodeOutputMaterial")
bsdf = N(t, "ShaderNodeBsdfPrincipled")
L(t, bsdf.outputs[0], out.inputs[0])
L(t, aerial(t, hexcol("#3a3127"), 120, 1500), bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.9

# Canopy: per-object hue and a lumpy light/dark breakup inside each crown.
t = canopy.node_tree
for nd in list(t.nodes):
    t.nodes.remove(nd)
out = N(t, "ShaderNodeOutputMaterial")
bsdf = N(t, "ShaderNodeBsdfPrincipled")
L(t, bsdf.outputs[0], out.inputs[0])
oi = N(t, "ShaderNodeObjectInfo")
tc = N(t, "ShaderNodeTexCoord")
cn = N(t, "ShaderNodeTexNoise", Scale=1.6, Detail=4.0, Roughness=0.6)
L(t, tc.outputs["Object"], cn.inputs["Vector"])
col = ramp(t, oi.outputs["Random"], [(0.0, hexcol("#0f2412")), (0.35, hexcol("#1a3a14")), (0.7, hexcol("#2c5418")), (1.0, hexcol("#4c6c22"))])
col = mix(t, 1.0, col, ramp(t, cn.outputs[0], [(0.35, (0.55, 0.6, 0.55, 1)), (0.65, (1.12, 1.1, 1.0, 1))]), "MULTIPLY")
# Leaf clusters: a fine bumpy, sparkling breakup so a crown reads as foliage, not a smooth stone.
lf = N(t, "ShaderNodeTexVoronoi", Scale=7.0)
L(t, tc.outputs["Object"], lf.inputs["Vector"])
col = mix(t, 1.0, col, ramp(t, lf.outputs["Distance"], [(0.05, (1.15, 1.15, 1.0, 1)), (0.6, (0.6, 0.65, 0.55, 1))]), "MULTIPLY")
lb = N(t, "ShaderNodeBump", Strength=0.75, Distance=0.25)
L(t, lf.outputs["Distance"], lb.inputs["Height"])
L(t, lb.outputs[0], bsdf.inputs["Normal"])
# Round 18: a dark shadowed underside to every crown (the canopy reads in layers, crown over crown).
gn_ = N(t, "ShaderNodeNewGeometry")
sn_ = N(t, "ShaderNodeSeparateXYZ")
L(t, gn_.outputs["Normal"], sn_.inputs[0])
under = ramp(t, maprange(t, sn_.outputs[2], -0.6, 0.35, 0.0, 1.0), [(0.0, (0.32, 0.36, 0.34, 1)), (1.0, (1.0, 1.0, 1.0, 1))])
col = mix(t, 1.0, col, under, "MULTIPLY")
L(t, aerial(t, col, 220, 2200), bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.9
frond = bpy.data.materials.new("frond")
t = nodes_clear(frond)
out = N(t, "ShaderNodeOutputMaterial")
bsdf = N(t, "ShaderNodeBsdfPrincipled")
L(t, bsdf.outputs[0], out.inputs[0])
oi = N(t, "ShaderNodeObjectInfo")
col = ramp(t, oi.outputs["Random"], [(0.0, hexcol("#2e5418")), (1.0, hexcol("#5a7a26"))])
L(t, aerial(t, col, 120, 1500), bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.8

CROWNS = [crown_mesh(f"crown{i}", 100 + i, lobes=5 + i % 5, spread=0.75 + 0.12 * (i % 4), flat=0.85 + 0.06 * (i % 3)) for i in range(10)]
GIANT_CROWNS = [crown_mesh(f"gcrown{i}", 200 + i, lobes=9, spread=1.3, flat=0.6) for i in range(4)]
TRUNKS = [trunk_mesh(f"trunk{i}", 0.06, lean=0.04 * (i - 1)) for i in range(3)]
PALMS = [palm_mesh(f"palm{i}", 400 + i) for i in range(4)]
for me in CROWNS + GIANT_CROWNS:
    me.materials.append(canopy)
for me in TRUNKS:
    me.materials.append(bark_far)
for me in PALMS:
    me.materials.append(frond)


def inst(me, loc, s, sz=None):
    o = bpy.data.objects.new("v", me)
    o.scale = (s, s, sz if sz is not None else s)
    o.rotation_euler.z = rng.uniform(0, 6.28)
    o.location = loc
    link(o)
    return o


def giant(loc, h, s):
    """An emergent: a bare trunk standing clear of the canopy under a broad, flat crown."""
    inst(rng.choice(TRUNKS), loc, h, sz=h)
    inst(rng.choice(GIANT_CROWNS), loc + Vector((0, 0, h * 0.78)), s, sz=s * rng.uniform(0.8, 1.1))
    # The canopy closes round its foot: it rises out of the forest, not off a bare pole.
    for c in range(3):
        cs = s * rng.uniform(0.45, 0.7)
        inst(rng.choice(CROWNS), loc + Vector((rng.uniform(-s, s) * 0.8, rng.uniform(-s, s) * 0.8, cs * 0.6)), cs)


def palm(loc, h):
    inst(rng.choice(PALMS), loc, h / 18.0)


hills = bpy.data.objects["hills"]
deps = bpy.context.evaluated_depsgraph_get()
count = 0
for k in range(14000 if not FAST else 4000):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(260, 1100)
    p = Vector((math.cos(a) * r, math.sin(a) * r, 700))
    hit, loc, nrm, idx, obj, _ = sc.ray_cast(deps, p, Vector((0, 0, -1)))
    if not hit or loc.z < 2:
        continue
    if nrm.z < 0.6:
        # The terrace walls: jungle hangs on them too (clumps pushed out off the face), so the hills
        # are not bare grey-green walls between green tops.
        if rng.random() < 0.6:
            s = rng.uniform(3, 7) * (r / 500) ** 0.3
            out = Vector((nrm.x, nrm.y, 0)).normalized() if Vector((nrm.x, nrm.y)).length > 1e-3 else Vector((0, 0, 0))
            inst(rng.choice(CROWNS), loc + out * s * 0.5, s, sz=s * rng.uniform(0.9, 1.4))
        continue
    s0 = rng.uniform(4, 10) * (r / 500) ** 0.3
    u = rng.random()
    if u < 0.09:
        giant(loc, s0 * rng.uniform(5.0, 7.5), s0 * rng.uniform(1.5, 2.2))
    elif u < 0.11:
        palm(loc, s0 * rng.uniform(2.6, 3.6))
    else:
        for c in range(rng.randint(1, 3)):
            s = s0 * rng.uniform(0.6, 1.15)
            tall = rng.random() < 0.18  # a narrow, towering crown now and then
            inst(rng.choice(CROWNS), loc + Vector((rng.uniform(-s0, s0), rng.uniform(-s0, s0), s * rng.uniform(-0.1, 0.5))), s * (0.7 if tall else 1.0), sz=s * (rng.uniform(1.8, 2.6) if tall else rng.uniform(0.75, 1.25)))
    count += 1
print("canopy", count)

# The far bank (220–400 m): not an even wall. Its height swells and sinks along the shore, it thins to
# gaps of open water and bare rock, giants and palms stand out of it, and the crowns step back in rows.
bank = 0
for k in range(3600 if not FAST else 1300):
    a = rng.uniform(0, 2 * math.pi)
    az = math.degrees(a)
    if abs(((az - SUN_AZ + 180) % 360) - 180) < 10:
        continue
    swell = noise.noise(Vector((math.cos(a) * 3.0, math.sin(a) * 3.0, 0.5)))  # -1..1 along the shore
    if swell < -0.35 and rng.random() < 0.8:
        continue  # a gap in the bank
    r = rng.uniform(230, 400)
    hmul = 1.0 + 0.6 * swell + 0.25 * (r - 230) / 170
    u = rng.random()
    base = Vector((math.cos(a) * r, math.sin(a) * r, -1.5))
    if u < 0.07:
        giant(base, rng.uniform(32, 50) * max(0.75, hmul), rng.uniform(8, 12))
    elif u < 0.16 and r < 320:
        palm(base, rng.uniform(20, 30))
    else:
        s = rng.uniform(3.5, 9) * max(0.5, hmul)
        inst(rng.choice(CROWNS), base + Vector((0, 0, s * rng.uniform(-0.15, 0.55))), s, sz=s * rng.uniform(0.8, 1.5))
    bank += 1
print("bank", bank)

# More karst close in: sheer pale faces standing out of the bank and the shallows.
for k in range(12):
    az = rng.uniform(0, 360)
    if abs(((az - SUN_AZ + 180) % 360) - 180) < 12:
        continue
    d = rng.uniform(280, 620)
    karst(f"karstnear{k}", Vector((math.cos(math.radians(az)) * d, math.sin(math.radians(az)) * d, -4)),
          rng.uniform(16, 34), rng.uniform(60, 150), 40 + k)

# Green caps and ledge clumps on every karst tower.
for (kl, kr, kh) in KARST_TOPS:
    for c in range(rng.randint(4, 8)):
        a = rng.uniform(0, 6.28)
        d = kr * rng.uniform(0.0, 0.5)
        s = kr * rng.uniform(0.18, 0.32)
        inst(rng.choice(CROWNS), kl + Vector((math.cos(a) * d, math.sin(a) * d, kh * rng.uniform(0.9, 0.98))), s, sz=s * 0.7)
    if rng.random() < 0.5:
        palm(kl + Vector((kr * 0.2, 0, kh * 0.95)), kr * 0.6)

# Mist banks: soft curtains low between the layers (shore | hills | mesas), thickest at the water,
# torn by noise, so each layer stands in front of a paler one.
mist = bpy.data.materials.new("mist")
t = nodes_clear(mist)
out = N(t, "ShaderNodeOutputMaterial")
em = N(t, "ShaderNodeEmission")
tr = N(t, "ShaderNodeBsdfTransparent")
mx = N(t, "ShaderNodeMixShader")
tc = N(t, "ShaderNodeTexCoord")
sep = N(t, "ShaderNodeSeparateXYZ")
L(t, tc.outputs["Generated"], sep.inputs[0])
mpm = N(t, "ShaderNodeMapping")
mpm.inputs["Scale"].default_value = (6.0, 6.0, 1.0)
L(t, tc.outputs["Generated"], mpm.inputs[0])
mn = N(t, "ShaderNodeTexNoise", Scale=9.0, Detail=5.0, Roughness=0.55)
L(t, mpm.outputs[0], mn.inputs["Vector"])
fall = maprange(t, sep.outputs[2], 0.0, 1.0, 1.0, 0.0)
fall = math_node(t, "POWER", fall, 1.8)
torn = maprange(t, mn.outputs[0], 0.38, 0.68, 0.15, 1.0)
dens = math_node(t, "MULTIPLY", math_node(t, "MULTIPLY", fall, torn), 0.8)
L(t, dens, mx.inputs[0])
L(t, tr.outputs[0], mx.inputs[1])
L(t, em.outputs[0], mx.inputs[2])
L(t, mx.outputs[0], out.inputs[0])
em.inputs["Color"].default_value = hexcol("#d4dfe4")
em.inputs["Strength"].default_value = 1.25
for rad, hgt in ((430, 34), (820, 60), (1350, 95)):
    bmm = bmesh.new()
    bmesh.ops.create_cone(bmm, cap_ends=False, segments=256, radius1=rad, radius2=rad, depth=hgt)
    mo = new_mesh_obj(f"mist{rad}", bmm)
    mo.location.z = hgt / 2 - 3
    mo.data.materials.append(mist)
    mo.visible_shadow = False

# ---------------------------------------------------------------- water and clouds
water = bpy.data.materials.new("water")
t = nodes_clear(water)
out = N(t, "ShaderNodeOutputMaterial")
bsdf = N(t, "ShaderNodeBsdfPrincipled")
L(t, bsdf.outputs[0], out.inputs[0])
bsdf.inputs["Base Color"].default_value = hexcol("#17605c")
bsdf.inputs["Roughness"].default_value = 0.08
tc = N(t, "ShaderNodeTexCoord")
wv = N(t, "ShaderNodeTexNoise", Scale=0.15, Detail=6.0)
L(t, tc.outputs["Object"], wv.inputs["Vector"])
bump = N(t, "ShaderNodeBump", Strength=0.08, Distance=0.5)
L(t, wv.outputs[0], bump.inputs["Height"])
L(t, bump.outputs[0], bsdf.inputs["Normal"])
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6000)
wo = new_mesh_obj("water", bm)
wo.data.materials.append(water)

clouds = bpy.data.materials.new("clouds")
t = nodes_clear(clouds)
out = N(t, "ShaderNodeOutputMaterial")
em = N(t, "ShaderNodeEmission")
tr = N(t, "ShaderNodeBsdfTransparent")
mx = N(t, "ShaderNodeMixShader")
tc = N(t, "ShaderNodeTexCoord")
mp = N(t, "ShaderNodeMapping")
mp.inputs["Scale"].default_value = (1.0, 4.5, 1.0)
L(t, tc.outputs["Object"], mp.inputs[0])
cn = N(t, "ShaderNodeTexNoise", Scale=0.00045, Detail=12.0, Roughness=0.58, Distortion=0.2)
L(t, mp.outputs[0], cn.inputs["Vector"])
dens = maprange(t, cn.outputs[0], 0.52, 0.7)
dens = math_node(t, "MULTIPLY", dens, 0.8)
L(t, dens, mx.inputs[0])
L(t, tr.outputs[0], mx.inputs[1])
L(t, em.outputs[0], mx.inputs[2])
L(t, mx.outputs[0], out.inputs[0])
# Self-lit, so they glow gold toward the sun and go lilac-grey away from it (seen from below,
# a lit plane would only show its dark side).
_e, _r = math.radians(SUN_EL), math.radians(SUN_ROT)
_sd = (math.sin(_r) * math.cos(_e), math.cos(_r) * math.cos(_e), math.sin(_e))
geo = N(t, "ShaderNodeNewGeometry")
nv = t.nodes.new("ShaderNodeVectorMath")
nv.operation = "NORMALIZE"
L(t, geo.outputs["Position"], nv.inputs[0])
dv = t.nodes.new("ShaderNodeVectorMath")
dv.operation = "DOT_PRODUCT"
L(t, nv.outputs[0], dv.inputs[0])
dv.inputs[1].default_value = _sd
toward = maprange(t, dv.outputs["Value"], 0.2, 0.98, 0.0, 1.0)
ccol = ramp(t, toward, [(0.0, hexcol("#d8e0ea")), (0.6, hexcol("#f6ecdc")), (1.0, hexcol("#fff3dc"))])
L(t, ccol, em.inputs["Color"])
L(t, maprange(t, dv.outputs["Value"], 0.2, 0.98, 1.1, 3.2), em.inputs["Strength"])
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30000)
co = new_mesh_obj("clouds", bm)
co.location.z = 1400
co.data.materials.append(clouds)
co.visible_shadow = False  # thin golden streaks; they must not dim the land

# ---------------------------------------------------------------- sun lamp matching the sky
sl = bpy.data.lights.new("sun", "SUN")
sl.energy = 3.2
sl.angle = math.radians(1.5)
sl.color = (1.0, 0.9, 0.76)
so = bpy.data.objects.new("sun", sl)
link(so)
# Nishita: sun direction (x, y, z) = (sin r · cos e, cos r · cos e, sin e) — verified below from pixels.
e, r = math.radians(SUN_EL), math.radians(SUN_ROT)
sun_dir = Vector((math.sin(r) * math.cos(e), math.cos(r) * math.cos(e), math.sin(e)))
so.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera + render
cd = bpy.data.cameras.new("pano")
cd.type = "PANO"
try:
    cd.panorama_type = "EQUIRECTANGULAR"
except AttributeError:
    cd.cycles.panorama_type = "EQUIRECTANGULAR"
cd.clip_end = 40000
cam = bpy.data.objects.new("pano", cd)
cam.location = (0, 0, 3.0)
cam.rotation_euler = (math.radians(90), 0, math.radians(-90))  # look along +X; image centre = +X
link(cam)
sc.camera = cam
W = 2048 if FAST else 4096
sc.render.resolution_x, sc.render.resolution_y = W, W // 2
sc.cycles.samples = 24 if FAST else 40  # denoised; round 18: more, so the denoiser keeps crown edges crisp
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 4
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Base Contrast"
sc.view_settings.exposure = -0.2

bpy.ops.render.render()
rr = bpy.data.images["Render Result"]
png = os.path.join(CACHE, "backdrop.png")
exr = os.path.join(CACHE, "backdrop.exr")
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGB"
sc.render.image_settings.color_depth = "8"
rr.save_render(png, scene=sc)
sc.render.image_settings.file_format = "OPEN_EXR"
sc.render.image_settings.color_depth = "16"
rr.save_render(exr, scene=sc)

import numpy as np
res = bpy.data.images.load(exr)
H = W // 2
px = np.array(res.pixels[:], np.float32).reshape(H, W, 4)
lum = px[:, :, 0] * 0.2126 + px[:, :, 1] * 0.7152 + px[:, :, 2] * 0.0722
iy, ix = np.unravel_index(np.argmax(lum), lum.shape)
u, v = (ix + 0.5) / W, (iy + 0.5) / H
print("sun pixel", ix, iy, "u", round(u, 4), "v", round(v, 4), "expected dir", tuple(round(c, 3) for c in sun_dir))

env = bpy.data.images.new("env", 1024, 512, float_buffer=True)
small = px.reshape(512, H // 512, 1024, W // 1024, 4).mean(axis=(1, 3))
env.pixels[:] = small.ravel()
env.filepath_raw = os.path.join(OUT, "env.hdr")
env.file_format = "HDR"
env.save()

ldr = bpy.data.images.load(png)
ldr.pixels[0]  # force the lazy load before retargeting the path
ldr.filepath_raw = os.path.join(OUT, "backdrop.webp")
ldr.file_format = "WEBP"
ldr.save()

with open(os.path.join(OUT, "backdrop.json"), "w") as f:
    json.dump({
        "sunDirBlender": [round(c, 5) for c in sun_dir],
        "sunPixel": [int(ix), int(iy)],
        "sunUV": [round(u, 5), round(v, 5)],
        "size": [W, H],
        "sunElevationDeg": SUN_EL,
        "cameraForward": "+X at image centre",
    }, f, indent=2)
print("backdrop done")
