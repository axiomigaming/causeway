"""Round 12 concept materials (scratch only, not shipped). Reuses build_ui helpers.
    python3 bake12.py [job ...]
"""
import math
import os
import random
import sys

WT = "/home/user/branchfall/.claude/worktrees/agent-aeb3d407ede760a20/blender"
OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "art")
os.makedirs(OUTDIR, exist_ok=True)
want = sys.argv[1:]
sys.path.insert(0, WT)
sys.argv = ["build_ui.py", "__none__"]  # import the helpers without running build_ui's jobs
import build_ui as B  # noqa: E402
import bpy  # noqa: E402
from common import N, L, hexcol, ramp, maprange  # noqa: E402

B.SAMPLES = 64
P, curve_obj, scene, sun_lamp = B.P, B.curve_obj, B.scene, B.sun_lamp


def render(name):
    bpy.context.scene.cycles.samples = 64
    path = os.path.join(OUTDIR, name + ".webp")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path, flush=True)


def pill(x0, y0, x1, y1, r=None, n=14):
    h = y1 - y0
    r = h / 2 if r is None else r
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle(cx, cy, r, n=96):
    return [(cx + r * math.cos(i / n * math.tau), cy + r * math.sin(i / n * math.tau)) for i in range(n)]


def mat(name, base, rough=0.4, metal=0.0, coat=0.0, emit=None, es=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = hexcol(base)
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    bs.inputs["Coat Weight"].default_value = coat
    bs.inputs["Coat Roughness"].default_value = 0.03
    if emit:
        bs.inputs["Emission Color"].default_value = hexcol(emit)
        bs.inputs["Emission Strength"].default_value = es
    return m


def obsidian():
    m = mat("obsidian", "#07080a", rough=0.05, coat=0.0)
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.05
    nz.inputs["Detail"].default_value = 6
    L(nt, tc.outputs["Object"], nz.inputs["Vector"])
    L(nt, ramp(nt, nz.outputs["Fac"], [(0.3, hexcol("#010203")), (0.7, hexcol("#06090a"))]), bs.inputs["Base Color"])
    return m


def jade(name="jade", c0="#0b5a3c", c1="#3fbf86"):
    m = mat(name, c0, rough=0.18, coat=1.0)
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.12
    nz.inputs["Detail"].default_value = 8
    nz.inputs["Distortion"].default_value = 2.0
    L(nt, tc.outputs["Object"], nz.inputs["Vector"])
    c = ramp(nt, nz.outputs["Fac"], [(0.25, hexcol(c0)), (0.75, hexcol(c1))])
    L(nt, c, bs.inputs["Base Color"])
    L(nt, c, bs.inputs["Emission Color"])
    bs.inputs["Emission Strength"].default_value = 0.25
    return m


def brass():
    return mat("brass", "#b0852e", rough=0.32, metal=1.0)


# ------------------------------------------------------------------ A. obsidian & jade
def obsidian_pill():
    W, H = 320, 64
    scene(W, H)
    sun_lamp(1.4, el=50)
    rim = curve_obj("rim", [P(pill(0.5, 0.5, W - 0.5, H - 0.5), H)], extrude=0.8, bevel=0.8, offset=-0.8, z=0.8, res=3)
    rim.data.materials.append(B.gold())
    body = curve_obj("body", [P(pill(2.2, 2.2, W - 2.2, H - 2.2), H)], extrude=2.0, bevel=7.0, offset=-7.0, z=3.0, res=8)
    body.data.materials.append(obsidian())
    inl = curve_obj("inlay", [P(pill(9, 9, W - 9, H - 9), H), P(pill(11.4, 11.4, W - 11.4, H - 11.4), H)], extrude=0.6, bevel=0.5, offset=-0.5, z=12.4, res=2)
    inl.data.materials.append(jade())
    for x in (26, W - 26):
        d = [(x, H / 2 - 9), (x + 7, H / 2), (x, H / 2 + 9), (x - 7, H / 2)]
        g = curve_obj("stud", [P(d, H)], extrude=1.0, bevel=2.6, offset=-2.6, z=10.0, res=4)
        g.data.materials.append(jade("jade2", "#127a52", "#6fe3ac"))
    render("a-obsidian")


# ------------------------------------------------------------------ B. sunstone medallion
def sunstone():
    W = H = 220
    c = W / 2
    scene(W, H)
    sun_lamp(1.9, el=40)
    stone = B.limestone("sun", palette=("#5b4532", "#7d6046", "#a08261"))
    dark = B.limestone("sund", palette=("#2e2219", "#45342a", "#5a4535"))
    outer = curve_obj("outer", [P(circle(c, c, 109), H), P(circle(c, c, 92), H)], extrude=3.0, bevel=2.2, offset=-2.2, z=3.0, res=4)
    outer.data.materials.append(stone)
    # glyph blocks on the outer ring
    for i in range(20):
        a = i / 20 * math.tau
        x, y = c + 100.5 * math.cos(a), c + 100.5 * math.sin(a)
        s = 4.2
        sq = [(x - s, y - s), (x + s, y - s), (x + s, y + s), (x - s, y + s)]
        b = curve_obj("blk", [P(sq, H)], extrude=1.0, bevel=1.0, offset=-1.0, z=8.0, res=2)
        b.data.materials.append(stone)
    tq = curve_obj("turq", [P(circle(c, c, 91), H), P(circle(c, c, 84), H)], extrude=1.4, bevel=1.0, offset=-1.0, z=3.4, res=3)
    tq.data.materials.append(jade("turq", "#0d6f78", "#49d6c8"))
    rays = curve_obj("ring2", [P(circle(c, c, 83), H), P(circle(c, c, 62), H)], extrude=2.0, bevel=1.5, offset=-1.5, z=2.2, res=3)
    rays.data.materials.append(dark)
    for i in range(16):
        a = i / 16 * math.tau
        r0, r1, hw = 63, 82, 0.17 if i % 2 == 0 else 0.1
        tri = [(c + r1 * math.cos(a), c + r1 * math.sin(a)), (c + r0 * math.cos(a + hw), c + r0 * math.sin(a + hw)), (c + r0 * math.cos(a - hw), c + r0 * math.sin(a - hw))]
        t = curve_obj("ray", [P(tri, H)], extrude=1.2, bevel=1.4, offset=-1.4, z=5.0, res=3)
        t.data.materials.append(B.gold())
    face = curve_obj("face", [P(circle(c, c, 61), H)], extrude=1.5, bevel=3.0, offset=-3.0, z=0.0, res=6)
    face.data.materials.append(B.limestone("sunf", palette=("#3a1d10", "#5a2c16", "#74391c")))
    gr = curve_obj("goldring", [P(circle(c, c, 61.5), H)], bevel=1.6, closed=True, z=6.0, dim="3D", res=3)
    gr.data.materials.append(B.gold())
    render("b-sunstone")


# ------------------------------------------------------------------ D. wood & rope
def wood(name="wood"):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    mp = N(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.012, 0.09, 0.05)
    L(nt, tc.outputs["Object"], mp.inputs["Vector"])
    wv = N(nt, "ShaderNodeTexWave")
    wv.wave_type = "BANDS"
    wv.bands_direction = "Y"
    wv.inputs["Scale"].default_value = 2.2
    wv.inputs["Distortion"].default_value = 9.0
    wv.inputs["Detail"].default_value = 6
    wv.inputs["Detail Scale"].default_value = 1.6
    L(nt, mp.outputs["Vector"], wv.inputs["Vector"])
    col = ramp(nt, wv.outputs["Fac"], [(0.0, hexcol("#3b2210")), (0.5, hexcol("#7a4b24")), (1.0, hexcol("#a26a35"))])
    L(nt, col, bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = 0.72
    bump = N(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    L(nt, wv.outputs["Fac"], bump.inputs["Height"])
    L(nt, bump.outputs["Normal"], bs.inputs["Normal"])
    return m


def rope():
    m = mat("rope", "#b4955c", rough=0.85)
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    wv = N(nt, "ShaderNodeTexWave")
    wv.wave_type = "BANDS"
    wv.bands_direction = "DIAGONAL"
    wv.inputs["Scale"].default_value = 0.9
    L(nt, tc.outputs["Object"], wv.inputs["Vector"])
    L(nt, ramp(nt, wv.outputs["Fac"], [(0.2, hexcol("#6e5530")), (0.8, hexcol("#d4b67a"))]), bs.inputs["Base Color"])
    bump = N(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    L(nt, wv.outputs["Fac"], bump.inputs["Height"])
    L(nt, bump.outputs["Normal"], bs.inputs["Normal"])
    return m


def planks(name, W, H, lash=True):
    scene(W, H)
    sun_lamp(1.8, el=44)
    rng = random.Random(7)
    wm = wood()
    n = 2
    ph = (H - 4) / n
    for i in range(n):
        y0 = 2 + i * ph
        pts = B.chipped([(3, y0 + 1), (W - 3, y0 + 1), (W - 3, y0 + ph - 1), (3, y0 + ph - 1)], rng, step=4.0, depth=1.1, bites=0.05)
        pl = curve_obj(f"pl{i}", [P(pts, H)], extrude=2.0, bevel=2.2, offset=-2.2, z=2.5 + 0.4 * i, res=3)
        pl.data.materials.append(wm)
    if lash:
        rm = rope()
        for x in (30, W - 30):
            for k in range(3):
                xx = x - 5 + k * 5
                loop = [(xx - 1.5, -2), (xx + 1.5, H + 2)]
                r = curve_obj("rope", [P(loop, H)], bevel=2.3, closed=False, z=7.5, dim="3D", res=3)
                r.data.materials.append(rm)
    bm = brass()
    for x, y in ((12, 10), (W - 12, 10), (12, H - 10), (W - 12, H - 10)):
        rv = curve_obj("rivet", [P(circle(x, y, 3.6, 24), H)], extrude=0.6, bevel=2.4, offset=-2.4, z=6.2, res=5)
        rv.data.materials.append(bm)
    render(name)


# ------------------------------------------------------------------ E. gold ingot & coins
def ingot():
    W, H = 320, 76
    scene(W, H)
    sun_lamp(1.5, el=50)
    rim = curve_obj("rim", [P(B.rect(0.5, 0.5, W - 0.5, H - 0.5), H)], extrude=1.0, bevel=1.0, offset=-1.0, z=1.0, res=2)
    rim.data.materials.append(B.bronze_dark())
    body = curve_obj("body", [P(B.rect(2, 2, W - 2, H - 2), H)], extrude=3.0, bevel=13.0, offset=-13.0, z=5.0, res=1)
    body.data.materials.append(B.gold_rich())
    gem = curve_obj("gem", [P([(W - 34, H / 2 - 11), (W - 22, H / 2), (W - 34, H / 2 + 11), (W - 46, H / 2)], H)], extrude=0.8, bevel=4.0, offset=-4.0, z=18.0, res=1)
    gem.data.materials.append(B.jewel("em", "#0b6b3c", "#2cff8a"))
    gem2 = curve_obj("gem2", [P([(34, H / 2 - 11), (46, H / 2), (34, H / 2 + 11), (22, H / 2)], H)], extrude=0.8, bevel=4.0, offset=-4.0, z=18.0, res=1)
    gem2.data.materials.append(B.jewel("em2", "#0b6b3c", "#2cff8a"))
    render("e-ingot")


def coins():
    W, H = 120, 72
    scene(W, H)
    sun_lamp(1.5, el=45)
    g = B.gold_rich("coin")
    for i, (x, y) in enumerate(((40, 44), (64, 40), (84, 30), (52, 26))):
        c = curve_obj(f"c{i}", [P(circle(x, y, 19, 64), H)], extrude=1.5, bevel=2.2, offset=-2.2, z=3 + i * 3, res=4)
        c.data.materials.append(g)
        r = curve_obj(f"r{i}", [P(circle(x, y, 14.5, 64), H)], bevel=0.9, closed=True, z=6.9 + i * 3, dim="3D", res=2)
        r.data.materials.append(B.bronze_dark(f"cr{i}"))
    render("e-coins")


# ------------------------------------------------------------------ G. turquoise mosaic
def mosaic_mat():
    m = bpy.data.materials.new("mosaic")
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tc = N(nt, "ShaderNodeTexCoord")
    mp = N(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.13, 0.13, 0.13)
    L(nt, tc.outputs["Object"], mp.inputs["Vector"])
    vo = N(nt, "ShaderNodeTexVoronoi")
    L(nt, mp.outputs["Vector"], vo.inputs["Vector"])
    ve = N(nt, "ShaderNodeTexVoronoi")
    ve.feature = "DISTANCE_TO_EDGE"
    L(nt, mp.outputs["Vector"], ve.inputs["Vector"])
    sep = N(nt, "ShaderNodeSeparateColor")
    L(nt, vo.outputs["Color"], sep.inputs[0])
    tile = ramp(nt, sep.outputs[0], [(0.0, hexcol("#0b5e66")), (0.45, hexcol("#18a3a0")), (0.8, hexcol("#46d2c0")), (1.0, hexcol("#9ff0dc"))])
    grout = maprange(nt, ve.outputs["Distance"], 0.02, 0.07, 0.0, 1.0)
    mix = N(nt, "ShaderNodeMix")
    mix.data_type = "RGBA"
    L(nt, grout, mix.inputs[0])
    mix.inputs[6].default_value = hexcol("#1a120c")
    L(nt, tile, mix.inputs[7])
    L(nt, mix.outputs[2], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = 0.25
    bs.inputs["Coat Weight"].default_value = 0.6
    bump = N(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    L(nt, grout, bump.inputs["Height"])
    L(nt, bump.outputs["Normal"], bs.inputs["Normal"])
    return m


def mosaic():
    W, H = 320, 68
    scene(W, H)
    sun_lamp(1.5, el=48)
    rim = curve_obj("rim", [P(pill(0.5, 0.5, W - 0.5, H - 0.5, r=18), H)], extrude=1.4, bevel=1.4, offset=-1.4, z=1.4, res=3)
    rim.data.materials.append(B.gold())
    body = curve_obj("body", [P(pill(4, 4, W - 4, H - 4, r=15), H)], extrude=1.6, bevel=3.0, offset=-3.0, z=4.0, res=4)
    body.data.materials.append(mosaic_mat())
    render("g-mosaic")


# ------------------------------------------------------------------ H. glowing glyph basalt
def glow_slab():
    W, H = 320, 72
    scene(W, H)
    sun_lamp(0.7, el=40)
    bas = B.limestone("bas", palette=B.BASALT)
    rng = random.Random(3)
    pts = B.chipped(B.stepped_rect(2, 2, W - 2, H - 2, 6), rng, step=4.0, depth=0.8, bites=0.04)
    body = curve_obj("body", [P(pts, H)], extrude=3.0, bevel=2.4, offset=-2.4, z=3.0, res=3)
    body.data.materials.append(bas)
    glow = mat("glow", "#0a2a22", rough=0.4, emit="#38ffc8", es=7.0)
    # a carved meander groove running the length (step-fret), lit from within
    y0, y1 = 12, H - 12
    path, x, up = [(14, (y0 + y1) / 2)], 14, True
    while x < W - 30:
        path += [(x, y0 if up else y1), (x + 12, y0 if up else y1), (x + 12, (y0 + y1) / 2), (x + 20, (y0 + y1) / 2)]
        x += 20
        up = not up
    g1 = curve_obj("groove", [P(path[:9], H)], bevel=1.1, closed=False, z=8.8, dim="3D", res=2)
    g1.data.materials.append(glow)
    g2 = curve_obj("groove2", [P([(W - px, py) for px, py in path[:9]], H)], bevel=1.1, closed=False, z=8.8, dim="3D", res=2)
    g2.data.materials.append(glow)
    render("h-glow")


JOBS = {
    "a": obsidian_pill,
    "b": sunstone,
    "d": lambda: planks("d-planks", 320, 72),
    "d2": lambda: planks("d-plank-sm", 160, 44, lash=False),
    "e": ingot,
    "e2": coins,
    "g": mosaic,
    "h": glow_slab,
}
for k, fn in JOBS.items():
    if want and k not in want:
        continue
    fn()
