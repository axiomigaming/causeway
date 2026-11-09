"""Rig the supplied runner mesh onto the CAUSEWAY skeleton (bone names, hierarchy and roll conventions
of the procedural character, so runner_anim.py and src/world/runner.ts drive it unchanged).

  1. Fit: every joint comes from char_source.landmarks() (cross-sections of the mesh).
  2. Skin: bone heat on a closed voxel proxy of the A-posed body (heat fails on the source's open,
     self-touching shells), transferred to the mesh, then repaired where heat is known to go wrong:
     the crotch (one leg's weights on the other thigh), the armpits and flanks (arm weights on the
     torso), the boots (rigid foot / toe / shin bands) and the hands (a clean wrist and knuckle line).
  3. Re-pose: the source stands in an A-pose with a wide stance; our clips are authored against a rest
     pose with the arms hanging and the feet under the hips. The arm and leg chains are rotated to
     that rest pose, the skin is baked there and the pose applied as the new rest — so every clip
     reads exactly as it was authored.
"""
import math

import bpy
import numpy as np
from mathutils import Vector, Matrix

import char_sculpt as S
from common import link

def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def build_rig(J):
    arm_data = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("runner", arm_data)
    link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b
    bone("root", (0, 0, 0), (0, 0.3, 0))
    bone("hips", J["pelvis"], J["spine"], "root")
    bone("spine", J["spine"], J["chest"], "hips", True)
    bone("chest", J["chest"], J["neck"], "spine", True)
    bone("neck", J["neck"], J["head"], "chest", True)
    bone("head", J["head"], J["crown"], "neck", True)
    for s in "LR":
        sx = 1 if s == "L" else -1
        clav = Vector((sx * 0.02, J["chest"].y + 0.01, J["shoulder." + s].z - 0.02))
        bone(f"shoulder.{s}", clav, J[f"shoulder.{s}"], "chest")
        bone(f"upper_arm.{s}", J[f"shoulder.{s}"], J[f"elbow.{s}"], f"shoulder.{s}", True)
        bone(f"forearm.{s}", J[f"elbow.{s}"], J[f"wrist.{s}"], f"upper_arm.{s}", True)
        bone(f"hand.{s}", J[f"wrist.{s}"], J[f"knuckle.{s}"], f"forearm.{s}", True)
        bone(f"fingers.{s}", J[f"knuckle.{s}"], J[f"fingertip.{s}"], f"hand.{s}", True)
        bone(f"thigh.{s}", J[f"hip.{s}"], J[f"knee.{s}"], "hips")
        bone(f"shin.{s}", J[f"knee.{s}"], J[f"ankle.{s}"], f"thigh.{s}", True)
        ball = J[f"toe.{s}"]
        bone(f"foot.{s}", J[f"ankle.{s}"], ball, f"shin.{s}", True)
        bone(f"toe.{s}", ball, Vector((ball.x, J[f"tip.{s}"].y - 0.01, ball.z)), f"foot.{s}", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def set_rolls(rig):
    """Uniform roll so local X is the hinge axis for every limb (flexion = rotation about X)."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for b in rig.data.edit_bones:
        b.align_roll(Vector((0, 0, 1)) if abs(b.vector.normalized().z) < 0.7 else Vector((0, -1, 0)))
    bpy.ops.object.mode_set(mode="OBJECT")


# ------------------------------------------------------------------ skin
def heat_skin(rig, mesh, voxel=0.007, tris=24000):
    """Bone heat on a closed proxy, transferred to the mesh."""
    proxy = S.duplicate(mesh, "proxy")
    S.voxel_remesh(proxy, voxel)
    S.decimate(proxy, tris)
    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    proxy.parent = None
    for m in list(proxy.modifiers):
        proxy.modifiers.remove(m)
    empty = sum(1 for v in proxy.data.vertices if not v.groups)
    print(f"  heat proxy: {len(proxy.data.vertices)} verts, {empty} unweighted", flush=True)
    for g in proxy.vertex_groups:
        if g.name not in mesh.vertex_groups:
            mesh.vertex_groups.new(name=g.name)
    m = mesh.modifiers.new("dt", "DATA_TRANSFER")
    m.object = proxy
    m.use_vert_data = True
    m.data_types_verts = {"VGROUP_WEIGHTS"}
    m.vert_mapping = "POLYINTERP_NEAREST"
    m.layers_vgroup_select_src = "ALL"
    m.layers_vgroup_select_dst = "NAME"
    S.apply_mods(mesh)
    bpy.data.objects.remove(proxy)


def _weights(mesh):
    """{vertex index: {group name: weight}}."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    return [{names[ge.group]: ge.weight for ge in v.groups if ge.weight > 1e-4} for v in mesh.data.vertices]


def _write(mesh, W):
    for g in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(g)
    groups = {}
    for i, w in enumerate(W):
        tot = sum(w.values())
        for n, x in w.items():
            if x / tot < 1e-3:
                continue
            if n not in groups:
                groups[n] = mesh.vertex_groups.new(name=n)
            groups[n].add([i], x / tot, "REPLACE")


def _seg_t(p, a, b):
    d = b - a
    return float((p - a).dot(d) / d.length_squared)


def repair(mesh, J):
    """Fix the places bone heat gets wrong (see the module docstring)."""
    W = _weights(mesh)
    crotch = J["_crotch"]
    fixed = dict(crotch=0, flank=0, boot=0, hand=0)
    for i, v in enumerate(mesh.data.vertices):
        co = v.co
        w = W[i]
        s = "L" if co.x > 0 else "R"
        o = "R" if s == "L" else "L"
        # Crotch and inner thighs: never the other leg.
        if co.z < crotch + 0.12:
            bad = [n for n in w if n.endswith("." + o) and n.split(".")[0] in ("thigh", "shin", "foot", "toe")]
            if bad:
                for n in bad:
                    w.pop(n)
                fixed["crotch"] += 1
        # Boots: rigid foot, a toe band from the ball forward, a blend into the shin over the ankle.
        if co.z < 0.17 and abs(co.x) < 0.33 and co.z < J[f"knee.{s}"].z - 0.2:
            ank = J[f"ankle.{s}"]
            ball = J[f"toe.{s}"]
            k = smooth((co.z - (ank.z - 0.005)) / 0.06)
            t = smooth((co.y - (ball.y - 0.015)) / 0.04) * (1 - k)
            W[i] = w = {f"shin.{s}": k, f"foot.{s}": (1 - k) * (1 - t), f"toe.{s}": t}
            fixed["boot"] += 1
            continue
        # Hands: hand and fingers by position along the hand (the thumb stays with the hand); the wrist
        # blends into the forearm.
        wr, kn, tip = J[f"wrist.{s}"], J[f"knuckle.{s}"], J[f"fingertip.{s}"]
        th = _seg_t(co, wr, tip)
        if th > -0.25 and (co - wr).length < 0.26 and abs(co.x) > abs(wr.x) - 0.06 and co.z < wr.z + 0.06:
            d = tip - wr
            perp = (co - (wr + d * max(0.0, min(1.0, th)))).length
            if perp < 0.07:
                tk = _seg_t(kn, wr, tip)
                fore = 1 - smooth((th + 0.06) / 0.14)
                fing = smooth((th - tk + 0.02) / 0.1)
                # Thumb: forward of the palm, short of the knuckle line.
                fwd = (co.y - (wr.y + d.y * max(0.0, min(1.0, th))))
                if fwd > 0.022 and th < tk + 0.12:
                    fing = 0.0
                W[i] = w = {f"forearm.{s}": fore, f"hand.{s}": (1 - fore) * (1 - fing), f"fingers.{s}": (1 - fore) * fing}
                fixed["hand"] += 1
                continue
        # Torso below the armpit: arm weights off the flanks and the waist.
        sh = J[f"shoulder.{s}"]
        if abs(co.x) < abs(sh.x) - 0.005 and co.z < sh.z - 0.1 and co.z > crotch:
            bad = [n for n in w if n.startswith(("upper_arm.", "forearm.", "hand.", "fingers."))]
            if bad:
                for n in bad:
                    w.pop(n)
                fixed["flank"] += 1
        if not w:
            W[i] = {"hips" if co.z < 1.0 else "chest": 1.0}
    _write(mesh, W)
    print("  weight repair:", fixed, flush=True)


ARM = ("upper_arm.", "forearm.", "hand.", "fingers.")


def gear(mesh, J, leather, rig=None):
    """The leather kit the source wears is part of its shell: the cross-harness, the two pouches under
    the arms and the thigh holster. Bone heat hands their outer edges to the nearest bone (the upper arm,
    for the under-arm pouches), so they swung out behind the shoulder blade with every arm swing. Here
    they are strapped to the body: the harness and pouches ride the ribcage (spine to chest by height;
    the straps over the trapezius keep a little of the clavicle), the holster rides the pelvis with at
    most a third of the thigh. The cloth round each piece blends into its weights over two rings of
    vertices, so nothing tears or pops at the seam."""
    import bmesh
    co = [v.co.copy() for v in mesh.data.vertices]
    sp, ch = J["spine"].z, J["chest"].z
    W = _weights(mesh)
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()

    def arm_dist(c, s):
        sh, el, wr = J[f"shoulder.{s}"], J[f"elbow.{s}"], J[f"wrist.{s}"]
        out = 9.0
        for a_, b_ in ((sh, el), (el, wr)):
            t = max(0.0, min(1.0, _seg_t(c, a_, b_)))
            out = min(out, (c - (a_ + (b_ - a_) * t)).length)
        return out
    # Leather pieces are connected patches of leather-coloured vertices. A patch is kit when it sits on
    # the body, not on an arm: shadowed sleeve folds and sun-browned forearms are patches too, centred on
    # the arm's axis.
    seen = set()
    pieces = set()
    for i0 in range(len(co)):
        if i0 in seen or not leather[i0]:
            continue
        comp, st = [], [i0]
        seen.add(i0)
        while st:
            i = st.pop()
            comp.append(i)
            for e in bm.verts[i].link_edges:
                j = e.other_vert(bm.verts[i]).index
                if j not in seen and leather[j]:
                    seen.add(j)
                    st.append(j)
        cen = sum((co[i] for i in comp), Vector()) / len(comp)
        s = "L" if cen.x > 0 else "R"
        if len(comp) < 4 or abs(cen.x) > 0.3:
            continue
        if cen.z > 1.0 and (arm_dist(cen, s) < 0.075 or (abs(cen.x) < 0.08 and cen.z > 1.36)):
            continue
        if not (0.68 < cen.z < J[f"shoulder.{s}"].z + 0.14):
            continue
        pieces.update(comp)
    # Under the arms (the pouches, the harness's side straps, the shirt's flanks): anything outside the
    # arm's own surface sheds its arm weights into the ribcage. The arm's surface is measured on its outer
    # half, which nothing else touches: per slab along the upper arm and forearm, the radius of the outer
    # half; a vertex further from the axis than that (on the body side) is not arm. Feathered over 2.5 cm.
    prof = {}
    for s_ in "LR":
        sx = 1 if s_ == "L" else -1
        for seg, (a_, b_) in enumerate(((J[f"shoulder.{s_}"], J[f"elbow.{s_}"]), (J[f"elbow.{s_}"], J[f"wrist.{s_}"]))):
            d = b_ - a_
            lat = Vector((sx, 0, 0))
            lat = (lat - d.normalized() * lat.dot(d.normalized())).normalized()
            radii = [[] for _ in range(20)]
            for c in co:
                if c.x * sx < 0.1:
                    continue
                t = _seg_t(c, a_, b_)
                if not (0.0 <= t < 1.0):
                    continue
                pp = c - (a_ + d * t)
                if pp.length < 0.16 and pp.normalized().dot(lat) > 0.3:
                    radii[int(t * 20)].append(pp.length)
            prof[(s_, seg)] = [float(np.percentile(r, 95)) if len(r) >= 3 else 0.07 for r in radii]

    def outside(c, s_):
        """How far outside the arm's surface (m); negative inside."""
        best = 9.0
        for seg, (a_, b_) in enumerate(((J[f"shoulder.{s_}"], J[f"elbow.{s_}"]), (J[f"elbow.{s_}"], J[f"wrist.{s_}"]))):
            t = _seg_t(c, a_, b_)
            tt = max(0.0, min(0.999, t))
            r = (c - (a_ + (b_ - a_) * tt)).length
            best = min(best, r - prof[(s_, seg)][int(tt * 20)])
        return best
    flank = 0
    for i, c in enumerate(co):
        s = "L" if c.x > 0 else "R"
        if not (1.0 < c.z < J[f"shoulder.{s}"].z - 0.05) or abs(c.x) > 0.34:
            continue
        f = smooth((outside(c, s) - 0.008) / 0.025)
        w = W[i]
        armw = sum(x for n, x in w.items() if n.startswith(ARM))
        if f <= 0 or armw <= 1e-4:
            continue
        k = smooth((c.z - sp) / (ch - sp))
        lost = armw * f
        for n in list(w):
            if n.startswith(ARM):
                w[n] *= 1 - f
        w["spine"] = w.get("spine", 0.0) + lost * (1 - k)
        w["chest"] = w.get("chest", 0.0) + lost * k
        flank += 1
    # The thigh holster rides the pelvis with at most a third of the thigh; below its belt loop it
    # swings on a spring bone ("pack", driven in src/world/runner.ts), so it jiggles with each landing.
    pieces = {i for i in pieces if co[i].z < 1.0}
    big = [i for i in pieces if abs(co[i].x) > 0.15]
    # (The holster's side only: with the kit on the other hip counted in, the spring bone sat on the body's
    # centre line, and the holster swung about a point 20 cm away from it, its edge shearing into torn
    # shards against the feathered ring in every landing and the vault.)
    if big:
        side = 1 if sum(1 for i in big if co[i].x > 0) > len(big) / 2 else -1
        big = [i for i in big if co[i].x * side > 0]
    bigset = set(big)
    top = max(co[i].z for i in big) if big else 0.0
    if rig is not None and big:
        cx = sum(co[i].x for i in big) / len(big)
        cy = sum(co[i].y for i in big) / len(big)
        bot = min(co[i].z for i in big)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode="EDIT")
        eb = rig.data.edit_bones
        b = eb.new("pack")
        b.head, b.tail = Vector((cx, cy, top)), Vector((cx, cy, bot))
        b.parent = eb["hips"]
        bpy.ops.object.mode_set(mode="OBJECT")
    for i in pieces:
        s = "L" if co[i].x > 0 else "R"
        th = min(0.33, W[i].get(f"thigh.{s}", 0.0))
        pk = 0.0
        if rig is not None and i in bigset:
            # A drop holster: it hangs from the belt and its leg strap ties its foot to the thigh. (Riding the
            # pelvis with at most a third of the thigh, its foot stayed back as the thigh drove up through the
            # vault and the leap, and the jeans tore through it in shards.)
            d = smooth((top - co[i].z) / 0.16)
            th = 0.35 + 0.6 * d
            pk = 0.05 + 0.1 * d
        W[i] = {"hips": (1 - th) * (1 - pk), f"thigh.{s}": th * (1 - pk)}
        if pk > 0:
            W[i]["pack"] = pk
    done = set(pieces)
    front = set(pieces)
    for k in (2 / 3, 1 / 3):
        ring = {e.other_vert(bm.verts[i]).index for i in front for e in bm.verts[i].link_edges} - done
        for j in ring:
            nb = [e.other_vert(bm.verts[j]).index for e in bm.verts[j].link_edges]
            src = [W[n] for n in nb if n in front]
            avg = {}
            for w in src:
                for n, x in w.items():
                    avg[n] = avg.get(n, 0.0) + x / len(src)
            out = {n: x * (1 - k) for n, x in W[j].items()}
            for n, x in avg.items():
                out[n] = out.get(n, 0.0) + x * k
            W[j] = out
        done |= ring
        front = ring
    bm.free()
    _write(mesh, W)
    print(f"  under-arm kit and flanks off the arm bones: {flank} verts; holster to the pelvis: {len(pieces)} (+{len(done) - len(pieces)} feathered)", flush=True)


