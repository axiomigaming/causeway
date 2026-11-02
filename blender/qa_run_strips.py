"""Eye-check strips for the gait clips, straight from an exported glb.

    python3 blender/qa_run_strips.py -- <runner.glb> <out.png> <clip>[:S] … [--step 2] [--views back,q34,side]

One sheet per call: a row per (clip, view), a tile every `--step` frames of one cycle. The floor (a
0.25 m checker) scrolls back by S m per cycle when S is given, as it does in the game, so a planted
foot reads still against it and a skating one slides. Views: `back` (the chase camera: behind, a little
above), `q34` (three-quarter from behind), `side` (sagittal, for the biomechanics).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector, Euler

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
opts = {}
pos = []
i = 0
while i < len(args):
    if args[i].startswith("--"):
        opts[args[i][2:]] = args[i + 1]
        i += 2
    else:
        pos.append(args[i])
        i += 1
glb, out = pos[0], pos[1]
clips = pos[2:]
STEP = int(opts.get("step", 2))
VIEWS = opts.get("views", "back,q34,side").split(",")
RES = tuple(int(x) for x in opts.get("res", "200x280").split("x"))
MAXF = int(opts.get("frames", 0))

if glb.endswith(".blend"):
    # A working file straight from the animation build (blender/cache/…): its rig and clips as they are.
    bpy.ops.wm.open_mainfile(filepath=glb)
    for o in list(bpy.data.objects):
        if o.type in ("LIGHT", "CAMERA") or o.name == "ground":
            bpy.data.objects.remove(o)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = int(opts.get("samples", 10))
sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = RES
sc.view_settings.view_transform = "Standard"
sc.render.fps = 30
if not glb.endswith(".blend"):
    bpy.ops.import_scene.gltf(filepath=glb)
rig = next(o for o in sc.objects if o.type == "ARMATURE")

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
fl = bpy.context.active_object
m = bpy.data.materials.new("floor")
m.use_nodes = True
nt = m.node_tree
bs = nt.nodes["Principled BSDF"]
ck = nt.nodes.new("ShaderNodeTexChecker")
ck.inputs["Scale"].default_value = 120.0  # 0.25 m checks: the pattern repeats every 0.5 m
ck.inputs["Color1"].default_value = (0.40, 0.34, 0.28, 1)
ck.inputs["Color2"].default_value = (0.52, 0.46, 0.38, 1)
nt.links.new(ck.outputs[0], bs.inputs["Base Color"])
fl.data.materials.append(m)
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
ld = bpy.data.lights.new("sun", "SUN")
ld.energy = 3.5
sun = bpy.data.objects.new("sun", ld)
sun.rotation_euler = Euler((math.radians(20), math.radians(10), math.radians(30)))
sc.collection.objects.link(sun)
cd = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cd)
sc.collection.objects.link(cam)
sc.camera = cam

# The runner faces +Y here. The chase camera sits ~4 m behind, ~1.3 m above his hips, looking slightly down.
CAMS = {
    "back": ((0.0, -4.2, 2.1), (0, 0.6, 0.95), 40),
    "q34": ((2.6, -2.8, 1.6), (0, 0.2, 0.9), 40),
    "side": ((3.4, 0.0, 0.95), (0, 0.0, 0.88), 38),
}


def aim(loc, target, lens):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cd.lens = lens


def label(img, text_rows):
    return img


rows = []
tmp = os.path.splitext(out)[0] + "_tmp.png"
for spec in clips:
    name, S = (spec.split(":") + [None])[:2]
    S = float(S) if S else 0.0
    act = bpy.data.actions.get(name) or next((a for a in bpy.data.actions if a.name == name or a.name.startswith(name + "_")), None)
    if act is None:
        print("no clip", name)
        continue
    rig.animation_data.action = act
    f0, f1 = (int(round(x)) for x in act.frame_range)
    n = f1 - f0
    if MAXF:
        f1 = min(f1, f0 + MAXF)
    for view in VIEWS:
        loc, tgt, lens = CAMS[view]
        aim(loc, tgt, lens)
        tiles = []
        for fr in range(f0, f1, STEP):
            sc.frame_set(fr)
            fl.location.y = -(S * (fr - f0) / n) % 0.5 if S else 0.0
            sc.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(tmp)
            a = np.array(im.pixels[:], np.float32).reshape(im.size[1], im.size[0], 4)
            bpy.data.images.remove(im)
            a[:, -1, :3] = 0.15  # a hairline between tiles
            tiles.append(a)
        rows.append(np.concatenate(tiles, axis=1))
        print(f"  {name} {view}: {len(tiles)} tiles", flush=True)
W = max(r.shape[1] for r in rows)
rows = [np.pad(r, ((0, 0), (0, W - r.shape[1]), (0, 0)), constant_values=1.0) for r in rows]
sheet = np.concatenate(rows[::-1], axis=0)  # images are bottom-up: the first row goes on top
o = bpy.data.images.new("strip", sheet.shape[1], sheet.shape[0], alpha=True)
o.pixels[:] = sheet.ravel()
o.filepath_raw = out
o.file_format = "PNG"
o.save()
if os.path.exists(tmp):
    os.remove(tmp)
print("wrote", out, sheet.shape, flush=True)
