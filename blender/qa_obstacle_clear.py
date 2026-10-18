"""Clearance of the obstacle moves against the real kit pieces, on the built runner's skinned mesh.

    python3 blender/qa_obstacle_clear.py          (needs blender/cache/runner_src_model.blend: build first)

The obstacle director lines each move's apex (the middle of takeoff → landing) up with its piece's
centre. The moves play in step with the run, so in clip time the floor moves back at 5 m/s at the base
tier and up to ~8.3 m/s when the clip rate saturates (high tiers). For each clip and floor speed this
samples the posed mesh every quarter frame and reports the worst gap between the body and the piece:
  log      log_fallen_0 lying across: a Ø 0.84 m trunk, centre 0.37 m up (top 0.79 m)
  pillar   pillar_topple_0: Ø 0.95 m, centre 0.45 m (the vaulting hand is allowed on it)
  lintel   beam_lintel_0: underside 1.32 m, 0.62 m deep (the bough: 1.2 m at its low end)
  gap      leap_gap over open water: nothing below the deck (z < 0) between the slab edges
Positive = clear (cm). It also prints the lowest foot height at the apex of the jumps.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import numpy as np

from common import CACHE

bpy.ops.wm.open_mainfile(filepath=os.path.join(CACHE, "runner_src_model.blend"))
rig = bpy.data.objects["runner"]
mesh = bpy.data.objects["runner_mesh"]
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
import runner_anim as A  # noqa: E402

A.build(rig)
sc = bpy.context.scene
FPS = A.FPS

# Dominant bone per vertex (to let the vaulting hand touch the pillar, and to find the feet).
names = {g.index: g.name for g in mesh.vertex_groups}
dom = []
for v in mesh.data.vertices:
    best = max(v.groups, key=lambda g: g.weight, default=None)
    dom.append(names.get(best.group, "") if best else "")
dom = np.array(dom)
hand_r = np.isin(dom, ["hand.R", "fingers.R", "forearm.R"])
feet = np.array([d.startswith(("foot.", "toe.")) for d in dom])


def verts(action, t):
    rig.animation_data.action = bpy.data.actions[action]
    f = 1 + t * FPS
    sc.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    m = ev.to_mesh()
    co = np.empty(len(m.vertices) * 3)
    m.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    co = co.reshape(-1, 3)
    M = np.array(mesh.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3]
    # Forward is +Y in the rig's space (key(): y forward → hips local −Z = world +Y).
    return co[:, 1], co[:, 2]


def circle_top(x, r, cy):
    return np.where(np.abs(x) < r, cy + np.sqrt(np.maximum(0.0, r * r - x * x)), -9.0)


def check(action, take, land, kind, speeds=(5.0, 8.3)):
    apex = 0.5 * (take + land)
    out = []
    for V in speeds:
        worst = 9.0
        at = None
        t = max(0.0, take - 0.25)
        while t <= land + 0.25:
            F, Z = verts(action, t)
            X = F - V * (apex - t)
            if kind == "log":
                gap = Z - circle_top(X, 0.42, 0.37)
                m = np.abs(X) < 0.42
            elif kind == "pillar":
                gap = Z - circle_top(X, 0.475, 0.45)
                m = (np.abs(X) < 0.475) & ~hand_r
            elif kind == "lintel":
                gap = 1.32 - Z
                m = np.abs(X) < 0.31
            elif kind == "bough":
                gap = 1.2 - Z
                m = np.abs(X) < 0.35
            else:
                gap = Z
                m = np.full(Z.shape, take + 0.03 <= t <= land - 0.03)
            if m.any():
                idx = np.where(m)[0]
                k = idx[np.argmin(gap[idx])]
                g = float(gap[k])
                if g < worst:
                    worst, at, who = g, t, f"{dom[k]} x{X[k]:+.2f} z{Z[k]:.2f}"
            t += 0.25 / FPS
        out.append(f"{V:.1f} m/s: worst {worst * 100:+.1f} cm at t={at:.3f}s ({who})" if at is not None else f"{V:.1f} m/s: never over it")
    print(f"  {action:10s} vs {kind:6s} " + " | ".join(out), flush=True)


def feet_at(action, t):
    F, Z = verts(action, t)
    pb = rig.pose.bones
    hz = (rig.matrix_world @ pb["hips"].head).z
    kz = [(rig.matrix_world @ pb[f"shin.{s}"].head).z for s in "LR"]
    az = [(rig.matrix_world @ pb[f"foot.{s}"].head).z for s in "LR"]
    print(f"    {action} t={t:.3f}: body min {Z.min():.2f} max {Z.max():.2f} hips {hz:.2f} knees {kz[0]:.2f}/{kz[1]:.2f} ankles {az[0]:.2f}/{az[1]:.2f}", flush=True)
    return float(Z[feet].min())


OB = {  # clip seconds, mirrors runner.ts OBSTACLES
    "jump_log": (5 / 30, 18 / 30),
    "leap_gap": (6 / 30, 21 / 30),
    "slide": (6 / 30, 20 / 30),
    "vault": (5 / 30, 16 / 30),
}
for name, (tk, ld) in OB.items():
    if name in bpy.data.actions:
        r = bpy.data.actions[name].frame_range
        print(f"{name}: frames {r[0]:.0f}–{r[1]:.0f}, takeoff {tk:.3f}s, land {ld:.3f}s, apex {(tk + ld) / 2:.3f}s", flush=True)
import json  # noqa: E402

over = json.loads(os.environ.get("QA_OB", "{}"))
OB.update({k: tuple(v) for k, v in over.items()})
print("== clearance (cm, + = clear)")
check("jump_log", *OB["jump_log"], "log")
check("vault", *OB["vault"], "pillar")
check("slide", *OB["slide"], "lintel")
check("slide", *OB["slide"], "bough")
check("leap_gap", *OB["leap_gap"], "gap")
for name in ("jump_log", "vault", "slide"):
    tk, ld = OB[name]
    print(f"  {name} lowest foot at the apex: {feet_at(name, 0.5 * (tk + ld)) * 100:.0f} cm", flush=True)
os._exit(0)
