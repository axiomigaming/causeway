"""Cinematic UI kit for CAUSEWAY round 13 (Blender 4.2 / Cycles, headless).

Shared stage, lights, PBR materials and shape helpers for the two concepts.

Units: 1 Blender unit = 1 CSS px. Image coords (x right, y down) map to Blender XY through P().
Sprites are rendered top-down through an orthographic camera at S× with transparent film.
A shadow-catcher plane under the object bakes a real soft contact shadow into the alpha.

The gold: flat metal faces seen straight on reflect whatever is straight above them. A
"reflection card" (an emissive plane above the subject, invisible to the camera and to diffuse
light) is placed there with a vertical gradient. That is how studio product shots get their
bright-top / dark-horizon / warm-bottom light model, so the classic slot-gold look (ref16) comes
out of a physically lit metal instead of a painted gradient.
"""
import math
import os
import random
import sys

WT = "/home/user/branchfall/.claude/worktrees/agent-aeb3d407ede760a20/blender"
HERE = os.path.dirname(os.path.abspath(__file__))
TTF = os.path.join(HERE, "ttf")
OUT = os.path.join(HERE, "art")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, WT)
_argv = sys.argv
sys.argv = ["build_ui.py", "__none__"]
import build_ui as B  # noqa: E402
sys.argv = _argv
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import N, L, hexcol, ramp, maprange, math_node, reset  # noqa: E402

P = B.P
S = 2
SAMPLES = int(os.environ.get("SAMPLES", "96"))


# ------------------------------------------------------------------ stage
def stage(w, h, pad=20, scale=S, catcher=True, world=True):
    """Fresh scene framing the CSS rect (0,0)-(w,h) plus `pad` on every side."""
    sc = reset()
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 8
    sc.cycles.glossy_bounces = 6
    sc.cycles.transmission_bounces = 8
    sc.render.film_transparent = True
    W, H = w + 2 * pad, h + 2 * pad
    sc.render.resolution_x = int(round(W * scale))
    sc.render.resolution_y = int(round(H * scale))
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 30
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = max(W, H)
    cd.clip_end = 2000
    cam = bpy.data.objects.new("cam", cd)
    cam.location = (w / 2, -h / 2, 900)
    sc.collection.objects.link(cam)
    sc.camera = cam
    if world:
        B.world(sc)
    if catcher:
        plane("catcher", -pad - 40, -pad - 40, w + pad + 40, h + pad + 40, 0.0, flat("catch", "#808080")).is_shadow_catcher = True
    return sc


def render(name):
    sc = bpy.context.scene
    sc.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("wrote", name, flush=True)


def sun(strength=2.2, el=55, az=135, angle=10, color=(1.0, 0.93, 0.82), name="key"):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = strength
    ld.angle = math.radians(angle)
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.rotation_euler = (math.radians(90 - el), 0, math.radians(az + 90))
    bpy.context.scene.collection.objects.link(ob)
    return ob


def rig(key=2.2, rim=0.9, fill=0.35):
    """Key from the upper left (casts the contact shadow), cool rim from the lower right that
    catches the far bevels, a weak warm fill so nothing goes black."""
    sun(key, el=52, az=135, angle=9, name="key")
    sun(rim, el=18, az=-45, angle=4, color=(0.80, 0.88, 1.0), name="rim")
    sun(fill, el=70, az=-120, angle=30, color=(1.0, 0.85, 0.65), name="fill")


def card(y_top, y_bot, stops, strength=1.0, z=36, extent=4000, x_c=0.0):
    """Reflection card above the subject: an emissive gradient along image Y between y_top and
    y_bot (clamped outside). Seen only by glossy and transmission rays."""
    m = bpy.data.materials.new("card")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = N(nt, "ShaderNodeOutputMaterial")
    em = N(nt, "ShaderNodeEmission")
    tc = N(nt, "ShaderNodeTexCoord")
    sep = N(nt, "ShaderNodeSeparateXYZ")
    L(nt, tc.outputs["Object"], sep.inputs[0])
    fac = maprange(nt, sep.outputs["Y"], -y_top, -y_bot, 0.0, 1.0, smooth=False)
    L(nt, ramp(nt, fac, stops), em.inputs["Color"])
    em.inputs["Strength"].default_value = strength
    L(nt, em.outputs[0], out.inputs["Surface"])
    ob = plane("card", x_c - extent, -extent, x_c + extent, extent, z, m)
    ob.location = (0, 0, 0)
    ob.visible_camera = False
    ob.visible_diffuse = False
    ob.visible_shadow = False
    ob.visible_volume_scatter = False
    return ob


