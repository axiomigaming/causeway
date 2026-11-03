"""The gait blends (run → sprint → dash), as the game mixes them: planted-foot drift and joint steps.

    python3 blender/qa_gait_blend.py            (needs blender/cache/runner_src_model.blend: build first)

The runtime plays the three gait clips on one stride phase and mixes them by the run tier (gaitMix in
src/world/runner.ts); the cadence is speed / the blended stride (STRIDE), so a planted foot keeps pace with
the floor only if the blended pose plants it. For each pair at mix weights 0.25 / 0.5 / 0.75 this blends the
clips' bone rotations (normalized quaternion sum, as three's mixer does) and the root, scrolls the floor
back at the blended stride, and reports, at the cadence the game would run that mix at:
  drift   worst horizontal slip of a planted sole point against the floor (cm per game frame)
  step    worst joint rotation step per game frame (deg) — a snap shows here
Bar: drift ≤ 1.5 cm/frame, step ≤ 25°/frame (judged by the motion critic in the game too).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Quaternion, Vector  # noqa: E402

from common import CACHE  # noqa: E402

bpy.ops.wm.open_mainfile(filepath=os.path.join(CACHE, "runner_src_model.blend"))
rig = bpy.data.objects["runner"]
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
import runner_anim as A  # noqa: E402

A.RIG = rig
A.configure(rig)
for p in rig.pose.bones:
    p.rotation_mode = "XYZ"
GAITS = {"run": A.RUN, "sprint": A.SPRINT, "dash": A.DASH}
for nm, G in GAITS.items():
    A.gait_clip(nm, G)
    for fc in bpy.data.actions[nm].fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"  # as exported (the glTF is sampled per key and played linearly)
S = {nm: G["D"] / G["ts"] for nm, G in GAITS.items()}
sc = bpy.context.scene
N = 240


def sample(nm):
    """Per phase sample: {bone: (quat, loc)} of clip nm."""
    act = bpy.data.actions[nm]
    rig.animation_data.action = act
    f0, f1 = act.frame_range
    out = []
    for i in range(N):
        fr = f0 + (f1 - f0) * i / N
        sc.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
        out.append({pb.name: (pb.matrix_basis.to_quaternion(), pb.matrix_basis.to_translation()) for pb in rig.pose.bones})
    return out


CLIPS = {nm: sample(nm) for nm in GAITS}
rig.animation_data.action = None
names = [pb.name for pb in rig.pose.bones]


def blended(a, b, w, i):
    """Blend sample i of clips a and b at weight w onto the rig; return bone quaternions and the
    world positions of the ankles (foot) and balls (toe), as the motion critic reads them."""
    pa, pbz = CLIPS[a][i], CLIPS[b][i]
    qs = {}
    for nm in names:
        qa, la = pa[nm]
        qb, lb = pbz[nm]
        if qa.dot(qb) < 0:
            qb = -qb
        q = Quaternion([(1 - w) * x + w * y for x, y in zip(qa, qb)])
        q.normalize()
        pb = rig.pose.bones[nm]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = q
        pb.location = la.lerp(lb, w)
        qs[nm] = q
    bpy.context.view_layer.update()
    pts = {f"{k}{s}": (rig.matrix_world @ rig.pose.bones[f"{k}.{s}"].head).copy() for k in ("foot", "toe") for s in "LR"}
    return qs, pts


def lerp_at(seq, p):
    f = (p % 1.0) * N
    i = int(f) % N
    return i, (i + 1) % N, f - int(f)


PLANT_H, PLANT_VY = 0.02, 0.01  # the critic's: within 2 cm of the lowest height seen, still vertically
worst = {"slide": 0.0, "step": 0.0, "snap": 0.0}
for a, b, v in (("run", "sprint", 7.9), ("sprint", "dash", 10.5)):
    for w in (0.0, 0.25, 0.5, 0.75, 1.0):
        Sb = (1 - w) * S[a] + w * S[b]
        cad = v / Sb
        dph = cad / 30.0  # stride phase per game frame
        samp = [blended(a, b, w, i) for i in range(N)]
        low = {k: min(s_[1][k].z for s_ in samp) for k in samp[0][1]}
        frames = []
        for kf in range(int(3 / dph)):  # three cycles of game frames, from an off-key phase
            i, j, u = lerp_at(samp, 0.013 + kf * dph)
            P = {k: samp[i][1][k].lerp(samp[j][1][k], u) for k in low}
            Q = {nm: samp[i][0][nm].slerp(samp[j][0][nm], u) for nm in names}
            frames.append((P, Q))
        slide = step = snap = 0.0
        snap_at = slide_at = step_at = "-"
        step_kf = 0
        om_prev = None
        oms = []
        for kf in range(1, len(frames)):
            (P0, Q0), (P1, Q1) = frames[kf - 1], frames[kf]
            for k in low:
                h0, h1 = P0[k].z, P1[k].z
                if h0 < low[k] + PLANT_H and h1 < low[k] + PLANT_H and abs(h1 - h0) < PLANT_VY:
                    # The floor scrolls back Sb per cycle: a still foot moves back with it.
                    d = math.hypot(P1[k].x - P0[k].x, P1[k].y - P0[k].y + Sb * dph)
                    if d * 100 > slide:
                        slide, slide_at = d * 100, f"{k} ph {(0.013 + kf * dph) % 1.0:.2f} h {(h1 - low[k]) * 100:.1f}cm"
            om = {nm: math.degrees(Q0[nm].rotation_difference(Q1[nm]).angle) for nm in names}
            om = {nm: min(x, 360 - x) for nm, x in om.items()}
            oms.append(om)
            nm_ = max(om, key=om.get)
            if om[nm_] > step:
                step, step_at, step_kf = om[nm_], nm_, len(oms) - 1
        if os.environ.get("DBG") == f"{a}{w}":
            for kf, om in enumerate(oms[:int(1 / dph) + 2]):
                ph_ = (0.013 + (kf + 1) * dph) % 1.0
                print(f"   ph {ph_:.3f} foot.L {om['foot.L']:5.1f} foot.R {om['foot.R']:5.1f} toe.L {om['toe.L']:5.1f} shin.L {om['shin.L']:5.1f} thigh.L {om['thigh.L']:5.1f}  footL z {frames[kf + 1][0]['footL'].z:.3f}")
        # A snap (the critic's pop): a frame's step over 25° and over 3x both neighbours'.
        for kf in range(1, len(oms) - 1):
            for nm in names:
                x = oms[kf][nm]
                if x > 25 and x > 3 * oms[kf - 1][nm] and x > 3 * oms[kf + 1][nm] and x > snap:
                    snap, snap_at = x, nm
        worst["slide"] = max(worst["slide"], slide)
        worst["step"] = max(worst["step"], step)
        worst["snap"] = max(worst["snap"], snap)
        print(f"{a}→{b} w {w:.2f}: S {Sb:.2f} m/cycle, {cad:.2f} cycles/s at {v} m/s: planted slide {slide:.2f} cm/frame ({slide_at}), "
              f"largest joint step {step:.0f}°/frame ({step_at}: "
              f"{' '.join(f'{oms[k][step_at]:.0f}' for k in range(max(0, step_kf - 2), min(len(oms), step_kf + 3)) if step_at != '-')}), "
              f"snaps {snap:.0f}° ({snap_at})", flush=True)
print(f"worst: slide {worst['slide']:.2f} cm/frame (bar 1.5); snaps {worst['snap']:.0f}° (none over 25°/frame wanted); "
      f"largest smooth joint speed {worst['step']:.0f}°/frame")
