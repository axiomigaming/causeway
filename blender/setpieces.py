"""Set pieces for the CAUSEWAY ruin kit (v2): carved heads, guardians, fallen columns,
relief walls, rope rails, roots, stepping stones, lily pads and moss. Pure bmesh, deterministic."""
import math
import random

import bmesh
import bpy
from mathutils import Vector, Matrix, Euler, noise

from common import add_block, finish_obj, hexcol, jitter_color
from kit_geo import sand, WOOD


def _merge(bm, tmp, color=None, color_fn=None):
    """Colour every loop of `tmp` and append it to `bm`."""
    cl = tmp.loops.layers.float_color.get("Col") or tmp.loops.layers.float_color.new("Col")
    for f in tmp.faces:
        for l in f.loops:
            l[cl] = color_fn(l.vert.co) if color_fn else color
    me = bpy.data.meshes.new("_t")
    tmp.to_mesh(me)
    tmp.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def _append(t, other):
    me = bpy.data.meshes.new("_t")
    other.to_mesh(me)
    other.free()
    t.from_mesh(me)
    bpy.data.meshes.remove(me)


def _cyl(r0, r1, h, segs=16, m=None, caps=True):
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=caps, segments=segs, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.translate(t, vec=(0, 0, h / 2), verts=t.verts)
    if m is not None:
        bmesh.ops.transform(t, matrix=m, verts=t.verts)
    return t


def _tube(pts, radii, ring_n=5):
    t = bmesh.new()
    prev = None
    for p, r in zip(pts, radii):
        ring = [t.verts.new(p + Vector((math.cos(2 * math.pi * j / ring_n) * r, math.sin(2 * math.pi * j / ring_n) * r * 0.3,
                                        math.sin(2 * math.pi * j / ring_n) * r))) for j in range(ring_n)]
        if prev:
            for j in range(ring_n):
                t.faces.new((prev[j], prev[(j + 1) % ring_n], ring[(j + 1) % ring_n], ring[j]))
        prev = ring
    return t


def _g(x, s):
    return math.exp(-(x * x) / (2 * s * s))


def face_bm(seed, rings=30, segs=40, crown=True, cuts=2):
    """A serene carved head, ~2 units tall, face toward −Y, chin near z=−1, crown on top.

    A UV sphere whose front is subdivided, then displaced by smooth feature fields
    (brow, closed eyes, nose, lips, cheeks, chin): the calm of the temple faces.
    """
    t = bmesh.new()
    bmesh.ops.create_uvsphere(t, u_segments=segs, v_segments=rings, radius=1.0)
    if cuts:
        front = [f for f in t.faces if f.calc_center_median().y < -0.3 and -0.9 < f.calc_center_median().z < 0.6]
        # A set of BMEdges iterates in memory-address order: sorted by index so the subdivision (and the
        # vertex order of the whole head) is the same on every run.
        t.edges.index_update()
        edges = sorted({e for f in front for e in f.edges}, key=lambda e: e.index)
        bmesh.ops.subdivide_edges(t, edges=edges, cuts=cuts, use_grid_fill=True)
        # The grid fill still creates its vertices in a run-dependent order (internal pointer hashing):
        # put vertices and faces in a canonical order (by position) so every build is identical.
        vr = {v: i for i, v in enumerate(sorted(t.verts, key=lambda v: (round(v.co.z, 5), round(v.co.y, 5), round(v.co.x, 5))))}
        t.verts.sort(key=lambda v: vr[v])
        t.verts.index_update()
        fr_ = {f: i for i, f in enumerate(sorted(t.faces, key=lambda f: tuple(sorted(v.index for v in f.verts))))}
        t.faces.sort(key=lambda f: fr_[f])
        t.faces.index_update()
    off = Vector((seed * 1.3, seed * 0.7, 0))
    for v in t.verts:
        p = v.co.copy()
        u, z = p.x, p.z
        fr = max(0.0, min(1.0, (-p.y - 0.2) / 0.45))
        au = abs(u)
        d = 0.0
        d += 0.07 * _g(z - 0.3, 0.07) * _g(u, 0.42)                          # brow
        d -= 0.09 * _g(au - 0.3, 0.12) * _g(z - 0.13, 0.08)                  # eye sockets
        d += 0.05 * _g(au - 0.3, 0.12) * _g(z - 0.1, 0.045)                  # heavy lids
        tn = max(0.0, min(1.0, (0.22 - z) / 0.42))
        d += 0.26 * tn * _g(u, 0.06 + 0.08 * tn) * (1 if z > -0.22 else _g(z + 0.22, 0.05))  # nose
        mz = -0.42 + 0.08 * u * u
        d += 0.075 * _g(u, 0.2) * _g(z - (mz + 0.06), 0.04)                  # upper lip
        d += 0.085 * _g(u, 0.17) * _g(z - (mz - 0.075), 0.045)               # lower lip
        d -= 0.045 * _g(u, 0.25) * _g(z - mz, 0.02)                          # the mouth line
        d += 0.06 * _g(u, 0.24) * _g(z + 0.7, 0.1)                           # chin
        d += 0.05 * _g(au - 0.42, 0.14) * _g(z + 0.2, 0.16)                  # cheeks
        d *= fr * 1.9
        d += noise.fractal(p * 3.0 + off, 0.6, 2.0, 4) * 0.022
        # Broad jaw and cheekbones, a flat face plane.
        sx = 0.86 + 0.08 * max(0.0, -z) * (1 - abs(z))
        v.co = Vector((p.x * sx, p.y * (0.72 if p.y < 0 else 0.9), p.z * 1.08)) + p.normalized() * d
    if crown:
        # A tiered lotus crown of stepped rings, and a finial.
        z = 0.7
        r = 0.8
        _append(t, _cyl(r * 1.02, r * 1.02, 0.14, 20, Matrix.Translation((0, 0.05, z))))  # diadem
        z += 0.14
        for i in range(3):
            h = 0.2
            _append(t, _cyl(r * 0.95, r * 0.86, h, 16, Matrix.Translation((0, 0.05, z))))
            z += h
            r *= 0.84
        _append(t, _cyl(r * 0.7, 0.05, 0.3, 10, Matrix.Translation((0, 0.05, z))))
    for sd in (-1, 1):  # long ear lobes
        e = bmesh.new()
        bmesh.ops.create_cube(e, size=1.0)
        bmesh.ops.bevel(e, geom=list(e.edges), offset=0.2, segments=2, affect="EDGES", clamp_overlap=True)
        bmesh.ops.transform(e, matrix=Matrix.Translation((sd * 0.78, 0.05, -0.12)) @ Matrix.Diagonal((0.12, 0.26, 0.78, 1)), verts=e.verts)
        _append(t, e)
    return t


