"""Round 11: the rock and cliff materials with a photoscan worked in (Poly Haven "rock_face", CC0).

Kept out of materials.py on purpose: that file's hash keys every baked group's cache (build_kit.py),
so editing it would re-bake the whole kit; these two groups carry their own MAT_TAG instead.

The scan goes in at two scales (one for the strata and fractures, one for the grain), its colour
normalised to its mean and mostly desaturated so the material's own hues (red-orange beds, moss,
algae streaks, the wet band) survive, and its height is added to the bump chain.
"""
import bpy
import materials as M
from common import L, N, hexcol, maprange, math_node, mix, nodes_clear, ramp


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


def bark(name="bark"):
    """The bark material with a bark scan (Poly Haven "bark_brown_02", CC0) worked in, moss on the
    sky-facing side (a fallen log's back, a root's crest), and pale, splintered heartwood where a face
    carries the `heart` attribute (the broken ends of log_fallen_0)."""
    # Built from the scan alone: the old procedural bark's wave bands ran round a trunk as rings.
    m = bpy.data.materials.new(name)
    nt = nodes_clear(m)
    out = N(nt, "ShaderNodeOutputMaterial")
    bsdf = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, bsdf.outputs[0], out.inputs[0])
    vec, _ = M._coords(nt, 1.0)
    c1, h1, r1 = M.scan(nt, vec, "bark_brown_02", 0.55, 0.55, 1.15)
    c2, h2, _r2 = M.scan(nt, vec, "bark_brown_02", 1.7, 0.7, 1.0)
    c = mix(nt, 0.4, c1, c2, "MULTIPLY")
    L(nt, mix(nt, 1.0, hexcol("#6a5440"), c, "MULTIPLY"), bsdf.inputs["Base Color"])
    L(nt, maprange(nt, r1, 0.3, 1.0, 0.75, 0.97), bsdf.inputs["Roughness"])
    L(nt, M._bump(nt, math_node(nt, "ADD", h1, math_node(nt, "MULTIPLY", h2, 0.4)), 1.0, 0.06), bsdf.inputs["Normal"])
    geo = N(nt, "ShaderNodeNewGeometry")
    sep = N(nt, "ShaderNodeSeparateXYZ")
    L(nt, geo.outputs["Normal"], sep.inputs[0])
    up = maprange(nt, sep.outputs[2], 0.35, 0.85, 0.0, 1.0)
    patches = M._noise(nt, vec, 1.6, 4, 0.6)
    moss = math_node(nt, "MULTIPLY", up, maprange(nt, patches.outputs[0], 0.38, 0.6, 0.0, 0.9))
    tufts = M._noise(nt, vec, 60, 4, 0.6)
    mc = ramp(nt, tufts.outputs[0], [(0.3, (0.07, 0.11, 0.03, 1)), (0.7, (0.2, 0.27, 0.07, 1))])
    base_in = bsdf.inputs["Base Color"]
    col = mix(nt, moss, base_in.links[0].from_socket, mc, "MIX")
    heart = N(nt, "ShaderNodeAttribute", _attribute_name="heart")
    hn = M._noise(nt, vec, 14, 6, 0.7)
    wood = ramp(nt, hn.outputs[0], [(0.3, (0.42, 0.28, 0.15, 1)), (0.7, (0.62, 0.45, 0.27, 1))])
    col = mix(nt, heart.outputs["Fac"], col, wood, "MIX")
    L(nt, col, base_in)
    return m


def flora(name="flora"):
    """The flora material, with the moss mounds (vertex alpha 0, see setpieces.moss_clump) given a
    fuzzy cushion-moss surface: clumps of tiny tufts, yellow-green tips, dark hollows between them,
    instead of smooth green clay. Lily pads and lotus keep the plain material."""
    m = M.flora(name)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    vc = N(nt, "ShaderNodeVertexColor", _layer_name="Col")
    mask = math_node(nt, "SUBTRACT", 1.0, vc.outputs["Alpha"])
    vec, _ = M._coords(nt, 1.0)
    cushions = M._noise(nt, vec, 9, 3, 0.55, 0.6)
    tufts = M._noise(nt, vec, 140, 4, 0.6)
    fine = M._noise(nt, vec, 45, 6, 0.7)
    hollow = maprange(nt, cushions.outputs[0], 0.3, 0.7, 0.55, 1.0)
    tint = ramp(nt, tufts.outputs[0], [(0.35, (0.55, 0.62, 0.42)), (0.55, (1.0, 1.0, 1.0)), (0.75, (1.35, 1.3, 0.75))])
    moss_col = mix(nt, 1.0, vc.outputs[0], tint, "MULTIPLY")
    moss_col = mix(nt, 1.0, moss_col, _grey(nt, hollow), "MULTIPLY")
    base_in = bsdf.inputs["Base Color"]
    L(nt, mix(nt, mask, base_in.links[0].from_socket, moss_col, "MIX"), base_in)
    h = math_node(nt, "ADD", math_node(nt, "MULTIPLY", tufts.outputs[0], 0.6),
                  math_node(nt, "ADD", math_node(nt, "MULTIPLY", fine.outputs[0], 0.4), hollow))
    nin = bsdf.inputs["Normal"]
    prev = nin.links[0].from_socket
    fuzzy = M._bump(nt, h, 1.0, 0.025, prev)
    sw = N(nt, "ShaderNodeMix")
    sw.data_type = "VECTOR"
    L(nt, mask, sw.inputs[0])
    L(nt, prev, sw.inputs[4])
    L(nt, fuzzy, sw.inputs[5])
    L(nt, sw.outputs[1], nin)
    rin = bsdf.inputs["Roughness"]
    L(nt, math_node(nt, "MAXIMUM", rin.links[0].from_socket, math_node(nt, "MULTIPLY", mask, 0.95)), rin)
    return m


def _grey(nt, v):
    c = N(nt, "ShaderNodeCombineColor")
    for i in range(3):
        L(nt, v, c.inputs[i])
    return c.outputs[0]