def finish(mesh, rig):
    with bpy.context.temp_override(object=mesh, active_object=mesh, selected_objects=[mesh], selected_editable_objects=[mesh]):
        bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01)
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    unweighted = [v.index for v in mesh.data.vertices if not v.groups]
    if unweighted:
        print("  unweighted verts:", len(unweighted), flush=True)
        g = mesh.vertex_groups.get("chest") or mesh.vertex_groups.new(name="chest")
        g.add(unweighted, 1.0, "REPLACE")


def bind(mesh, rig):
    mesh.parent = rig
    mesh.matrix_parent_inverse = Matrix.Identity(4)
    m = mesh.modifiers.get("arm") or mesh.modifiers.new("arm", "ARMATURE")
    m.object = rig
    return m


# ------------------------------------------------------------------ re-pose to our rest
def _rotate_world(pb, q):
    M = pb.matrix.copy()
    t = M.translation.copy()
    pb.matrix = Matrix.Translation(t) @ q.to_matrix().to_4x4() @ Matrix.Translation(-t) @ M
    bpy.context.view_layer.update()


def _aim(rig, name, d):
    pb = rig.pose.bones[name]
    cur = (pb.tail - pb.head).normalized()
    _rotate_world(pb, cur.rotation_difference(Vector(d).normalized()))