def colossal_head(name, seed, size=1.9):
    """A giant stone face sunk to the chin: z=0 is the ground or water line. Faces −Y."""
    rng = random.Random(seed)
    bm = bmesh.new()
    t = face_bm(seed)
    bmesh.ops.transform(t, matrix=Matrix.Translation((0, 0, size * 0.62))
                        @ Euler((rng.uniform(-0.1, 0.02), rng.uniform(-0.14, 0.14), 0)).to_matrix().to_4x4() @ Matrix.Scale(size, 4),
                        verts=t.verts)
    base = sand(rng)
    _merge(bm, t, base)
    for i in range(8):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(1.3, 2.3) * size / 1.9
        s = rng.uniform(0.35, 0.8)
        add_block(bm, (s * 1.5, s * 1.2, s), (math.cos(a) * r, math.sin(a) * r, s * 0.3 - 0.2), (0.2, 0.1, a), bevel=0.06,
                  rng=rng, color=sand(rng), chip=0.6, segments=1)
    return finish_obj(name, bm, 60)


def guardian(name, seed, height=5.6, broken=False):
    """A standing temple guardian on a plinth, hands on a sword planted before him. Faces −Y."""
    rng = random.Random(seed)
    bm = bmesh.new()
    k = height / 5.6
    add_block(bm, (1.9 * k, 1.9 * k, 0.5 * k), (0, 0, 0.25 * k), bevel=0.06, rng=rng, color=sand(rng), chip=0.4)
    add_block(bm, (1.6 * k, 1.6 * k, 0.45 * k), (0, 0, 0.72 * k), bevel=0.05, rng=rng, color=sand(rng), chip=0.3)
    c = sand(rng)
    z0 = 0.95 * k
    robe = _cyl(0.72 * k, 0.5 * k, 2.1 * k, 24, Matrix.Translation((0, 0, z0)))
    for v in robe.verts:
        a = math.atan2(v.co.y, v.co.x)
        if Vector((v.co.x, v.co.y)).length > 0.05:
            f = 1 + 0.06 * math.cos(a * 9) * (1 - (v.co.z - z0) / (2.1 * k))
            v.co.x *= f
            v.co.y *= f
    _merge(bm, robe, c)
    zt = z0 + 2.1 * k
    add_block(bm, (1.12 * k, 0.86 * k, 0.22 * k), (0, 0, zt), bevel=0.05, rng=rng, color=jitter_color(c, rng, 0.05), chip=0.2)
    tor = bmesh.new()
    bmesh.ops.create_cube(tor, size=1.0)
    for v in tor.verts:
        v.co = Vector((v.co.x * (0.95 + 0.35 * (v.co.z + 0.5)) * k, v.co.y * 0.62 * k, v.co.z * 1.25 * k))
    bmesh.ops.bevel(tor, geom=list(tor.edges), offset=0.12 * k, segments=2, affect="EDGES", clamp_overlap=True)
    bmesh.ops.translate(tor, vec=(0, 0, zt + 0.72 * k), verts=tor.verts)
    _merge(bm, tor, c)
    zs = zt + 1.3 * k
    for sd in (-1, 1):
        if broken and sd > 0:
            add_block(bm, (0.36 * k, 0.36 * k, 0.4 * k), (sd * 0.72 * k, 0, zs - 0.25 * k), bevel=0.05, rng=rng, color=c, chip=0.8)
            continue
        _merge(bm, _cyl(0.2 * k, 0.17 * k, 0.95 * k, 10,
                        Matrix.Translation((sd * 0.74 * k, 0, zs - 0.95 * k)) @ Euler((0.2, sd * 0.1, 0)).to_matrix().to_4x4()), c)
        _merge(bm, _cyl(0.17 * k, 0.14 * k, 0.72 * k, 10,
                        Matrix.Translation((sd * 0.7 * k, -0.12 * k, zs - 0.92 * k)) @ Euler((1.95, 0, -sd * 1.0)).to_matrix().to_4x4()), c)
    add_block(bm, (0.44 * k, 0.32 * k, 0.28 * k), (0, -0.62 * k, zt + 0.1 * k), bevel=0.06, rng=rng, color=c, chip=0.2)  # hands
    # The sword, point down to the plinth.
    add_block(bm, (0.2 * k, 0.07 * k, 2.2 * k), (0, -0.7 * k, z0 + 1.0 * k), bevel=0.02, rng=rng, color=jitter_color(c, rng, 0.08), chip=0.3, segments=1)
    add_block(bm, (0.66 * k, 0.14 * k, 0.12 * k), (0, -0.7 * k, zt - 0.06 * k), bevel=0.03, rng=rng, color=c, chip=0.2, segments=1)
    for sd in (-1, 1):
        s = bmesh.new()
        bmesh.ops.create_uvsphere(s, u_segments=12, v_segments=8, radius=0.34 * k)
        bmesh.ops.transform(s, matrix=Matrix.Translation((sd * 0.74 * k, 0, zs)) @ Matrix.Diagonal((1.1, 1.0, 0.75, 1)), verts=s.verts)
        _merge(bm, s, c)
    add_block(bm, (0.4 * k, 0.4 * k, 0.3 * k), (0, 0, zs + 0.1 * k), bevel=0.06, rng=rng, color=c)  # neck
    h = face_bm(seed, rings=20, segs=26, cuts=1)
    if not broken:
        m = Matrix.Translation((0, 0, zs + 0.7 * k)) @ Matrix.Scale(0.42 * k, 4)
    else:  # the head lies at the statue's feet
        m = Matrix.Translation((0.95 * k, -1.2 * k, 0.4 * k)) @ Euler((1.2, 0.3, 0.6)).to_matrix().to_4x4() @ Matrix.Scale(0.42 * k, 4)
    bmesh.ops.transform(h, matrix=m, verts=h.verts)
    _merge(bm, h, c)
    for v in bm.verts:
        v.co += noise.noise_vector(v.co * 2.1 + Vector((seed, 0, 0))) * 0.012
    return finish_obj(name, bm, 45)


