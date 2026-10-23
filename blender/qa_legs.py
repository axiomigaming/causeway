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
  still      a frozen body in the air: the longest run of airborne frames (no part of the body on the
             floor, or the pelvis dropping faster than 1 m/s) whose total joint angular speed (sum over
             the trunk, head and limb joints) stays under STILL deg/frame (frames)
  spine      the trunk (chest against the pelvis) at its worst, as % of the natural range: twist 45°,
             forward bend 75°, back arch 35°, side bend 40°
  neck       the head against the chest, % of range: turn 70°, chin down 55°, back 60°, tilt 40°
  wrist      the hand against the forearm, % of 75°
  shrug      a shoulder hiked toward the neck (the shoulder bone's rotation), % of 25°
Flags: hinge > 10°, foot yaw > 25°, roll > 20°, cross > 2 cm, hands > 2 cm, slide > 1 cm, still > 3 frames,
spine / neck / wrist / shrug > 100 %.
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
LIM = dict(hinge=10.0, yaw=25.0, roll=20.0, cross=2.0, hands=2.0, slide=1.0, pop=60.0, still=3.0,
           spine=100.0, neck=100.0, wrist=100.0, shrug=100.0)
STILL = 25.0  # deg per frame (at 30 fps), summed over MOVERS: under it, a body in the air reads as a held pose
RAD = {"hips": 0.12, "spine": 0.11, "chest": 0.12, "neck": 0.06, "head": 0.1, "upper_arm": 0.05, "forearm": 0.04,
       "hand": 0.03, "thigh": 0.075, "shin": 0.05}
MOVERS = ["hips", "spine", "chest", "neck", "head"] + [f"{b}.{s}" for s in "LR" for b in ("thigh", "shin", "foot", "upper_arm", "forearm", "hand")]


def axis(b, i):
    m = (M @ pb[b].matrix).to_3x3()
    return Vector((m[0][i], m[1][i], m[2][i])).normalized()


def P(b, tail=False):
    return M @ (pb[b].tail if tail else pb[b].head)


def ang(u, v):
    return math.degrees(math.acos(max(-1.0, min(1.0, abs(u.dot(v))))))


def wq(b):
    return (M @ pb[b].matrix).to_quaternion()


def rom(parent, child, twist, flex, ext, side):
    """% of the natural range used by `child` against `parent` (twist about the bone, bend forward/back,
    bend sideways). Forward bend is −X in this rig (torso() leans with negative X rotations)."""
    rest = rig.data.bones[parent].matrix_local.to_quaternion().inverted() @ rig.data.bones[child].matrix_local.to_quaternion()
    q = rest.inverted() @ (wq(parent).inverted() @ wq(child))  # in the child's rest frame, from rest
    sw, tw = q.to_swing_twist("Y")
    e = sw.to_euler("XYZ")
    pitch, roll = math.degrees(e.x), math.degrees(e.z)
    return max(abs(math.degrees(tw)) / twist, (-pitch / flex if pitch < 0 else pitch / ext), abs(roll) / side) * 100


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
    run = 0
    hz_prev = 0.0
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        speed = 0.0
        for b in MOVERS:
            if b in pb and b in qprev:
                d = math.degrees(pb[b].matrix_basis.to_quaternion().rotation_difference(qprev[b]).angle)
                speed += min(d, 360 - d)
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
        soles = []
        for s in "LR":
            hz = P(f"foot.{s}").z - 0.09
            tz = (P(f"toe.{s}", tail=True) if f"toe.{s}" in pb else P(f"foot.{s}", tail=True)).z
            soles.append(min(hz, tz))
        body = min(min((M @ b.head).z, (M @ b.tail).z) - RAD[b.name.split(".")[0]] for b in pb if b.name.split(".")[0] in RAD)
        hz = hips.z
        falling = f > f0 and (hz - hz_prev) * 30 < -1.0
        hz_prev = hz
        airborne = (min(soles) > 0.05 and body > 0.04) or falling
        if os.environ.get("QA_SPEED") and airborne:
            print(f"  {act.name} f{f} air speed {speed:5.1f}", flush=True)
        if airborne and f > f0 and speed < STILL:
            run += 1
            if run > worst["still"][0]:
                worst["still"] = (run, f)
        else:
            run = 0
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
            # (A foot lying on its side under a body that is down is not a plant.)
            planted = -0.05 < sole < 0.03 and hips.z - sole > 0.45
            if planted:
                w = math.degrees(math.asin(min(1.0, abs(axis(f"foot.{s}", 0).z))))
                if w > worst["roll"][0]:
                    worst["roll"] = (w, f)
                lat = (heel - hips).dot(side) * (1 if s == "L" else -1)
                w = max(0.0, -lat * 100)
                if w > worst["cross"][0]:
                    worst["cross"] = (w, f)
                # Measured at the ball of the foot: the pivot of a turn on the spot and of a heel rolling up.
                rel = (P(f"toe.{s}") if f"toe.{s}" in pb else heel) - root
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
        for k, w in (("spine", rom("hips", "chest", 45, 75, 35, 40)), ("neck", rom("chest", "head", 70, 55, 60, 40))):
            if w > worst[k][0]:
                worst[k] = (w, f)
        for s in "LR":
            a = math.degrees(pb[f"hand.{s}"].matrix_basis.to_quaternion().angle)
            w = min(a, 360 - a) / 75 * 100
            if w > worst["wrist"][0]:
                worst["wrist"] = (w, f)
            if f"shoulder.{s}" in pb:
                w = math.degrees(pb[f"shoulder.{s}"].matrix_basis.to_quaternion().angle) / 25 * 100
                if w > worst["shrug"][0]:
                    worst["shrug"] = (w, f)
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