def repose(rig, mesh, J):
    """Arms down and feet under the hips, baked into the skin and applied as the rest pose."""
    bpy.context.view_layer.objects.active = rig
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    bpy.context.view_layer.update()
    for s in "LR":
        sx = 1 if s == "L" else -1
        # The rest arm of the clips: upper arm ~9° out and a touch back, forearm a touch forward.
        _aim(rig, f"upper_arm.{s}", (sx * 0.16, -0.05, -1.0))
        _aim(rig, f"forearm.{s}", (sx * 0.09, 0.1, -1.0))
        _aim(rig, f"hand.{s}", (sx * 0.08, 0.06, -1.0))
        # Legs: swing each leg in (frontal plane only) until the ankle is under the hip; the boot keeps
        # its sole on the ground.
        foot = rig.pose.bones[f"foot.{s}"]
        keep = foot.matrix.copy()
        th = rig.pose.bones[f"thigh.{s}"]
        hip, ank = th.head.copy(), foot.head.copy()
        want = Vector((hip.x + sx * 0.012, ank.y, ank.z)) - hip
        cur = ank - hip
        a0 = math.atan2(cur.x, -cur.z)
        a1 = math.atan2(want.x, -want.z)
        from mathutils import Quaternion
        _rotate_world(th, Quaternion((0, 1, 0), a0 - a1))
        M = keep.copy()
        M.translation = foot.matrix.translation
        foot.matrix = M
        bpy.context.view_layer.update()
    # Bake the skin in this pose, then make it the rest.
    with bpy.context.temp_override(object=mesh, active_object=mesh, selected_objects=[mesh], selected_editable_objects=[mesh]):
        bpy.ops.object.modifier_apply(modifier="arm")
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    set_rolls(rig)
    bind(mesh, rig)