# light models for the cards (image-top → image-bottom)
CARD_WORD = [
    (0.00, (1.00, 0.96, 0.86, 1)),
    (0.30, (0.98, 0.90, 0.70, 1)),
    (0.47, (0.62, 0.50, 0.32, 1)),
    (0.53, (0.10, 0.07, 0.045, 1)),
    (0.60, (0.42, 0.30, 0.17, 1)),
    (1.00, (0.80, 0.58, 0.30, 1)),
]
CARD_SOFT = [
    (0.00, (1.00, 0.95, 0.84, 1)),
    (0.45, (0.70, 0.60, 0.44, 1)),
    (1.00, (0.30, 0.22, 0.14, 1)),
]


# ------------------------------------------------------------------ materials
def flat(name, col, rough=0.6, metal=0.0, emit=None, es=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = hexcol(col) if isinstance(col, str) else col
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if emit:
        bs.inputs["Emission Color"].default_value = hexcol(emit)
        bs.inputs["Emission Strength"].default_value = es
    return m


def _scratches(nt, tc, angle, sx, sy, lo, hi, seed):
    mp = N(nt, "ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, 0, angle)
    mp.inputs["Scale"].default_value = (sx, sy, 1)
    mp.inputs["Location"].default_value = (seed * 13.1, seed * 7.7, seed)
    L(nt, tc.outputs["Object"], mp.inputs["Vector"])
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 1.0
    nz.inputs["Detail"].default_value = 1.0
    L(nt, mp.outputs["Vector"], nz.inputs["Vector"])
    # a thin band around the noise mid-level = a hairline scratch
    d = math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", nz.outputs["Fac"], 0.5))
    line = maprange(nt, d, lo, hi, 1.0, 0.0)
    # only some of them: masked by a coarse noise so the scratches come in patches
    mk = N(nt, "ShaderNodeTexNoise")
    mk.inputs["Scale"].default_value = 0.035
    mp2 = N(nt, "ShaderNodeMapping")
    mp2.inputs["Location"].default_value = (seed * 31.0, seed * 17.0, 0)
    L(nt, tc.outputs["Object"], mp2.inputs["Vector"])
    L(nt, mp2.outputs["Vector"], mk.inputs["Vector"])
    return math_node(nt, "MULTIPLY", line, maprange(nt, mk.outputs["Fac"], 0.45, 0.62, 0.0, 1.0))


def gold(name="gold", tone=(1.0, 0.66, 0.24), rough=0.17, aged=0.0, grime=1.0, scratch=1.0):
    """Polished cast gold: metal, slight tonal mottling, micro-scratches (rougher, faintly darker
    hairlines in two directions), dirt and darkening in the crevices (AO), a hint of hammering."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    mot = N(nt, "ShaderNodeTexNoise")
    mot.inputs["Scale"].default_value = 0.05
    mot.inputs["Detail"].default_value = 4
    L(nt, tc.outputs["Object"], mot.inputs["Vector"])
    r, g, b = tone
    if aged:
        r, g, b = r * (1 - 0.35 * aged), g * (1 - 0.42 * aged), b * (1 - 0.2 * aged)
        sat = 1 - 0.6 * aged
        lum = (r + g + b) / 3
        r, g, b = lum + (r - lum) * sat, lum + (g - lum) * sat, lum + (b - lum) * sat
    base = ramp(nt, mot.outputs["Fac"], [(0.35, (r * 0.92, g * 0.88, b * 0.80, 1)), (0.65, (r, g * 1.03, b * 1.05, 1))])
    ao = N(nt, "ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 3.0
    ao.samples = 12
    dirt = maprange(nt, ao.outputs["AO"], 0.55, 0.98, 0.85 * grime, 0.0)
    col = N(nt, "ShaderNodeMix")
    col.data_type = "RGBA"
    L(nt, dirt, col.inputs[0])
    L(nt, base, col.inputs[6])
    col.inputs[7].default_value = (0.10, 0.05, 0.018, 1)
    s1 = _scratches(nt, tc, 0.45, 0.07, 2.6, 0.006, 0.016, 1.0)
    s2 = _scratches(nt, tc, -0.9, 0.05, 2.2, 0.005, 0.014, 2.0)
    s3 = _scratches(nt, tc, 1.9, 0.12, 3.4, 0.004, 0.012, 3.0)
    sc_ = math_node(nt, "MULTIPLY", math_node(nt, "MAXIMUM", math_node(nt, "MAXIMUM", s1, s2), s3), scratch)
    rough_n = math_node(nt, "ADD", rough + 0.12 * aged, math_node(nt, "MULTIPLY", mot.outputs["Fac"], 0.08))
    rough_n = math_node(nt, "ADD", rough_n, math_node(nt, "MULTIPLY", sc_, 0.22))
    rough_n = math_node(nt, "ADD", rough_n, math_node(nt, "MULTIPLY", dirt, 0.35))
    L(nt, col.outputs[2], bs.inputs["Base Color"])
    L(nt, rough_n, bs.inputs["Roughness"])
    bs.inputs["Metallic"].default_value = 1.0
    hm = N(nt, "ShaderNodeTexNoise")
    hm.inputs["Scale"].default_value = 0.6
    hm.inputs["Detail"].default_value = 2
    L(nt, tc.outputs["Object"], hm.inputs["Vector"])
    bump = N(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    bump.inputs["Distance"].default_value = 0.3
    L(nt, math_node(nt, "SUBTRACT", hm.outputs["Fac"], math_node(nt, "MULTIPLY", sc_, 0.5)), bump.inputs["Height"])
    L(nt, bump.outputs["Normal"], bs.inputs["Normal"])
    return m


def stone(name="stone", palette=("#6f6352", "#8f826c", "#aa9c83"), scale=1.0, moss=(), bump=0.9):
    m = B.limestone(name, moss_zones=moss, scale=scale, palette=palette)
    for n in m.node_tree.nodes:
        if n.bl_idname == "ShaderNodeBump":
            n.inputs["Strength"].default_value = bump
    return m


LIME_WARM = ("#5e4c3a", "#806a51", "#9c8566")
LIME_COOL = ("#5f5b55", "#79746b", "#918b80")
BASALT_WARM = ("#1e1410", "#2a1c16", "#38261d")
BASALT = ("#141312", "#1d1b19", "#282522")
OXBLOOD = ("#250b06", "#3a130a", "#4a1a0e")
ASH = ("#2a2826", "#353230", "#423e3a")


def glass_gem(name, col, ior=1.76, glow=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = col
    bs.inputs["Transmission Weight"].default_value = 1.0
    bs.inputs["Roughness"].default_value = 0.0
    bs.inputs["IOR"].default_value = ior
    if glow:
        bs.inputs["Emission Color"].default_value = col
        bs.inputs["Emission Strength"].default_value = glow
    return m


RUBY = (0.62, 0.012, 0.02, 1)
EMERALD = (0.01, 0.42, 0.13, 1)
TURQ = (0.02, 0.45, 0.42, 1)


def obsidian(name="obsidian"):
    m = flat(name, (0.004, 0.0045, 0.005, 1), rough=0.06)
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.08
    nz.inputs["Detail"].default_value = 6
    L(nt, tc.outputs["Object"], nz.inputs["Vector"])
    L(nt, maprange(nt, nz.outputs["Fac"], 0.3, 0.7, 0.04, 0.12), bs.inputs["Roughness"])
    return m


def turquoise(name="turq"):
    """Turquoise mosaic: Voronoi tesserae in teal shades, dark grout, grout recessed."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    mp = N(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.28, 0.28, 0.28)
    L(nt, tc.outputs["Object"], mp.inputs["Vector"])
    vo = N(nt, "ShaderNodeTexVoronoi")
    L(nt, mp.outputs["Vector"], vo.inputs["Vector"])
    ve = N(nt, "ShaderNodeTexVoronoi")
    ve.feature = "DISTANCE_TO_EDGE"
    L(nt, mp.outputs["Vector"], ve.inputs["Vector"])
    sp = N(nt, "ShaderNodeSeparateColor")
    L(nt, vo.outputs["Color"], sp.inputs[0])
    tile = ramp(nt, sp.outputs[0], [(0.0, hexcol("#0d5b5e")), (0.5, hexcol("#1b9a95")), (0.85, hexcol("#3fc4b4")), (1.0, hexcol("#8fe6d2"))])
    grout = maprange(nt, ve.outputs["Distance"], 0.03, 0.08, 0.0, 1.0)
    c = N(nt, "ShaderNodeMix")
    c.data_type = "RGBA"
    L(nt, grout, c.inputs[0])
    c.inputs[6].default_value = hexcol("#1c140c")
    L(nt, tile, c.inputs[7])
    L(nt, c.outputs[2], bs.inputs["Base Color"])
    L(nt, maprange(nt, grout, 0, 1, 0.7, 0.28), bs.inputs["Roughness"])
    bs.inputs["Coat Weight"].default_value = 0.4
    bp = N(nt, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.5
    L(nt, grout, bp.inputs["Height"])
    L(nt, bp.outputs["Normal"], bs.inputs["Normal"])
    return m


def ember_stone(name="ember", palette=OXBLOOD, heat=1.0):
    """Recessed stone whose crack network glows like coals (CASH OUT heat)."""
    m = stone(name, palette)
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    vc = N(nt, "ShaderNodeTexVoronoi")
    vc.feature = "DISTANCE_TO_EDGE"
    vc.inputs["Scale"].default_value = 0.055
    L(nt, tc.outputs["Object"], vc.inputs["Vector"])
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.04
    L(nt, tc.outputs["Object"], nz.inputs["Vector"])
    crack = math_node(nt, "MULTIPLY", maprange(nt, vc.outputs["Distance"], 0.0, 0.05, 1.0, 0.0), maprange(nt, nz.outputs["Fac"], 0.4, 0.6, 0.15, 1.0))
    L(nt, ramp(nt, crack, [(0.0, (0.0, 0.0, 0.0, 1)), (0.35, (0.9, 0.12, 0.0, 1)), (0.8, (1.0, 0.45, 0.05, 1)), (1.0, (1.0, 0.8, 0.4, 1))]), bs.inputs["Emission Color"])
    L(nt, math_node(nt, "MULTIPLY", crack, 6.0 * heat), bs.inputs["Emission Strength"])
    return m


# ------------------------------------------------------------------ geometry
def plane(name, x0, y0, x1, y1, z, mat):
    return B.plane(name, x0, y0, x1, y1, z, mat)


def cobj(name, loops, mat, z=0.0, extrude=0.0, bevel=0.0, res=3, offset=None, dim="2D", closed=True, fill="BOTH"):
    ob = B.curve_obj(name, [P(l, 0) for l in loops], extrude=extrude, bevel=bevel, fill=fill, closed=closed, z=z, res=res,
                     dim=dim, offset=-bevel if offset is None else offset)
    ob.data.materials.append(mat)
    return ob


def circle(cx, cy, r, n=96, a0=0.0):
    return [(cx + r * math.cos(a0 + i / n * math.tau), cy + r * math.sin(a0 + i / n * math.tau)) for i in range(n)]


def chipped(pts, seed=1, step=3.0, depth=0.9, bites=0.06):
    return B.chipped(pts, random.Random(seed), step=step, depth=depth, bites=bites)


def stepped_rect(x0, y0, x1, y1, s):
    return B.stepped_rect(x0, y0, x1, y1, s)


def stepped(x0, y0, w, h, s):
    return B.stepped(x0, y0, w, h, s)


def gem(name, cx, cy, r, mat, z, h=0.55, seg=12):
    """A faceted cabochon (low-poly dome, flat-shaded facets) so the refraction sparkles."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=6, radius=1.0)
    for v in list(bm.verts):
        if v.co.z < -0.05:
            bm.verts.remove(v)
    for v in bm.verts:
        v.co.x, v.co.y, v.co.z = cx + v.co.x * r, -cy + v.co.y * r, z + max(v.co.z, 0) * r * h
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def bezel(name, cx, cy, r, mat, z, w=1.8):
    return cobj(name, [circle(cx, cy, r + w), circle(cx, cy, r)], mat, z=z, extrude=0.8, bevel=0.9, res=3)


# ------------------------------------------------------------------ type
_FONTS = {}


def font(name):
    if name not in _FONTS:
        _FONTS[name] = bpy.data.fonts.load(os.path.join(TTF, name + ".ttf"))
    return _FONTS[name]


def text(name, body, fnt, size, cx, cy, z, mat, extrude=1.0, bevel=0.0, res=0, offset=0.0, track=1.0):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = fnt
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.bevel_resolution = res
    cu.offset = offset
    cu.space_character = track
    ob = bpy.data.objects.new(name, cu)
    ob.location = (cx, -cy, z)
    bpy.context.scene.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def measure(body, fnt, track=1.0):
    """(width, height, y-offset of the ink centre from the align centre) at size 100."""
    ob = text("probe", body, fnt, 100, 0, 0, 0, None, extrude=0, track=track)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    bpy.data.meshes.remove(me)
    bpy.data.objects.remove(ob)
    return max(xs) - min(xs), max(ys) - min(ys), (max(ys) + min(ys)) / 2, (max(xs) + min(xs)) / 2


def cast_word(body, fnt, cx, cy, cap_h, z, mat, track=1.0, depth=None, chamfer=None, seat=None, maxw=None):
    """Raised cast-gold letters with a flat face and a crisp 45° chamfer (bevel_resolution 0),
    standing on a thin dark seat that separates them from the ground. cap_h sets the ink height
    (optically centred on cy, not the font's line box). Returns the objects."""
    w, h, yc, xc = measure(body, fnt, track)
    size = 100 * cap_h / h
    if maxw and w * size / 100 > maxw:
        size = 100 * maxw / w
    k = size / 100
    depth = depth if depth is not None else 0.10 * cap_h
    chamfer = chamfer if chamfer is not None else 0.036 * cap_h
    ox, oy = -xc * k, -yc * k  # ink-centre correction
    f = text("face", body, fnt, size, cx + ox, cy - oy, z + depth, mat, extrude=depth, bevel=chamfer, res=0, track=track)
    objs = [f]
    if seat:
        s = text("seat", body, fnt, size, cx + ox, cy - oy, z + 0.4, seat, extrude=0.4, bevel=0.3, res=0, offset=0.035 * cap_h, track=track)
        objs.append(s)
    return objs, size