def fallen_column(name, seed, radius=0.75, n=5):
    """A toppled colossal column: drums spilled in a rough line along +Y, the capital at the end."""
    rng = random.Random(seed)
    bm = bmesh.new()
    y = 0.0
    yaw = 0.0
    x = 0.0
    for i in range(n):
        ln = rng.uniform(0.9, 1.3) * radius * 1.4
        yaw += rng.uniform(-0.2, 0.2)
        d = _cyl(radius, radius * 0.98, ln, 20)
        for v in d.verts:
            a = math.atan2(v.co.y, v.co.x)
            fl = 1 + 0.035 * math.cos(a * 12)  # fluting
            v.co.x *= fl
            v.co.y *= fl
            v.co += noise.noise_vector(v.co * 2.5 + Vector((seed, i, 0))) * 0.035
        sink = rng.uniform(0.05, 0.3)
        x += math.sin(yaw) * ln * 0.5
        m = (Matrix.Translation((x, y, radius - sink))
             @ Euler((-math.pi / 2 + rng.uniform(-0.05, 0.05), 0, yaw)).to_matrix().to_4x4()
             @ Matrix.Rotation(rng.uniform(0, 6.28), 4, "Z"))
        bmesh.ops.transform(d, matrix=m, verts=d.verts)
        _merge(bm, d, sand(rng))
        y += ln + rng.uniform(0.05, 0.3)
    add_block(bm, (radius * 3.0, radius * 0.75, radius * 3.0), (x + 0.3, y + radius * 0.45, radius * 1.3), (0.1, 0.3, 0.15), bevel=0.06,
              rng=rng, color=sand(rng), chip=0.5)
    for _ in range(4):
        s = rng.uniform(0.2, 0.45)
        add_block(bm, (s * 1.4, s, s), (rng.uniform(-1.5, 1.5), rng.uniform(0, y), s * 0.3), (0, 0, rng.uniform(0, 6)), bevel=0.04,
                  rng=rng, color=sand(rng), chip=0.7, segments=1)
    return finish_obj(name, bm, 50)


def relief_wall(name, seed, length=4.0, depth=0.9):
    """Big dressed ashlar with two tall carved courses (the glyph material cuts the relief). Runs along +Y."""
    rng = random.Random(seed)
    bm = bmesh.new()
    z = -0.35
    for ci, ch in enumerate([0.55, 1.15, 1.15, 0.5]):
        y = -rng.uniform(0, 0.6) if ci % 2 else 0.0
        while y < length - 0.05:
            bl = min(rng.uniform(1.2, 2.0) if ch > 1 else rng.uniform(0.6, 1.0), length - y)
            if ci == 3 and rng.random() < 0.3:
                y += bl
                continue
            add_block(bm, (depth, bl - 0.03, ch - 0.03), (0, y + bl / 2, z + ch / 2), bevel=0.03, rng=rng,
                      color=jitter_color(hexcol("#b89066"), rng, 0.06), chip=0.35 if ci == 3 else 0.12, jit=0.01, segments=1)
            y += bl
        z += ch
    y = 0.0
    while y < length - 0.05:  # a projecting cornice, a stone or two gone
        bl = rng.uniform(0.7, 1.2)
        if rng.random() > 0.2:
            add_block(bm, (depth + 0.3, bl - 0.03, 0.22), (0, y + bl / 2, z + 0.11), bevel=0.03, rng=rng, color=sand(rng), chip=0.5, segments=1)
        y += bl
    return finish_obj(name, bm)


