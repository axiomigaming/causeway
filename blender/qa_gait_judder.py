"""The motion critic's gait judder measure, offline, on the gait clips (tools/motion-audit.mjs, "judder").

    python3 blender/qa_gait_judder.py            (needs blender/cache/runner_src_model.blend: build first)

Each gait is sampled at 30 fps game frames at its tier's cadence (speed / stride), over 8 cycles from an
off-key phase. Per joint, the angular step ω_t between frames; J = mean |ω_t − (ω_t−1 + ω_t+1)/2| / mean ω;
J_lp the same for the joint's curve low-passed at 4× the stride frequency. The critic flags an excess
J − J_lp over 0.1. Prints the leg joints and the worst of the rest.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Quaternion  # noqa: E402

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
CASES = (("run", A.RUN, 6.5), ("sprint", A.SPRINT, 9.0), ("dash", A.DASH, 11.8), ("dash", A.DASH, 12.6))
built = set()
sc = bpy.context.scene
JOINTS = ["spine", "chest", "neck", "head"] + [f"{b}.{s}" for b in ("thigh", "shin", "foot", "toe", "upper_arm", "forearm", "hand") for s in "LR"]


def J(qs):
    w = np.array([min(a, 360 - a) for a in (math.degrees(qs[i - 1].rotation_difference(qs[i]).angle) for i in range(1, len(qs)))])
    e = np.abs(w[1:-1] - 0.5 * (w[:-2] + w[2:]))
    return e.sum() / max(w[1:-1].sum(), len(e))


def lowpass(x, cut):
    e = np.concatenate([x, x[::-1]])
    F = np.fft.rfft(e)
    k = np.arange(len(F)) / len(e)
    F[k > cut] = 0
    return np.fft.irfft(F, len(e))[: len(x)]


worst_all = 0.0
for nm, G, v in CASES:
    if nm not in built:
        A.gait_clip(nm, G)
        for fc in bpy.data.actions[nm].fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        built.add(nm)
    act = bpy.data.actions[nm]
    rig.animation_data.action = act
    f0, f1 = act.frame_range
    cad = v / (G["D"] / G["ts"])
    dph = cad / 30.0
    n = int(8 / dph)
    Q = {j: [] for j in JOINTS}
    for i in range(n):
        ph = (0.013 + i * dph) % 1.0
        fr = f0 + (f1 - f0) * ph
        sc.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
        for j in JOINTS:
            Q[j].append(rig.pose.bones[j].matrix_basis.to_quaternion())
    cut = 4 * dph
    res = {}
    for j in JOINTS:
        qs = Q[j]
        ref = qs[len(qs) // 2]
        rv = []
        for q in qs:
            d = ref.inverted() @ q
            if d.w < 0:
                d = -d
            ax, ang = d.to_axis_angle()
            rv.append(np.array(ax) * ang)
        rv = np.array(rv)
        lp = np.stack([lowpass(rv[:, c], cut) for c in range(3)], axis=1)
        qlp = []
        for r in lp:
            ang = np.linalg.norm(r)
            qlp.append(ref @ (Quaternion(r / ang, ang) if ang > 1e-9 else Quaternion()))
        res[j] = (J(qs), J(qlp))
        if os.environ.get("DBG") == f"{nm}{v}:{j}":
            w = [math.degrees(qs[i - 1].rotation_difference(qs[i]).angle) for i in range(1, len(qs))]
            wl = [math.degrees(qlp[i - 1].rotation_difference(qlp[i]).angle) for i in range(1, len(qlp))]
            for i in range(min(len(w), int(2 / dph) + 1)):
                print(f"   ph {(0.013 + (i + 1) * dph) % 1.0:.3f}  step {w[i]:5.1f}  lowpassed {wl[i]:5.1f}")
    # The critic's pop rule (a step over 25°/frame and over 3x both neighbours') on the legs: exempt in the
    # plain run, but every move and fall joins the stride on a strike, and its first frames are the stride's.
    pops = []
    for j in JOINTS:
        if j.split(".")[0] not in ("thigh", "shin", "foot", "toe"):
            continue
        w = [min(a, 360 - a) for a in (math.degrees(Q[j][i - 1].rotation_difference(Q[j][i]).angle) for i in range(1, len(Q[j])))]
        for i in range(1, len(w) - 1):
            if w[i] > 25 and w[i] > 3 * max(w[i - 1], w[i + 1], 2):
                pops.append((j, round(w[i]), round((0.013 + (i + 1) * dph) % 1.0, 2)))
    legs = [j for j in JOINTS if j.split(".")[0] in ("thigh", "shin", "foot", "toe")]
    rest = [j for j in JOINTS if j not in legs]
    wr = max(rest, key=lambda j: res[j][0] - res[j][1])
    worst = max(res[j][0] - res[j][1] for j in JOINTS)
    worst_all = max(worst_all, worst)
    print(f"{nm} at {v} m/s ({cad:.2f} cycles/s): " + ", ".join(f"{j} {res[j][0]:.2f}/{res[j][1]:.2f}/{res[j][0] - res[j][1]:+.2f}" for j in legs)
          + f"; worst other {wr} {res[wr][0] - res[wr][1]:+.2f}; leg pops {len(pops)} {pops[:4]}", flush=True)
print(f"worst excess {worst_all:+.2f} (critic limit +0.10)")
