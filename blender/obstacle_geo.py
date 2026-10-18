"""Round 11: obstacle pieces for the obstacle director (the game places them by name; see
src/world/obstacles.ts). Built in their resting pose, origin on the ground at the centre of the path:

  log_fallen_0      a fallen jungle trunk across the way (7.6 m, Ø 0.8 m): round, bark-scanned and
                    mossy on top, branch stubs snapped short, one end splintered, the other an old
                    rotten break. Lies along Blender X (across the path).  [bark atlas]
  beam_lintel_0     a carved stone lintel (6.6 × 0.62 × 0.7 m): glyph cartouches along both faces and a
                    fret on top, chipped ends; its underside at z = 0 (the director lifts it onto its
                    posts or drops it).  [stoneB atlas]
  pillar_topple_0   a standing square glyph pier, 4.4 m, broken at the top, origin at its foot (the
                    pivot it topples about).  [stoneB atlas]
"""
import math
import random

import bpy
import bmesh
from mathutils import Matrix, Vector, noise

from common import finish_obj, hexcol, jitter_color
from setpieces import _cyl, _merge
import meso as X

BARK = ("#5a4632", "#4e3c2a", "#634d36")


def _ring_radius(rng, a, z, base, off):
    # Bark ridges run along the trunk (low frequency around, high along), plus slow swelling.
    ridge = 0.035 * noise.noise(Vector((math.cos(a) * 3.0, math.sin(a) * 3.0, z * 0.6)) + off)
    swell = 0.05 * noise.noise(Vector((0.0, 0.0, z * 0.35)) + off)
    return base * (1.0 + swell) + ridge


def log_fallen(name, seed, length=7.6, r0=0.42, r1=0.35, seg=22, rings=46):
    """Modelled upright along Z (so the bark scan's grain runs along it) and laid along X by the
    object's rotation (the loader bakes that into the geometry)."""
    rng = random.Random(seed)
    off = Vector((seed * 0.37, seed * 0.11, 0.0))
    bm = bmesh.new()
    t = bmesh.new()
    heart = t.faces.layers.float.new("heart")
    ring_verts = []
    for i in range(rings + 1):
        z = length * i / rings
        k = z / length
        base = r0 + (r1 - r0) * k
        # A gentle sag and a kink where it hit the ground.
        bend = Vector((0.12 * math.sin(k * math.pi) + 0.05 * noise.noise(Vector((k * 3.0, 0.0, 0.0)) + off), 0.06 * math.sin(k * 2.4), 0.0))
        row = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            r = _ring_radius(rng, a, z, base, off)
            row.append(t.verts.new((math.cos(a) * r + bend.x, math.sin(a) * r + bend.y, z)))
        ring_verts.append(row)
    for i in range(rings):
        for j in range(seg):
            a, b = ring_verts[i][j], ring_verts[i][(j + 1) % seg]
            c, d = ring_verts[i + 1][(j + 1) % seg], ring_verts[i + 1][j]
            t.faces.new((a, b, c, d))
    # The splintered end (z = length): every vertex of the last ring pushed out into a jagged spike,
    # pulled toward the core, with a few long splinters; then a ragged, pale core.
    last = ring_verts[-1]
    cz = length
    for j, v in enumerate(last):
        spike = rng.uniform(0.02, 0.28) + (0.45 if rng.random() < 0.18 else 0.0)
        pull = rng.uniform(0.15, 0.55) if spike > 0.3 else rng.uniform(0.0, 0.25)
        v.co.z += spike
        v.co.x -= (v.co.x - 0.0) * pull * 0.6
        v.co.y -= (v.co.y - 0.0) * pull * 0.6
    core = t.verts.new((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), cz + 0.06))
    for j in range(seg):
        f = t.faces.new((last[j], last[(j + 1) % seg], core))
        f[heart] = 1.0
    # The old break (z = 0): a rotten, hollowed end, sunk in.
    first = ring_verts[0]
    hollow = t.verts.new((0.0, 0.0, 0.12))
    inner = []
    for j, v in enumerate(first):
        p = v.co * 0.62
        p.z = 0.04 + rng.uniform(0.0, 0.05)
        inner.append(t.verts.new(p))
    for j in range(seg):
        f = t.faces.new((first[(j + 1) % seg], first[j], inner[j], inner[(j + 1) % seg]))
        f[heart] = 1.0
        f = t.faces.new((inner[(j + 1) % seg], inner[j], hollow))
        f[heart] = 1.0
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    bark = jitter_color(hexcol(rng.choice(BARK)), rng, 0.06, 0.03)
    _merge(bm, t, bark)
    # Branch stubs, snapped short.
    for _ in range(rng.randint(3, 4)):
        z = rng.uniform(1.2, length - 1.2)
        a = rng.uniform(0, 2 * math.pi)
        r = r0 + (r1 - r0) * z / length
        rad = rng.uniform(0.06, 0.1)
        ln = rng.uniform(0.16, 0.38)
        d = Vector((math.cos(a), math.sin(a), rng.uniform(0.15, 0.5))).normalized()
        m = Matrix.Translation(Vector((math.cos(a) * r * 0.8, math.sin(a) * r * 0.8, z))) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        s = _cyl(rad, rad * 0.75, ln, 8, m)
        for v in s.verts:
            if v.co.length > 0 and (m.inverted() @ v.co).z > ln * 0.9:
                v.co += d * rng.uniform(-0.06, 0.1)
        _merge(bm, s, jitter_color(bark, rng, 0.05, 0.02))
    ob = finish_obj(name, bm, 50)
    # Lie it down across the path (Blender X) by the object's rotation (build_kit zeroes locations
    # before export, so the centring and the lift onto the ground go into the mesh, in its own frame:
    # world (−L/2, 0, h) is local (−h, 0, −L/2) under a quarter turn about Y).
    ob.data.transform(Matrix.Translation((-r0 * 0.88, 0.0, -length / 2)))
    ob.rotation_euler = (0.0, math.pi / 2, 0.0)
    return ob