def rope_rail(name, seed, length=4.0, width=3.2, h=1.05):
    """Posts and sagging rope hand-lines along both sides of a plank tile (runs along +Y)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    for sd in (-1, 1):
        x = sd * (width / 2 + 0.12)
        for yp in (0.15, length - 0.15):
            add_block(bm, (0.16, 0.16, h + 0.4), (x, yp, (h + 0.4) / 2 - 0.35), (rng.uniform(-0.06, 0.06), rng.uniform(-0.05, 0.05), 0),
                      bevel=0.02, rng=rng, color=jitter_color(WOOD[1], rng), jit=0.01, segments=1)
        for zr, sag in ((h, 0.2), (h * 0.55, 0.12)):
            n = 10
            pts = [Vector((x, 0.15 + (length - 0.3) * i / n, zr - sag * 4 * (i / n) * (1 - i / n))) for i in range(n + 1)]
            _merge(bm, _tube(pts, [0.03] * len(pts)), hexcol("#a08458"))
    return finish_obj(name, bm, 60)


def roots(name, seed, width=3.0, n=7, length=(1.5, 3.5)):
    """Aerial roots hanging from z=0 down a face in the XZ plane (bark material)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    for k in range(n):
        x = -width / 2 + width * (k + rng.uniform(0.1, 0.9)) / n
        ln = rng.uniform(*length)
        r0 = rng.uniform(0.04, 0.09)
        segs = 8
        p = Vector((x, -0.15, 0.25))
        pts, rad = [], []
        for i in range(segs + 1):
            s = i / segs
            if i == 1:
                p = Vector((x, 0.0, 0.0))
            elif i:
                p = p + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.03, 0.05), -ln / segs))
            pts.append(p.copy())
            rad.append(r0 * (1 - 0.8 * s) + 0.008)
        _merge(bm, _tube(pts, rad), (0.3, 0.25, 0.2, 1))
    return finish_obj(name, bm, 70)