def joints(rig):
    """Rest joint positions after the re-pose (world = armature space here)."""
    B = rig.data.bones
    out = {}
    for b in B:
        out[b.name] = (b.head_local.copy(), b.tail_local.copy())
    return out


def soft_bones(mesh, J, rig, key):
    """Spring bones for what hangs off him or moves on its own (driven in src/world/runner.ts): the two
    pouches under the arms on the harness's side straps, the shirt blousing over the belt front and back,
    the rolled sleeve cuffs, the hair, and a jaw (the lower face, hinged below the ears) for breathing hard.
    Each takes at most a part of its vertices' weight, feathered, so the motion stays a lag and a bounce
    on the body, never a piece swinging free. `key` is each vertex's material: 1 skin, 2 hair, 3 leather,
    4 jeans, 5 shirt."""
    co = [v.co.copy() for v in mesh.data.vertices]
    W = _weights(mesh)
    sh = {s: J[f"shoulder.{s}"] for s in "LR"}
    el = {s: J[f"elbow.{s}"] for s in "LR"}
    bones = {}

    def take(i, nm, w):
        W[i] = {n: x * (1 - w) for n, x in W[i].items()}
        W[i][nm] = W[i].get(nm, 0.0) + w

    def dom(i):
        """The bone a vertex mostly follows (each piece only takes vertices of its own body part: with the
        arms hanging, the torso's flank lies within a cuff's radius of the upper arm, and given to the
        sleeve it was torn off the body in shards whenever the arm moved away)."""
        return max(W[i], key=W[i].get).split(".")[0] if W[i] else ""
    # The pouches: leather on the flanks between the ribcage and the arm, below the armpit.
    for s in "LR":
        sx = 1 if s == "L" else -1
        idx = [i for i, c in enumerate(co) if key[i] == 3 and 0.15 < c.x * sx < 0.255 and 1.0 < c.z < sh[s].z - 0.08 and abs(c.y) < 0.14
               and dom(i) in ("spine", "chest")]
        if len(idx) >= 6:
            cx = sum(co[i].x for i in idx) / len(idx)
            cy = sum(co[i].y for i in idx) / len(idx)
            top = max(co[i].z for i in idx)
            bot = min(co[i].z for i in idx)
            bones[f"pouch.{s}"] = ((cx, cy, top), (cx, cy, bot), "chest")
            for i in idx:
                w = 0.5 * smooth((top - co[i].z) / max(0.04, 0.6 * (top - bot)))
                if w > 0:
                    take(i, f"pouch.{s}", w)
    # The shirt over the belt, front and back: a little blousing that lags each landing.
    belt = max((c.z for i, c in enumerate(co) if key[i] == 4 and abs(c.x) < 0.05), default=J["pelvis"].z)
    for nm, sgn in (("hemF", 1), ("hemB", -1)):
        idx = [i for i, c in enumerate(co) if key[i] == 5 and abs(c.x) < 0.17 and c.y * sgn > 0.03 and belt < c.z < belt + 0.14
               and dom(i) in ("hips", "spine")]
        if len(idx) >= 6:
            cy = sum(co[i].y for i in idx) / len(idx)
            bones[nm] = ((0.0, cy, belt + 0.14), (0.0, cy, belt), "hips")
            for i in idx:
                w = 0.3 * smooth((belt + 0.14 - co[i].z) / 0.08) * smooth((co[i].z - belt) / 0.03)
                if w > 0:
                    take(i, nm, w)
    # The rolled cuffs: the shirt over the last third of the upper arm.
    for s in "LR":
        a_, b_ = sh[s], el[s]
        idx = []
        for i, c in enumerate(co):
            if key[i] != 5 or c.x * (1 if s == "L" else -1) < 0.15 or dom(i) not in ("upper_arm", "forearm"):
                continue
            t = _seg_t(c, a_, b_)
            if 0.6 < t < 1.08 and (c - (a_ + (b_ - a_) * t)).length < 0.08:
                idx.append((i, t))
        if len(idx) >= 6:
            d = (b_ - a_).normalized()
            bones[f"sleeve.{s}"] = (tuple(a_ + (b_ - a_) * 0.6), tuple(b_ + d * 0.02), f"upper_arm.{s}")
            for i, t in idx:
                w = 0.35 * smooth((t - 0.6) / 0.25)
                if w > 0:
                    take(i, f"sleeve.{s}", w)
    # The hair above the ears.
    hz = J["head"].z + 0.03
    idx = [i for i, c in enumerate(co) if key[i] == 2 and c.z > hz and dom(i) == "head"]
    if idx:
        cy = sum(co[i].y for i in idx) / len(idx)
        bones["hair"] = ((0.0, cy, hz), (0.0, cy, J["crown"].z), "head")
        for i in idx:
            w = 0.45 * smooth((co[i].z - hz) / 0.1)
            if w > 0:
                take(i, "hair", w)
    # The jaw: the face below the mouth, hinged below the ears; feathered up to the mouth and back to the neck.
    fr = [c for c in co if abs(c.x) < 0.02 and J["head"].z - 0.08 < c.z < J["head"].z + 0.06]
    chin_y = max((c.y for c in fr), default=0.1)
    mouth = J["head"].z - 0.01
    hinge = Vector((0.0, chin_y - 0.1, J["head"].z + 0.01))
    idx = [i for i, c in enumerate(co) if key[i] in (1, 2) and c.y > hinge.y + 0.02 and J["head"].z - 0.09 < c.z < mouth and abs(c.x) < 0.075
           and dom(i) in ("head", "neck")]
    if len(idx) >= 4:
        bones["jaw"] = (tuple(hinge), (0.0, chin_y, J["head"].z - 0.06), "head")
        for i in idx:
            c = co[i]
            w = smooth((mouth - c.z) / 0.025) * smooth((c.y - hinge.y - 0.02) / 0.05)
            if w > 0:
                take(i, "jaw", w)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    for nm, (h, t, parent) in bones.items():
        b = eb.new(nm)
        b.head, b.tail = Vector(h), Vector(t)
        b.parent = eb[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    _write(mesh, W)
    print("  soft bones:", ", ".join(f"{nm} ({sum(1 for w in W if nm in w)} verts)" for nm in bones), flush=True)


def unweld(mesh, rig):
    """Cut the scan's webbing between parts that move apart. The source was scanned with the arms hanging
    against the flanks and the hands at the hips and the thighs touching: its surface runs straight across
    those contacts. Below the armpit (and below the crotch), a face with vertices on both the arm and the
    torso (or a hand and a thigh, or both thighs) stretched into long torn shards whenever the arm drove or
    a leg swung away: up to 32 cm at the right hip and flank, the 'torn holster'. Those faces go; the hole
    each part is left with is capped from its own rim (a fan on its own vertices, so it moves with it), its
    texture taken from the rim."""
    import bmesh
    names = {g.index: g.name for g in mesh.vertex_groups}
    B = rig.data.bones
    pit = {s: B[f"upper_arm.{s}"].head_local.z - 0.09 for s in "LR"}
    crotch = min(B["thigh.L"].head_local.z, B["thigh.R"].head_local.z) - 0.06
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    dl = bm.verts.layers.deform.active
    uv = bm.loops.layers.uv.active

    def part(v):
        if dl is None or not v[dl]:
            return "torso"
        g = max(v[dl].items(), key=lambda kv: kv[1])[0]
        n = names[g]
        b = n.split(".")[0]
        s = n[-1] if n[-2:] in (".L", ".R") else ""
        if b in ("upper_arm", "forearm", "hand", "fingers"):
            return "arm" + s
        if b in ("thigh", "shin", "foot", "toe"):
            return "leg" + s
        return "torso"
    P = {v: part(v) for v in bm.verts}
    kill = []
    for f in bm.faces:
        ps = {P[v] for v in f.verts}
        z = sum(v.co.z for v in f.verts) / len(f.verts)
        cut = False
        for s in "LR":
            if f"arm{s}" in ps and "torso" in ps and z < pit[s]:
                cut = True
            if f"arm{s}" in ps and ("legL" in ps or "legR" in ps):
                cut = True
        if "legL" in ps and "legR" in ps and z < crotch:
            cut = True
        if cut:
            kill.append(f)
    nkill = len(kill)
    bmesh.ops.delete(bm, geom=kill, context="FACES_ONLY")
    # Each part's open rim, as chains of boundary edges whose ends are both that part's: capped by a fan.
    caps = 0
    rim = [e for e in bm.edges if e.is_boundary and P.get(e.verts[0]) == P.get(e.verts[1])]
    seen = set()
    for e0 in rim:
        if e0 in seen:
            continue
        pp = P[e0.verts[0]]
        comp, st = [], [e0]
        seen.add(e0)
        while st:
            e = st.pop()
            comp.append(e)
            for v in e.verts:
                for e2 in v.link_edges:
                    if e2 not in seen and e2.is_boundary and P.get(e2.verts[0]) == pp and P.get(e2.verts[1]) == pp:
                        seen.add(e2)
                        st.append(e2)
        if len(comp) < 2:
            continue
        verts = list({v for e in comp for v in e.verts})
        c = sum((v.co for v in verts), verts[0].co * 0) / len(verts)
        cv = bm.verts.new(c)
        # the centre takes the rim's weights (averaged) so it rides with its part
        if dl is not None:
            acc = {}
            for v in verts:
                for g, w in v[dl].items():
                    acc[g] = acc.get(g, 0.0) + w / len(verts)
            for g, w in acc.items():
                cv[dl][g] = w
        P[cv] = pp
        caps_faces = []
        for e in comp:
            a, b = e.verts
            try:
                f = bm.faces.new((a, b, cv))
            except ValueError:
                continue
            # face the same way as the rim face it closes against: opposite winding along the shared edge
            lf = e.link_faces[0] if len(e.link_faces) > 1 else None
            other = [lf2 for lf2 in e.link_faces if lf2 is not f]
            if other:
                o = other[0]
                for lo in o.loops:
                    if lo.vert is a and lo.link_loop_next.vert is b:
                        f.normal_flip()
                        break
            caps_faces.append(f)
            caps += 1
        # One texel for the whole cap, the rim's middle: the rim's UVs fanned across it read as a striped
        # sunburst on the flank.
        if uv is not None and caps_faces:
            rim_uv = [l2[uv].uv.copy() for v in verts for l2 in v.link_loops if l2.face not in caps_faces]
            if rim_uv:
                m = rim_uv[len(rim_uv) // 2]
                for f in caps_faces:
                    for lo in f.loops:
                        lo[uv].uv = m
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    print(f"  unwelded: {nkill} webbing faces cut, {caps} cap faces", flush=True)


def arm_clean(mesh, rig):
    """Below the armpit an arm vertex follows the arm only, and a flank vertex the ribcage only. Bone heat
    and the under-arm pass left the inner upper arm with up to half its weight on the spine and the chest:
    when the arm drove forward or went up, that strip stayed with the body and the inner arm smeared 15-21 cm
    between the two (the shredded look at the armpit and the flank in the cheers, the falls and the leap).
    Mixed weights fade out over the 10 cm below the armpit; above it the joint keeps its blend."""
    W = _weights(mesh)
    B = rig.data.bones
    pit = {s: B[f"upper_arm.{s}"].head_local.z - 0.05 for s in "LR"}
    TORSO = ("spine", "chest", "hips", "pouch", "shoulder")
    n = 0
    for i, v in enumerate(mesh.data.vertices):
        w = W[i]
        if not w:
            continue
        s = "L" if v.co.x > 0 else "R"
        f = smooth((v.co.z - (pit[s] - 0.1)) / 0.1)
        if f >= 1.0:
            continue
        arm = {k: x for k, x in w.items() if k.startswith(ARM) or k.startswith("sleeve.")}
        torso = {k: x for k, x in w.items() if k.split(".")[0] in TORSO}
        if not arm or not torso:
            continue
        aw, tw = sum(arm.values()), sum(torso.values())
        if aw >= tw:
            keep, drop = arm, torso
        else:
            keep, drop = torso, arm
        lost = sum(drop.values()) * (1 - f)
        for k in drop:
            w[k] *= f
        tot = sum(keep.values())
        for k in keep:
            w[k] += lost * keep[k] / tot
        n += 1
    _write(mesh, W)
    print(f"  arm/flank weights unmixed below the armpit: {n} verts", flush=True)
