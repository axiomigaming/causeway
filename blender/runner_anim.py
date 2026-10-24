"""Runner animation library (imported by build_runner.py).

Rig conventions (verified by render): down-pointing bones (thigh, shin, upper
arm, forearm, fingers) flex forward with −X, knees flex with +X; up-pointing
bones (hips, spine, chest, neck, head) lean forward with −X, yaw with +Y (the
left side comes forward, the face turns to the character's right) and roll with
+Z (the left side rises); feet point toes-down with −X.

Every clip keys every bone each key, so clips blend cleanly. The root height is
solved from contacts (soles, knees, seat) so feet meet the ground; gait cycles
add ballistic flight phases between stances.
"""
import math
import os

import bpy
from mathutils import Vector, Euler, Quaternion

from common import CACHE, preview, link, hexcol

FPS = 30
# Leg geometry (thigh, shin, hip-joint height, half the hip width). configure() measures them from the
# rig, so the contact solver and the gait IK plant this body's feet, whatever its proportions.
LT, LS, HIP_Z, HIP_W = 0.42, 0.43, 0.95, 0.1
# Rest-pose sagittal angles (forward +): the thigh's lean, the knee's bend and the shin's lean.
THIGH0, K0, A0 = 0.0, 0.0, 0.0
# Sole points relative to the ankle in the foot's rest frame (y forward, z up): heel, mid, ball, toe tip.
SOLE = [(-0.07, -0.1), (0.02, -0.1), (0.12, -0.097), (0.19, -0.078)]
BONES = None
RIG = None


def mirror(s):
    return "R" if s == "L" else "L"


def sgn(s):
    return 1 if s == "L" else -1


# ------------------------------------------------------------------ semantic pose helpers
def leg(P, s, hip=0.0, knee=0.0, ankle=0.0, toe=0.0, out=0.07, yaw=0.0):  # a hip-width base unless told otherwise
    P[f"thigh.{s}"] = (-hip, yaw, out * sgn(s))
    P[f"shin.{s}"] = (knee, 0, 0)
    P[f"foot.{s}"] = (-ankle, 0, 0)
    P[f"toe.{s}"] = (toe, 0, 0)


ARM_TWIST_MAX = math.radians(70)


def _arm_twist(x, y, z):
    tw = Euler((x, y, z)).to_quaternion().to_swing_twist("Y")[1]
    return math.atan2(math.sin(tw), math.cos(tw))


def arm(P, s, fwd=0.0, elbow=0.0, out=0.12, wrist=0.0, twist=0.0, curl=0.3, shrug=0.0, prot=0.0):
    x, y, z = -fwd, twist * sgn(s), out * sgn(s)
    # Raised arms come out of the Euler wrung about their own length (overhead, 110-170° from bind: they
    # read as twisted). Keep the aim, clamp the twist about the arm's length to ~70°.
    e = Euler((x, y, z))
    q = e.to_quaternion()
    sw, tw = q.to_swing_twist("Y")
    tw = math.atan2(math.sin(tw), math.cos(tw))
    if abs(tw) > ARM_TWIST_MAX:
        q2 = sw @ Quaternion((0.0, 1.0, 0.0), math.copysign(ARM_TWIST_MAX, tw))
        x, y, z = q2.to_euler("XYZ", e)
    P[f"upper_arm.{s}"] = (x, y, z)
    P[f"forearm.{s}"] = (-elbow, 0, 0)
    P[f"hand.{s}"] = (wrist, 0, 0)
    P[f"fingers.{s}"] = (0, 0, -curl * sgn(s))
    P[f"shoulder.{s}"] = (shrug, 0, prot * sgn(s))


def torso(P, lean=0.0, look=0.0, yaw=0.0, roll=0.0, hp=0.0, hyaw=0.0, hroll=0.0, head_yaw=0.0, head_roll=0.0, breath=0.0):
    """lean: upper body forward relative to the pelvis; hp: pelvis pitch forward; yaw/head_yaw are
    absolute (world) rotations of the chest and the head; look: head pitch up relative to the chest."""
    P["hips"] = (-hp, hyaw, hroll)
    dy = yaw - hyaw
    P["spine"] = (-lean * 0.55, dy * 0.5, roll * 0.5)
    P["chest"] = (-lean * 0.45 - breath, dy * 0.5, roll * 0.5)
    hy = head_yaw - yaw
    P["neck"] = (look * 0.6, hy * 0.6, head_roll * 0.5)
    P["head"] = (look * 0.4, hy * 0.4, head_roll * 0.5)


def contact_z(P):
    """Lowest contact point (soles, knees, seat) relative to the hip joints, sagittal plane."""
    hp = -P.get("hips", (0, 0, 0))[0]
    pts = [-0.125 - 0.02 * max(0.0, hp)]  # the seat
    for s in "LR":
        hip = -P.get(f"thigh.{s}", (0, 0, 0))[0]
        knee = P.get(f"shin.{s}", (0, 0, 0))[0]
        ankle = -P.get(f"foot.{s}", (0, 0, 0))[0]
        at = THIGH0 + hip - hp
        as_ = at - knee - K0
        af = as_ - ankle - A0
        kz = -LT * math.cos(at)
        az = kz - LS * math.cos(as_)
        pts.append(kz - 0.058 * abs(math.cos(as_ - at * 0.5)) - 0.01)
        for y, z in SOLE[:2]:
            pts.append(az + y * math.sin(af) + z * math.cos(af))
        # Ball and toes hinge at the toe joint.
        tf = af + P.get(f"toe.{s}", (0, 0, 0))[0]
        jz = az + BALL_J[0] * math.sin(af) + BALL_J[1] * math.cos(af)
        for y, z in TOE_PTS:
            pts.append(jz + y * math.sin(tf) + z * math.cos(tf))
    return min(pts)


def solve_root(P):
    return -(HIP_Z + contact_z(P))


SEAT_D = 0.125  # the seat below the hip joints (sitting on the ground)


def _sole_z(P, s, knee, ankle):
    """Lowest sole point of one leg relative to the hip joints, for a given knee bend and ankle."""
    hp = -P.get("hips", (0, 0, 0))[0]
    hip = -P.get(f"thigh.{s}", (0, 0, 0))[0]
    at = THIGH0 + hip - hp
    as_ = at - knee - K0
    af = as_ - ankle - A0
    az = -LT * math.cos(at) - LS * math.cos(as_)
    return min(az + y * math.sin(af) + z * math.cos(af) for y, z in SOLE)


def sit_ground(P, sides=("L", "R"), splay=0.0):
    """Sitting on the ground, not on an invisible chair: returns the root height that puts the seat on the
    floor, and bends each listed leg's knee until its sole is on the floor too, the sole flat (with the thighs this low, the legs lie out along the stone)."""
    hp = -P.get("hips", (0, 0, 0))[0]
    seat = -SEAT_D - 0.02 * max(0.0, hp)
    for s in sides:
        hip = -P[f"thigh.{s}"][0]
        at = THIGH0 + hip - hp
        lo, hi = 0.0, max(0.05, at - K0 - A0)  # from the shin in line with the thigh to the shin hanging plumb
        for _ in range(40):
            k = 0.5 * (lo + hi)
            as_ = at - k - K0
            if _sole_z(P, s, k, as_ - A0 + splay) > seat:
                lo = k
            else:
                hi = k
        k = 0.5 * (lo + hi)
        as_ = at - k - K0
        P[f"shin.{s}"] = (k, 0, 0)
        P[f"foot.{s}"] = (-(as_ - A0 + splay), 0, 0)
    return -(HIP_Z + seat)


def hips_loc(x, y, h):
    """The hips' pose location for a body offset of x (to his L), y (forward) and h (up) in the root's frame.
    The hips bone's rest frame is not quite level (it leans ~1.6°), so this goes through its real rest
    rotation: a long forward travel must not lift or sink the body."""
    R = RIG.data.bones["hips"].matrix_local.to_3x3()
    return R.inverted() @ Vector((x, y, h))


# Where a clip stands after a turn on the spot: later keys (given as before the turn) shift in time and
# place by this, so the body stays where the turn's steps left it. new_action() clears it.
STAGE = {"dt": 0, "x": 0.0, "y": 0.0}


def key(frame, P, z=None, y=0.0, x=0.0, lift=0.0):
    frame += STAGE["dt"]
    x += STAGE["x"]
    y += STAGE["y"]
    pb = RIG.pose.bones
    for p in pb:
        p.rotation_euler = Euler((0, 0, 0))
        p.location = Vector((0, 0, 0))
    for name, rot in P.items():
        pb[name].rotation_euler = Euler(rot)
    if z is None:
        z = solve_root(P)
    # The hips bone points up (+Z world): local X = world X, local Y = world Z, local Z = −world Y.
    pb["hips"].location = hips_loc(x, y, z + lift)
    for p in pb:
        p.keyframe_insert("rotation_euler", frame=frame)
        p.keyframe_insert("location", frame=frame)


def new_action(name):
    STAGE.update(dt=0, x=0.0, y=0.0)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    RIG.animation_data_create()
    RIG.animation_data.action = act
    return act


def sample(keys, t):
    """Periodic Catmull-Rom through (t, *values) keys."""
    n = len(keys)
    for i in range(n):
        t0 = keys[i][0]
        t1 = keys[(i + 1) % n][0] + (1.0 if i + 1 == n else 0.0)
        tt = t if t >= t0 else t + 1.0
        if t0 <= tt < t1:
            u = (tt - t0) / (t1 - t0)
            p0, p1, p2, p3 = (keys[(i + k) % n][1:] for k in (-1, 0, 1, 2))
            return [0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3)
                    for a, b, c, d in zip(p0, p1, p2, p3)]
    return list(keys[0][1:])


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ gaits
# Locomotion is solved, not keyed. Each gait is a set of biomechanical targets for one stride
# cycle (t = 0 is this foot's strike), from sprint and distance-running kinematics:
#
#   stance (0 … ts): the foot is fixed to the ground. A ground anchor slides back under the hip at
#     exactly one contact length D per stance, the foot rolls heel → flat → ball (a run) or stays on
#     the forefoot (sprint, dash), and the leg is solved by two-bone IK in the sagittal plane, so the
#     sole never skates. The hip sinks through mid-stance (the leg loads like a spring) and pushes
#     back up to toe-off.
#   flight (ts … 0.5): ballistic — the pelvis follows a parabola whose height comes from the flight
#     time at the gait's design speed (g·T²/8).
#   swing: heel recovery (the knee folds, the heel comes up under the seat — higher at speed), knee
#     drive (the thigh up to ~40° running, ~65–75° sprinting), then the shin swings out and the foot
#     paws back into the next strike. Swing keys are Hermite-joined to the IK solutions at toe-off
#     and strike, so there is no pop at either end.
#   upper body: the pelvis rotates with the swing leg and drops on the swing side after each strike;
#     the chest counter-rotates; the arms pump from the shoulder opposite the legs at ~90° elbows
#     (closing in front, opening behind), hands loose; the head holds a steady gaze against the bob,
#     the pitch and the roll. A little left/right asymmetry keeps it from reading as a mirror.
#
# S = D / ts is the ground covered per cycle when the stance foot is still: the runtime sets its
# cadence to speed / S (see STRIDE in src/world/runner.ts), so the planted foot moves with the floor.
# S is sized so the cadence that keeps the foot planted stays under the runtime's turnover cap at every
# tier (run 2.80, sprint 3.91, dash 4.84 m/cycle: ≤ 2.6 cycles/s, ~5.2 steps/s, even at 12.6 m/s); the
# contact lengths D are as long as these legs reach (the solver lowers the hips to keep the knee targets).
HEEL = SOLE[0]
BALL = SOLE[2]
BALL_OFF = BALL[0] - HEEL[0]
# The toe hinge (relative to the ankle), its height above the floor, and the toes' sole (relative to it).
BALL_J, BALL_JH = BALL, 0.0
TOE_PTS = [(0.0, 0.0), (SOLE[3][0] - BALL[0], SOLE[3][1] - BALL[1])]


def configure(rig):
    """Measure the legs and soles from the rig (rest pose). A rig built from a supplied mesh carries its
    boot's sole as `sole` = (heel, ball, toe tip) forward of the ankle and the ankle's height."""
    global LT, LS, HIP_Z, HIP_W, SOLE, HEEL, BALL, BALL_OFF, THIGH0, K0, A0, BALL_J, BALL_JH, TOE_PTS
    B = rig.data.bones
    hip, knee, ank = B["thigh.L"].head_local, B["shin.L"].head_local, B["foot.L"].head_local
    THIGH0 = math.atan2(knee.y - hip.y, hip.z - knee.z)
    shin0 = math.atan2(ank.y - knee.y, knee.z - ank.z)
    K0 = THIGH0 - shin0
    A0 = shin0
    LT = (B["thigh.L"].tail_local - B["thigh.L"].head_local).length
    LS = (B["shin.L"].tail_local - B["shin.L"].head_local).length
    HIP_Z = B["thigh.L"].head_local.z
    HIP_W = abs(B["thigh.L"].head_local.x)
    if "sole" in rig.keys():
        heel, ball, tip, az = (float(x) for x in rig["sole"])
        SOLE = [(heel + 0.012, -az), (0.3 * heel + 0.7 * ball - 0.05, -az), (ball, -az), (tip - 0.012, -az + 0.008)]
    HEEL, BALL = SOLE[0], SOLE[2]
    BALL_OFF = BALL[0] - HEEL[0]
    if "sole" in rig.keys():
        jz = B["toe.L"].head_local.z - ank.z
        BALL_J = (BALL[0], jz)
        BALL_JH = jz - BALL[1]
        TOE_PTS = [(0.0, -BALL_JH), (SOLE[3][0] - BALL[0], -BALL_JH + 0.012)]
    _HCACHE.clear()
    print(f"  anim rig rest angles: thigh {math.degrees(THIGH0):+.1f}° knee {math.degrees(K0):+.1f}° shin {math.degrees(A0):+.1f}°", flush=True)
    print(f"  anim rig: thigh {LT:.3f} shin {LS:.3f} hip {HIP_Z:.3f} ±{HIP_W:.3f}  sole {[(round(a, 3), round(b, 3)) for a, b in SOLE]}", flush=True)
G_ACC = 9.81

RUN = dict(
    ts=0.28, D=0.78, xtd=0.24, knee=(0.38, 0.97, 0.45), v=6.0,
    af=[(0.0, 0.14), (0.14, 0.0), (0.32, 0.0), (1.0, -0.88)],
    swing=[(0.18, -0.34, 1.05, 0.45), (0.42, 0.12, 1.85, 0.12), (0.68, 0.72, 1.42, -0.12), (0.86, 0.66, 0.66, -0.16)],
    hp=0.17, lean=0.25, hyaw=0.12, hroll=0.05, chest=0.85, head_down=0.14,
    arm_c=0.24, arm_a=1.02, elbow=1.62, elbow_a=0.4, out=0.25, curl=0.95, peak=0.76, frames=48,
)
SPRINT = dict(
    ts=0.225, D=0.88, xtd=0.18, knee=(0.42, 0.9, 0.4), v=9.0,
    af=[(0.0, -0.2), (0.4, -0.05), (0.5, -0.08), (1.0, -0.98)],
    swing=[(0.15, -0.4, 1.28, 0.55), (0.38, 0.2, 2.3, 0.1), (0.64, 1.12, 1.75, -0.2), (0.84, 0.92, 0.78, -0.12)],
    hp=0.23, lean=0.32, hyaw=0.16, hroll=0.06, chest=0.9, head_down=0.1,
    arm_c=0.3, arm_a=1.1, elbow=1.6, elbow_a=0.5, out=0.22, curl=1.1, peak=0.74, frames=48,
)
# The desperate all-out run of the top tiers: longer reach, higher knees, a harder pump, a deeper lean.
DASH = dict(SPRINT, ts=0.19, D=0.92, xtd=0.21, knee=(0.44, 0.88, 0.38), v=12.6,
            af=[(0.0, -0.26), (0.4, -0.08), (0.5, -0.1), (1.0, -1.02)],
            swing=[(0.15, -0.42, 1.38, 0.55), (0.37, 0.24, 2.42, 0.1), (0.63, 1.26, 1.85, -0.22), (0.83, 1.02, 0.84, -0.12)],
            hp=0.27, lean=0.42, hyaw=0.19, hroll=0.07, chest=0.95, head_down=0.18,
            arm_c=0.35, arm_a=1.35, elbow=1.58, elbow_a=0.6, out=0.24, curl=1.25, peak=0.73)


def _rot(y, z, a):
    return y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)


def _ankle_from(anchor, af, H):
    """Ankle (x fwd, z up, relative to the hip joint) for a foot pitched af (toes up +) whose heel
    would rest at `anchor` if flat: it pivots on the heel while toes-up, on the ball while toes-down."""
    if af > 0:
        ox, oz = _rot(*HEEL, af)
        return anchor - ox, -H - oz
    # Toes-down the foot hinges at the ball joint (BALL_J, BALL_JH above the floor) while the toes stay
    # flat on the ground: the pivot is the joint, not the sole under it, or the planted toes would slide.
    ox, oz = _rot(*BALL_J, af)
    return anchor + BALL_OFF - ox, -H + BALL_JH - oz


def _ik(ax, az):
    """Sagittal two-bone IK → (world thigh angle, knee flexion). Knee in front of the hip–ankle line."""
    d = min(math.hypot(ax, az), (LT + LS) * 0.9995)
    phi = math.atan2(ax, -az)
    al = math.acos(max(-1.0, min(1.0, (LT * LT + d * d - LS * LS) / (2 * LT * d))))
    at = phi + al
    kx, kz = LT * math.sin(at), -LT * math.cos(at)
    return at, at - math.atan2(ax - kx, -(az - kz))


