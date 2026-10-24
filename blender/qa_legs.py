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
  thightw/sw a thigh wrung about its length (% of 55°) / swung from bind (% of 135°)
  armtw      an upper arm wrung about its length (twist from bind), % of 90°
  shrug      a shoulder hiked toward the neck (the shoulder bone's rotation), % of 25°
  judder     the joints' angular speed zig-zagging frame to frame at real playback speed (the gaits at
             their in-game cadence, ~3 clip frames per game frame; the rest at 30 fps): per joint,
             J = mean |w_t - (w_t-1 + w_t+1)/2| / mean w (the motion critic's measure; a smooth cycle
             reads ~0.1-0.2), the worst joint
  jerk       the largest angular acceleration of any joint at playback speed (deg/frame^2)
Flags: judder > 0.35 (gaits), hinge > 10°, foot yaw > 25°, roll > 20°, cross > 2 cm, hands > 2 cm, slide > 1 cm, still > 3 frames,
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
           spine=100.0, neck=100.0, wrist=100.0, shrug=100.0, armtw=100.0, thightw=100.0, thighsw=100.0, judder=0.35, jerk=999.0)
# In-game playback: clip frames advanced per 30 fps game frame (the gaits at their usual cadence, cycles/s
# x 48 keys / 30), everything else in real time.
PLAY = {"run": 1.95 * 48 / 30, "sprint": 2.3 * 48 / 30, "dash": 2.55 * 48 / 30}
JOINTS = ["hips", "spine", "chest", "neck", "head"] + [f"{b}.{s}" for s in "LR" for b in ("thigh", "shin", "foot", "toe", "upper_arm", "forearm", "hand")]


def judder_of(act):
    """(worst J, joint, max jerk deg/frame^2) for an action at its playback speed."""
    f0, f1 = act.frame_range
    step = PLAY.get(act.name, 1.0)
    gait = act.name in PLAY
    span = (f1 - f0)
    n = int((span * (4 if gait else 1)) / step)
    seqs = []
    for off in ((0.0, 0.37, 0.71) if gait else (0.0,)):
        qs = []
        for i in range(n):
            t = f0 + ((off * step + i * step) % span if gait else min(span, i * step))
            sc.frame_set(int(t), subframe=t - int(t))
            qs.append({j: pb[j].matrix_basis.to_quaternion() for j in JOINTS if j in pb})
        seqs.append(qs)
    worst, wj, jerk = 0.0, "", 0.0
    for j in JOINTS:
        if j not in pb:
            continue
        num = den = 0.0
        cnt = 0
        for qs in seqs:
            w = []
            for a, b in zip(qs, qs[1:]):
                d = math.degrees(b[j].rotation_difference(a[j]).angle)
                w.append(min(d, 360 - d))
            for i in range(1, len(w) - 1):
                num += abs(w[i] - 0.5 * (w[i - 1] + w[i + 1]))
                den += w[i]
                cnt += 1
                jerk = max(jerk, abs(w[i] - w[i - 1]))
        if cnt and den > cnt * 0.5:  # (a joint that hardly moves cannot judder visibly)
            J = num / max(den, cnt)
            if os.environ.get("QA_J") and gait:
                print(f"  J {act.name} {j} {J:.2f}", flush=True)
            if J > worst:
                worst, wj = J, j
    return worst, wj, jerk
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
    hz_prev = hz_prev2 = 0.0
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
        hz_prev2 = hz_prev
        hz_prev = hz
        moving = f > f0 and abs(hz - hz_prev2) * 30 > 0.4
        airborne = (min(soles) > 0.05 and body > 0.04 and moving) or falling
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
            # The upper arm wrung about its own length (twist from the bind pose), % of 90°.
            sw_, tw_ = pb[f"upper_arm.{s}"].matrix_basis.to_quaternion().to_swing_twist("Y")
            w = abs(math.degrees(tw_)) / 90 * 100
            if w > worst["armtw"][0]:
                worst["armtw"] = (w, f)
            # The thigh wrung about its length (% of 55°) and swung (% of 135°) from bind (the critic's limits).
            sw_, tw_ = pb[f"thigh.{s}"].matrix_basis.to_quaternion().to_swing_twist("Y")
            tw_ = math.atan2(math.sin(tw_), math.cos(tw_))
            w = abs(math.degrees(tw_)) / 55 * 100
            if w > worst["thightw"][0]:
                worst["thightw"] = (w, f)
            a = math.degrees(sw_.angle)
            w = min(a, 360 - a) / 135 * 100
            if w > worst["thighsw"][0]:
                worst["thighsw"] = (w, f)
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
    J, jj, jerk = judder_of(act)
    worst["judder"] = (J, 0)
    worst["jerk"] = (jerk, 0)
    if act.name not in PLAY:
        J = 0.0  # one-shots: reported, flagged only in the gaits (their curves are keyed by hand)
    flags = [k for k in LIM if (worst[k][0] > LIM[k] if k != "judder" else J > LIM[k])]
    popbone[0] += f" J:{jj}"
    rows.append((act.name, worst, flags))
    cells = "  ".join(f"{k} {worst[k][0]:5.1f}@{worst[k][1]:<3d}" for k in LIM)
    print(f"{act.name:16s} {cells} [{popbone[0]}]  {'FLAG ' + ','.join(flags) if flags else 'ok'}", flush=True)
bad = [r for r in rows if r[2]]
print(f"== {len(rows)} clips, {len(bad)} flagged", flush=True)
os._exit(0)
