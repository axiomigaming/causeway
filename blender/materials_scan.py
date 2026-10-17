"""Round 11: the rock and cliff materials with a photoscan worked in (Poly Haven "rock_face", CC0).

Kept out of materials.py on purpose: that file's hash keys every baked group's cache (build_kit.py),
so editing it would re-bake the whole kit; these two groups carry their own MAT_TAG instead.

The scan goes in at two scales (one for the strata and fractures, one for the grain), its colour
normalised to its mean and mostly desaturated so the material's own hues (red-orange beds, moss,
algae streaks, the wet band) survive, and its height is added to the bump chain.
"""
import materials as M
from common import L, N, math_node, mix


def _inject(m, asset, scales, amount, bump):
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    vec, _ = M._coords(nt, 1.0)
    cols, hs = [], []
    for s in scales:
        c, h, _r = M.scan(nt, vec, asset, s, 0.8, 1.1)
        cols.append(c)
        hs.append(h)
    c = mix(nt, 0.5, cols[0], cols[1], "MULTIPLY") if len(cols) > 1 else cols[0]
    base_in = bsdf.inputs["Base Color"]
    src = base_in.links[0].from_socket
    L(nt, mix(nt, amount, src, c, "MULTIPLY"), base_in)
    h = hs[0] if len(hs) == 1 else math_node(nt, "ADD", hs[0], math_node(nt, "MULTIPLY", hs[1], 0.5))
    nin = bsdf.inputs["Normal"]
    prev = nin.links[0].from_socket if nin.links else None
    L(nt, M._bump(nt, h, bump, 0.12, prev), nin)
    return m


def rock(name="rock"):
    return _inject(M.rock(name), "rock_face", (0.16, 0.55), 0.85, 0.9)


def cliff(name="cliff"):
    return _inject(M.cliff(name), "rock_face", (0.12, 0.45), 0.8, 0.8)