def _pw(keys, u):
    """Smooth monotone (PCHIP) interpolation through (u, value) keys: no stop at each key (an eased
    segment halts dead at every key, and the joint's speed dips and surges between them)."""
    if u <= keys[0][0]:
        return keys[0][1]
    if u >= keys[-1][0]:
        return keys[-1][1]
    n = len(keys)
    h = [keys[i + 1][0] - keys[i][0] for i in range(n - 1)]
    d = [(keys[i + 1][1] - keys[i][1]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    for i in range(n - 1):
        u0, u1 = keys[i][0], keys[i + 1][0]
        if u <= u1:
            t = (u - u0) / h[i]
            a, b = keys[i][1], keys[i + 1][1]
            h00, h10, h01, h11 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
            return h00 * a + h10 * h[i] * m[i] + h01 * b + h11 * h[i] * m[i + 1]
    return keys[-1][1]


def _hermite(pts, t):
    """Cubic Hermite through (t, values, tangent-or-None) points; missing tangents are Catmull-Rom."""
    n = len(pts)
    tans = []
    for i, (ti, vi, mi) in enumerate(pts):
        if mi is not None:
            tans.append(mi)
            continue
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tans.append([(y - x) / max(1e-6, b[0] - a[0]) for x, y in zip(a[1], b[1])])
    for i in range(n - 1):
        t0, p0, _ = pts[i]
        t1, p1, _ = pts[i + 1]
        if t <= t1 or i == n - 2:
            h = t1 - t0
            s = max(0.0, min(1.0, (t - t0) / h))
            h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
            return [h00 * a + h10 * h * ma + h01 * b + h11 * h * mb for a, b, ma, mb in zip(p0, p1, tans[i], tans[i + 1])]
    return list(pts[-1][1])


def _scaled(G, k):
    """Amplitude k < 1 (easing down out of a run): shorter contacts, lower knees, a smaller pump."""
    if k >= 0.999:
        return G
    g = dict(G)
    g["D"] = G["D"] * (0.35 + 0.65 * k)
    g["xtd"] = G["xtd"] * (0.45 + 0.55 * k)
    g["swing"] = [(s, at * (0.35 + 0.65 * k), kn * (0.45 + 0.55 * k), an * k) for s, at, kn, an in G["swing"]]
    g["v"] = G["v"] * k
    for n_ in ("hyaw", "hroll", "arm_a", "elbow_a"):
        g[n_] = G[n_] * k
    g["knee"] = tuple(0.3 + (x - 0.3) * k for x in G["knee"])
    return g


def _height_for(G, u, knee):
    """Hip height at which the stance knee is flexed `knee` at stance fraction u (bisection)."""
    lo, hi = 0.63 * HIP_Z, HIP_Z + 0.02
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        k_ = _ik(*_ankle_from(G["xtd"] - G["D"] * u, _pw(G["af"], u), mid))[1]
        lo, hi = (lo, mid) if k_ < knee else (mid, hi)
    return 0.5 * (lo + hi)


_HCACHE = {}


def _heights(G):
    """(strike, mid-stance, toe-off) hip heights from the knee targets: the leg lands nearly straight,
    loads to ~40° at mid-stance and pushes off almost straight."""
    key_ = (G["D"], G["xtd"], G["knee"], tuple(G["af"]))
    if key_ not in _HCACHE:
        ktd, kmid, kto = G["knee"]
        _HCACHE[key_] = (_height_for(G, 0.0, ktd), _height_for(G, 0.45, kmid), _height_for(G, 1.0, kto))
    return _HCACHE[key_]


def _sink(G):
    htd, hmid, hto = _heights(G)
    return 0.5 * (htd + hto) - hmid


def _pelvis(ph, G):
    """Pelvis yaw (left side forward +), roll (left side up +) and hip height at cycle phase ph."""
    tw = 2 * math.pi
    ts = G["ts"]
    hy = G["hyaw"] * math.cos(tw * (ph - 0.96))
    # Obliquity: the swing side drops sharply after each strike as the stance hip takes the load.
    loc = ph % 0.5
    drop = math.exp(-((loc - 0.3 * ts - 0.02) / (0.45 * ts + 0.04)) ** 2) * (1 if ph % 1.0 < 0.5 else -1)
    roll = G["hroll"] * drop
    # Height: spring-loaded stance, ballistic flight.
    htd, hmid, hto = _heights(G)
    if loc < ts:
        u = loc / ts
        base = htd + (hto - htd) * u
        bump = (hmid - (htd + (hto - htd) * 0.45)) / math.sin(0.45 * math.pi) ** 1.2
        H = base + bump * math.sin(math.pi * u) ** 1.2
    else:
        u = (loc - ts) / (0.5 - ts)
        cad = G["v"] / (G["D"] / ts) if G["v"] > 0.1 else 1.0
        tf = (0.5 - ts) / min(2.6, max(0.6, cad))
        H = hto + (htd - hto) * u + 4 * u * (1 - u) * G_ACC * tf * tf / 8
    return hy, roll, H


def _hip_of(s, hy, roll):
    """Hip joint (forward, up) offset from the pelvis centre for the pelvis yaw and roll."""
    return sgn(s) * HIP_W * math.sin(hy), sgn(s) * HIP_W * math.sin(roll)


def _stance_leg(s, ph, t, G):
    """(world thigh angle, knee, ankle joint, toe) of leg s in stance at its own phase t."""
    hy, roll, H = _pelvis(ph, G)
    hx, hz = _hip_of(s, hy, roll)
    u = t / G["ts"]
    af = _pw(G["af"], u)
    ax, az = _ankle_from(G["xtd"] - G["D"] * u - hx, af, H + hz)
    at, knee = _ik(ax, az)
    ankle = (at - knee) - af
    toe = min(1.2, max(0.0, -af))  # the toes stay flat on the ground
    return at, knee, ankle, toe


def _leg_state(s, ph, G):
    off = 0.0 if s == "L" else 0.5
    t = (ph + off) % 1.0
    ts = G["ts"]
    if t < ts:
        return _stance_leg(s, ph, t, G)
    # Swing: Hermite from the toe-off solution through the keys to the next strike's solution.
    e = 0.004
    ph_to = (ts - off) % 1.0
    ph_td = (1.0 - off) % 1.0
    a0 = _stance_leg(s, ph_to, ts - 1e-6, G)[:3]
    a0m = _stance_leg(s, (ph_to - e) % 1.0, ts - e, G)[:3]
    a1 = _stance_leg(s, ph_td, 0.0, G)[:3]
    a1p = _stance_leg(s, (ph_td + e) % 1.0, e, G)[:3]
    sw = 1.0 - ts
    m0 = [(x - y) / (e / sw) * 0.6 for x, y in zip(a0, a0m)]   # the push-off's momentum carries into swing (C1: no corner)
    m1 = [(y - x) / (e / sw) * 0.6 for x, y in zip(a1, a1p)]
    m0[1] = max(0.0, m0[1])  # the knee folds straight after toe-off, never locks back
    pts = [(0.0, list(a0), m0)] + [(k[0], list(k[1:]), None) for k in G["swing"]] + [(1.0, list(a1), m1)]
    at, knee, ankle = _hermite(pts, (t - ts) / sw)
    knee = max(0.04, knee)
    # The toes leave the ground bent (as they were at toe-off), then straighten in the swing.
    # (Over the first third of the swing: snapped straight in a frame or two it read as a flick.)
    toe = min(1.2, max(0.0, -G["af"][-1][1])) * math.exp(-(((t - ts) / sw) / 0.22) ** 2)
    return at, knee, ankle, toe


def _gait(ph, G, k=1.0):
    """Pose, lateral root offset and root height for gait G at cycle phase ph (0 = left strike)."""
    G = _scaled(G, k)
    tw = 2 * math.pi
    P = {}
    hy, roll, H = _pelvis(ph, G)
    ts = G["ts"]
    # Pelvis pitch: tipped forward, most at each push-off (the hip extending behind).
    hp = G["hp"] * (0.4 + 0.6 * k) + 0.025 * k * math.cos(2 * tw * (ph - ts))
    for s in "LR":
        at, knee, ankle, toe = _leg_state(s, ph, G)
        t = (ph + (0.0 if s == "L" else 0.5)) % 1.0
        stance = t < ts
        # The stance foot lands under the body's line (a narrow track); the swing knee tracks straight.
        out = -0.035 if stance else -0.005 + 0.02 * math.sin(math.pi * (t - ts) / (1 - ts))
        # Solved angles are world (sagittal); the rig's rest leg is not quite straight: take its rest
        # angles out so the joints land where the solver put them (else the soles sink and slide).
        P[f"thigh.{s}"] = (-(at + hp - THIGH0), hy * 0.8, out * sgn(s))
        P[f"shin.{s}"] = (knee - K0, 0, 0)
        P[f"foot.{s}"] = (-(ankle - A0), 0, 0)
        P[f"toe.{s}"] = (toe, 0, 0)
        # Arms: the opposite arm swings with this leg's thigh; the forearm lags, the hand stays loose.
        m = mirror(s)
        a = math.cos(tw * (t - G["peak"]))
        lag = math.cos(tw * (t - G["peak"] - 0.05))
        flop = math.sin(tw * (t - G["peak"] - 0.12))
        asym = 1.0 if m == "R" else 0.93            # the right arm pumps a touch bigger …
        wide = 0.0 if m == "R" else 0.02            # … the left rides a touch wider
        fwd = (G["arm_c"] + G["arm_a"] * a * asym) * k + 0.05 * (1 - k)
        arm(P, m, fwd=fwd, elbow=(G["elbow"] + G["elbow_a"] * lag) * (0.55 + 0.45 * k),
            out=G["out"] + wide - 0.06 * k + 0.03 * a * k, wrist=0.08 + 0.12 * flop * k, twist=0.08 * a * k,
            curl=G["curl"] + 0.1 * lag * k, prot=0.15 * a * k, shrug=(0.03 + 0.05 * max(0.0, a)) * k)
    # Trunk: a steady forward lean with a small flex as each stance loads, the chest counter-rotating
    # against the pelvis; the head keeps its gaze level through all of it.
    load = math.exp(-(((ph % 0.5) - 0.45 * ts) / (0.5 * ts + 0.03)) ** 2)
    lean = G["lean"] * (0.4 + 0.6 * k) + 0.025 * k * load
    look = hp + lean - G["head_down"] - 0.03 * k * load
    torso(P, lean=lean, look=look, yaw=-G["chest"] * hy, roll=-roll * 0.8, hp=hp, hyaw=hy, hroll=roll,
          head_yaw=0.0, head_roll=-roll * 0.1)
    # The body's line shifts a little over each stance foot.
    x = 0.01 * k * math.cos(tw * (ph - ts * 0.5))
    return P, x, H - HIP_Z


# The solved cycle has corners in its velocities: the stance/swing hand-offs (damped tangents), the
# eased ankle-pitch segments (each stops dead at its key) and the toe's snap straight after toe-off.
# Played at ~3x in the game (a cycle in ~15 frames) those corners zig-zag frame to frame (judder). So the
# cycle is sampled densely and every channel (joint angles, root) filtered with a narrow periodic Gaussian
# (sigma ~1.6 % of a cycle): positions move by millimetres, the velocity corners round off.
CYCLE_N = 192
CYCLE_SIGMA = 6.0  # samples


_CYC = {}


def _cycle(G, k):
    key_ = (id(G), round(k, 4))
    if key_ in _CYC:
        return _CYC[key_]
    raw = [_gait(i / CYCLE_N, G, k) for i in range(CYCLE_N)]
    names = list(raw[0][0].keys())
    def smooth(vals, sig=CYCLE_SIGMA):
        r = int(math.ceil(3 * sig))
        w = [math.exp(-0.5 * (j / sig) ** 2) for j in range(-r, r + 1)]
        ws = sum(w)
        n = len(vals)
        return [sum(w[j + r] * vals[(i + j) % n] for j in range(-r, r + 1)) / ws for i in range(n)]
    chans = {}
    for nm in names:
        # The feet and toes swing fastest (the whole push-off in ~2 game frames): filtered wider.
        sig = CYCLE_SIGMA * (1.5 if nm.split(".")[0] in ("foot", "toe") else 1.0)
        for a in range(3):
            chans[(nm, a)] = smooth([R[0][nm][a] for R in raw], sig)
    xs = smooth([R[1] for R in raw])
    zs = smooth([R[2] for R in raw])
    out = []
    for i in range(CYCLE_N):
        P = {nm: tuple(chans[(nm, a)][i] for a in range(3)) for nm in names}
        out.append((P, xs[i], zs[i]))
    # The filtered legs reach a little lower or higher than the solved ones: shift the root by the
    # difference of the lowest contact (sagittal, so the pelvis roll the solver applied is kept), so
    # each sole lands where the solver put it; that correction is filtered narrowly too.
    d = [raw[i][2] - out[i][2] + contact_z(raw[i][0]) - contact_z(out[i][0]) for i in range(CYCLE_N)]
    d = smooth(d, 2.0)
    out = [(P, x, z + dd) for (P, x, z), dd in zip(out, d)]
    _CYC[key_] = out
    return out


def _gait_smooth(ph, G, k=1.0):
    c = _cycle(G, k)
    f = (ph % 1.0) * CYCLE_N
    i = int(f) % CYCLE_N
    j = (i + 1) % CYCLE_N
    u = f - int(f)
    P = {nm: tuple(a + (b - a) * u for a, b in zip(c[i][0][nm], c[j][0][nm])) for nm in c[i][0]}
    return P, c[i][1] + (c[j][1] - c[i][1]) * u, c[i][2] + (c[j][2] - c[i][2]) * u


def loco(ph, G, k=1.0):
    P, x, _ = _gait_smooth(ph, G, k)
    return P, x


def gait_root(ph, G, k=1.0):
    return _gait_smooth(ph, G, k)[2]


def gait_clip(name, G):
    new_action(name)
    n = G["frames"]
    for f in range(n + 1):
        ph = f / n
        P, x, z = _gait_smooth(ph, G)
        key(f + 1, P, z=z, x=x)
    print(f"  gait {name}: S = {G['D'] / G['ts']:.3f} m/cycle, hip heights {['%.3f' % h for h in _heights(G)]}", flush=True)


# ------------------------------------------------------------------ poses
def ready_pose(br=0.0):
    P = {}
    torso(P, lean=0.62 + 0.02 * br, look=0.62, hp=0.2, yaw=0.08, hyaw=0.05, head_yaw=0.0)
    leg(P, "L", hip=0.95, knee=1.45, ankle=-0.35)
    leg(P, "R", hip=-0.12, knee=0.85, ankle=0.25, toe=0.5)
    arm(P, "R", fwd=0.85, elbow=1.25, out=0.14, curl=0.7)
    arm(P, "L", fwd=-0.7, elbow=0.95, out=0.2, curl=0.7)
    return P


def standing(P, wide=0.06, bend=0.05):
    # Feet flat whatever the pelvis does: a pelvis pitched forward (torso hp, set before this) takes the
    # thighs with it, so the hips flex by as much again to keep the knees over the feet.
    hp = -P.get("hips", (0.0, 0.0, 0.0))[0]
    leg(P, "L", hip=0.04 + bend + hp, knee=0.06 + bend * 2, ankle=bend, out=wide)
    leg(P, "R", hip=-0.02 + bend + hp, knee=0.03 + bend * 2, ankle=bend, out=wide + 0.02)


def build(rig):
    global RIG
    RIG = rig
    configure(rig)
    for p in rig.pose.bones:
        p.rotation_mode = "XYZ"

    # ---------------------------------------------------------- gaits
    gait_clip("run", RUN)
    gait_clip("sprint", SPRINT)
    gait_clip("dash", DASH)

    # ---------------------------------------------------------- idle: a ready stance — knees soft, weight rocking
    # from foot to foot, hands loose in front of the hips, a breathing cycle, glances back down the
    # causeway, a strap tug
    new_action("idle")
    for f in range(0, 151, 5):
        t = f / 150
        br = math.sin(t * 2 * math.pi * 2)
        glance_l = ease((f - 40) / 12) * (1 - ease((f - 68) / 12))
        glance_r = ease((f - 80) / 12) * (1 - ease((f - 108) / 14))
        tug = ease((f - 112) / 10) * (1 - ease((f - 136) / 10))
        sway = math.sin(t * 2 * math.pi)
        P = {}
        torso(P, lean=0.11 + 0.015 * br, look=0.1 + 0.08 * glance_r - 0.04 * tug, yaw=-0.14 * glance_l + 0.1 * glance_r + 0.04 * sway,
              roll=0.02 * sway, hroll=-0.045 * sway, hyaw=0.05 * sway, hp=0.06, head_yaw=-0.8 * glance_l + 0.65 * glance_r + 0.15 * tug,
              head_roll=0.03 * sway, breath=0.025 * br)
        # Left foot a half step ahead; the weight rocks onto the right hip and back.
        leg(P, "L", hip=0.2 + 0.05 * sway, knee=0.32 + 0.08 * sway, ankle=0.12 + 0.03 * sway, out=0.07)
        leg(P, "R", hip=0.05 - 0.05 * sway, knee=0.18 - 0.06 * sway, ankle=0.12 - 0.03 * sway, out=0.1)
        arm(P, "L", fwd=0.3 + 0.03 * br, elbow=0.95 + 0.05 * br, out=-0.04, wrist=0.2, twist=-0.2, curl=0.25)
        arm(P, "R", fwd=0.22 + 0.45 * tug, elbow=0.8 + 1.1 * tug, out=-0.02 + 0.02 * tug, wrist=0.15, twist=-0.15 + 0.4 * tug, curl=0.3 + 0.8 * tug)
        P["shoulder.L"] = (0.03 * br, 0, 0.04)
        P["shoulder.R"] = (0.03 * br + 0.08 * tug, 0, 0.04)
        key(f + 1, P, x=0.012 * sway)

    # ---------------------------------------------------------- idle_b: weight onto one hip, roll the neck and
    # shoulders, look up at the ruins, brush dust off the forearm, settle (plays in turn with idle)
    new_action("idle_b")
    for f in range(0, 181, 5):
        t = f / 180
        br = math.sin(t * 2 * math.pi * 3)
        hipk = ease(f / 25) * (1 - ease((f - 150) / 25))          # weight onto the right leg
        neck = ease((f - 20) / 12) * (1 - ease((f - 56) / 14))    # a slow neck roll
        nroll = math.sin((f - 20) / 36 * 2 * math.pi) if 20 <= f <= 56 else 0.0
        up = ease((f - 62) / 16) * (1 - ease((f - 104) / 16))     # looks up at the heights
        brush = ease((f - 108) / 8) * (1 - ease((f - 142) / 10))  # brushes the left forearm
        stroke = math.sin((f - 108) / 34 * 3 * 2 * math.pi) if 108 <= f <= 142 else 0.0
        P = {}
        torso(P, lean=0.03 + 0.1 * brush + 0.01 * br, look=0.05 + 0.5 * up - 0.25 * brush + 0.2 * neck * nroll, yaw=0.06 * hipk - 0.1 * brush,
              roll=-0.03 * hipk, hroll=0.06 * hipk, hyaw=-0.04 * hipk, head_yaw=0.25 * up - 0.2 * brush + 0.15 * neck,
              head_roll=0.18 * neck * math.cos((f - 20) / 36 * 2 * math.pi) if 20 <= f <= 56 else 0.0, breath=0.016 * br)
        leg(P, "R", hip=0.02, knee=0.02, ankle=0.0, out=0.08 + 0.02 * hipk)
        leg(P, "L", hip=0.1 + 0.12 * hipk, knee=0.12 + 0.3 * hipk, ankle=0.08 + 0.12 * hipk, out=0.06 - 0.02 * hipk)
        arm(P, "L", fwd=0.26 + 0.55 * brush, elbow=0.85 + 0.6 * brush, out=-0.04 + 0.02 * brush, twist=-0.2 + 0.7 * brush, curl=0.3 - 0.1 * brush)
        arm(P, "R", fwd=0.22 + 0.42 * brush + 0.05 * stroke * brush, elbow=0.8 + 0.9 * brush, out=-0.03 - 0.03 * brush + 0.04 * stroke * brush,
            twist=0.3 * brush, curl=0.3 - 0.2 * brush)
        P["shoulder.L"] = (0.02 * br + 0.1 * neck * max(0.0, nroll), 0, 0)
        P["shoulder.R"] = (0.02 * br + 0.1 * neck * max(0.0, -nroll), 0, 0)
        key(f + 1, P, x=-0.03 * hipk)

    # ---------------------------------------------------------- idle_c: getting ready to run — a look down the
    # causeway, shake out the hands, two quick bounces on the balls of the feet, a shoulder roll, a big breath out
    new_action("idle_c")
    for f in range(0, 181, 3):
        br = math.sin(f / 180 * 2 * math.pi * 3)
        look = ease((f - 6) / 14) * (1 - ease((f - 44) / 14))                 # peers down the way ahead
        shake = ease((f - 48) / 6) * (1 - ease((f - 86) / 8))                 # shakes out the hands
        sh = math.sin(f * 2.6) * shake
        bounce = ease((f - 92) / 5) * (1 - ease((f - 124) / 6))               # bounces on the toes
        bz = abs(math.sin((f - 92) / 32 * 2 * math.pi)) * bounce
        roll = ease((f - 126) / 8) * (1 - ease((f - 160) / 10))               # rolls the shoulders back
        rph = (f - 126) / 34 * 2 * math.pi
        blow = ease((f - 150) / 10) * (1 - ease((f - 176) / 6))               # a long breath out
        P = {}
        torso(P, lean=0.05 + 0.08 * look - 0.03 * blow + 0.012 * br + 0.03 * bz, look=0.02 - 0.06 * look - 0.1 * blow,
              yaw=0.05 * look, head_yaw=0.12 * look, roll=0.02 * sh, breath=0.018 * br - 0.03 * blow)
        bend = 0.1 + 0.1 * bz + 0.04 * look
        standing(P, wide=0.07, bend=bend)
        for s_, k in (("L", 1.0), ("R", -1.0)):
            arm(P, s_, fwd=0.24 + 0.15 * shake + 0.05 * sh * k + 0.05 * bz, elbow=0.75 + 0.1 * shake + 0.2 * bz,
                out=-0.02 + 0.12 * shake + 0.03 * sh, wrist=0.35 * sh * k, twist=0.2 * sh, curl=0.3 - 0.2 * shake,
                shrug=0.08 * roll * max(0.0, math.sin(rph)), prot=0.1 * roll * math.cos(rph))
        # On the toes at the top of each bounce.
        for s_ in "LR":
            if bz > 0.01:
                th, kn, an, to = P[f"thigh.{s_}"], P[f"shin.{s_}"], P[f"foot.{s_}"], P[f"toe.{s_}"]
                P[f"foot.{s_}"] = (an[0] - 0.35 * bz, 0, 0)
                P[f"toe.{s_}"] = (0.35 * bz, 0, 0)
        key(f + 1, P, x=0.01 * sh)

    # ---------------------------------------------------------- ready: coiled, rocking gently on the balls of the feet
    new_action("ready")
    for f in range(0, 41, 4):
        br = math.sin(f / 40 * 2 * math.pi)
        key(f + 1, ready_pose(br), y=0.015 * br)

    # ---------------------------------------------------------- start: the burst out of the crouch into the run
    # Anticipation (sink and cock the arms), an explosive push off the front foot with the rear knee
    # driving through, then three accelerating steps — short and low, rising to the run by the fourth
    # plant (a left strike, where the run cycle begins).
    new_action("start")
    key(1, ready_pose())
    # Set: the weight rocks back a touch onto the rear foot, the arms cock.
    P = ready_pose()
    torso(P, lean=0.55, look=0.6, hp=0.16, yaw=0.08, hyaw=0.05)
    leg(P, "L", hip=0.9, knee=1.6, ankle=-0.4)
    leg(P, "R", hip=-0.05, knee=1.0, ankle=0.3, toe=0.55)
    arm(P, "R", fwd=0.7, elbow=1.4, out=0.14, curl=0.9)
    arm(P, "L", fwd=-0.85, elbow=1.0, out=0.2, curl=0.9)
    key(3, P, lift=-0.02)
    P = ready_pose()
    torso(P, lean=0.7, look=0.66, hp=0.24, yaw=0.12, hyaw=0.06)
    leg(P, "L", hip=1.15, knee=1.85, ankle=-0.5)
    leg(P, "R", hip=0.0, knee=1.2, ankle=0.4, toe=0.65)
    arm(P, "R", fwd=1.15, elbow=1.5, out=0.14, curl=0.9)
    arm(P, "L", fwd=-1.0, elbow=1.0, out=0.2, curl=0.9)
    key(5, P, lift=-0.035)
    P = {}
    torso(P, lean=0.85, look=0.78, hp=0.24, hyaw=-0.2, yaw=0.18)
    leg(P, "L", hip=-0.32, knee=0.06, ankle=0.95, toe=0.85)
    leg(P, "R", hip=1.35, knee=2.1, ankle=0.25)
    arm(P, "L", fwd=1.65, elbow=1.25, curl=1.0, prot=0.18, out=0.06, shrug=0.1)
    arm(P, "R", fwd=-1.3, elbow=0.8, out=0.24, curl=1.0)
    key(9, P, lift=0.04)
    P = {}
    torso(P, lean=0.7, look=0.64, hp=0.2, hyaw=-0.06)
    leg(P, "R", hip=0.42, knee=0.55, ankle=-0.05)
    leg(P, "L", hip=-0.42, knee=1.1, ankle=0.55)
    arm(P, "L", fwd=1.15, elbow=1.5, out=0.1, curl=1.0, prot=0.12)
    arm(P, "R", fwd=-0.95, elbow=1.05, out=0.22, curl=1.0)
    key(12, P)
    P = {}
    torso(P, lean=0.62, look=0.6, hp=0.18, hyaw=0.14, yaw=-0.12)
    leg(P, "R", hip=-0.42, knee=0.3, ankle=0.72, toe=0.6)
    leg(P, "L", hip=1.1, knee=1.95, ankle=0.22)
    arm(P, "R", fwd=1.3, elbow=1.35, curl=0.85, prot=0.12, out=0.07)
    arm(P, "L", fwd=-1.0, elbow=0.95, out=0.2, curl=0.85)
    key(16, P, lift=0.025)
    P = {}
    torso(P, lean=0.55, look=0.55, hp=0.16, hyaw=0.05)
    leg(P, "L", hip=0.4, knee=0.45, ankle=-0.05)
    leg(P, "R", hip=-0.4, knee=1.2, ankle=0.55)
    arm(P, "R", fwd=1.05, elbow=1.5, out=0.1, curl=1.0, prot=0.1)
    arm(P, "L", fwd=-0.85, elbow=1.05, out=0.22, curl=1.0)
    key(19, P)
    P, x = loco(0.25, SPRINT, 0.85)
    key(22, P, z=gait_root(0.25, SPRINT, 0.85), x=x)
    P, x = loco(0.5, RUN, 0.95)
    key(26, P, z=gait_root(0.5, RUN, 0.95), x=x)
    P, x = loco(0.75, RUN)
    key(29, P, z=gait_root(0.75, RUN), x=x)
    P0, x0 = loco(0.0, RUN)
    key(32, P0, z=gait_root(0.0, RUN), x=x0)

    # ---------------------------------------------------------- chasm: skid, teeter and windmill at the edge, sit back hard
    new_action("fall_chasm")
    P0, x0 = loco(0.0, RUN)
    key(1, P0, z=gait_root(0.0, RUN), x=x0)
    P = {}
    torso(P, lean=-0.12, look=0.25, hp=-0.05)
    leg(P, "L", hip=0.75, knee=0.25, ankle=-0.3)
    leg(P, "R", hip=0.1, knee=0.9, ankle=0.2)
    arm(P, "L", fwd=1.1, elbow=0.6, out=0.4, curl=0.1)
    arm(P, "R", fwd=0.9, elbow=0.7, out=0.45, curl=0.1)
    key(4, P, lift=-0.035)
    # The catch: thrown back off the skid, arms flung out wide (it reads from behind as well as the side).
    P = {}
    torso(P, lean=-0.28, look=0.3, hp=-0.08, roll=0.05)
    leg(P, "L", hip=0.9, knee=0.45, ankle=-0.35)
    leg(P, "R", hip=0.35, knee=1.3, ankle=0.0)
    arm(P, "L", fwd=0.7, elbow=0.3, out=1.25, curl=0.0)
    arm(P, "R", fwd=0.6, elbow=0.35, out=1.3, curl=0.0)
    key(9, P)
    # The teeter: the lip under his toes, he rocks side to side on one foot then the other, the arms
    # windmilling out at the sides against it, the head snapping to the drop and back.
    teeter = [
        # fr, lean, roll, lifted leg, L arm (fwd, out), R arm (fwd, out), head yaw, look
        (13, 0.35, 0.2, "R", (1.6, 1.25), (0.2, 0.9), 0.15, -0.55),
        (17, 0.22, -0.22, "L", (0.3, 0.85), (1.7, 1.3), -0.2, -0.3),
        (21, -0.08, 0.14, "R", (1.95, 0.7), (1.0, 1.35), 0.1, 0.1),
        (25, 0.45, -0.12, None, (1.3, 0.95), (1.45, 1.0), 0.0, -0.6),
    ]
    for fr, lean, roll, lift, la, ra, hy, look in teeter:
        P = {}
        torso(P, lean=lean, look=look, hp=0.12, roll=roll, hroll=-0.5 * roll, head_yaw=hy, head_roll=-0.3 * roll)
        leg(P, "L", hip=0.3, knee=0.3, ankle=0.35, toe=0.4)
        leg(P, "R", hip=-0.05, knee=0.3, ankle=0.55, toe=0.5, out=0.08)
        if lift == "R":
            leg(P, "R", hip=-0.45, knee=1.2, ankle=0.3, out=0.25)
        elif lift == "L":
            leg(P, "L", hip=-0.4, knee=1.15, ankle=0.3, out=0.25)
        arm(P, "L", fwd=la[0], elbow=0.35, out=la[1], curl=0.05)
        arm(P, "R", fwd=ra[0], elbow=0.35, out=ra[1], curl=0.05)
        key(fr, P)
    # The lip crumbles: the knees buckle, he snatches down at the edge with both hands.
    P = {}
    torso(P, lean=0.75, look=-0.55, hp=0.3, roll=0.05)
    leg(P, "L", hip=0.75, knee=1.1, ankle=0.1, toe=0.3)
    leg(P, "R", hip=0.4, knee=1.25, ankle=0.4, toe=0.5, out=0.1)
    arm(P, "L", fwd=1.25, elbow=0.25, out=0.35, wrist=-0.6, curl=0.6)
    arm(P, "R", fwd=1.15, elbow=0.3, out=0.4, wrist=-0.6, curl=0.6)
    key(29, P, lift=-0.06)
    # Over the edge: the grab closes on nothing, arms up after it, legs kicking.
    P = {}
    torso(P, lean=0.62, look=-0.3, hp=0.25, roll=0.06)
    leg(P, "L", hip=0.5, knee=0.9, ankle=0.4, toe=0.5)
    leg(P, "R", hip=-0.3, knee=0.7, ankle=0.5, toe=0.4, out=0.08)
    arm(P, "L", fwd=1.9, elbow=0.5, out=0.55, curl=0.4)
    arm(P, "R", fwd=1.7, elbow=0.6, out=0.65, curl=0.4)
    key(33, P, y=0.18)
    # Falling (ballistic from frame 34, 1.1 s: the game drops the slab under him then): pitched forward
    # over the lip and drifting on past it, never sitting back; legs trailing and kicking, arms flailing
    # up and out. The water (2.2 m below the deck) takes his feet at ~1.77 s (the game's splash is at
    # 1.75 s); he plunges in, slows, and is fully under by ~2.4 s (the game hides him at 2.6 s).
    WATER = -2.2  # the lowest point (his feet) reaches the surface
    for fr in range(35, 83, 2):
        u = (fr - 34) / FPS
        w = fr * 0.9
        drop = -0.5 * G_ACC * u * u
        if drop < WATER:
            # In the water: the plunge slows hard; the body folds a little as it goes under.
            ui = math.sqrt(2 * -WATER / G_ACC)
            v0 = G_ACC * ui
            t2 = u - ui
            drop = WATER - (v0 * t2 - 0.5 * 10.0 * t2 * t2 if t2 < v0 / 10.0 else v0 * v0 / 20.0)
        k = min(1.0, u * 1.5)
        P = {}
        # The whole body tips forward from the hips as he goes (a tumble, not a standing drop), ~60°
        # by the water; the trunk dips further, the head lifts to look where he is going.
        torso(P, lean=0.5 + 0.3 * k, look=0.1 + 0.45 * k, hp=0.25 + 0.8 * k, roll=0.14 * math.sin(w * 0.5),
              head_yaw=0.1 * math.sin(w * 0.4))
        leg(P, "L", hip=-0.1 + 0.4 * math.sin(w), knee=0.45 + 0.45 * max(0.0, math.sin(w + 1.2)), ankle=0.4, out=0.2)
        leg(P, "R", hip=-0.1 - 0.4 * math.sin(w), knee=0.45 + 0.45 * max(0.0, -math.sin(w + 1.2)), ankle=0.4, out=0.24)
        # Arms thrown up and out, clawing at the air (kept short of overhead, where the axes flip).
        arm(P, "L", fwd=2.0 + 0.35 * math.sin(w * 1.3), elbow=0.35 + 0.3 * math.sin(w), out=0.75 + 0.25 * math.sin(w * 1.1), curl=0.3)
        arm(P, "R", fwd=1.95 - 0.35 * math.sin(w * 1.3 + 0.8), elbow=0.45, out=0.8 + 0.25 * math.cos(w * 1.1), curl=0.3)
        key(fr, P, y=0.18 + 1.6 * min(u, 0.9) + 0.4 * max(0.0, u - 0.9), lift=drop)

    # ---------------------------------------------------------- gate: slam to a stop, recoil, stagger back, sink down
    new_action("fall_gate")
    run_in()
    # Brake: the front foot plants hard, the hips drop, the arms start up.
    P = {}
    torso(P, lean=-0.12, look=0.2, hp=-0.03)
    leg(P, "L", hip=0.7, knee=0.3, ankle=-0.3)
    leg(P, "R", hip=0.0, knee=1.0, ankle=0.3)
    arm(P, "L", fwd=0.9, elbow=1.3, out=0.3, curl=0.4)
    arm(P, "R", fwd=0.85, elbow=1.35, out=0.3, curl=0.4)
    key(4, P, lift=-0.035)
    # Shield: forearms up in front of the face (hands at brow height, never above the head), chin
    # tucked, the face turning away from the slab.
    shield = dict(fwd=1.3, elbow=2.15, out=0.46, twist=-0.35, wrist=0.2, curl=0.85, shrug=0.25)
    P = {}
    torso(P, lean=-0.06, look=-0.28, hp=-0.04, head_yaw=0.38, head_roll=0.08)
    leg(P, "L", hip=0.5, knee=0.35, ankle=-0.1)
    leg(P, "R", hip=-0.15, knee=0.7, ankle=0.4, toe=0.2)
    arm(P, "L", **shield)
    arm(P, "R", **shield)
    key(7, P, y=0.04)
    # The slam: thrown back, still shielding.
    P = {}
    torso(P, lean=-0.36, look=0.05, hp=-0.1, head_yaw=0.3, head_roll=-0.04)
    leg(P, "L", hip=0.28, knee=0.28, ankle=0.05)
    leg(P, "R", hip=-0.35, knee=0.42, ankle=0.35, toe=0.2)
    arm(P, "L", **dict(shield, fwd=1.15, elbow=1.95))
    arm(P, "R", **dict(shield, fwd=1.1, elbow=2.0))
    key(10, P, y=-0.02)
    # Stagger back: right foot, then left, arms coming down and out for balance.
    P = {}
    torso(P, lean=-0.24, look=0.0, hp=-0.08, roll=0.1, head_yaw=0.15)
    leg(P, "R", hip=-0.42, knee=0.5, ankle=0.3)
    leg(P, "L", hip=0.32, knee=0.45, ankle=0.0)
    arm(P, "L", fwd=0.85, elbow=1.6, out=0.48, curl=0.5)
    arm(P, "R", fwd=0.8, elbow=1.65, out=0.5, curl=0.5)
    key(15, P, y=-0.18)
    P = {}
    torso(P, lean=-0.1, look=-0.05, hp=-0.05, roll=-0.08)
    leg(P, "L", hip=-0.32, knee=0.6, ankle=0.35)
    leg(P, "R", hip=0.34, knee=0.55, ankle=0.0)
    arm(P, "L", fwd=0.45, elbow=1.0, out=0.55, curl=0.4)
    arm(P, "R", fwd=0.4, elbow=0.95, out=0.58, curl=0.4)
    key(21, P, y=-0.32)
    P = {}
    torso(P, lean=0.06, look=-0.05)
    standing(P, wide=0.1, bend=0.2)
    arm(P, "L", fwd=0.25, elbow=0.6, out=0.3, curl=0.4)
    arm(P, "R", fwd=0.22, elbow=0.6, out=0.32, curl=0.4)
    key(27, P, y=-0.38)
    # The fight goes out of him: hands drop, the shoulders round and sag, the head goes down.
    for fr, slump, br in ((36, 0.5, 0.0), (46, 1.0, 1.0), (56, 1.0, 0.0)):
        P = {}
        torso(P, lean=0.12 + 0.2 * slump, look=-0.15 - 0.3 * slump, hp=0.04, breath=0.03 * br)
        standing(P, wide=0.1, bend=0.14)
        arm(P, "L", fwd=0.08, elbow=0.2, out=0.12, curl=0.3)
        arm(P, "R", fwd=0.05, elbow=0.18, out=0.12, curl=0.3)
        P["shoulder.L"] = (-0.1 * slump, 0, 0.16 * slump)
        P["shoulder.R"] = (-0.1 * slump, 0, 0.16 * slump)
        key(fr, P, y=-0.4)
    # Bent over, hands on the knees, breathing hard, a slow shake of the head.
    for fr, br, hy in ((68, 1.0, 0.0), (78, 0.0, 0.22), (86, 1.0, -0.22), (96, 0.0, 0.0)):
        P = {}
        torso(P, lean=0.62 - 0.05 * br, look=-0.25, hp=0.2, head_yaw=hy, breath=0.045 * br)
        standing(P, wide=0.12, bend=0.3)
        arm(P, "L", fwd=0.7, elbow=0.22, out=0.12, wrist=-0.35, curl=0.5)
        arm(P, "R", fwd=0.68, elbow=0.25, out=0.12, wrist=-0.35, curl=0.5)
        P["shoulder.L"] = (-0.06, 0, 0.12)
        P["shoulder.R"] = (-0.06, 0, 0.12)
        key(fr, P, y=-0.4)

    # ---------------------------------------------------------- rockfall: flinch, cover the head, drop to a crouch
    new_action("fall_rock")
    P0, x0 = loco(0.0, RUN)
    key(1, P0, z=gait_root(0.0, RUN), x=x0)
    P, x = loco(0.12, RUN)
    torso(P, lean=0.0, look=0.55, hp=0.06, head_yaw=0.15)
    arm(P, "L", fwd=0.6, elbow=1.3, out=0.3, curl=0.4, shrug=0.1)
    arm(P, "R", fwd=0.4, elbow=1.3, out=0.3, curl=0.4, shrug=0.1)
    key(3, P, z=gait_root(0.12, RUN), x=x)
    P = {}
    torso(P, lean=0.1, look=-0.4, hp=0.0)
    leg(P, "L", hip=0.6, knee=0.4, ankle=-0.2)
    leg(P, "R", hip=0.0, knee=0.9, ankle=0.3)
    arm(P, "L", fwd=1.2, elbow=1.2, out=0.5, curl=0.5, shrug=0.25)
    arm(P, "R", fwd=1.15, elbow=1.25, out=0.5, curl=0.5, shrug=0.25)
    key(5, P, lift=-0.02)
    # Hands clasped over the back of the head, elbows forward round the face: a crouch under the
    # falling rock, not arms in the air.
    cover = dict(fwd=1.9, elbow=2.45, out=0.5, twist=-0.45, curl=0.9, shrug=0.3)
    P = {}
    torso(P, lean=0.35, look=-0.35, hp=0.05)
    leg(P, "L", hip=0.9, knee=1.3, ankle=-0.2)
    leg(P, "R", hip=0.3, knee=1.4, ankle=0.4)
    arm(P, "L", **cover)
    arm(P, "R", **cover)
    key(8, P)
    P = {}
    torso(P, lean=0.6, look=-0.4, hp=0.2)
    leg(P, "L", hip=1.3, knee=2.1, ankle=-0.3)
    leg(P, "R", hip=0.6, knee=2.2, ankle=0.35, toe=0.5)
    arm(P, "L", **cover)
    arm(P, "R", **cover)
    key(14, P)
    for fr, lean, sh in ((22, 0.75, 0.25), (28, 0.92, 0.35), (36, 0.8, 0.25), (52, 0.78, 0.22), (72, 0.7, 0.18), (95, 0.68, 0.15)):
        P = {}
        torso(P, lean=lean * 0.75 + 0.1, look=-0.55 + 0.15 * (fr >= 72), hp=0.25, head_yaw=0.12 * (fr >= 72))
        # Down on the left knee, the right foot planted: the soles and the knee share the ground.
        leg(P, "L", hip=0.25, knee=1.8, ankle=0.3, toe=0.6)
        leg(P, "R", hip=1.95, knee=1.7, ankle=0.0, out=0.14)
        c = dict(cover)
        c["shrug"] = sh
        if fr >= 72:
            # It is over: one hand down on the stone, the other on the knee.
            arm(P, "L", fwd=1.0, elbow=0.2, out=0.25, wrist=-0.7, curl=0.1)
            arm(P, "R", fwd=0.85, elbow=0.65, out=0.2, curl=0.5)
        else:
            arm(P, "L", **c)
            arm(P, "R", **c)
        key(fr, P)

    # ---------------------------------------------------------- win: run out of it, look back, catch breath, fist raised
    new_action("win")
    P0, x0 = loco(0.0, RUN)
    key(1, P0, z=gait_root(0.0, RUN), x=x0)
    P, x = loco(0.5, RUN, 0.75)
    key(7, P, z=gait_root(0.5, RUN, 0.75), x=x)
    P, x = loco(0.0, RUN, 0.45)
    key(13, P, z=gait_root(0.0, RUN, 0.45), x=x)
    P = {}
    torso(P, lean=0.08, look=0.05, hp=0.02)
    leg(P, "L", hip=0.3, knee=0.35, ankle=-0.1)
    leg(P, "R", hip=0.12, knee=0.55, ankle=0.1, out=0.08)
    arm(P, "L", fwd=0.35, elbow=0.9, curl=0.5)
    arm(P, "R", fwd=0.25, elbow=0.8, curl=0.5)
    key(19, P)
    for fr, br in ((26, 0.0), (34, 1.0), (40, 0.0)):
        P = {}
        torso(P, lean=-0.03, look=0.1, yaw=0.4, hyaw=0.12, head_yaw=1.05, breath=0.03 * br)
        standing(P, wide=0.08, bend=0.03)
        arm(P, "L", fwd=0.15, elbow=0.5, out=0.15, curl=0.5)
        arm(P, "R", fwd=-0.05, elbow=0.4, out=0.14, curl=0.5)
        key(fr, P)
    for fr, br in ((48, 0.0), (55, 1.0), (62, 0.0), (69, 1.0)):
        P = {}
        torso(P, lean=0.72 - 0.05 * br, look=0.55, hp=0.35, breath=0.04 * br)
        leg(P, "L", hip=0.45, knee=0.6, ankle=0.12, out=0.1)
        leg(P, "R", hip=0.4, knee=0.55, ankle=0.12, out=0.12)
        arm(P, "L", fwd=0.72, elbow=0.18, out=0.2, wrist=0.3, curl=0.35)
        arm(P, "R", fwd=0.7, elbow=0.2, out=0.2, wrist=0.3, curl=0.35)
        key(fr, P)
    P = {}
    torso(P, lean=0.02, look=0.05)
    standing(P, wide=0.09, bend=0.04)
    arm(P, "L", fwd=0.15, elbow=0.6, curl=0.8)
    arm(P, "R", fwd=0.5, elbow=1.4, curl=1.0)
    key(78, P)
    P = {}
    torso(P, lean=0.1, look=0.0, yaw=0.08)
    standing(P, wide=0.1, bend=0.1)
    arm(P, "L", fwd=0.2, elbow=0.9, out=0.2, curl=1.2)
    arm(P, "R", fwd=1.2, elbow=2.0, out=0.3, curl=1.35, twist=0.2)
    key(84, P)
    for fr, up in ((90, 1.0), (98, 0.94), (120, 0.97), (140, 0.95)):
        P = {}
        torso(P, lean=-0.12 * up, look=0.35 * up, yaw=-0.1, roll=-0.05, breath=0.03 * (fr % 20 == 0))
        standing(P, wide=0.1, bend=0.02)
        arm(P, "R", fwd=2.95 * up, elbow=0.3 + (1 - up) * 3, out=-0.25, curl=1.35, twist=0.3)
        arm(P, "L", fwd=0.12, elbow=0.95, out=0.22, curl=1.2)
        P["shoulder.R"] = (0.2, 0, -0.05)
        key(fr, P)

    extra_clips()

    for act in bpy.data.actions:
        gait = act.name in ("run", "sprint", "dash")
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR" if gait else "BEZIER"
    for act in bpy.data.actions:
        # (Not the vault: its support arm is baked to the stone.)
        if act.name == "start" or act.name.startswith(("fall_", "win", "jump_", "leap_", "slide", "turn_cut", "stumble_")):
            follow_through(act)
    rig.animation_data.action = bpy.data.actions["run"]


# Overlapping action for the one-shots: (driven bone, axis, driver bones, gain). The head and neck drag
# behind the trunk's pitch and roll and overshoot when it stops; the forearms and hands trail the swing of
# the upper arms. Each is a damped spring (~2.4 Hz, ζ 0.42) driven by the driver's angular acceleration.
FOLLOW = [("neck", 0, ("hips", "spine", "chest"), 0.22), ("head", 0, ("hips", "spine", "chest"), 0.32),
          ("head", 2, ("spine", "chest"), 0.25),
          ("forearm.L", 0, ("upper_arm.L",), 0.3), ("forearm.R", 0, ("upper_arm.R",), 0.3),
          ("hand.L", 0, ("upper_arm.L", "forearm.L"), 0.25), ("hand.R", 0, ("upper_arm.R", "forearm.R"), 0.25)]


def follow_through(act, hz=2.4, zeta=0.42, lim=0.3):
    fc = {(f.data_path, f.array_index): f for f in act.fcurves}

    def curve(b, i):
        return fc.get((f'pose.bones["{b}"].rotation_euler', i))
    f0, f1 = (int(x) for x in act.frame_range)
    frames = list(range(f0, f1 + 1))
    dt = 1.0 / FPS
    w0 = 2 * math.pi * hz
    base = {}
    for b, i, drv, g in FOLLOW:
        c = curve(b, i)
        if c is None:
            continue
        if (b, i) not in base:
            base[(b, i)] = [c.evaluate(t) for t in frames]
        a = [sum(curve(d, i).evaluate(t) for d in drv if curve(d, i)) for t in frames]
        o = v = 0.0
        out = []
        for k in range(len(frames)):
            acc = (a[min(k + 1, len(a) - 1)] - 2 * a[k] + a[max(k - 1, 0)]) / (dt * dt)
            for _ in range(4):
                h = dt / 4
                v += (-w0 * w0 * o - 2 * zeta * w0 * v - g * acc) * h
                o += v * h
            o = max(-lim, min(lim, o))
            out.append(o)
        base[(b, i)] = [x + y for x, y in zip(base[(b, i)], out)]
    for (b, i), vals in base.items():
        c = curve(b, i)
        c.keyframe_points.clear()
        for t, x in zip(frames, vals):
            kp = c.keyframe_points.insert(t, x, options={"FAST"})
            kp.interpolation = "LINEAR"
        c.update()


def run_in(fr=1):
    P0, x0 = loco(0.0, RUN)
    key(fr, P0, z=gait_root(0.0, RUN), x=x0)


def sit_look_up(P, look, br):
    torso(P, lean=0.23, look=look, hp=-0.2, breath=0.02 * br, head_yaw=0.05)
    leg(P, "L", hip=1.5, knee=1.65, ankle=-0.2, out=0.1)
    leg(P, "R", hip=1.6, knee=1.0, ankle=0.0, out=0.14)
    arm(P, "L", fwd=0.9, elbow=1.3, out=0.2, curl=0.4)
    arm(P, "R", fwd=-0.4, elbow=0.3, out=0.25, wrist=-0.7, curl=0.2, shrug=-0.3)  # palm down on the stone beside him


def kneel_one(P, lean=0.4, look=0.0, head_yaw=0.0):
    torso(P, lean=lean, look=look, hp=0.2, head_yaw=head_yaw)
    leg(P, "L", hip=0.25, knee=1.8, ankle=0.3, toe=0.6)
    leg(P, "R", hip=1.95, knee=1.7, ankle=0.0, out=0.14)


def standing_turned(P, yaw):
    # The root bone's local Z is world up: rotation about it turns the whole body.
    P["root"] = (0, 0, yaw)

AKIMBO = dict(fwd=-0.1, elbow=1.8, out=0.5, twist=-1.1, wrist=0.3, curl=0.5)  # hand on the hip, knuckles in
FISTS = dict(fwd=0.2, elbow=1.25, out=0.25, curl=1.1)  # loose fists at the waist


DECEL = 30  # frames from the run to the braking plant (decel())


def decel(f0=1):
    """Run → stop over ~1 s: four slowing steps, each a little longer, the stride shortening, the arm
    swing dying away and the trunk coming up and back to brake; a last braking plant, a glance back over
    the shoulder at what he got away from, and the arms swinging on through it."""
    run_in(f0)
    for d, ph, k, back in ((5, 0.5, 0.8, 0.0), (11, 0.0, 0.6, 0.04), (18, 0.5, 0.42, 0.07), (26, 0.0, 0.26, 0.08)):
        P, x = loco(ph, RUN, k)
        nudge(P, "spine", dx=0.55 * back)
        nudge(P, "chest", dx=0.45 * back)
        nudge(P, "neck", dx=-0.3 * back)
        key(f0 + d - 1, P, z=gait_root(ph, RUN, k), x=x)
    P = {}
    torso(P, lean=0.12, look=0.12, hp=0.04, head_yaw=0.55, yaw=0.12)
    leg(P, "L", hip=0.4, knee=0.3, ankle=-0.18)
    leg(P, "R", hip=0.0, knee=0.4, ankle=0.18, toe=0.2)
    arm(P, "L", fwd=0.55, elbow=0.8, out=0.3, curl=0.4)
    arm(P, "R", fwd=0.4, elbow=0.9, out=0.3, curl=0.4)
    key(f0 + DECEL, P)
    return f0 + DECEL


def balls(P, x=0.0, y=0.0):
    """World (x, y) of each foot's ball (the toe joint) for pose P with the hips offset (x, y) in the root
    frame (forward kinematics on the rig, the root bone's turn included)."""
    act = RIG.animation_data.action
    RIG.animation_data.action = None
    pb = RIG.pose.bones
    for p in pb:
        p.rotation_euler = Euler((0, 0, 0))
        p.location = Vector((0, 0, 0))
    for name, rot in P.items():
        pb[name].rotation_euler = Euler(rot)
    pb["hips"].location = hips_loc(x, y, 0.0)
    bpy.context.view_layer.update()
    M = RIG.matrix_world
    out = {s: (M @ pb[f"toe.{s}"].head).to_2d() for s in "LR"}
    RIG.animation_data.action = act
    return out


def turn_to(f0, yaw, arms, y=0.0, yaw0=0.0):
    """Round to `yaw` in real steps: each one a pivot on the ball of the planted foot (it stays put while the
    heel swings round), then the other foot lifted, carried round and set down. The head leads and the
    trunk follows a little ahead of the hips (never wound up against them). Four steps for a half turn,
    6 frames each. The clip's later keys shift (time and place) to where the steps end (see STAGE)."""
    n = max(2, int(math.ceil(abs(yaw - yaw0) / 0.8)))
    f0 += STAGE["dt"]
    x_cur, y_cur = STAGE["x"], y + STAGE["y"]
    saved = dict(STAGE)
    STAGE.update(dt=0, x=0.0, y=0.0)

    def pose(k, lift_leg):
        P = {}
        lead = 0.3 * (1.0 - k)
        torso(P, lean=0.05, look=0.3, yaw=0.5 * lead, head_yaw=lead + (0.1 if k < 1.0 else 0.0), breath=0.03)
        standing(P, wide=0.11, bend=0.1)
        if lift_leg:
            leg(P, lift_leg, hip=0.35, knee=0.65, ankle=0.1, out=0.1)
        arm(P, "L", **arms)
        arm(P, "R", **arms)
        standing_turned(P, yaw0 + (yaw - yaw0) * k)
        return P
    first = "R" if yaw > yaw0 else "L"
    planted = balls(pose(0.0, None), x_cur, y_cur)
    for i in range(1, n + 1):
        swing = first if i % 2 else ("L" if first == "R" else "R")
        sup = "L" if swing == "R" else "R"
        for frac, lift in ((0.5, swing), (1.0, None)):
            k = (i - 1 + frac) / n
            P = pose(k, lift)
            # The support foot's ball stays where it is: the hips offset (root frame) that puts it there.
            b = balls(P, 0.0, 0.0)[sup]
            d = planted[sup] - b
            a = -(yaw0 + (yaw - yaw0) * k)
            ox = d.x * math.cos(a) - d.y * math.sin(a)
            oy = d.x * math.sin(a) + d.y * math.cos(a)
            key(f0 + int(round(6 * (i - 1 + frac))), P, x=ox, y=oy)
            x_cur, y_cur = ox, oy
        planted = balls(P, x_cur, y_cur)
    STAGE.update(dt=saved["dt"] + 6 * n - 14, x=x_cur, y=y_cur - y)


def hold(f0, yaw, arms, n=8, step=14, y=0.0):
    """The held payoff: breathing, the weight rocking from foot to foot, a nod, the head never still."""
    for i in range(n):
        side = 1 if i % 2 else -1
        P = {}
        nod = -0.12 if i == 2 else (-0.06 if i == 5 else 0.0)
        torso(P, lean=-0.05, look=0.32 + nod + 0.03 * side, breath=0.05 * (i % 2), hroll=0.035 * side,
              roll=-0.025 * side, head_yaw=0.06 * side, head_roll=0.03 * side)
        standing(P, wide=0.12, bend=0.04)
        # The unweighted leg relaxes: knee forward, heel light.
        leg(P, "R" if side > 0 else "L", hip=0.1, knee=0.24, ankle=0.12, out=0.1)
        arms(P, i)
        standing_turned(P, yaw)
        key(f0 + i * step, P, x=0.025 * side, y=y)



def extra_clips():
    """Crash and escape variants, and the fall at the push-off."""
    # ---------------------------------------------------------- fall_start: the gate slams as they push off
    new_action("fall_start")
    key(1, ready_pose())
    P = {}
    torso(P, lean=0.1, look=0.35, hp=0.0)
    leg(P, "L", hip=0.55, knee=0.8, ankle=-0.1)
    leg(P, "R", hip=0.0, knee=0.5, ankle=0.2)
    arm(P, "L", fwd=1.35, elbow=1.5, out=0.35, curl=0.3, shrug=0.2)
    arm(P, "R", fwd=1.3, elbow=1.55, out=0.35, curl=0.3, shrug=0.2)
    key(6, P, y=-0.05)
    P = {}
    torso(P, lean=-0.25, look=0.35, hp=-0.08, roll=0.08)
    leg(P, "L", hip=-0.35, knee=0.5, ankle=0.3)
    leg(P, "R", hip=0.3, knee=0.4, ankle=0.0)
    arm(P, "L", fwd=0.6, elbow=0.5, out=0.8, curl=0.2)
    arm(P, "R", fwd=0.5, elbow=0.4, out=0.75, curl=0.2)
    key(12, P, y=-0.3)
    P = {}
    torso(P, lean=-0.05, look=0.2, hp=-0.05, roll=-0.08)
    leg(P, "R", hip=-0.3, knee=0.9, ankle=0.4)
    leg(P, "L", hip=0.5, knee=1.1, ankle=0.0)
    arm(P, "L", fwd=0.3, elbow=0.5, out=0.6, curl=0.3)
    arm(P, "R", fwd=0.2, elbow=0.4, out=0.65, curl=0.3)
    key(18, P, y=-0.5)
    P = {}
    torso(P, lean=-0.1, look=0.15, hp=-0.15)
    leg(P, "L", hip=0.95, knee=0.8, ankle=0.0)
    leg(P, "R", hip=0.7, knee=1.1, ankle=0.2)
    arm(P, "L", fwd=-0.1, elbow=0.4, out=0.5, curl=0.2)
    arm(P, "R", fwd=-0.15, elbow=0.35, out=0.55, curl=0.2)
    key(22, P, z=solve_root(P) + 0.02, y=-0.56)  # legs going out from under him, the feet still over the stone
    P = {}
    torso(P, lean=0.1, look=0.05, hp=-0.25)
    leg(P, "L", hip=1.4, knee=1.2, ankle=-0.1)
    leg(P, "R", hip=1.55, knee=1.6, ankle=0.1)
    arm(P, "L", fwd=-0.6, elbow=0.2, out=0.4, wrist=-0.5, curl=0.1)
    arm(P, "R", fwd=-0.55, elbow=0.25, out=0.4, wrist=-0.5, curl=0.1)
    key(28, P, z=sit_ground(P), y=-0.6)  # lands on the seat
    for fr, look, br in ((34, -0.3, 0.0), (46, -0.25, 1.0), (58, -0.1, 0.0), (76, -0.35, 1.0), (92, -0.4, 0.0)):
        P = {}
        sit_look_up(P, look, br)
        key(fr, P, z=sit_ground(P), y=-0.62)  # on the seat on the floor, legs out (not on an invisible chair)

    # ---------------------------------------------------------- fall_gate_b: turn away from the slam, drop to a knee
    new_action("fall_gate_b")
    run_in()
    P = {}
    torso(P, lean=-0.1, look=0.25, hp=-0.02)
    leg(P, "L", hip=0.7, knee=0.3, ankle=-0.3)
    leg(P, "R", hip=0.0, knee=1.0, ankle=0.3)
    arm(P, "L", fwd=1.2, elbow=0.6, out=0.3, curl=0.1)
    arm(P, "R", fwd=1.1, elbow=0.6, out=0.3, curl=0.1)
    key(5, P)
    P = {}
    torso(P, lean=0.15, look=-0.1, yaw=-0.45, hyaw=-0.2, head_yaw=-1.0, head_roll=0.15)
    leg(P, "L", hip=0.35, knee=0.7, ankle=0.0)
    leg(P, "R", hip=-0.2, knee=0.8, ankle=0.4)
    arm(P, "R", fwd=2.1, elbow=1.75, out=0.68, twist=-0.3, curl=0.9, shrug=0.25)
    arm(P, "L", fwd=-0.3, elbow=0.9, out=0.45, curl=0.6)
    key(10, P, y=-0.08)
    P = {}
    torso(P, lean=0.35, look=-0.2, yaw=-0.35, hyaw=-0.15, head_yaw=-0.8)
    leg(P, "L", hip=0.6, knee=1.3, ankle=0.1)
    leg(P, "R", hip=0.1, knee=1.3, ankle=0.4)
    arm(P, "R", fwd=2.2, elbow=1.85, out=0.62, twist=-0.3, curl=0.9, shrug=0.25)
    arm(P, "L", fwd=0.2, elbow=0.8, out=0.4, curl=0.6)
    key(16, P, y=-0.25)
    P = {}
    kneel_one(P, lean=0.5, look=-0.3, head_yaw=-0.4)
    arm(P, "R", fwd=2.0, elbow=1.9, out=0.5, twist=-0.3, curl=0.9)
    arm(P, "L", fwd=0.9, elbow=0.1, out=0.25, wrist=-0.8, curl=0.1)
    key(24, P, y=-0.35)
    for fr, t in ((36, 0.0), (52, 0.4), (70, 1.0), (95, 1.0)):
        P = {}
        kneel_one(P, lean=0.5 + 0.1 * t, look=-0.3 - 0.15 * t, head_yaw=-0.4 * (1 - t))
        arm(P, "R", fwd=2.0 - 1.2 * t, elbow=1.9 - 1.5 * t, out=0.5 - 0.3 * t, curl=0.9 - 0.4 * t)
        arm(P, "L", fwd=0.9 - 0.4 * t, elbow=0.1 + 0.3 * t, out=0.25, wrist=-0.8 * (1 - t), curl=0.2)
        key(fr, P, y=-0.35)

    # ---------------------------------------------------------- fall_rock_b: thrown back onto the seat, arm up against the dust
    new_action("fall_rock_b")
    run_in()
    P = {}
    torso(P, lean=0.05, look=0.3, hp=0.0)
    leg(P, "L", hip=0.7, knee=0.4, ankle=-0.3)
    leg(P, "R", hip=0.0, knee=0.9, ankle=0.3)
    arm(P, "L", fwd=1.4, elbow=1.1, out=0.5, curl=0.4, shrug=0.2)
    arm(P, "R", fwd=1.3, elbow=1.2, out=0.5, curl=0.4, shrug=0.2)
    key(4, P)
    P = {}
    torso(P, lean=-0.45, look=0.55, hp=-0.15)
    leg(P, "L", hip=0.9, knee=0.5, ankle=-0.2)
    leg(P, "R", hip=0.4, knee=1.2, ankle=0.1)
    arm(P, "L", fwd=2.0, elbow=1.2, out=0.6, curl=0.6)
    arm(P, "R", fwd=0.6, elbow=0.6, out=0.8, curl=0.3)
    key(9, P, y=-0.25)
    P = {}
    torso(P, lean=-0.35, look=0.4, hp=-0.3)
    leg(P, "L", hip=1.35, knee=0.5, ankle=-0.2)
    leg(P, "R", hip=1.1, knee=1.3, ankle=0.0, out=0.1)
    arm(P, "L", fwd=1.9, elbow=1.3, out=0.6, curl=0.6)
    arm(P, "R", fwd=-0.8, elbow=0.15, out=0.35, wrist=-0.7, curl=0.1)
    key(16, P, y=-0.55)
    P = {}
    torso(P, lean=-0.25, look=0.3, hp=-0.28)
    leg(P, "L", hip=1.45, knee=0.45, ankle=-0.2)
    leg(P, "R", hip=1.5, knee=1.1, ankle=0.0, out=0.1)
    arm(P, "L", fwd=1.9, elbow=1.3, out=0.6, curl=0.6)
    arm(P, "R", fwd=-0.8, elbow=0.15, out=0.4, wrist=-0.75, curl=0.1)
    key(18, P, z=solve_root(P) + 0.05, y=-0.57)  # the feet kick up as the seat comes down
    P = {}
    torso(P, lean=-0.1, look=0.15, hp=-0.26, head_roll=-0.08)
    leg(P, "L", hip=1.4, knee=0.55, ankle=-0.2)
    leg(P, "R", hip=1.55, knee=1.35, ankle=0.0, out=0.1)
    arm(P, "L", fwd=1.95, elbow=1.25, out=0.6, curl=0.6)
    arm(P, "R", fwd=-0.75, elbow=0.15, out=0.4, wrist=-0.75, curl=0.1, shrug=-0.3)
    # Down on the seat on the stone (legs out along it), the hand behind propping him up.
    key(22, P, z=sit_ground(P), y=-0.58)
    for fr, t, br in ((28, 0.0, 0.0), (44, 0.3, 1.0), (62, 0.7, 0.0), (80, 1.0, 1.0), (95, 1.0, 0.0)):
        P = {}
        torso(P, lean=-0.2 + 0.4 * t, look=0.35 - 0.6 * t, hp=-0.28, head_yaw=0.35 * math.sin(t * 3), breath=0.02 * br)
        leg(P, "L", hip=1.4 + 0.3 * t, out=0.09)
        leg(P, "R", hip=1.6, out=0.12)
        arm(P, "L", fwd=1.9 - 1.3 * t, elbow=1.3 - 0.4 * t, out=0.5, curl=0.6)
        arm(P, "R", fwd=-0.75, elbow=0.1 + 0.15 * t, out=0.4 - 0.1 * t, wrist=-0.8, curl=0.1, shrug=-0.3)  # the prop, on the stone
        key(fr, P, z=sit_ground(P), y=-0.6)

    # ---------------------------------------------------------- fall_chasm_b: skid down onto the knees at the lip
    new_action("fall_chasm_b")
    run_in()
    P = {}
    torso(P, lean=-0.15, look=0.25, hp=-0.05)
    leg(P, "L", hip=0.8, knee=0.3, ankle=-0.3)
    leg(P, "R", hip=0.05, knee=1.0, ankle=0.2)
    arm(P, "L", fwd=1.2, elbow=0.6, out=0.45, curl=0.1)
    arm(P, "R", fwd=1.0, elbow=0.7, out=0.5, curl=0.1)
    key(4, P)
    P = {}
    torso(P, lean=-0.3, look=0.2, hp=-0.1)
    leg(P, "L", hip=1.0, knee=0.6, ankle=-0.3)
    leg(P, "R", hip=0.1, knee=1.6, ankle=0.4, toe=0.4)
    arm(P, "L", fwd=1.5, elbow=0.4, out=0.7, curl=0.0)
    arm(P, "R", fwd=0.4, elbow=0.4, out=0.9, curl=0.0)
    key(10, P)
    P = {}
    torso(P, lean=0.45, look=-0.05, hp=0.15)
    leg(P, "L", hip=0.05, knee=1.75, ankle=0.4, toe=0.5)
    leg(P, "R", hip=0.1, knee=1.8, ankle=0.4, toe=0.5, out=0.08)
    arm(P, "L", fwd=1.0, elbow=0.25, out=0.3, wrist=-0.6, curl=0.1)
    arm(P, "R", fwd=0.95, elbow=0.25, out=0.3, wrist=-0.6, curl=0.1)
    key(16, P, y=-0.05)
    P = {}
    torso(P, lean=0.75, look=-0.1, hp=0.2)
    leg(P, "L", hip=0.1, knee=1.75, ankle=0.4, toe=0.5)
    leg(P, "R", hip=0.15, knee=1.8, ankle=0.4, toe=0.5, out=0.08)
    arm(P, "L", fwd=1.2, elbow=0.15, out=0.3, wrist=-0.8, curl=0.1)
    arm(P, "R", fwd=1.15, elbow=0.15, out=0.3, wrist=-0.8, curl=0.1)
    key(26, P, y=-0.05)
    # Settling back toward the heels: the knees stay on the stone (the pelvis lowers as the hips flex, the
    # shins fold a little further and the feet lie out flat behind), never a kneel hovering over the floor.
    def settle(fr, t, br, fix, unt=0.0):
        P = {}
        torso(P, lean=0.75 - 0.35 * t, look=-0.1 - 0.25 * t, hp=0.2 - 0.3 * t, head_yaw=0.25 * math.sin(fr * 0.3) * (1 - t), breath=0.03 * br)
        u = min(1.0, t / 0.6) * fix  # the feet lay out flat early in the settle, before the weight sinks back
        dk, da = (0.2 * t + unt) * fix, 1.6 * u  # unt: the shins fold up to lift the feet as the toes untuck
        leg(P, "L", hip=0.1 + 0.5 * t, knee=1.75 + 0.6 * t + dk, ankle=0.4 - 0.2 * t - da, toe=0.5 * (1 - u))
        leg(P, "R", hip=0.15 + 0.5 * t, knee=1.8 + 0.6 * t + dk, ankle=0.4 - 0.2 * t - da, toe=0.5 * (1 - u), out=0.08)
        arm(P, "L", fwd=1.2 - 0.9 * t, elbow=0.15 + 0.5 * t, out=0.3, wrist=-0.8 * (1 - t), curl=0.3)
        arm(P, "R", fwd=1.15 - 0.85 * t, elbow=0.15 + 0.5 * t, out=0.3, wrist=-0.8 * (1 - t), curl=0.3)
        return P

    for fr, t, br, unt in ((40, 0.0, 0.0, 0.0), (47, 0.3, 0.5, 0.45), (56, 0.6, 1.0, 0.0), (72, 1.0, 0.0, 0.0), (95, 1.0, 1.0, 0.0)):
        key(fr, settle(fr, t, br, 1, unt), z=solve_root(settle(fr, t, br, 0)) - 0.16 * t, y=-0.08)

    # ---------------------------------------------------------- the escapes, scaled by the multiplier (runner.ts picks):
    # win_pump (low), win_cheer (mid), win_cheer_big (high). Each: 2–3 slowing steps, relief, a turn to the
    # lens, the celebration, then a living hold (breathing, weight shifts, a nod) under the result card.
    FACE = 2.9
    for name in ("win_pump", "win_cheer", "win_cheer_big"):
        lvl = ("win_pump", "win_cheer", "win_cheer_big").index(name)
        new_action(name)
        decel(1)
        if lvl == 0:
            # Head back, a long breath out, hands to the hips.
            for fr, br in ((DECEL + 4, 0.0), (DECEL + 11, 1.0), (DECEL + 18, 0.3)):
                P = {}
                torso(P, lean=-0.08 - 0.06 * br, look=0.35 + 0.35 * br, hp=-0.04, breath=0.07 * br)
                standing(P, wide=0.11, bend=0.08)
                for sd in "LR":
                    arm(P, sd, **AKIMBO)
                key(fr, P)
            t = DECEL + 18
        else:
            # Hands on the knees, back heaving, eyes up the road.
            heave = ((5, 0.0), (11, 1.0), (17, 0.0), (23, 1.0)) if lvl == 2 else ((5, 0.0), (11, 1.0), (17, 0.0), (23, 1.0), (29, 0.0))
            heave = tuple((DECEL + d, br) for d, br in heave)
            for fr, br in heave:
                P = {}
                torso(P, lean=0.95 - 0.06 * br, look=0.85, hp=0.35, breath=0.07 * br)
                standing(P, wide=0.13, bend=0.3)
                for sd in "LR":
                    arm(P, sd, fwd=1.0, elbow=0.25, out=0.22, wrist=-0.3, curl=0.35, shrug=0.06 * br)
                key(fr, P)
            t = heave[-1][0]
        # Turn to the lens: three small steps, head leading.
        turn_to(t, FACE, arms=AKIMBO if lvl == 0 else FISTS)
        t += 14
        if lvl == 0:
            # A small fist pump: "yes!" — pulled down to the hip twice, a little dip into it.
            for d, ph in ((5, 0), (9, 1), (14, 0), (18, 1), (24, 2)):
                P = {}
                torso(P, lean=0.12 if ph == 1 else -0.02, look=0.25 if ph == 1 else 0.38, yaw=0.08)
                standing(P, wide=0.11, bend=0.16 if ph == 1 else 0.06)
                if ph == 0:
                    arm(P, "R", fwd=1.75, elbow=1.15, out=-0.35, curl=1.35, twist=0.1)  # cocked: fist up and out, above the shoulder
                elif ph == 1:
                    arm(P, "R", fwd=-0.2, elbow=1.7, out=0.15, curl=1.35, twist=0.1)  # yanked down to the hip
                else:
                    arm(P, "R", fwd=0.15, elbow=1.8, out=0.2, curl=1.35, twist=0.1)
                arm(P, "L", **AKIMBO)
                standing_turned(P, FACE)
                key(t + d, P)
            t += 24
            hold(t, FACE, lambda P, i: (arm(P, "R", **AKIMBO), arm(P, "L", **AKIMBO)))
            continue
        if lvl == 1:
            # Both fists up in a V, pumped twice (overhead, a negative "out" spreads the arms).
            for d, up, bend in ((6, 1.0, 0.04), (11, 0.88, 0.16), (16, 1.0, 0.03), (22, 0.92, 0.12), (30, 1.0, 0.04)):
                P = {}
                torso(P, lean=-0.18 * up, look=0.45 * up)
                standing(P, wide=0.13, bend=bend)
                for sd in "LR":
                    arm(P, sd, fwd=2.85 * up, elbow=0.05 + (1 - up) * 1.6, out=-0.45 * up + 0.3 * (1 - up), curl=1.35)
                standing_turned(P, FACE)
                key(t + d, P)
            t += 30

            def arms1(P, i):
                arm(P, "R", fwd=2.75 - 0.05 * (i % 2), elbow=0.15, out=-0.4, curl=1.35)
                arm(P, "L", **AKIMBO)
            hold(t + 10, FACE, arms1)
            continue
        # High: the roar, arms flung wide; then two jumping cheers, fists up; then the V held.
        for d in (6, 14):
            P = {}
            torso(P, lean=-0.28, look=0.55, breath=0.06)
            standing(P, wide=0.18, bend=0.16)
            for sd in "LR":
                arm(P, sd, fwd=0.55, elbow=0.35, out=1.45, twist=0.3, curl=1.35)
            standing_turned(P, FACE)
            key(t + d, P)
        t += 14
        for j in range(2):
            # Crouch, spring, air (knees tucked, fists up), land soft.
            P = {}
            torso(P, lean=0.35, look=0.3)
            standing(P, wide=0.14, bend=0.42)
            for sd in "LR":
                arm(P, sd, fwd=1.0 if j else 0.4, elbow=1.7 if j else 2.0, out=0.3 if j else 0.85, curl=1.35)
            standing_turned(P, FACE)
            key(t + 5, P)
            zc = solve_root(P)
            U = {}
            torso(U, lean=-0.15, look=0.5)
            leg(U, "L", hip=0.7, knee=1.3, ankle=0.3, out=0.1)
            leg(U, "R", hip=0.6, knee=1.2, ankle=0.3, out=0.12)
            for sd in "LR":
                arm(U, sd, fwd=2.9, elbow=0.1, out=-0.45, curl=1.35)
            standing_turned(U, FACE)
            # The arms throw up through the front (a key on the way, so they don't flip over the top).
            M = dict(U)
            for sd in "LR":
                arm(M, sd, fwd=1.6, elbow=0.5, out=0.3, curl=1.35)
            key(t + 7, M, z=-0.02 + 0.08)
            # In the air it keeps moving: the knees tuck up and kick out again, the fists punch, the head
            # tips back with the shout (not one held pose).
            for d, h, k in ((9, 0.22, 0.0), (11, 0.3, 1.0), (13, 0.26, 0.5), (14, 0.18, -0.4)):
                A = dict(U)
                torso(A, lean=-0.15 - 0.1 * k, look=0.5 + 0.2 * k, roll=0.06 * k * (1 if j else -1))
                leg(A, "L", hip=0.7 + 0.35 * k, knee=1.3 + 0.4 * k, ankle=0.3, out=0.1)
                leg(A, "R", hip=0.6 + 0.25 * k, knee=1.2 + 0.5 * k, ankle=0.3, out=0.12)
                for sd in "LR":
                    arm(A, sd, fwd=2.9 - 0.25 * k * (1 if sd == "L" else -0.5), elbow=0.1 + 0.25 * max(0.0, k), out=-0.45, curl=1.35)
                standing_turned(A, FACE)
                key(t + d, A, z=-0.02 + h)
            L = {}
            torso(L, lean=0.25, look=0.4)
            standing(L, wide=0.14, bend=0.32)
            for sd in "LR":
                arm(L, sd, fwd=2.4, elbow=0.4, out=-0.35, curl=1.35)
            standing_turned(L, FACE)
            key(t + 17, L)
            t += 17

        def arms2(P, i):
            for sd in "LR":
                arm(P, sd, fwd=2.75 - 0.06 * ((i + (sd == "L")) % 2), elbow=0.15, out=-0.42, curl=1.35)
        hold(t + 8, FACE, arms2)

    # ---------------------------------------------------------- win_salute: ease down to a walk, turn back, salute
    new_action("win_salute")
    run_in()
    P, x = loco(0.5, RUN, 0.6)
    key(8, P, z=gait_root(0.5, RUN, 0.6), x=x)
    P, x = loco(0.0, RUN, 0.3)
    key(15, P, z=gait_root(0.0, RUN, 0.3), x=x)
    # Plant, and a fist pump pulled down to the hip: "yes!" (the low-tier escape's payoff starts here).
    P = {}
    torso(P, lean=0.28, look=0.12, hp=0.08)
    standing(P, wide=0.1, bend=0.2)
    arm(P, "R", fwd=0.55, elbow=2.1, out=0.22, curl=1.35, twist=0.2)
    arm(P, "L", fwd=0.2, elbow=0.9, out=0.2, curl=0.9)
    key(18, P)
    # ... then punched at the sky, held a beat (the camera is behind him: it has to clear his head).
    for fr in (22, 27):
        P = {}
        torso(P, lean=-0.04, look=0.3, hp=0.0)
        standing(P, wide=0.1, bend=0.08)
        arm(P, "R", fwd=2.75, elbow=0.3, out=-0.25, curl=1.35, twist=0.2)
        arm(P, "L", fwd=0.15, elbow=1.0, out=0.25, curl=0.9)
        key(fr, P)
    # Turn back toward the ruins, breathing hard, a hand on the hip, chest up.
    akimbo = AKIMBO
    for fr, yaw, lift_leg, br in ((33, 0.9, "R", 1.0), (38, 1.9, "L", 0.0), (43, 2.7, "R", 1.0), (48, 2.85, None, 0.0)):
        P = {}
        torso(P, lean=0.06, look=0.15, head_yaw=0.35 if fr < 41 else 0.0, breath=0.04 * br)
        standing(P, wide=0.09, bend=0.06)
        if lift_leg:
            leg(P, lift_leg, hip=0.4, knee=0.7, ankle=0.1)
        arm(P, "L", **akimbo)
        arm(P, "R", fwd=0.7, elbow=2.0, out=0.25, curl=1.35, twist=0.2)
        standing_turned(P, yaw)
        key(fr, P)
    # Two fingers to the brow, then out: a salute to the ruins.
    for fr, ph in ((54, 1), (62, 1), (68, 2), (76, 3)):
        P = {}
        torso(P, lean=0.0, look=0.15, yaw=-0.08)
        standing(P, wide=0.09, bend=0.04)
        if ph == 1:
            arm(P, "R", fwd=1.2, elbow=2.35, out=0.75, twist=0.5, wrist=0.3, curl=0.9)
        elif ph == 2:
            arm(P, "R", fwd=1.6, elbow=0.9, out=0.95, twist=0.2, curl=0.9)
        else:
            arm(P, "R", fwd=0.5, elbow=1.9, out=0.2, curl=1.35, twist=0.2)
        arm(P, "L", **akimbo)
        standing_turned(P, 2.85)
        key(fr, P)
    # And it holds as a payoff: the fist raised above the head, a hand on the hip, chest out, chin up,
    # still catching his breath (the result card shows over this; the clip clamps on its last key).
    for fr, br in ((86, 0.0), (96, 1.0), (106, 0.0), (118, 1.0), (130, 0.0)):
        P = {}
        torso(P, lean=-0.06, look=0.28, yaw=-0.1, breath=0.04 * br)
        standing(P, wide=0.1, bend=0.05)
        # Raised wide of the head (out < 0 overhead), so the lens in front still sees his face.
        arm(P, "R", fwd=2.3 + 0.05 * br, elbow=0.8, out=-0.42, curl=1.35, twist=0.25)
        arm(P, "L", **akimbo)
        P["shoulder.R"] = (0.12, 0, 0)
        standing_turned(P, 2.85)
        key(fr, P)

    # ---------------------------------------------------------- win_leap: a bound and a leap, fist punched at the sky
    new_action("win_leap")
    run_in()
    P, x = loco(0.5, RUN, 0.9)
    key(5, P, z=gait_root(0.5, RUN, 0.9), x=x)
    P = {}
    torso(P, lean=0.5, look=0.45, hp=0.2)
    leg(P, "L", hip=0.7, knee=1.2, ankle=-0.1)
    leg(P, "R", hip=0.0, knee=0.9, ankle=0.4)
    arm(P, "L", fwd=-0.9, elbow=0.6, out=0.2, curl=0.8)
    arm(P, "R", fwd=-0.8, elbow=0.6, out=0.2, curl=0.8)
    key(9, P, )
    # The arm swings up through the front on the way (not through the gimbal over the top).
    P = {}
    torso(P, lean=0.25, look=0.4)
    leg(P, "L", hip=1.0, knee=1.45, ankle=0.0)
    leg(P, "R", hip=-0.25, knee=0.6, ankle=0.55, toe=0.3)
    arm(P, "R", fwd=1.4, elbow=0.55, out=0.12, curl=1.2, twist=0.1)
    arm(P, "L", fwd=0.1, elbow=0.7, out=0.5, curl=0.8)
    key(12, P, lift=0.25)
    P = {}
    torso(P, lean=0.05, look=0.35)
    leg(P, "L", hip=1.25, knee=1.6, ankle=0.1)
    leg(P, "R", hip=-0.35, knee=0.5, ankle=0.6, toe=0.3)
    arm(P, "R", fwd=2.85, elbow=0.3, out=-0.25, curl=1.35, twist=0.2)
    arm(P, "L", fwd=0.4, elbow=0.8, out=0.9, curl=0.8)
    key(14, P, lift=0.45)
    P = {}
    torso(P, lean=-0.05, look=0.45)
    leg(P, "L", hip=1.1, knee=1.3, ankle=0.1)
    leg(P, "R", hip=0.2, knee=1.2, ankle=0.3)
    arm(P, "R", fwd=3.0, elbow=0.2, out=-0.25, curl=1.35, twist=0.2)
    arm(P, "L", fwd=0.5, elbow=0.8, out=1.0, curl=0.8)
    key(20, P, lift=0.55)
    P = {}
    torso(P, lean=0.55, look=0.4, hp=0.25)
    leg(P, "L", hip=1.3, knee=2.0, ankle=-0.25)
    leg(P, "R", hip=0.5, knee=2.0, ankle=0.35, toe=0.5)
    arm(P, "R", fwd=1.0, elbow=1.2, out=0.5, curl=1.2)
    arm(P, "L", fwd=0.9, elbow=0.2, out=0.4, wrist=-0.7, curl=0.1)
    key(27, P, )
    P = {}
    torso(P, lean=0.68, look=0.3, hp=0.3)
    leg(P, "L", hip=1.45, knee=2.2, ankle=-0.35)
    leg(P, "R", hip=0.6, knee=2.2, ankle=0.4, toe=0.55)
    arm(P, "R", fwd=0.9, elbow=1.3, out=0.5, curl=1.2)
    arm(P, "L", fwd=1.0, elbow=0.15, out=0.4, wrist=-0.8, curl=0.1)
    key(30, P, )
    key(35, P, )
    P = {}
    torso(P, lean=0.2, look=0.2)
    standing(P, wide=0.1, bend=0.2)
    arm(P, "R", fwd=0.6, elbow=2.1, out=0.2, curl=1.35)
    arm(P, "L", fwd=0.2, elbow=0.7, out=0.25, curl=0.8)
    key(44, P, )
    for fr, up in ((52, 0.0), (60, 1.0), (72, 0.97)):
        P = {}
        torso(P, lean=0.12 - 0.22 * up, look=0.1 + 0.3 * up, yaw=-0.1 * up)
        standing(P, wide=0.1, bend=0.12 - 0.08 * up)
        if up > 0:
            arm(P, "R", fwd=2.95 * up, elbow=0.3, out=-0.25, curl=1.35, twist=0.3)
        else:
            arm(P, "R", fwd=0.7, elbow=2.3, out=0.15, curl=1.35)
        arm(P, "L", fwd=0.12, elbow=0.95, out=0.22, curl=1.2)
        key(fr, P, )
    # Round to the lens, both fists up, and the living hold.
    turn_to(74, 2.9, arms=FISTS)
    P = {}
    torso(P, lean=-0.2, look=0.5)
    standing(P, wide=0.14, bend=0.05)
    for sd in "LR":
        arm(P, sd, fwd=2.85, elbow=0.08, out=-0.45, curl=1.35)
    standing_turned(P, 2.9)
    key(94, P)

    def arms_l(P, i):
        arm(P, "R", fwd=2.75 - 0.05 * (i % 2), elbow=0.15, out=-0.4, curl=1.35)
        arm(P, "L", **AKIMBO)
    hold(104, 2.9, arms_l)

    epic_clips()
    obstacle_clips()
    crash_clips()


def epic_clips():
    """Payoffs for the biggest settled rounds (50x+): the FX director picks them."""
    # ---------------------------------------------------------- win_slide: a baseball slide under a closing gate,
    # pop up on the far side, fist to the sky (held under the result card)
    new_action("win_slide")
    run_in()
    P, x = loco(0.5, RUN, 0.95)
    key(4, P, z=gait_root(0.5, RUN, 0.95), x=x)
    # Drop: the lead leg shoots forward, the other folds under, the trunk lies back, a hand trails.
    for fr, y, wob in ((8, 0.25, 0.0), (13, 0.75, 1.0), (19, 1.2, -1.0), (25, 1.5, 0.5)):
        P = {}
        torso(P, lean=-0.42 + 0.03 * wob, look=0.55, hp=-0.15, roll=0.04 * wob, head_yaw=0.05 * wob)
        leg(P, "L", hip=1.25, knee=0.12, ankle=-0.25)
        leg(P, "R", hip=0.35, knee=2.1, ankle=0.35, out=0.15)
        arm(P, "R", fwd=-0.75, elbow=0.25, out=0.35, wrist=-0.6, curl=0.3)
        arm(P, "L", fwd=1.3 + 0.1 * wob, elbow=0.7, out=0.35, curl=1.1)
        key(fr, P, y=y)
    # Up: the folded knee drives him onto his feet.
    P = {}
    kneel_one(P, lean=0.45, look=0.2)
    arm(P, "R", fwd=0.6, elbow=0.4, out=0.3, wrist=-0.6, curl=0.4)
    arm(P, "L", fwd=0.8, elbow=1.4, out=0.2, curl=1.1)
    key(31, P, y=1.7)
    P = {}
    torso(P, lean=0.15, look=0.2)
    standing(P, wide=0.12, bend=0.25)
    arm(P, "R", fwd=0.5, elbow=2.1, out=0.2, curl=1.35)
    arm(P, "L", fwd=0.3, elbow=1.0, out=0.3, curl=1.0)
    key(37, P, y=1.8)
    # A breath on his feet, hands to the thighs, a look back at the gate he went under …
    for fr, br, hy in ((42, 0.0, 0.2), (48, 1.0, 0.75), (54, 0.0, 0.9)):
        P = {}
        torso(P, lean=0.55 - 0.05 * br, look=0.6, hp=0.2, breath=0.07 * br, head_yaw=hy)
        standing(P, wide=0.13, bend=0.22)
        for sd in "LR":
            arm(P, sd, fwd=0.75, elbow=0.35, out=0.22, wrist=-0.3, curl=0.35, shrug=0.05 * br)
        key(fr, P, y=1.8)
    # … then round to it (and the lens), both fists punched up, and the living hold.
    turn_to(56, 2.9, arms=FISTS, y=1.8)
    for d, up, bend in ((6, 1.0, 0.04), (11, 0.88, 0.16), (16, 1.0, 0.03), (24, 0.95, 0.08)):
        P = {}
        torso(P, lean=-0.2 * up, look=0.5 * up, breath=0.05)
        standing(P, wide=0.14, bend=bend)
        for sd in "LR":
            arm(P, sd, fwd=2.85 * up, elbow=0.05 + (1 - up) * 1.6, out=-0.45 * up + 0.3 * (1 - up), curl=1.35)
        standing_turned(P, 2.9)
        key(70 + d, P, y=1.8)

    def arms_s(P, i):
        arm(P, "R", fwd=2.75 - 0.05 * (i % 2), elbow=0.15, out=-0.4, curl=1.35)
        arm(P, "L", **AKIMBO)
    hold(104, 2.9, arms_s, y=1.8)

    # ---------------------------------------------------------- fall_ledge: the floor goes; a desperate leap for the
    # far lip, a catch, a hang, one hand slips, and the drop (root below the floor: for collapse staging only)
    new_action("fall_ledge")
    run_in()
    P = {}
    torso(P, lean=0.5, look=0.3, hp=0.2)
    leg(P, "L", hip=-0.3, knee=0.25, ankle=0.8, toe=0.8)
    leg(P, "R", hip=1.3, knee=1.9, ankle=0.2)
    arm(P, "L", fwd=1.4, elbow=1.0, curl=0.9)
    arm(P, "R", fwd=-0.8, elbow=0.9, curl=0.9)
    key(5, P, lift=0.03)
    P = {}
    torso(P, lean=0.3, look=0.45, hp=0.15)
    leg(P, "L", hip=-0.35, knee=0.9, ankle=0.5)
    leg(P, "R", hip=0.5, knee=1.2, ankle=0.2)
    arm(P, "L", fwd=2.6, elbow=0.2, out=0.15, curl=0.3)
    arm(P, "R", fwd=2.5, elbow=0.25, out=0.15, curl=0.3)
    key(11, P, y=0.7, lift=0.35)
    # The catch: hands on the lip, the body slams against the wall below it and swings.
    hang = dict(fwd=2.95, elbow=0.35, out=-0.15, curl=1.2)
    for fr, sw, z in ((17, 0.0, -1.95), (23, 0.5, -1.98), (30, -0.35, -1.96), (37, 0.2, -1.97)):
        P = {}
        torso(P, lean=-0.05 + 0.1 * sw, look=0.6, hp=-0.05 + 0.1 * sw)
        leg(P, "L", hip=0.25 * sw + 0.1, knee=0.3 + 0.2 * abs(sw), ankle=0.3)
        leg(P, "R", hip=-0.2 * sw, knee=0.5, ankle=0.3)
        arm(P, "L", **hang)
        arm(P, "R", **hang)
        key(fr, P, z=z, y=1.45)
    # The left hand slips; he claws back up for it — and the right lets go.
    for fr, la in ((43, 1.4), (49, 2.6), (54, 1.7)):
        P = {}
        torso(P, lean=0.05, look=0.65, roll=-0.12, hp=0.0)
        leg(P, "L", hip=0.4, knee=0.8, ankle=0.3)
        leg(P, "R", hip=-0.1, knee=0.4, ankle=0.3)
        arm(P, "L", fwd=la, elbow=0.6, out=0.25, curl=0.5)
        arm(P, "R", **hang)
        key(fr, P, z=-2.0, y=1.45)
    for fr in range(57, 85, 2):
        u = (fr - 56) / FPS
        w = fr * 0.8
        P = {}
        torso(P, lean=-0.3, look=0.7, hp=-0.1, roll=0.08 * math.sin(w * 0.5))
        leg(P, "L", hip=0.3 + 0.3 * math.sin(w), knee=0.7, ankle=0.3, out=0.1)
        leg(P, "R", hip=0.3 - 0.3 * math.sin(w), knee=0.6, ankle=0.3, out=0.12)
        arm(P, "L", fwd=2.7 + 0.3 * math.sin(w * 1.3), elbow=0.4, out=0.3, curl=0.3)
        arm(P, "R", fwd=2.5 - 0.3 * math.sin(w * 1.3), elbow=0.4, out=0.35, curl=0.3)
        key(fr, P, z=-2.0 - 0.5 * G_ACC * u * u, y=1.45)


# ------------------------------------------------------------------ obstacle moves (the FX obstacle director)
def lerp_pose(A, B, u):
    out = {}
    for k in set(A) | set(B):
        a = A.get(k, (0.0, 0.0, 0.0))
        b = B.get(k, (0.0, 0.0, 0.0))
        out[k] = tuple(x + (y - x) * u for x, y in zip(a, b))
    return out


def pose_path(stops, u):
    """Piecewise eased blend through [(u, pose), ...]."""
    for (u0, A), (u1, B) in zip(stops, stops[1:]):
        if u <= u1:
            return lerp_pose(A, B, ease((u - u0) / max(1e-6, u1 - u0)))
    return dict(stops[-1][1])


def air(f0, f1, stops, z0, z1, h, x0=0.0, x1=0.0):
    """Key every frame of a flight: poses along `stops`, the hips on a parabola of apex h over the chord."""
    for f in range(f0, f1 + 1):
        u = (f - f0) / (f1 - f0)
        key(f, pose_path(stops, u), z=z0 + (z1 - z0) * u + 4 * h * u * (1 - u), x=x0 + (x1 - x0) * u)


def nudge(P, bone, dx=0.0, dy=0.0, dz=0.0):
    a = P.get(bone, (0.0, 0.0, 0.0))
    P[bone] = (a[0] + dx, a[1] + dy, a[2] + dz)


def gkey(fr, ph, G=None, k=1.0, **mods):
    G = G or RUN
    P, x = loco(ph, G, k)
    key(fr, P, z=gait_root(ph, G, k), x=x)
    return P


JL_LAND, JL_H = 24, 0.52
V_LAND, V_H = 22, 0.29
V_PLANT = (10, 16)  # frames the palm is on the stone
VY = 1.75  # the legs swing round to his left
# ... of which this share is the thighs turning in the hips (≤ ~50°, a natural range); the rest is the whole
# body turning sideways over the planted hand, the pelvis leading (no femur wrung 100° in its socket).
VT = 0.45
VL = (2.12, 2.18, 2.02)  # and up (thigh flexion) through the plant
VA = (1.0, 0.85, 0.1, -0.65, -1.1)  # the support arm: reach, plant start, over it, plant end, shove
SLIDE_Z = -0.55


def plant_hand(action, side, f0, f1, where, ramp=1):
    """Hold a wrist on a world point through frames f0..f1 with an IK constraint, baked into the action."""
    rig = RIG
    pb = rig.pose.bones
    emp = bpy.data.objects.new(f"plant_{action}", None)
    bpy.context.scene.collection.objects.link(emp)
    for f in range(f0 - ramp, f1 + ramp + 1):
        emp.location = where((f - 1) / FPS)
        emp.keyframe_insert("location", frame=f)
    c = pb[f"forearm.{side}"].constraints.new("IK")
    c.target = emp
    c.chain_count = 2
    for f, w in ((f0 - ramp - 1, 0.0), (f0, 1.0), (f1, 1.0), (f1 + ramp + 1, 0.0)):
        c.influence = w
        c.keyframe_insert("influence", frame=f)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    for b in rig.data.bones:
        b.select = b.name in (f"forearm.{side}", f"upper_arm.{side}")
    bpy.ops.nla.bake(frame_start=f0 - ramp - 1, frame_end=f1 + ramp + 1, only_selected=True, visual_keying=True,
                     clear_constraints=True, use_current_action=True, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    ea = emp.animation_data.action if emp.animation_data else None
    bpy.data.objects.remove(emp)
    if ea is not None:
        bpy.data.actions.remove(ea)
    if rig.animation_data.action.name != action:
        print(f"  plant_hand: bake wrote to {rig.animation_data.action.name}", flush=True)


def obstacle_clips():
    """Moves over, under and around the course, authored at run pace (5 m/s); each starts on a left strike
    (gait phase 0) and hands back to the gait at the phase noted (runner.ts OBSTACLES)."""
    # ---------------------------------------------------------- jump_log: a running hurdle stride over the trunk
    # (log_fallen_0: Ø 0.84 m, top ~0.8 m). Off the left foot; the right leg reaches over nearly straight,
    # heel leading, the trunk dips toward it and the left arm reaches along it while the right swings
    # back; the left (trail) leg folds and comes over high and out to the side, then pulls through to
    # become the next stride. The right foot takes the landing and he is straight back into the run.
    new_action("jump_log")
    run_in()
    gkey(4, 0.2)
    T = {}
    torso(T, lean=0.38, look=0.4, hp=0.18, yaw=0.08, hyaw=-0.06)
    leg(T, "L", hip=-0.42, knee=0.25, ankle=0.8, toe=0.75)
    leg(T, "R", hip=1.5, knee=1.6, ankle=0.0)
    arm(T, "L", fwd=1.1, elbow=1.2, out=0.15, curl=0.45)
    arm(T, "R", fwd=-0.75, elbow=1.1, out=0.22, curl=0.45)
    zt = solve_root(T)
    # Rising: the lead knee unfolds, the trail leg leaves the floor folding.
    U1 = {}
    torso(U1, lean=0.55, look=0.5, hp=0.22, yaw=0.12, hyaw=-0.1)
    leg(U1, "R", hip=2.05, knee=0.75, ankle=-0.25)
    leg(U1, "L", hip=-0.15, knee=1.6, ankle=0.4, out=0.25)
    arm(U1, "L", fwd=1.45, elbow=0.6, out=0.1, wrist=0.1, curl=0.35)
    arm(U1, "R", fwd=-0.75, elbow=1.25, out=0.35, curl=0.4)
    # Over the top: lead leg out straight, heel first; chest down to the knee; the trail knee comes up and
    # round at the side, foot tucked to the seat, high.
    U2 = {}
    torso(U2, lean=0.82, look=0.75, hp=0.25, yaw=0.18, hyaw=-0.2, roll=0.05)
    leg(U2, "R", hip=1.9, knee=0.15, ankle=-0.3)
    leg(U2, "L", hip=0.55, knee=2.2, ankle=-0.1, out=1.15, yaw=-0.3)
    arm(U2, "L", fwd=1.55, elbow=0.35, out=0.05, wrist=0.15, curl=0.3)
    arm(U2, "R", fwd=-0.45, elbow=1.35, out=0.45, curl=0.4)
    # Coming down: the lead leg cuts down for the floor, the trail knee pulls through in front, high, the
    # arms start to swap.
    U3 = {}
    torso(U3, lean=0.6, look=0.55, hp=0.22, yaw=0.0, hyaw=0.05)
    leg(U3, "R", hip=1.35, knee=0.2, ankle=-0.15)
    leg(U3, "L", hip=1.05, knee=2.1, ankle=0.0, out=0.55, yaw=-0.15)
    arm(U3, "L", fwd=0.9, elbow=0.9, out=0.15, curl=0.4)
    arm(U3, "R", fwd=0.1, elbow=1.3, out=0.3, curl=0.4)
    # Touchdown on the right (the run's right strike), the left knee driving on.
    D, _ = loco(0.5, RUN)
    torso(D, lean=0.42, look=0.45, hp=0.2, yaw=-0.06, hyaw=0.05)
    leg(D, "L", hip=1.15, knee=1.75, ankle=0.05, out=0.15)
    arm(D, "R", fwd=0.85, elbow=1.4, out=0.2, curl=0.45)
    arm(D, "L", fwd=-0.55, elbow=1.15, out=0.25, curl=0.45)
    zl = gait_root(0.5, RUN)
    air(6, JL_LAND, [(0.0, T), (0.17, U1), (0.5, U2), (0.78, U3), (1.0, D)], zt, zl, JL_H)
    # No pause: a slightly deeper first stance (soaking the drop), then the stride rolls on.
    P, x = loco(0.6, RUN)
    nudge(P, "shin.R", dx=0.12)
    nudge(P, "thigh.R", dx=-0.06)
    key(JL_LAND + 2, P, z=gait_root(0.6, RUN) - 0.025, x=x)
    gkey(JL_LAND + 4, 0.7)

    # ---------------------------------------------------------- leap_gap: bound across a 1.5–3 m gap
    # (nominal 0.5 s flight; the runtime stretches the flight and its arc to the actual gap)
    new_action("leap_gap")
    run_in()
    gkey(4, 0.2)
    T = {}
    torso(T, lean=0.45, look=0.5, hp=0.2)
    leg(T, "L", hip=-0.45, knee=0.2, ankle=0.8, toe=0.75)
    leg(T, "R", hip=1.45, knee=1.6, ankle=0.15)
    arm(T, "L", fwd=1.8, elbow=0.9, out=0.15, curl=0.7)
    arm(T, "R", fwd=1.1, elbow=1.0, out=0.2, curl=0.7)
    zt = solve_root(T)
    R1 = {}
    torso(R1, lean=0.3, look=0.55, hp=0.12)
    leg(R1, "R", hip=1.2, knee=1.0, ankle=0.1)
    leg(R1, "L", hip=-0.35, knee=1.45, ankle=0.4)
    arm(R1, "L", fwd=2.3, elbow=0.45, out=0.3, curl=0.4)
    arm(R1, "R", fwd=2.0, elbow=0.5, out=0.35, curl=0.4)
    R2 = {}
    torso(R2, lean=0.32, look=0.5, hp=0.12)
    leg(R2, "L", hip=1.25, knee=1.05, ankle=0.1)
    leg(R2, "R", hip=-0.25, knee=1.55, ankle=0.4)
    arm(R2, "L", fwd=1.9, elbow=0.55, out=0.45, curl=0.4)
    arm(R2, "R", fwd=2.35, elbow=0.45, out=0.4, curl=0.4)
    D = {}
    torso(D, lean=0.45, look=0.4, hp=0.18)
    leg(D, "L", hip=1.05, knee=0.35, ankle=-0.1)
    leg(D, "R", hip=0.7, knee=0.8, ankle=0.1)
    arm(D, "L", fwd=1.2, elbow=0.5, out=0.35, curl=0.6)
    arm(D, "R", fwd=1.3, elbow=0.5, out=0.35, curl=0.6)
    zl = solve_root(D)
    air(7, 22, [(0.0, T), (0.35, R1), (0.7, R2), (1.0, D)], zt, zl, 0.31)
    # Heavy landing: both knees fold to soak it, hands forward toward the ground, then drive out of it.
    for fr, k in ((24, 0.6), (27, 1.0)):
        A = {}
        torso(A, lean=0.55 + 0.25 * k, look=0.55 + 0.2 * k, hp=0.22 + 0.1 * k)
        leg(A, "L", hip=0.95 + 0.3 * k, knee=0.6 + 0.9 * k, ankle=-0.2 - 0.3 * k)
        leg(A, "R", hip=0.35 + 0.2 * k, knee=1.0 + 0.6 * k, ankle=0.2, toe=0.4)
        arm(A, "L", fwd=1.0 + 0.2 * k, elbow=0.4, out=0.35, wrist=-0.4, curl=0.6)
        arm(A, "R", fwd=0.9 + 0.2 * k, elbow=0.5, out=0.35, wrist=-0.4, curl=0.6)
        key(fr, A)
    # Out of the absorb over a few more frames (the first step drives up out of the crouch).
    P = gkey(32, 0.25, k=0.8)
    gkey(37, 0.5)

    # ---------------------------------------------------------- slide: under a low beam (head ≤ ~1.0 m), up running
    new_action("slide")
    run_in()
    gkey(4, 0.2)
    P = {}
    torso(P, lean=-0.2, look=0.4, hp=-0.08)
    leg(P, "L", hip=1.05, knee=0.35, ankle=-0.15)
    leg(P, "R", hip=0.15, knee=1.8, ankle=0.3, toe=0.4)
    arm(P, "L", fwd=1.0, elbow=0.9, out=0.3, curl=0.9)
    arm(P, "R", fwd=-0.3, elbow=0.6, out=0.4, curl=0.6)
    key(6, P)
    for fr, wob in ((9, 0.0), (13, 1.0), (18, -0.6)):
        P = {}
        # Down on the right hip: the folded leg lies flat (thigh turned out), the trunk well back.
        # (The lean back is mostly the pelvis rolling back; the spine itself arches no more than ~25°.)
        torso(P, lean=-0.56 + 0.03 * wob, look=0.4, hp=-0.36, roll=0.05 + 0.03 * wob)
        leg(P, "L", hip=1.24, knee=0.1, ankle=-0.3)
        leg(P, "R", hip=0.86, knee=2.4, ankle=0.3, out=0.9)
        arm(P, "R", fwd=-0.5, elbow=0.2, out=0.5, wrist=-0.6, curl=0.3)
        arm(P, "L", fwd=0.3 + 0.06 * wob, elbow=0.45, out=0.45, curl=1.0)
        key(fr, P, z=SLIDE_Z)
    # Up: the folded right knee and the planted left heel lever him back over his feet.
    P = {}
    torso(P, lean=0.55, look=0.45, hp=0.2)
    leg(P, "L", hip=1.4, knee=1.75, ankle=-0.2)
    leg(P, "R", hip=0.15, knee=1.9, ankle=0.3, toe=0.6)
    arm(P, "R", fwd=0.9, elbow=1.2, out=0.25, curl=1.0)
    arm(P, "L", fwd=-0.4, elbow=1.1, out=0.3, curl=1.0)
    key(21, P)
    P = {}
    torso(P, lean=0.45, look=0.45, hp=0.18)
    leg(P, "L", hip=0.7, knee=0.8, ankle=-0.05)
    leg(P, "R", hip=-0.3, knee=1.0, ankle=0.6, toe=0.6)
    arm(P, "R", fwd=1.0, elbow=1.4, curl=1.0)
    arm(P, "L", fwd=-0.6, elbow=1.1, out=0.25, curl=1.0)
    key(24, P)
    gkey(27, 0.25, k=0.9)
    gkey(30, 0.45)

    # ---------------------------------------------------------- vault: a one-hand speed vault over the toppled pillar
    # (pillar_topple_0: Ø 0.95 m, top ~0.93 m). Off the left foot, the right hand plants on top; the body
    # leans out over it while both legs swing round to the left, near level, knees soft; the hand stays
    # put as he passes over it (it slides back with the floor), then shoves off; the left foot lands.
    new_action("vault")
    run_in()
    gkey(4, 0.2)
    T = {}
    torso(T, lean=0.55, look=0.45, hp=0.2, yaw=-0.1)
    leg(T, "L", hip=-0.35, knee=0.3, ankle=0.75, toe=0.65)
    leg(T, "R", hip=1.75, knee=2.15, ankle=-0.1)
    arm(T, "R", fwd=VA[0], elbow=0.25, out=0.12, wrist=-0.9, curl=0.25)
    arm(T, "L", fwd=0.5, elbow=1.0, out=0.45, curl=0.4)
    zt = solve_root(T)
    # The push-off leg folds heel to seat at once, so it comes over the near face high.
    T2 = dict(T)
    torso(T2, lean=0.7, look=0.55, hp=0.2, yaw=0.0, hyaw=0.3, roll=-0.15)
    leg(T2, "L", hip=0.9, knee=1.95, ankle=-0.2, yaw=VY * 0.55 * VT)
    leg(T2, "R", hip=2.05, knee=2.45, ankle=-0.45, yaw=VY * 0.7 * VT)
    standing_turned(T2, -VY * 0.6 * (1 - VT))
    arm(T2, "R", fwd=0.95, elbow=0.1, out=0.1, wrist=-1.1, curl=0.2)
    # Plant (u 0.2 → 0.72): the arm sweeps from ahead of the shoulder to behind it as he passes over the
    # hand (world angle ≈ fwd − trunk pitch), so the palm keeps its place on the stone.
    P1 = {}
    torso(P1, lean=1.1, look=0.75, hp=0.2, yaw=0.0, hyaw=0.3, roll=0.3, hroll=-0.2)
    leg(P1, "L", hip=VL[0], knee=0.9, ankle=-0.25, yaw=VY * 1.05 * VT)
    leg(P1, "R", hip=VL[0] + 0.1, knee=1.1, ankle=-0.45, yaw=VY * VT)
    standing_turned(P1, -VY * 1.02 * (1 - VT))
    arm(P1, "R", fwd=VA[1], elbow=0.05, out=0.08, wrist=-1.2, curl=0.15)
    arm(P1, "L", fwd=0.7, elbow=0.7, out=0.9, curl=0.35)
    P2 = {}
    torso(P2, lean=1.15, look=0.75, hp=0.2, yaw=0.0, hyaw=0.4, roll=0.4, hroll=-0.3)
    leg(P2, "L", hip=VL[1], knee=0.2, ankle=-0.25, yaw=VY * VT)
    leg(P2, "R", hip=VL[1] - 0.05, knee=0.2, ankle=-0.25, yaw=VY * VT)
    standing_turned(P2, -VY * (1 - VT))
    arm(P2, "R", fwd=VA[2], elbow=0.0, out=0.1, wrist=-1.35, curl=0.15)
    arm(P2, "L", fwd=0.9, elbow=0.4, out=1.3, curl=0.35)
    P3 = {}
    torso(P3, lean=1.0, look=0.7, hp=0.2, yaw=0.0, hyaw=0.3, roll=0.3, hroll=-0.2)
    leg(P3, "L", hip=VL[2], knee=0.3, ankle=-0.2, yaw=VY * 0.6 * VT)
    leg(P3, "R", hip=VL[2] - 0.1, knee=0.9, ankle=-0.15, yaw=VY * 0.6 * VT)
    standing_turned(P3, -VY * 0.6 * (1 - VT))
    arm(P3, "R", fwd=VA[3], elbow=0.05, out=0.15, wrist=-1.1, curl=0.2)
    arm(P3, "L", fwd=0.9, elbow=0.5, out=1.1, curl=0.35)
    # Shove off: the hand leaves the stone, the left leg reaches down for the floor.
    P4 = {}
    torso(P4, lean=0.45, look=0.45, hp=0.15, yaw=0.05, hyaw=0.45, roll=-0.05)
    leg(P4, "L", hip=1.0, knee=0.25, ankle=-0.1)
    leg(P4, "R", hip=1.3, knee=1.4, ankle=0.0)
    arm(P4, "R", fwd=VA[4], elbow=0.4, out=0.25, wrist=-0.6, curl=0.35)
    arm(P4, "L", fwd=0.7, elbow=0.7, out=0.8, curl=0.4)
    D = {}
    torso(D, lean=0.38, look=0.45, hp=0.15, hyaw=0.15)
    leg(D, "L", hip=0.6, knee=0.3, ankle=0.0)
    leg(D, "R", hip=0.7, knee=1.6, ankle=0.2)
    arm(D, "R", fwd=0.4, elbow=1.2, out=0.3, curl=0.45)
    arm(D, "L", fwd=-0.1, elbow=1.1, out=0.45, curl=0.45)
    zl = solve_root(D)
    air(6, V_LAND, [(0.0, T), (0.15, T2), (0.24, P1), (0.46, P2), (0.7, P3), (0.86, P4), (1.0, D)], zt, zl, V_H)
    A = {}
    torso(A, lean=0.45, look=0.45, hp=0.2, hyaw=0.05)
    leg(A, "L", hip=0.45, knee=0.75, ankle=-0.15)
    leg(A, "R", hip=0.75, knee=1.6, ankle=0.15)
    arm(A, "R", fwd=0.7, elbow=1.3, out=0.25, curl=0.45)
    arm(A, "L", fwd=-0.4, elbow=1.2, out=0.3, curl=0.45)
    key(V_LAND + 2, A)
    gkey(V_LAND + 5, 0.3, k=0.9)
    gkey(V_LAND + 8, 0.5)
    # The palm on the stone: through the plant the right wrist is held (IK, baked) on the pillar's top,
    # which slides back past him with the floor at run pace (5 m/s in clip time).
    apex = 0.5 * (5 / 30 + (V_LAND - 1) / 30)
    plant_hand("vault", "R", V_PLANT[0], V_PLANT[1], lambda t: (-0.2, 5.0 * (apex - t), 0.93), ramp=3)

    # ---------------------------------------------------------- turn_cut_L / _R: plant the outside foot, cut 90°
    for side in "LR":
        sg = 1 if side == "L" else -1
        o = "R" if side == "L" else "L"
        new_action(f"turn_cut_{side}")
        # A left cut plants the right foot (its strike is gait phase 0.5); a right cut the left (phase 0), so
        # the right cut starts half a cycle later (on a right strike) and both plant on frame 9.
        p0 = 0.0 if side == "L" else 0.5
        # Keyed every frame: the stride runs on underneath (phase knots below) and the cut's accents (the
        # plant, the lean in, the arms for balance) blend in and out over it. Keyed only every 4 frames, the
        # in-betweens cut corners off the gait's curves and the shin snapped (~30°/frame) into the clip.
        knots = [(1, 0.0), (9, 0.5), (13, 0.75), (16, 0.85), (19, 1.0)]

        def phase_at(fr):
            for (f0, a), (f1, b) in zip(knots, knots[1:]):
                if fr <= f1:
                    return p0 + a + (b - a) * (fr - f0) / (f1 - f0)
            return p0 + 1.0

        def hat(fr, a, m, b):
            if fr <= a or fr >= b:
                return 0.0
            u = (fr - a) / (m - a) if fr <= m else (b - fr) / (b - m)
            return u * u * (3 - 2 * u)
        for fr in range(1, 20):
            ph = phase_at(fr) % 1.0
            P, x = loco(ph, RUN)
            w9, w13, w16 = hat(fr, 4, 9, 13), hat(fr, 9, 13, 16), hat(fr, 13, 16, 19)
            nudge(P, f"thigh.{o}", dz=0.22 * sgn(o) * w9)
            nudge(P, f"shin.{o}", dx=0.25 * w9)
            nudge(P, "chest", dy=(0.12 * w9 + 0.15 * w13 + 0.1 * w16) * sg)
            nudge(P, "spine", dy=0.08 * sg * w9)
            nudge(P, "neck", dy=(0.3 * w9 + 0.25 * w13) * sg)
            nudge(P, "head", dy=(0.2 * w9 + 0.15 * w13) * sg)
            if w9 > 0:
                # Arms for balance: the outside arm drives across, the inside one swings back and out.
                A = {}
                arm(A, side, fwd=-0.45, elbow=1.15, out=0.45, curl=0.9)
                arm(A, o, fwd=0.85, elbow=1.5, out=0.08, curl=0.9)
                for nm, v in A.items():
                    P[nm] = tuple(a + (b - a) * w9 for a, b in zip(P.get(nm, (0.0, 0.0, 0.0)), v))
            P["root"] = (0.0, (0.12 * w9 + 0.14 * w13 + 0.08 * w16) * sg, (0.12 * w9 + 0.3 * w13 + 0.1 * w16) * sg)
            key(fr, P, z=gait_root(ph, RUN) - 0.04 * w9 - 0.02 * w13, x=x - 0.06 * sg * w9)

    # ---------------------------------------------------------- stumble_land: a landing that goes wrong, then saved
    # (start it at a jump's or leap's landing in place of the clean one)
    new_action("stumble_land")
    D = {}
    torso(D, lean=0.3, look=0.45, hp=0.15)
    leg(D, "R", hip=0.75, knee=0.3, ankle=0.05)
    leg(D, "L", hip=0.25, knee=1.5, ankle=0.3)
    arm(D, "L", fwd=0.9, elbow=1.3, out=0.25, curl=1.0)
    arm(D, "R", fwd=-0.3, elbow=1.2, out=0.3, curl=1.0)
    key(1, D, z=solve_root(D) + 0.08)
    key(3, D)
    P = {}
    torso(P, lean=0.95, look=0.8, hp=0.35, roll=0.16, head_roll=0.1)
    leg(P, "R", hip=1.0, knee=1.6, ankle=-0.35, out=-0.12)
    leg(P, "L", hip=-0.1, knee=1.2, ankle=0.4, toe=0.4)
    arm(P, "L", fwd=0.5, elbow=0.4, out=1.15, curl=0.3)
    arm(P, "R", fwd=1.45, elbow=0.1, out=0.2, wrist=-0.7, curl=0.2)
    key(6, P)
    P = {}
    torso(P, lean=0.65, look=0.6, hp=0.25, roll=0.06)
    leg(P, "L", hip=1.2, knee=0.5, ankle=-0.15)
    leg(P, "R", hip=-0.2, knee=1.1, ankle=0.6, toe=0.5)
    arm(P, "L", fwd=0.6, elbow=0.7, out=0.8, curl=0.6)
    arm(P, "R", fwd=0.7, elbow=0.8, out=0.4, curl=0.6)
    key(9, P)
    P = gkey(13, 0.15, k=0.8)
    gkey(17, 0.4, k=0.9)
    gkey(20, 0.6)


# ------------------------------------------------------------------ the crash director's reactions (round 18)
# Rig space: forward +Y, the "L" side +X, up +Z. Root yaw + turns him toward his R side; on the hips, roll
# (torso hroll) + tips him toward the R side, and with the pelvis pitched flat (hp ~1.5) it log-rolls him
# about the forward axis. The root height of a lying or crumpled pose comes from floor_z: forward kinematics
# of the pose with a radius per bone, so the lowest surface of the body (not just the soles) is on the floor.
RAD = {"hips": 0.12, "spine": 0.11, "chest": 0.12, "neck": 0.06, "head": 0.1, "shoulder": 0.06,
       "upper_arm": 0.085, "forearm": 0.065, "hand": 0.035, "fingers": 0.02,
       "thigh": 0.085, "shin": 0.06, "toe": 0.05}
V_RUN = 0.2  # m per frame at the crash (6 m/s)
CADENCE_F = 0.072  # stride phase per frame at that pace


def floor_z(P, x=0.0, y=0.0):
    """The root height (hips location) that puts the lowest surface of pose P on the floor."""
    act = RIG.animation_data.action
    RIG.animation_data.action = None
    pb = RIG.pose.bones
    for p in pb:
        p.rotation_euler = Euler((0, 0, 0))
        p.location = Vector((0, 0, 0))
    for name, rot in P.items():
        pb[name].rotation_euler = Euler(rot)
    pb["hips"].location = hips_loc(x, y, 0.0)
    bpy.context.view_layer.update()
    M = RIG.matrix_world
    lo = 9.0
    for p in pb:
        base = p.name.split(".")[0]
        if base == "foot":
            # The heel sits ~9 cm under the ankle; the tail is the ball.
            lo = min(lo, (M @ p.head).z - 0.088, (M @ p.tail).z - 0.05)
        elif base in RAD:
            lo = min(lo, (M @ p.head).z - RAD[base], (M @ p.tail).z - RAD[base])
    RIG.animation_data.action = act
    return -lo


def fkey(fr, P, y=0.0, x=0.0, lift=0.0, base=0.0):
    """Key with the lowest point of the body on the floor (base: the floor's height; lift: off it)."""
    key(fr, P, z=floor_z(P, x, y) + base + lift, y=y, x=x)


def run_keys(f0, f1, y0=0.0, ph0=0.0, arms=None):
    """Running strides keyed every 2 frames, travelling forward at the crash pace."""
    for fr in range(f0, f1 + 1, 2):
        ph = (ph0 + CADENCE_F * (fr - f0)) % 1.0
        P, x = loco(ph, RUN)
        if arms:
            arms(P, fr)
        key(fr, P, z=gait_root(ph, RUN), x=x, y=y0 + V_RUN * (fr - f0))


def flail(P, w, k=1.0, arms=True, legs=True):
    """Arms windmilling and clawing, legs kicking: the struggle of a body in the air."""
    if legs:
        leg(P, "L", hip=0.15 + 0.45 * k * math.sin(w), knee=0.5 + 0.5 * k * max(0.0, math.sin(w + 1.2)), ankle=0.35, out=0.18)
        leg(P, "R", hip=0.15 - 0.45 * k * math.sin(w), knee=0.5 + 0.5 * k * max(0.0, -math.sin(w + 1.2)), ankle=0.35, out=0.22)
    if arms:
        # Up and out, windmilling (kept short of straight overhead, where the axes flip).
        arm(P, "L", fwd=1.95 + 0.55 * k * math.sin(w * 1.3), elbow=0.35 + 0.35 * math.sin(w), out=1.05 + 0.35 * k * math.sin(w * 1.1), curl=0.3)
        arm(P, "R", fwd=1.9 - 0.55 * k * math.sin(w * 1.3 + 0.8), elbow=0.4 + 0.3 * math.cos(w), out=1.1 + 0.35 * k * math.cos(w * 1.1), curl=0.3)


def crash_clips():
    # ---------------------------------------------------------- fall_trip: the trailing foot catches on a fallen
    # column; he pitches forward, one stumbling step, dives, hands then chest on the stone, rolls once, lies prone.
    new_action("fall_trip")
    run_keys(1, 5)
    # The catch (0.2 s): the R foot, swinging through, hooks the column and stops dead; the body carries
    # on over it, the L leg swings on, the arms jerk.
    P = {}
    torso(P, lean=0.3, look=0.2, hp=0.2)
    # (The L knee comes up high: that foot has to clear the column's top, ~0.5 m.)
    leg(P, "L", hip=1.55, knee=2.3, ankle=-0.35)
    leg(P, "R", hip=0.45, knee=1.2, ankle=0.4, toe=0.3)
    arm(P, "L", fwd=-0.5, elbow=1.2, out=0.25, curl=0.8)
    arm(P, "R", fwd=0.9, elbow=1.1, out=0.25, curl=0.8)
    # (A frame before: the L foot already snatched up off the stone, heel to the seat, to go over.)
    P6 = lerp_pose(loco((CADENCE_F * 5) % 1.0, RUN)[0], P, 0.5)
    leg(P6, "L", hip=0.7, knee=1.6, ankle=0.3)
    fkey(6, P6, y=0.98, lift=0.08)
    fkey(7, P, y=1.15, lift=0.1)
    # Pitching over: the R foot flung up behind, the L reaching for a step, the arms going out ahead.
    P = {}
    torso(P, lean=0.25, look=0.5, hp=0.6)
    leg(P, "L", hip=1.25, knee=0.7, ankle=0.0)
    leg(P, "R", hip=-0.45, knee=1.25, ankle=0.4)
    arm(P, "L", fwd=1.1, elbow=0.4, out=0.35, curl=0.3)
    arm(P, "R", fwd=1.0, elbow=0.5, out=0.35, curl=0.3)
    fkey(10, P, y=1.6, lift=0.08)
    # The stumbling step lands (0.37 s), too far under him to save it.
    P = {}
    torso(P, lean=0.25, look=0.6, hp=0.8)
    leg(P, "L", hip=1.2, knee=0.5, ankle=0.3)
    leg(P, "R", hip=-0.2, knee=1.3, ankle=0.4)
    arm(P, "L", fwd=1.2, elbow=0.35, out=0.35, curl=0.2)
    arm(P, "R", fwd=1.15, elbow=0.4, out=0.4, curl=0.2)
    fkey(12, P, y=1.95)
    P12 = P
    # Diving off it, arms out for the floor.
    P = {}
    torso(P, lean=0.15, look=0.7, hp=1.05)
    # (The heels fold up behind him: the legs pass over the column, not through it.)
    leg(P, "L", hip=-0.15, knee=1.3, ankle=0.6)
    leg(P, "R", hip=-0.05, knee=1.35, ankle=0.4)
    arm(P, "L", fwd=1.25, elbow=0.25, out=0.3, wrist=-0.5, curl=0.1)
    arm(P, "R", fwd=1.2, elbow=0.3, out=0.32, wrist=-0.5, curl=0.1)
    # (The push-off foot folds up as it leaves the stone instead of sweeping back low over the column.)
    P13 = lerp_pose(P12, P, 0.45)
    leg(P13, "L", hip=0.75, knee=2.0, ankle=0.4)
    fkey(14, P13, y=2.22, lift=0.1)
    fkey(15, P, y=2.35, lift=0.12)
    # The hands hit (0.53 s), palms flat, head up.
    P = {}
    torso(P, lean=0.12, look=0.7, hp=1.2)
    leg(P, "L", hip=-0.2, knee=1.2, ankle=0.5)
    leg(P, "R", hip=-0.1, knee=1.25, ankle=0.4)
    arm(P, "L", fwd=1.35, elbow=0.15, out=0.3, wrist=-0.9, curl=0.1)
    arm(P, "R", fwd=1.3, elbow=0.18, out=0.32, wrist=-0.9, curl=0.1)
    fkey(17, P, y=2.55)
    # The elbows give …
    P = {}
    torso(P, lean=0.05, look=0.75, hp=1.38)
    leg(P, "L", hip=-0.15, knee=1.0, ankle=0.5)
    leg(P, "R", hip=-0.1, knee=0.95, ankle=0.4)
    arm(P, "L", fwd=1.15, elbow=1.2, out=0.55, wrist=-0.6, curl=0.2)
    arm(P, "R", fwd=1.1, elbow=1.25, out=0.55, wrist=-0.6, curl=0.2)
    fkey(19, P, y=2.7)
    # … and the chest and the R shoulder take it (0.67 s), the face turned off the stone, the feet kicking up.
    # (Arms splayed out flat, the R one swept back, so it is the chest and the R shoulder on the stone.)
    for fr, roll, kn, y, la, ra in ((21, 0.3, 0.7, 2.85, (0.3, 0.9, 0.8), (0.0, 0.4, 0.4)), (23, 0.3, 0.95, 2.95, (0.2, 0.6, 1.0), (-0.3, 0.3, 0.2))):
        P = {}
        torso(P, lean=0.2, look=0.85, hp=1.62, hroll=roll, head_yaw=0.6)
        leg(P, "L", hip=-0.05, knee=kn, ankle=0.3, out=0.1)
        leg(P, "R", hip=-0.1, knee=kn - 0.2, ankle=0.3, out=0.1)
        arm(P, "L", fwd=la[0], elbow=la[1], out=la[2], curl=0.4)
        arm(P, "R", fwd=ra[0], elbow=ra[1], out=ra[2], curl=0.4)
        fkey(fr, P, y=y)
    # The momentum rolls him over once along the stone, arms in, legs together, slowing.
    for fr, u, y in ((26, 0.2, 3.05), (29, 0.45, 3.15), (32, 0.68, 3.22), (35, 0.86, 3.27), (39, 1.0, 3.3)):
        P = {}
        torso(P, lean=0.0, look=0.6, hp=1.5, hroll=0.5 + (2 * math.pi - 0.4) * u)
        leg(P, "L", hip=0.0, knee=0.45, ankle=0.3, out=0.05)
        leg(P, "R", hip=0.05, knee=0.35, ankle=0.3, out=0.05)
        arm(P, "L", fwd=0.6, elbow=2.0, out=0.15, curl=0.8)
        arm(P, "R", fwd=0.6, elbow=2.0, out=0.15, curl=0.8)
        fkey(fr, P, y=y)
    # Down, prone: the cheek turned to the stone, a hand by the head, breathing hard, then the head lifts.
    ROLLED = 0.1 + 2 * math.pi
    for fr, br, look in ((45, 0.0, 0.3), (56, 1.0, 0.65), (70, 0.0, 0.3), (88, 1.0, 0.4)):
        P = {}
        torso(P, lean=0.15, look=look, hp=1.65, hroll=ROLLED, head_yaw=0.9 - 0.3 * (look > 0.5), breath=0.05 * br)
        leg(P, "L", hip=0.02, knee=0.5, ankle=0.3, out=0.12)
        leg(P, "R", hip=-0.13, knee=0.12, ankle=0.3, out=0.1)
        arm(P, "L", fwd=0.3, elbow=0.3, out=0.35, curl=0.5)
        arm(P, "R", fwd=0.2, elbow=0.2, out=0.3, curl=0.5)
        fkey(fr, P, y=3.32)

    # ---------------------------------------------------------- fall_pillar: a toppled pier across the way; he
    # cannot stop: hands up, chest-first into it, rebounds, staggers back two steps, the legs go, he sits down hard.
    new_action("fall_pillar")

    def hands_up(P, fr):
        u = min(1.0, max(0.0, (fr - 3) / 4))
        arm(P, "L", fwd=0.4 + 1.2 * u, elbow=1.3 + 0.2 * u, out=0.3, wrist=-0.4 * u, curl=0.5)
        arm(P, "R", fwd=0.4 + 1.2 * u, elbow=1.3 + 0.2 * u, out=0.32, wrist=-0.4 * u, curl=0.5)
    run_keys(1, 7, arms=hands_up)
    # IMPACT (0.27 s): the front foot planted, forearms up before the face, palms out, the head turned aside.
    P = {}
    torso(P, lean=0.15, look=-0.1, hp=0.08, head_yaw=-0.5)
    leg(P, "L", hip=0.45, knee=0.35, ankle=0.0)
    leg(P, "R", hip=-0.35, knee=0.6, ankle=0.5, toe=0.4)
    arm(P, "L", fwd=1.45, elbow=1.55, out=0.5, wrist=-0.5, curl=0.2)
    arm(P, "R", fwd=1.45, elbow=1.6, out=0.5, wrist=-0.5, curl=0.2)
    fkey(9, P, y=1.5)
    # The squash against the stone: the head snaps down, the arms fold, the knees give.
    P = {}
    torso(P, lean=0.08, look=-0.35, hp=0.05, head_yaw=-0.6)
    leg(P, "L", hip=0.5, knee=0.6, ankle=0.15)
    leg(P, "R", hip=-0.25, knee=0.8, ankle=0.5, toe=0.4)
    arm(P, "L", fwd=1.4, elbow=1.85, out=0.55, wrist=-0.4, curl=0.3)
    arm(P, "R", fwd=1.4, elbow=1.9, out=0.55, wrist=-0.4, curl=0.3)
    fkey(10, P, y=1.51)
    # Thrown back off it (0.4 s), arms flung out, the head whipping back.
    P = {}
    torso(P, lean=-0.35, look=0.4, hp=-0.15, roll=0.1)
    leg(P, "L", hip=0.3, knee=0.3, ankle=0.1)
    leg(P, "R", hip=-0.1, knee=0.5, ankle=0.3)
    arm(P, "L", fwd=0.9, elbow=0.35, out=0.9, curl=0.2)
    arm(P, "R", fwd=0.85, elbow=0.4, out=0.95, curl=0.2)
    fkey(12, P, y=1.3, lift=0.04)
    # Two staggering steps back, arms windmilling.
    P = {}
    torso(P, lean=-0.3, look=0.25, hp=-0.1, roll=-0.08)
    leg(P, "R", hip=-0.3, knee=0.3, ankle=0.1)
    leg(P, "L", hip=0.4, knee=0.5, ankle=0.2)
    arm(P, "L", fwd=1.3, elbow=0.3, out=1.0, curl=0.2)
    arm(P, "R", fwd=0.4, elbow=0.4, out=1.1, curl=0.2)
    fkey(15, P, y=1.05)
    P = {}
    torso(P, lean=-0.2, look=0.1, hp=-0.1, roll=0.1)
    leg(P, "L", hip=-0.25, knee=0.45, ankle=0.1)
    leg(P, "R", hip=0.35, knee=0.7, ankle=0.2)
    arm(P, "L", fwd=0.5, elbow=0.4, out=0.9, curl=0.3)
    arm(P, "R", fwd=1.2, elbow=0.35, out=0.8, curl=0.3)
    fkey(19, P, y=0.8)
    # The legs give (0.77 s): knees fold, the pelvis tucks under, the arms out for balance …
    P = {}
    torso(P, lean=0.1, look=0.0, hp=-0.3)
    leg(P, "L", hip=0.9, knee=1.5, ankle=0.3)
    leg(P, "R", hip=0.7, knee=1.3, ankle=0.3)
    arm(P, "L", fwd=0.8, elbow=0.4, out=0.9, curl=0.3)
    arm(P, "R", fwd=0.2, elbow=0.4, out=1.0, curl=0.3)
    fkey(22, P, y=0.7)
    # (half way down: the seat about to land, the hands going back for the stone)
    P = {}
    torso(P, lean=0.0, look=0.15, hp=-0.35)
    leg(P, "L", hip=1.25, knee=1.6, ankle=0.3)
    leg(P, "R", hip=1.1, knee=1.5, ankle=0.3)
    arm(P, "L", fwd=0.5, elbow=0.4, out=0.7, curl=0.3)
    arm(P, "R", fwd=-0.4, elbow=0.3, out=0.5, curl=0.3)
    fkey(25, P, y=0.64)

    def pillar_sit(lean, look, hp, br=0.0, la=(0.6, 0.6, 0.5), hy=0.0, ra=None):
        P = {}
        torso(P, lean=lean, look=look, hp=hp, breath=0.03 * br, head_yaw=hy)
        leg(P, "L", hip=1.4, out=0.1)
        leg(P, "R", hip=1.6, out=0.12)
        arm(P, "L", fwd=la[0], elbow=la[1], out=la[2], curl=0.5)
        if ra:
            arm(P, "R", fwd=ra[0], elbow=ra[1], out=ra[2], curl=0.5)  # off the stone, the forearm over the knee
        else:
            arm(P, "R", fwd=-0.75, elbow=0.2, out=0.4, wrist=-0.8, curl=0.1, shrug=-0.12)
        return P
    # … and he sits down hard (0.87 s), rocks back on the propping hand, then slumps forward over his knees.
    P = pillar_sit(-0.15, 0.2, -0.3)
    key(28, P, z=sit_ground(P), y=0.6)
    P = pillar_sit(-0.35, 0.35, -0.35)
    key(31, P, z=sit_ground(P), y=0.6)
    for fr, lean, look, br, hy in ((34, 0.35, -0.4, 0.0, 0.0), (46, 0.4, -0.5, 1.0, 0.25), (60, 0.3, -0.3, 0.0, -0.2), (78, 0.4, -0.5, 1.0, 0.1), (96, 0.35, -0.4, 0.0, 0.0)):
        P = pillar_sit(lean, look, -0.25, br, la=(0.9, 1.2, 0.25), hy=hy, ra=(0.95, 1.1, 0.3))
        key(fr, P, z=sit_ground(P), y=0.6)

    # ---------------------------------------------------------- fall_pillar_b: skids to a stop with both hands
    # on the fallen pier, hangs his head, then turns and looks back the way he came (it is cut off).
    new_action("fall_pillar_b")
    run_keys(1, 3)
    P = {}
    torso(P, lean=-0.15, look=0.25, hp=-0.05)
    leg(P, "L", hip=0.75, knee=0.25, ankle=-0.3)
    leg(P, "R", hip=0.1, knee=0.9, ankle=0.2)
    arm(P, "L", fwd=1.1, elbow=0.7, out=0.4, curl=0.2)
    arm(P, "R", fwd=1.0, elbow=0.75, out=0.42, curl=0.2)
    fkey(5, P, y=0.75)
    P = {}
    torso(P, lean=-0.25, look=0.2, hp=-0.08)
    leg(P, "L", hip=0.85, knee=0.35, ankle=-0.3)
    leg(P, "R", hip=0.25, knee=1.1, ankle=0.2)
    arm(P, "L", fwd=1.4, elbow=0.4, out=0.3, wrist=-0.4, curl=0.1)
    arm(P, "R", fwd=1.35, elbow=0.45, out=0.32, wrist=-0.4, curl=0.1)
    fkey(8, P, y=1.05)
    # Hands on the stone (0.37 s), palms flat, the body checked into them.
    for fr, lean, look, el, y in ((11, 0.2, 0.0, 0.35, 1.2), (13, 0.35, -0.3, 0.9, 1.22), (17, 0.4, -0.5, 0.75, 1.22)):
        P = {}
        torso(P, lean=lean, look=look, hp=0.05)
        leg(P, "L", hip=0.35 + 0.05, knee=0.3, ankle=0.0)
        leg(P, "R", hip=-0.15 + 0.05, knee=0.35, ankle=0.3)
        arm(P, "L", fwd=1.45, elbow=el, out=0.28, wrist=-0.9, curl=0.1)
        arm(P, "R", fwd=1.42, elbow=el + 0.05, out=0.3, wrist=-0.9, curl=0.1)
        fkey(fr, P, y=y)
    # Pushes off it, square on his feet, the hands dropping …
    P = {}
    torso(P, lean=0.2, look=0.0, hp=0.0, head_yaw=0.3)
    standing(P, wide=0.11, bend=0.12)
    arm(P, "L", fwd=0.8, elbow=0.6, out=0.3, curl=0.5)
    arm(P, "R", fwd=0.6, elbow=0.6, out=0.3, curl=0.5)
    key(21, P, y=1.1)
    # … and turns to look back the way he came: two real steps round (a pivot on the ball, then a step).
    BACK = dict(fwd=0.3, elbow=0.6, out=0.3, curl=0.6)
    turn_to(21, 1.0, arms=BACK, y=1.1)
    for fr, br, hy in ((40, 1.0, 0.95), (52, 0.0, 1.0), (66, 1.0, 0.9), (82, 0.0, 1.0), (98, 1.0, 0.95)):
        P = {}
        torso(P, lean=0.1, look=0.15, yaw=0.35, head_yaw=hy, breath=0.04 * br)
        standing(P, wide=0.11, bend=0.08)
        arm(P, "L", **BACK)
        arm(P, "R", fwd=0.25, elbow=0.5, out=0.25, curl=0.6)
        standing_turned(P, 1.0)
        key(fr, P, y=1.1)

    # ---------------------------------------------------------- fall_side_hit: rockfall from his R side: the stone
    # takes the R shoulder (0.23 s), he spins round toward it and goes down on his L side.
    new_action("fall_side_hit")

    def glance(P, fr):
        if fr >= 5:
            P["neck"] = (0.0, 0.25, 0.0)
            P["head"] = (0.0, 0.25, 0.0)
    run_keys(1, 5, arms=glance)
    P, x = loco((CADENCE_F * 6) % 1.0, RUN)
    arm(P, "R", fwd=1.2, elbow=1.6, out=0.5, curl=0.8)
    P["neck"] = (0.0, 0.3, 0.0)
    P["head"] = (0.0, 0.35, 0.0)
    key(7, P, z=gait_root((CADENCE_F * 6) % 1.0, RUN), x=x, y=1.2)
    # IMPACT: the R shoulder knocked back, the trunk thrown toward the L side, the head whipped.
    P = {}
    torso(P, lean=0.1, look=0.1, hp=0.0, roll=-0.45, yaw=0.5, head_yaw=0.9, head_roll=-0.4)
    leg(P, "L", hip=0.5, knee=0.7, ankle=0.2)
    leg(P, "R", hip=-0.3, knee=0.6, ankle=0.4)
    arm(P, "R", fwd=0.5, elbow=0.9, out=1.0, curl=0.3)
    arm(P, "L", fwd=0.6, elbow=1.0, out=0.7, curl=0.3)
    fkey(8, P, y=1.35, x=0.05, lift=0.03)
    # The spin: round toward the R, arms flung wide, feet leaving the stone, tipping toward the L side.
    for fr, yaw, roll, x, y, lift in ((10, 0.9, -0.3, 0.25, 1.5, 0.08), (13, 2.0, -0.6, 0.5, 1.62, 0.06)):
        P = {}
        torso(P, lean=0.15, look=0.1, hp=0.0, hroll=roll, roll=-0.2)
        leg(P, "L", hip=0.2, knee=0.9, ankle=0.2, out=0.3)
        leg(P, "R", hip=0.6, knee=0.4, ankle=0.3, out=0.2)
        arm(P, "L", fwd=1.0, elbow=0.3, out=1.3, curl=0.3)
        arm(P, "R", fwd=0.8, elbow=0.3, out=1.3, curl=0.3)
        standing_turned(P, yaw)
        fkey(fr, P, y=y, x=x, lift=lift)
    # A foot catches, the L hand goes down for the stone …
    P = {}
    torso(P, lean=0.3, look=0.0, hp=0.0, hroll=-0.8)
    leg(P, "L", hip=0.4, knee=0.8, ankle=0.2, out=0.15)
    leg(P, "R", hip=0.9, knee=1.0, ankle=0.2, out=0.15)
    arm(P, "L", fwd=0.6, elbow=0.2, out=0.9, wrist=-0.7, curl=0.1)
    arm(P, "R", fwd=0.9, elbow=0.6, out=0.8, curl=0.3)
    standing_turned(P, 2.9)
    fkey(16, P, y=1.7, x=0.7)

    def side_lie(P, roll, kn=1.0, br=0.0, ra=(0.6, 0.8, 0.3), look=0.0):
        torso(P, lean=0.2, look=look, hp=0.25, hroll=roll, breath=0.04 * br)
        leg(P, "L", hip=0.6, knee=kn, ankle=0.2, out=0.05)
        leg(P, "R", hip=0.75, knee=kn + 0.15, ankle=0.2, out=0.05)
        arm(P, "L", fwd=1.5, elbow=0.5, out=-0.3, curl=0.5)
        arm(P, "R", fwd=ra[0], elbow=ra[1], out=ra[2], curl=0.5)
        standing_turned(P, 3.4)
    # … down on the L side (0.63 s), a bounce, curled up; the R hand comes over to the struck shoulder.
    for fr, roll, kn, y, x in ((19, -1.45, 1.0, 1.72, 0.85), (22, -1.62, 0.8, 1.74, 0.88), (26, -1.55, 1.1, 1.75, 0.9)):
        P = {}
        side_lie(P, roll, kn)
        fkey(fr, P, y=y, x=x)
    for fr, br, ra in ((36, 1.0, (1.2, 1.9, -0.1)), (50, 0.0, (1.3, 2.1, -0.15)), (66, 1.0, (1.25, 2.0, -0.12)), (84, 0.0, (1.3, 2.1, -0.15))):
        P = {}
        side_lie(P, -1.55, 1.15, br, ra, look=-0.2)
        fkey(fr, P, y=1.75, x=0.9)

    # ---------------------------------------------------------- fall_drop: the floor gives under him (0.13 s); he
    # drops 2.75 m to the stone below fighting the air all the way, lands hard (0.93 s), crumples, rolls onto his
    # back and lies there, winded.
    new_action("fall_drop")
    run_keys(1, 3)
    DROP = 2.75
    P = {}
    torso(P, lean=-0.1, look=0.3, hp=-0.05)
    leg(P, "L", hip=0.5, knee=0.6, ankle=0.2)
    leg(P, "R", hip=-0.2, knee=0.7, ankle=0.3)
    arm(P, "L", fwd=1.1, elbow=0.8, out=0.55, curl=0.2)
    arm(P, "R", fwd=1.0, elbow=0.85, out=0.6, curl=0.2)
    fkey(5, P, y=0.75)
    # Falling (gravity from 0.13 s): pitching back and forth, the arms windmilling, the legs kicking.
    land_u = math.sqrt(2 * DROP / G_ACC)
    for fr in range(7, 26, 2):
        u = (fr - 5) / FPS
        w = fr * 0.85
        k = min(1.0, u * 4)
        P = {}
        torso(P, lean=0.1 + 0.15 * math.sin(w * 0.5), look=0.4 - 0.2 * math.sin(w * 0.4), hp=-0.1 + 0.15 * math.sin(w * 0.3),
              roll=0.12 * math.sin(w * 0.45), head_yaw=0.15 * math.sin(w * 0.35))
        flail(P, w, k)
        fkey(fr, P, y=0.75 + 1.9 * u, lift=-min(DROP, 0.5 * G_ACC * u * u))
    # The landing (0.93 s): the feet strike, the knees fold, the arms come forward for the stone.
    fr_land = 5 + land_u * FPS
    P = {}
    torso(P, lean=0.6, look=0.3, hp=0.4)
    leg(P, "L", hip=0.9, knee=1.4, ankle=0.3, out=0.12)
    leg(P, "R", hip=0.8, knee=1.35, ankle=0.3, out=0.14)
    arm(P, "L", fwd=1.0, elbow=0.4, out=0.5, curl=0.3)
    arm(P, "R", fwd=0.95, elbow=0.45, out=0.55, curl=0.3)
    fkey(int(round(fr_land)) + 1, P, y=0.75 + 1.9 * land_u, base=-DROP)
    # Crumpling: the knees right down, the hands slap the stone, he pitches over onto the R shoulder …
    P = {}
    torso(P, lean=0.7, look=0.4, hp=0.75)
    leg(P, "L", hip=1.6, knee=2.2, ankle=0.4, out=0.12)
    leg(P, "R", hip=1.5, knee=2.15, ankle=0.4, out=0.14)
    arm(P, "L", fwd=1.3, elbow=0.3, out=0.4, wrist=-0.8, curl=0.1)
    arm(P, "R", fwd=1.25, elbow=0.35, out=0.45, wrist=-0.8, curl=0.1)
    fkey(32, P, y=2.35, base=-DROP)
    P = {}
    torso(P, lean=0.2, look=0.5, hp=1.3, hroll=0.4)
    leg(P, "L", hip=0.8, knee=1.6, ankle=0.3)
    leg(P, "R", hip=0.7, knee=1.5, ankle=0.3)
    arm(P, "L", fwd=0.9, elbow=1.6, out=0.3, curl=0.6)
    arm(P, "R", fwd=0.9, elbow=1.6, out=0.3, curl=0.6)
    fkey(35, P, y=2.55, base=-DROP)
    # … rolls over along the stone, and onto his back.
    for fr, roll, y, kn in ((38, 1.1, 2.7, 1.2), (41, 2.0, 2.8, 0.9), (44, 2.8, 2.86, 0.7), (48, math.pi + 0.08, 2.9, 0.6)):
        P = {}
        torso(P, lean=0.05, look=0.3, hp=1.5, hroll=roll)
        leg(P, "L", hip=0.3, knee=kn, ankle=0.3, out=0.06)
        leg(P, "R", hip=0.25, knee=kn - 0.1, ankle=0.3, out=0.06)
        arm(P, "L", fwd=0.7, elbow=1.8, out=0.25, curl=0.7)
        arm(P, "R", fwd=0.7, elbow=1.8, out=0.25, curl=0.7)
        fkey(fr, P, y=y, base=-DROP)
    # Flat on his back, winded: chest heaving, a knee drawn up, an arm out on the stone, the head rolling.
    for fr, br, hy in ((56, 1.0, 0.3), (68, 0.0, -0.2), (82, 1.0, 0.25), (98, 0.0, -0.1)):
        P = {}
        torso(P, lean=0.0, look=0.15, hp=1.5, hroll=math.pi + 0.08, head_yaw=hy, breath=0.07 * br)
        leg(P, "L", hip=0.7, knee=1.3, ankle=0.2, out=0.1)
        leg(P, "R", hip=0.05, knee=0.15, ankle=0.2, out=0.12)
        arm(P, "L", fwd=-0.2, elbow=0.4, out=0.9, curl=0.4)
        arm(P, "R", fwd=0.1, elbow=1.2, out=0.5, curl=0.4)
        fkey(fr, P, y=2.92, base=-DROP)


# ------------------------------------------------------------------ look-dev previews
def _ground():
    if "ground" in bpy.data.objects:
        return
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    g = bpy.context.active_object
    g.name = "ground"
    m = bpy.data.materials.new("ground")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexcol("#8c7a64")
    g.data.materials.append(m)


def shot(rig, action, frame, cam, target=(0, 0, 0.9), tag=None, lens=40, res=(480, 540)):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    path = f"{CACHE}/runner_{tag or action}_{frame}.png"
    preview(path, cam, target, lens=lens, res=res, samples=10, sun=(40, 0, 130))
    return path


def previews(rig, which):
    _ground()
    side = (3.6, 0.35, 1.0)
    if which in ("model", "all"):
        shot(rig, "idle", 1, (0.9, 3.0, 1.5), (0, 0, 1.05), tag="front", lens=45)
        shot(rig, "idle", 1, (0.5, -3.2, 1.6), (0, 0, 1.1), tag="back", lens=45)
        shot(rig, "idle", 1, (0.35, 0.9, 1.68), (0, 0.02, 1.6), tag="face", lens=60, res=(480, 480))
        shot(rig, "idle", 1, (-0.9, 0.7, 1.75), (0, 0.0, 1.55), tag="face34", lens=50, res=(480, 480))
        shot(rig, "idle", 1, (0.9, 0.5, 0.35), (0.1, 0.05, 0.25), tag="boots", lens=50, res=(480, 480))
        shot(rig, "idle", 1, (0.75, 0.55, 1.0), (0.26, 0.0, 0.88), tag="hand", lens=60, res=(480, 480))
    if which in ("run", "all"):
        for f in (1, 4, 8, 12, 15, 19):
            shot(rig, "run", f, side)
        for f in (1, 4, 7, 10, 13, 16):
            shot(rig, "sprint", f, side)
        for f in (1, 5, 9):
            shot(rig, "sprint", f, (0.4, -3.6, 1.8), tag="sprintback")
        for f in (1, 4, 7, 9, 13, 16, 19, 23):
            shot(rig, "start", f, side)
    if which in ("react", "all"):
        for f in (9, 19, 29, 46, 78):
            shot(rig, "fall_chasm", f, (2.6, 2.4, 1.3))
        for f in (9, 19, 32, 62):
            shot(rig, "fall_gate", f, (2.6, 2.4, 1.3))
        for f in (8, 22, 72):
            shot(rig, "fall_rock", f, (2.6, 2.4, 1.3))
        for f in (13, 30, 55, 84, 98):
            shot(rig, "win", f, (1.4, 3.2, 1.4))
        for f in (1, 50, 90):
            shot(rig, "idle", f, (1.4, 3.2, 1.4))
    if which == "obst":
        for name, frames in (("jump_log", (6, 12, 19, 21)), ("leap_gap", (7, 12, 18, 22, 27)), ("slide", (7, 14, 21, 24)),
                             ("vault", (6, 9, 12, 15)), ("turn_cut_L", (9, 13)), ("stumble_land", (3, 6, 9))):
            for f in frames:
                shot(rig, name, f, (2.6, 2.4, 1.3))
        for f in (9, 13):
            shot(rig, "turn_cut_L", f, (0.3, -3.6, 1.2), tag="tcback")
    if which == "cel":
        for name, frames in (("win_cheer", (16, 21, 33, 63, 120)), ("win_cheer_big", (21, 39, 66, 74, 90, 130))):
            for f in frames:
                shot(rig, name, f, (1.4, 3.2, 1.4) if False else (2.6, 2.4, 1.3))
    if which in ("react2", "all"):
        for name, frames in (("fall_start", (6, 12, 26, 70)), ("fall_gate_b", (10, 16, 24, 80)), ("fall_rock_b", (9, 16, 60)),
                             ("fall_chasm_b", (10, 16, 26, 72)), ("win_cheer", (11, 26, 33, 110)),
                             ("win_salute", (34, 46, 54, 68, 100)), ("win_leap", (9, 14, 20, 27, 60)), ("dash", (1, 5, 9))):
            for f in frames:
                cam = (3.6, 0.35, 1.0) if name == "dash" else (2.6, 2.4, 1.3)
                shot(rig, name, f, cam)