def beam_lintel(name, seed, length=6.6, h=0.62, d=0.7):
    """A carved lintel fallen from a gateway: a slab with a row of glyph cartouches on both long faces,
    a stepped fret along its top, the ends broken off."""
    rng = random.Random(seed)
    bm = bmesh.new()
    X.box(bm, rng, (length, d, h), (0, 0, h / 2), X.lime(rng, 0.15), bevel=0.05, chip=0.35)
    # Broken ends: a chunk off each end, askew.
    for sx in (-1, 1):
        X.box(bm, rng, (0.4, d * 0.8, h * 0.7), (sx * (length / 2 + 0.12), rng.uniform(-0.05, 0.05), h * 0.38), X.lime(rng, 0.3),
              rot=(rng.uniform(-0.2, 0.2), rng.uniform(-0.15, 0.15), rng.uniform(-0.3, 0.3)), chip=0.7)
    for sy in (-1, 1):
        t = bmesh.new()
        X.glyph_grid(t, rng, 0, -d / 2 - 0.01, h / 2, 6, 1, 0.42, 0.18)
        if sy > 0:
            bmesh.ops.transform(t, matrix=Matrix.Rotation(math.pi, 4, "Z"), verts=t.verts)
        X._merge_bm(bm, t)
    # A projecting cornice along the top, broken in places.
    x = -length / 2 + 0.2
    while x < length / 2 - 0.4:
        w = rng.uniform(0.7, 1.4)
        if rng.random() > 0.2:
            X.box(bm, rng, (min(w, length / 2 - 0.2 - x) - 0.03, d * 1.12, 0.14), (x + w / 2, 0, h + 0.07), X.lime(rng, 0.3), bevel=0.03, chip=0.5)
        x += w
    return finish_obj(name, bm, 40)


def pillar_topple(name, seed):
    return X.square_pier(name, seed, height=4.4, w=0.9, broken=True)
