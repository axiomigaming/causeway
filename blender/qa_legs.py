"""Limb sanity for every runner clip, on the built rig — run after a build.

    python3 blender/qa_legs.py [clip ...]        (needs blender/cache/runner_src_model.blend)

Per clip, sampled every frame, the worst value and where:
  hinge      knee bending outside the leg's hinge plane: angle between the thigh's and the shin's
             hinge (X) axes (deg; a true hinge is 0)
  foot yaw   the foot turned against the shin about the leg: angle between the foot's and the shin's
             hinge axes (deg)
  roll       a planted foot (sole within 3 cm of the floor) rolled onto its edge: tilt of the foot's
             hinge axis out of level (deg)
  cross      a planted foot past the body's midline toward the other side (cm, pelvis frame)
  hands      a hand inside the trunk (capsule from the pelvis to the neck, r 0.12 m) (cm deep)
  pop        the largest change of any bone's rotation from one frame to the next (deg)
  slide      a planted foot drifting while it stays planted (cm per frame); plants inside a clip's
             running stretch, moving straight back at run pace with the floor, are not slides
Flags: hinge > 10°, foot yaw > 25°, roll > 20°, cross > 2 cm, hands > 2 cm, slide > 1 cm.
(The gaits' slip against the moving floor is qa_gait_audit.py's job; root motion is subtracted here.)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector

from common import CACHE

bpy.ops.wm.open_mainfile(filepath=os.path.join(CACHE, "runner_src_model.blend"))
rig = bpy.data.objects["runner"]
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
import runner_anim as A  # noqa: E402

A.build(rig)
sc = bpy.context.scene
pb = rig.pose.bones
M = rig.matrix_world
only = [a for a in sys.argv[1:] if not a.startswith("-")]
LIM = dict(hinge=10.0, yaw=25.0, roll=20.0, cross=2.0, hands=2.0, slide=1.0, pop=60.0)


def axis(b, i):
    m = (M @ pb[b].matrix).to_3x3()
    return Vector((m[0][i], m[1][i], m[2][i])).normalized()


def P(b, tail=False):
    return M @ (pb[b].tail if tail else pb[b].head)


def ang(u, v):
    return math.degrees(math.acos(max(-1.0, min(1.0, abs(u.dot(v))))))


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


rows = []
for act in sorted(bpy.data.actions, key=lambda a: a.name):
    if only and act.name not in only:
        continue
    if not any(fc.data_path.startswith("pose.bones") for fc in act.fcurves):
        continue
    rig.animation_data.action = act
    f0, f1 = (int(x) for x in act.frame_range)
    worst = {k: (0.0, 0) for k in LIM}
    prev = {}
    qprev = {}
    popbone = [""]
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        for b in pb:
            q = b.matrix_basis.to_quaternion()
            if b.name in qprev:
                d = math.degrees(q.rotation_difference(qprev[b.name]).angle)
                d = min(d, 360 - d)
                if d > worst["pop"][0]:
                    worst["pop"] = (d, f)
                    popbone[0] = b.name
            qprev[b.name] = q
        hips = P("hips")
        root = P("root") if "root" in pb else Vector((0, 0, 0))
        side = axis("hips", 0)  # the pelvis's left (+X)
        for s in "LR":
            w = abs(ang(axis(f"thigh.{s}", 0), axis(f"shin.{s}", 0)))
            if w > worst["hinge"][0]:
                worst["hinge"] = (w, f)
            w = ang(axis(f"shin.{s}", 0), axis(f"foot.{s}", 0))
            if w > worst["yaw"][0]:
                worst["yaw"] = (w, f)
            heel = P(f"foot.{s}")
            toe = P(f"toe.{s}", tail=True) if f"toe.{s}" in pb else P(f"foot.{s}", tail=True)
            sole = min(heel.z - 0.09, toe.z)
            planted = -0.05 < sole < 0.03
            if planted:
                w = math.degrees(math.asin(min(1.0, abs(axis(f"foot.{s}", 0).z))))
                if w > worst["roll"][0]:
                    worst["roll"] = (w, f)
                lat = (heel - hips).dot(side) * (1 if s == "L" else -1)
                w = max(0.0, -lat * 100)
                if w > worst["cross"][0]:
                    worst["cross"] = (w, f)
                rel = heel - root
                if s in prev and prev[s] is not None:
                    dx, dy = rel.x - prev[s].x, rel.y - prev[s].y
                    w = math.hypot(dx, dy) * 100
                    # A plant inside a running stretch of a clip moves back with the floor (it does at
                    # runtime too): straight back at run pace. Anything else that moves is a slide.
                    floor = dy < 0 and abs(dx) < 0.3 * abs(dy) and 8 < w < 45
                    if act.name not in ("run", "sprint", "dash") and not floor and w > worst["slide"][0]:
                        worst["slide"] = (w, f)
                prev[s] = rel
            else:
                prev[s] = None
        a0, a1 = P("spine"), P("neck")
        for s in "LR":
            for pt in (P(f"hand.{s}"), P(f"hand.{s}", tail=True)):
                w = max(0.0, (0.12 - seg_dist(pt, a0, a1)) * 100)
                if w > worst["hands"][0]:
                    worst["hands"] = (w, f)
    flags = [k for k in LIM if worst[k][0] > LIM[k]]
    rows.append((act.name, worst, flags))
    cells = "  ".join(f"{k} {worst[k][0]:5.1f}@{worst[k][1]:<3d}" for k in LIM)
    print(f"{act.name:16s} {cells} [{popbone[0]}]  {'FLAG ' + ','.join(flags) if flags else 'ok'}", flush=True)
bad = [r for r in rows if r[2]]
print(f"== {len(rows)} clips, {len(bad)} flagged", flush=True)
os._exit(0)
