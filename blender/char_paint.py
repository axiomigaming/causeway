"""The supplied runner's texture maps, as supplied.

The owner's character ships with exactly the look of blender/sources/runner/albedo.png — the cream
henley with rolled sleeves, blue-grey jeans, the brown leather cross-harness and holster, his face and
hair. Colour and normal are used untouched (loaded straight from the source PNGs); only roughness and
metallic are packed into one glTF ORM map (R = 1, G = roughness, B = metallic), pixel for pixel.
"""
import os
import shutil

import bpy
import numpy as np


def source_maps(src_dir, out_dir):
    """{color, normal, orm} image paths at the source resolution."""
    os.makedirs(out_dir, exist_ok=True)
    rgh = bpy.data.images.load(os.path.join(src_dir, "roughness.png"))
    met = bpy.data.images.load(os.path.join(src_dir, "metallic.png"))
    for im in (rgh, met):
        im.colorspace_settings.name = "Non-Color"
    w, h = rgh.size
    r = np.array(rgh.pixels[:], np.float32).reshape(h, w, 4)[..., 0]
    m = np.array(met.pixels[:], np.float32).reshape(h, w, 4)[..., 0]
    one = np.ones_like(r)
    orm = bpy.data.images.new("runner_orm", w, h, alpha=False)
    orm.colorspace_settings.name = "Non-Color"
    orm.pixels[:] = np.stack([one, r, m, one], -1).ravel()
    path = os.path.join(out_dir, "runner_orm.png")
    orm.filepath_raw = path
    orm.file_format = "PNG"
    orm.save()
    for im in (rgh, met, orm):
        bpy.data.images.remove(im)
    # Byte-for-byte copies, named for the delivery pipeline (it sizes maps by name).
    out = {"orm": path}
    for k, f in (("color", "albedo.png"), ("normal", "normal.png")):
        out[k] = os.path.join(out_dir, f"runner_{k}.png")
        shutil.copyfile(os.path.join(src_dir, f), out[k])
    return out


def vertex_hsv(mesh, albedo_path):
    """Mean albedo of each vertex's corners, as (hue°, saturation, value) arrays."""
    im = bpy.data.images.load(albedo_path)
    w, h = im.size
    px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
    bpy.data.images.remove(im)
    me = mesh.data
    uv = np.zeros(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    vi = np.zeros(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", vi)
    c = px[np.clip((uv[:, 1] * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1)]
    acc = np.zeros((len(me.vertices), 3))
    np.add.at(acc, vi, c)
    acc /= np.maximum(np.bincount(vi, minlength=len(me.vertices)), 1)[:, None]
    r, g, b = acc[:, 0], acc[:, 1], acc[:, 2]
    mx, mn = acc.max(1), acc.min(1)
    d = mx - mn + 1e-6
    hue = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
    return hue, (mx - mn) / (mx + 1e-6), mx


# Per-material surface response for the ORM map. The source's roughness map is one flat cloth value
# (median 0.91) over skin, hair and leather alike, and its metallic map is noise (~0.1 everywhere): under
# the game's sun the face and forearms read as matte cloth with a grey metallic cast, not skin. Each
# texel's material is read off the mesh (by skin weight and colour) and its roughness re-centred there,
# keeping the source's own variation; metallic goes to 0 (no metal on him but the buckles' few texels).
ROUGH = {"skin": (0.5, 0.35), "hair": (0.58, 0.4), "leather": (0.5, 0.5)}


def refine_orm(mesh, tex, hue, sat, val, leather):
    """Rewrite tex["orm"] in place: roughness per material class (skin, hair, leather; cloth as supplied),
    metallic to 0. Classes per vertex: skin = head, neck, hands and the bare forearms in the skin hue;
    hair = the dark crown; leather = the kit mask. Rasterized into UV space per face and feathered."""
    from PIL import Image, ImageDraw, ImageFilter
    me = mesh.data
    gid = {g.index: g.name for g in mesh.vertex_groups}
    nv = len(me.vertices)
    dom = [""] * nv
    best = np.zeros(nv)
    for v in me.vertices:
        for g in v.groups:
            if g.weight > best[v.index]:
                best[v.index] = g.weight
                dom[v.index] = gid.get(g.group, "")
    z = np.array([v.co.z for v in me.vertices])
    head_top = z.max()
    skinhue = (hue > 4) & (hue < 34) & (sat > 0.25) & (sat < 0.7) & (val > 0.3)
    cls = np.zeros(nv, np.int8)  # 0 cloth, 1 skin, 2 hair, 3 leather
    for i in range(nv):
        d = dom[i].split(".")[0]
        if leather[i]:
            cls[i] = 3
        elif d in ("head", "neck"):
            cls[i] = 2 if (val[i] < 0.3 and z[i] > head_top - 0.16) else 1 if skinhue[i] or val[i] >= 0.3 else 2
        elif d in ("hand", "fingers") or (d == "forearm" and skinhue[i]):
            cls[i] = 1
    W, H = Image.open(tex["orm"]).size
    masks = {c: Image.new("L", (W, H), 0) for c in (1, 2, 3)}
    draws = {c: ImageDraw.Draw(m) for c, m in masks.items()}
    uvl = me.uv_layers.active.data
    for poly in me.polygons:
        vs = [me.loops[li].vertex_index for li in poly.loop_indices]
        cs = [int(cls[v]) for v in vs]
        c = max(set(cs), key=cs.count)
        if c == 0:
            continue
        pts = [(uvl[li].uv[0] * W, (1.0 - uvl[li].uv[1]) * H) for li in poly.loop_indices]
        draws[c].polygon(pts, fill=255)
    orm = np.asarray(Image.open(tex["orm"]).convert("RGB")).astype(np.float32) / 255.0
    r = orm[..., 1].copy()
    for c, name in ((1, "skin"), (2, "hair"), (3, "leather")):
        # grow over the islands' padding, then feather the edge
        m = masks[c].filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2))
        w = np.asarray(m).astype(np.float32) / 255.0
        mid, k = ROUGH[name]
        rc = np.clip(mid + k * (orm[..., 1] - 0.91), 0.3, 0.95)
        r = r * (1 - w) + rc * w
    orm[..., 1] = r
    orm[..., 2] = 0.0
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(tex["orm"])
    counts = {n: int((np.asarray(masks[c]) > 0).sum()) for c, n in ((1, "skin"), (2, "hair"), (3, "leather"))}
    print("  orm: texels per class", counts, flush=True)
    return masks