def stepping_stones(name, seed, n=6, spread=3.0):
    """Squat worn blocks just breaking the water (z=0 is the water line)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    for i in range(n):
        s = rng.uniform(0.5, 1.0)
        add_block(bm, (s * 1.3, s * 1.1, 0.9), (rng.uniform(-spread, spread) * 0.5, i * spread * 0.5 + rng.uniform(-0.4, 0.4), -0.32 + rng.uniform(0, 0.15)),
                  (rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), rng.uniform(0, 6)), bevel=0.08, rng=rng, color=sand(rng), chip=0.6, segments=1)
    return finish_obj(name, bm)


# ------------------------------------------------------------------ flora (vertex-coloured, baked)
# Round 20: deeper, saturated greens (they read as yellow paper under the low sun), a bronze young pad.
PAD = [hexcol(h) for h in ("#2c561a", "#36631f", "#24481a", "#41702a", "#2f5a24")]
LOTUS = [hexcol(h) for h in ("#f2b8c6", "#f7d0da", "#e994ad", "#fbe6ea")]
BROWN = hexcol("#6e4f22")


def lily_pads(name, seed, n=12, spread=1.6, flowers=2):
    """A raft of lily pads (z=0 is the water line) with a lotus or two.

    Round 20: each pad is cupped (the rim lifts), creased along radial veins (alternating ridge and
    furrow spokes over two rings), some with bites torn out of the rim and a browned, dying edge; a
    dark disc under each pad darkens the water at its edge (contact shadow). Lotus petals are pointed
    and folded along their midrib, in three whorls, pink at the tips and pale at the heart."""
    rng = random.Random(seed)
    bm = bmesh.new()
    for i in range(n):
        r = rng.uniform(0.18, 0.42)
        a = rng.uniform(0, 6.28)
        d = spread * math.sqrt(rng.random())
        cx, cy = math.cos(a) * d, math.sin(a) * d
        segs = 22
        notch = rng.uniform(0, 6.28)
        cup = rng.uniform(0.02, 0.06)
        brown = rng.random() < 0.22
        bites = [rng.randint(1, segs - 2) for _ in range(rng.choice((0, 0, 1, 2)))]
        col = jitter_color(rng.choice(PAD), rng, 0.08, 0.04)
        # Contact shadow: a dark rim a hair above the water, the pad's own outline (notch and bites
        # included) a little larger: a thin wet, dark edge where the leaf meets the water.
        def outline(j, segs=segs, notch=notch, r=r, bites=bites):
            aa = notch + 0.3 + (2 * math.pi - 0.6) * j / segs
            rr = r * (1 + 0.035 * math.sin(j * 3.1))
            if any(abs(j - b_) <= 1 for b_ in bites):
                rr *= 0.72 if j in bites else 0.86
            return aa, rr

        t = bmesh.new()
        c0 = t.verts.new((cx, cy, 0.004))
        sr = []
        for j in range(segs + 1):
            aa, rr = outline(j)
            sr.append(t.verts.new((cx + math.cos(aa) * (rr * 1.06 + 0.012), cy + math.sin(aa) * (rr * 1.06 + 0.012), 0.004)))
        for j in range(segs):
            t.faces.new((c0, sr[j], sr[j + 1]))
        _merge(bm, t, color=(0.03, 0.06, 0.04, 1.0))
        t = bmesh.new()
        c = t.verts.new((cx, cy, 0.024))
        mid, ring = [], []
        for j in range(segs + 1):
            aa = notch + 0.3 + (2 * math.pi - 0.6) * j / segs
            vein = 0.006 if j % 2 == 0 else -0.004  # ridge / furrow spokes
            rr = r * (1 + 0.035 * math.sin(j * 3.1))
            if any(abs(j - b_) <= 1 for b_ in bites):
                rr *= 0.72 if j in bites else 0.86
            mid.append(t.verts.new((cx + math.cos(aa) * rr * 0.55, cy + math.sin(aa) * rr * 0.55, 0.022 + cup * 0.25 + vein)))
            ring.append(t.verts.new((cx + math.cos(aa) * rr, cy + math.sin(aa) * rr, 0.02 + cup + vein * 0.6 + 0.008 * rng.random())))
        for j in range(segs):
            t.faces.new((c, mid[j], mid[j + 1]))
            t.faces.new((mid[j], ring[j], ring[j + 1], mid[j + 1]))

        def pad_col(co, col=col, cx=cx, cy=cy, r=r, brown=brown):
            rad = min(1.0, Vector((co.x - cx, co.y - cy)).length / r)
            c3 = [ch * (0.85 + 0.3 * rad) for ch in col[:3]]
            if brown and rad > 0.8:
                k = (rad - 0.8) / 0.2
                c3 = [a_ * (1 - k) + b_ * k for a_, b_ in zip(c3, BROWN[:3])]
            return tuple(c3) + (1,)

        _merge(bm, t, color_fn=pad_col)
    for k in range(flowers):
        a = rng.uniform(0, 6.28)
        d = spread * 0.6 * math.sqrt(rng.random())
        cx, cy = math.cos(a) * d, math.sin(a) * d
        pc = rng.choice(LOTUS)
        for layer, (npet, ln, el, w) in enumerate(((10, 0.21, 0.45, 0.07), (8, 0.17, 0.85, 0.06), (5, 0.11, 1.2, 0.045))):
            for j in range(npet):
                aa = 2 * math.pi * j / npet + layer * 0.37 + rng.uniform(-0.08, 0.08)
                t = bmesh.new()
                base = Vector((cx, cy, 0.05))
                dirv = Vector((math.cos(aa) * math.cos(el), math.sin(aa) * math.cos(el), math.sin(el)))
                side = Vector((-math.sin(aa), math.cos(aa), 0)) * w
                tip = base + dirv * ln
                # Folded along the midrib (the midrib sits low, the edges lift: a boat-shaped petal).
                fold = Vector((0, 0, 1)) * w * 0.35
                m1 = base + dirv * ln * 0.45
                vs = [t.verts.new(base), t.verts.new(m1 - side + fold), t.verts.new(m1), t.verts.new(tip), t.verts.new(m1 + side + fold)]
                t.faces.new((vs[0], vs[1], vs[2]))
                t.faces.new((vs[1], vs[3], vs[2]))
                t.faces.new((vs[0], vs[2], vs[4]))
                t.faces.new((vs[2], vs[3], vs[4]))
                _merge(bm, t, color_fn=lambda co, base=base, pc=pc, ln=ln: tuple(
                    ch * (0.62 + 0.5 * min(1, (co - base).length / ln)) for ch in pc[:3]) + (1,))
        _merge(bm, _cyl(0.04, 0.05, 0.06, 8, Matrix.Translation((cx, cy, 0.05))), hexcol("#e6c040"))
    return finish_obj(name, bm, 80)


def moss_clump(name, seed, radius=0.6, n=5):
    """Soft mounds of moss for wall tops, rubble and stones (z=0 is the surface it sits on)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    for i in range(n):
        t = bmesh.new()
        r = radius * rng.uniform(0.45, 1.0)
        bmesh.ops.create_icosphere(t, subdivisions=2, radius=r)
        off = Vector((seed + i * 3.1, i, 0))
        a = rng.uniform(0, 6.28)
        d = radius * rng.uniform(0, 0.9)
        flat = rng.uniform(0.3, 0.45)
        for v in t.verts:
            v.co.z = max(v.co.z, -0.02) * flat
            # Round 11: lumpier cushions (tufts on tufts), not smooth domes.
            v.co *= 1 + noise.fractal(v.co * 3 + off, 0.6, 2, 3) * 0.3 + noise.noise(v.co * 7 + off) * 0.06
            v.co += Vector((math.cos(a) * d, math.sin(a) * d, -0.03))
        col = jitter_color(hexcol(rng.choice(("#4e6a22", "#5c7426", "#435e1e", "#6f7f2c"))), rng, 0.1, 0.05)
        # Alpha 0 marks moss for the flora material's fuzzy moss surface (materials_scan.flora); vertex
        # colours are not exported, so this never reaches the game.
        _merge(bm, t, col[:3] + (0.0,))
    ob = finish_obj(name, bm, 80)
    return ob


def _limb(pts, radii, segs=14):
    """A smooth limb along the points: rings of `segs` vertices, the radius eased between the given
    ones (round knuckles), capped at both ends with a rounded fan."""
    t = bmesh.new()
    rings = []
    for i, (p, r) in enumerate(zip(pts, radii)):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        q = d.to_track_quat("Z", "Y")
        rings.append([t.verts.new(p + q @ Vector((math.cos(2 * math.pi * j / segs) * r, math.sin(2 * math.pi * j / segs) * r, 0)))
                      for j in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for j in range(segs):
            t.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    for ring, p, sgn in ((rings[0], pts[0], -1), (rings[-1], pts[-1], 1)):
        d = (pts[-1] - pts[-2]).normalized() if sgn > 0 else (pts[0] - pts[1]).normalized()
        tip = t.verts.new(p + d * (radii[-1] if sgn > 0 else radii[0]) * 0.8)
        for j in range(segs):
            f = (ring[j], ring[(j + 1) % segs], tip) if sgn > 0 else (ring[(j + 1) % segs], ring[j], tip)
            t.faces.new(f)
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    return t


def colossal_hand(name, seed):
    """World round 15: the stone hand of a drowned colossus breaking the water, palm toward the sky,
    fingers curled as if reaching (≈2.2 m tall at scale 1: placed at 6–8× in the river). The wrist is at
    the origin, the hand rising along +Z, the palm facing −Y (the runner)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    stone = sand(rng)
    # Forearm and wrist rising from the water, a little bent.
    arm = [Vector((0, 0.15, -1.2)), Vector((0, 0.08, -0.4)), Vector((0, 0.0, 0.25))]
    _merge(bm, _limb(arm, [0.4, 0.34, 0.24], 24), jitter_color(stone, rng, 0.05, 0.02))
    # The palm: a flattened, rounded block.
    palm = bmesh.new()
    bmesh.ops.create_icosphere(palm, subdivisions=3, radius=1.0)
    for v in palm.verts:
        # Squared off toward a palm (a superellipse), thicker at the heel of the hand.
        sq = lambda c: math.copysign(abs(c) ** 0.6, c)
        v.co = Vector((sq(v.co.x) * 0.46, v.co.y * (0.2 - 0.04 * v.co.z), sq(v.co.z) * 0.52 + 0.68))
    _merge(bm, palm, jitter_color(stone, rng, 0.05, 0.02))
    # Four fingers from the top of the palm, each three joints, curling toward the runner (−Y).
    for i, (x, ln, spread) in enumerate(((-0.27, 0.88, -0.12), (-0.09, 1.0, -0.04), (0.09, 0.95, 0.04), (0.26, 0.74, 0.12))):
        curl = rng.uniform(0.35, 0.6) + i * 0.05
        p = Vector((x, 0.0, 1.12))
        d = Vector((spread, 0.0, 1.0)).normalized()
        pts = [p.copy()]
        for k, seg in enumerate((0.42, 0.3, 0.24)):
            ang = curl * (k + 1) * 0.55
            dk = Vector((d.x, -math.sin(ang), math.cos(ang))).normalized()
            p = p + dk * seg * ln
            pts.append(p.copy())
        r = 0.105 if i < 3 else 0.095
        _merge(bm, _limb(pts, [r, r * 0.97, r * 0.9, r * 0.8], 12), jitter_color(stone, rng, 0.06, 0.02))
    # The thumb, out to the side and up.
    tp = [Vector((-0.4, -0.05, 0.6)), Vector((-0.62, -0.18, 0.85)), Vector((-0.72, -0.3, 1.1)), Vector((-0.74, -0.42, 1.28))]
    _merge(bm, _limb(tp, [0.14, 0.12, 0.11, 0.09], 12), jitter_color(stone, rng, 0.06, 0.02))
    # Weathering: the stone eroded and pitted, a little moss on the upward faces (vertex colour).
    bm.normal_update()
    off = Vector((seed * 0.17, 0, 0))
    cl = bm.loops.layers.float_color.get("Col")
    for v in bm.verts:
        v.co += v.normal * noise.fractal(v.co * 4.0 + off, 0.6, 2.0, 4) * 0.025
    for f in bm.faces:
        if f.normal.z > 0.55 and noise.noise(f.calc_center_median() * 6 + off) > 0.15:
            for l in f.loops:
                l[cl] = jitter_color(hexcol("#5a6e2c"), rng, 0.1, 0.04)
    return finish_obj(name, bm, 60)


def _catmull(ps, steps):
    """Points along a Catmull-Rom spline through `ps` (Vectors), `steps` per span."""
    out = []
    ext = [ps[0] * 2 - ps[1]] + list(ps) + [ps[-1] * 2 - ps[-2]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(ps[-1].copy())
    return out


def _root_sweep(bm, pts, prof, twist, ring_n=12, ref=Vector((0, 1, 0)), seed=0.0, ridges=7, knuckle=0.14, grain=None, v0=0.0):
    """Sweep a root section along `pts`.

    prof(u) -> (half-extent along e2, half-extent along e1); e1 = tangent x `ref` (off the surface the
    root lies on, for ref = the wall's run), e2 = tangent x e1. The section is not round: a keel toward
    e1, flutes running along the grain (`ridges`), knuckles swelling and pinching along the length,
    a twist. The start is capped; the end comes to a point. With `grain` (the bmesh UV layer "grain"),
    the loops get (round the section, along the root) in metres, so a bark scan runs along the root.
    Returns the arc length swept (for chaining a branch's grain)."""
    n = len(pts)
    rings = []
    arc = [v0]
    for i in range(1, n):
        arc.append(arc[-1] + (pts[i] - pts[i - 1]).length)
    perims = []
    for i, p in enumerate(pts):
        u = i / (n - 1)
        tng = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        e1 = tng.cross(ref)
        if e1.length < 1e-4:
            e1 = tng.cross(Vector((0, 0, 1)))
        e1.normalize()
        e2 = tng.cross(e1).normalized()
        tw = twist(u)
        a1 = e1 * math.cos(tw) + e2 * math.sin(tw)
        a2 = -e1 * math.sin(tw) + e2 * math.cos(tw)
        wb, wn = prof(u)
        # Knuckles: the root swells and pinches along its length.
        kn = 1.0 + knuckle * (0.6 * math.sin(arc[i] * 7.3 + seed) + 0.4 * noise.noise(Vector((arc[i] * 2.1, seed, 0.3))))
        ring = []
        for j in range(ring_n):
            ang = 2 * math.pi * j / ring_n
            fl = 1.0 + 0.07 * math.cos(ang * ridges + seed) + 0.05 * noise.noise(Vector((math.cos(ang) * 2, math.sin(ang) * 2, arc[i] * 4.0 + seed)))
            keel = 1.0 + 0.2 * max(0.0, math.cos(ang)) ** 3
            ring.append(bm.verts.new(p + (a1 * math.cos(ang) * wn * keel + a2 * math.sin(ang) * wb) * kn * fl))
        rings.append(ring)
        perims.append(math.pi * (wb + wn) * kn)
    for i in range(n - 1):
        for j in range(ring_n):
            f = bm.faces.new((rings[i][j], rings[i][(j + 1) % ring_n], rings[i + 1][(j + 1) % ring_n], rings[i + 1][j]))
            if grain is not None:
                uu = (j / ring_n, (j + 1) / ring_n, (j + 1) / ring_n, j / ring_n)
                ii = (i, i, i + 1, i + 1)
                for lp, a, b in zip(f.loops, uu, ii):
                    lp[grain].uv = (a * perims[b], arc[b])
    cap = bm.faces.new(list(reversed(rings[0])))
    if grain is not None:
        for lp in cap.loops:
            lp[grain].uv = (0.0, arc[0])
    return arc[-1]


def buttress_roots(name, seed, length=4.0, n=3, crest=1.2):
    """World round 17-18: giant buttress roots heaved over a parapet.

    Modelled on the right-hand wall: origin on the wall's centre line at path level, spanning `length`
    m along +Y, the path toward −X, the water beyond +X. Each root comes thick out of the bank behind
    the wall, arches over the crest (sunk into the masonry, as roots grow), runs down the inner face and
    tapers hard; where it meets the paving it turns into a buttress: a tall, thin plank fin that runs
    out onto the slabs and sinks into the joints. Most fork on the face; fins also run off along the
    wall's foot; some send a branch down the outer face to the water. The section is fluted along the
    grain, knuckled and twisted, and carries a "grain" UV (round, along) so the bark runs with it.
    """
    rng = random.Random(seed)
    bm = bmesh.new()
    grain = bm.loops.layers.uv.new("UVMap")  # the atlas layer (packed later)
    grain = bm.loops.layers.uv.new("grain")
    Y, Z = Vector((0, 1, 0)), Vector((0, 0, 1))
    for k in range(n):
        y0 = length * (k + rng.uniform(0.2, 0.8)) / n
        # Round 23: thinner (they read as fat smooth tubes up close), tapering harder, twisted round
        # their length (the flutes spiral), and running out a metre onto the paving, not one and a half.
        r0 = rng.uniform(0.12, 0.2)
        sd = seed * 1.7 + k * 3.1
        wob = lambda s, sd=sd: noise.noise(Vector((sd, s * 1.3, 0.5)))  # -1..1
        lift = rng.uniform(0.1, 0.45)
        skew = rng.uniform(-0.7, 0.7)
        fin = rng.uniform(0.17, 0.26)  # the foot's plank: half its height
        # Out of the ground behind the wall, over the crest, down the inner face, out across the paving.
        ctrl = [(2.7, -0.3), (2.0, crest * 0.7 + lift), (1.1, crest + lift), (0.3, crest + 0.1 + lift * 0.3), (-0.34, crest - 0.15),
                (-0.46, 0.75), (-0.55, 0.32), (-0.68, 0.12), (-0.88, 0.04), (-1.05, -0.04)]
        ps = []
        for i, (x, z) in enumerate(ctrl):
            f = i / (len(ctrl) - 1)
            ps.append(Vector((x + 0.06 * wob(i), y0 + skew * (f - 0.5) + 0.22 * wob(i + 10) * f, z)))
        pts = _catmull(ps, 5)
        tw = rng.uniform(1.6, 2.6) * rng.choice((-1, 1))

        def prof(u, r0=r0, fin=fin):
            # e1 is off the surface (up on the crest, out of the face, up on the floor), e2 across.
            if u < 0.58:  # over the wall: tapering hard from the bank
                w = r0 * (1.0 - 0.55 * (u / 0.58) ** 0.8)
                return (w * 1.1, w)
            if u < 0.78:  # the turn onto the paving: the section stands up into a plank
                f = (u - 0.58) / 0.2
                f = f * f * (3 - 2 * f)
                w = r0 * 0.45
                return (w * (1.1 - 0.62 * f), w * (1.0 + (fin / w - 1.0) * f))
            f = (u - 0.78) / 0.22  # the fin running out, thinning and sinking
            return (r0 * 0.45 * 0.48 * (1 - 0.85 * f) + 0.008, fin * (1 - 0.92 * f * f) + 0.01)

        _root_sweep(bm, pts, prof, lambda u, tw=tw: tw * u, ring_n=14, ref=Y, seed=sd, grain=grain, knuckle=0.18)
        # Round 23: lianas — one or two thin woody vines wound round the root over the crest, one
        # dropping off it in a loose loop toward the paving (rope-thin, not a second root).
        for li in range(rng.choice((1, 2))):
            ph = rng.uniform(0, 6.28)
            turns = rng.uniform(2.0, 3.2)
            rl = rng.uniform(0.022, 0.035)
            lp = []
            m_ = len(pts)
            i0, i1 = int(m_ * 0.12), int(m_ * 0.62)
            for i in range(i0, i1):
                u = (i - i0) / (i1 - i0 - 1)
                tng = (pts[min(m_ - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
                e1 = tng.cross(Y)
                if e1.length < 1e-4:
                    e1 = tng.cross(Z)
                e1.normalize()
                e2 = tng.cross(e1).normalized()
                w = prof(i / (m_ - 1))
                a = ph + turns * 6.2832 * u
                rad = max(w[0], w[1]) * 1.05 + rl
                lp.append(pts[i] + (e1 * math.cos(a) + e2 * math.sin(a)) * rad)
            # Off the root's inner end: a sagging loop down toward the floor.
            end = lp[-1]
            drop = rng.uniform(0.5, 0.9)
            lp += [end + Vector((-0.12, 0.08 * rng.choice((-1, 1)), -drop * 0.5)), end + Vector((-0.2, 0.15 * rng.choice((-1, 1)), -drop))]
            _root_sweep(bm, lp, lambda u, rl=rl: (rl * (1 - 0.4 * u) + 0.004, rl * (1 - 0.4 * u) + 0.004), lambda u: 0.0, ring_n=6,
                        ref=Y, seed=sd + 21 + li, ridges=3, knuckle=0.25, grain=grain)
        # A fork off the inner face: thinner, down to the paving a little way along, its own fin.
        if rng.random() < 0.75:
            side = rng.choice((-1, 1))
            fp = [Vector((-0.4, ps[4].y, crest - 0.3)), Vector((-0.5, ps[4].y + side * 0.25, 0.7)), Vector((-0.6, ps[4].y + side * 0.55, 0.18)),
                  Vector((-0.75, ps[4].y + side * 0.78, 0.04)), Vector((-0.92, ps[4].y + side * 0.92, -0.04))]
            rf = r0 * 0.5
            ff = fin * 0.6

            def fprof(u, rf=rf, ff=ff):
                if u < 0.45:
                    return (rf * (1 - 0.3 * u), rf * (1 - 0.3 * u))
                f = (u - 0.45) / 0.55
                return (rf * 0.7 * (1 - 0.8 * f) + 0.006, rf * 0.7 + (ff - rf * 0.7) * min(1.0, f * 2) * (1 - 0.9 * f * f) + 0.008)

            _root_sweep(bm, _catmull(fp, 4), fprof, lambda u: 0.4 * u, ring_n=10, ref=Y, seed=sd + 5, grain=grain)
        # Fins running off along the wall's foot from where the root comes down (a buttress spreads).
        for side in (-1, 1):
            if rng.random() < 0.6:
                ln = rng.uniform(0.7, 1.3)
                yb = ps[6].y
                bp = [Vector((-0.6, yb, 0.08)), Vector((-0.66, yb + side * ln * 0.5, 0.04)), Vector((-0.64, yb + side * ln, -0.04))]
                h = fin * rng.uniform(0.5, 0.8)
                _root_sweep(bm, _catmull(bp, 4), lambda u, h=h: (h * (1 - 0.85 * u) + 0.01, 0.045 * (1 - 0.7 * u) + 0.006),
                            lambda u: 0.0, ring_n=8, ref=Z, seed=sd + 9 + side, knuckle=0.2, grain=grain)
        # A branch down the outer face toward the water (the water line is ~2.2 m below the path).
        if rng.random() < 0.7:
            yb = y0 + rng.uniform(-0.4, 0.4)
            bps = [Vector((0.55, yb, crest + 0.05)), Vector((0.75, yb, crest - 0.45)), Vector((0.95, yb + 0.15 * wob(3), 0.0)), Vector((1.3, yb, -1.4)), Vector((1.7, yb, -2.6))]
            rb = r0 * 0.6
            _root_sweep(bm, _catmull(bps, 4), lambda u, rb=rb: (rb * (1.1 - 0.75 * u) + 0.01, rb * (1.0 - 0.8 * u) + 0.01), lambda u: 0.3 * u,
                        ring_n=10, ref=Y, seed=sd + 13, grain=grain)
    ob = finish_obj(name, bm, 50)
    ob.data.uv_layers.active = ob.data.uv_layers["UVMap"]  # the atlas layer; "grain" is read by name
    # The bark material runs its scan along the "grain" UV where this flag is set (see materials_scan.bark).
    at = ob.data.attributes.new("grainw", "FLOAT", "POINT")
    at.data.foreach_set("value", [1.0] * len(ob.data.vertices))
    return ob
