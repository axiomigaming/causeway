"""Concept 2 — SUN RELIC: the CTA is a cast-gold sun-disc set in a basalt dock.
    FONT2=<ttf name> python3 c2.py [job ...]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib14 as K  # noqa: E402

FONT = os.environ.get("FONT2", "Unbounded-Black")
D = 200          # disc diameter (CSS px at desktop; the phone shows it at 176)
R = D / 2
PAD = 16


def rays(c, r0, r1, n, mat, z, long_every=2, cy=None):
    """Serrated sun rays: trapezoid teeth, alternately long and short, chamfered."""
    cx, cy = c, (c if cy is None else cy)
    for i in range(n):
        a = i / n * math.tau - math.pi / 2
        ro = r1 if i % long_every == 0 else r0 + (r1 - r0) * 0.55
        hw_in = math.pi / n * (0.62 if i % long_every == 0 else 0.5)
        pts = [(cx + r0 * math.cos(a - hw_in), cy + r0 * math.sin(a - hw_in)), (cx + ro * math.cos(a), cy + ro * math.sin(a)),
               (cx + r0 * math.cos(a + hw_in), cy + r0 * math.sin(a + hw_in))]
        K.cobj("ray", [pts], mat, z=z, extrude=0.6, bevel=1.2, res=0)


def disc(name, state="idle"):
    dis = state == "disabled"
    dz = -2.5 if state == "pressed" else 0.0
    K.stage(D, D, pad=PAD)
    K.rig(key=1.7 if state == "pressed" else 2.2)
    K.card(0, D, K.CARD_SOFT, strength=1.3 if not dis else 0.8)
    c = R
    if not dis:
        K.glint(c - 70, c - 66, c + 10, c - 26, z=30, strength=5.0 if state != "pressed" else 3.2)
    g = K.gold("g", aged=1.0 if dis else 0.0, rough=0.16)
    gh = K.gold("gh", aged=1.0 if dis else 0.0, rough=0.3, scratch=1.6)  # hammered body
    # back plate (the body of the disc under the rays)
    K.cobj("body", [K.circle(c, c, 88)], gh, z=1.0 + dz, extrude=0.6, bevel=1.0)
    rays(c, 85, 100, 24, g, z=2.2 + dz)
    # raised bead, turquoise ring, inner bead
    K.cobj("bead_o", [K.circle(c, c, 88), K.circle(c, c, 83.5)[::-1]], g, z=4.0 + dz, extrude=0.6, bevel=1.4, res=3)
    if state in ("cash", "hot"):
        tq = K.turquoise("tq")
        nt = tq.node_tree
        bs = nt.nodes["Principled BSDF"]
        bs.inputs["Emission Color"].default_value = (0.05, 0.9, 0.75, 1) if state == "cash" else (1.0, 0.22, 0.02, 1)
        bs.inputs["Emission Strength"].default_value = 0.6 if state == "cash" else 0.9
    elif dis:
        tq = K.carved("tqd", K.ASH2, wear=0.2, pits=0.2)
    else:
        tq = K.turquoise("tq")
    K.cobj("turq", [K.circle(c, c, 83.8), K.circle(c, c, 72.2)[::-1]], tq, z=3.4 + dz, extrude=0.4, bevel=0.6)
    K.cobj("bead_i", [K.circle(c, c, 72.6), K.circle(c, c, 68)[::-1]], g, z=4.0 + dz, extrude=0.6, bevel=1.4, res=3)
    # obsidian centre, recessed; it carries the word (idle) or the live amount (cash)
    ob = K.obsidian("obs")
    if state == "hot":
        nt = ob.node_tree
        bs = nt.nodes["Principled BSDF"]
        bs.inputs["Emission Color"].default_value = (1.0, 0.3, 0.03, 1)
        bs.inputs["Emission Strength"].default_value = 0.02
    K.cobj("obs", [K.circle(c, c, 68.4)], ob, z=2.2 + dz, extrude=0.3, bevel=0.9)
    # gems: ruby at the top of the ring, three jade studs at 3, 6 and 9 o'clock
    foil = K.gold("foil", rough=0.08, scratch=0.0, grime=0.0, aged=1.0 if dis else 0.0)
    for i, (gm, rr) in enumerate([("ruby", 7.4), ("jade", 5.0), ("jade", 5.0), ("jade", 5.0)]):
        a = -math.pi / 2 + i * math.pi / 2
        x, y = c + 78 * math.cos(a), c + 78 * math.sin(a)
        K.bezel("bz", x, y, rr, g, z=6.6 + dz, w=1.8)
        K.cobj("foil", [K.circle(x, y, rr + 0.2)], foil, z=6.0 + dz, extrude=0.2, bevel=0.0)
        if dis:
            m = K.flat("gd", (0.05, 0.05, 0.05, 1), 0.3)
        elif gm == "ruby":
            m = K.glass_gem("ruby", K.RUBY, ior=1.76, glow=2.4 if state == "hot" else 0.35)
        else:
            m = K.glass_gem("jade", K.EMERALD, ior=1.6, glow=0.35)
        K.gem(gm, x, y, rr, m, z=6.4 + dz, h=0.66, seg=12)
    K.render(name)


def word(name, body, cap_h, track, w, h, aged=0.0):
    K.stage(w, h, pad=8)
    K.rig()
    K.card(h / 2 - cap_h / 2, h / 2 + cap_h / 2, K.CARD_WORD, strength=1.55 if not aged else 0.95)
    K.cast_word(body, K.font(FONT), w / 2, h / 2, cap_h, 0.3, K.gold("wg", aged=aged, rough=0.16), track=track,
                seat=K.flat("seat", "#120804", 0.5), maxw=w - 6)
    K.render(name)


def dock(name, w, h=132, cy=38, rs=95):
    """Basalt dock with a round bronze mount for the disc, cut into its top edge."""
    K.stage(w, h, pad=PAD)
    K.rig()
    K.card(0, h, K.CARD_SOFT, strength=1.0)
    cx = w / 2
    dx = math.sqrt(rs * rs - cy * cy)
    a0 = math.atan2(-cy, -dx)
    a1 = math.atan2(-cy, dx)
    arc = []
    n = 72
    # from the left intersection, round under the disc, to the right intersection
    span = (a1 - a0) % math.tau
    for i in range(n + 1):
        a = a0 - i / n * (math.tau - span)
        arc.append((cx + rs * math.cos(a), cy + rs * math.sin(a)))
    outline = [(0, 0), (cx - dx, 0)] + arc + [(cx + dx, 0), (w, 0), (w, h), (0, h)]
    outline = K.chipped(outline, seed=17, step=4.0, depth=0.6, bites=0.015)
    bas = K.carved("bas", K.BAS_W, wear=0.6, pits=0.6)
    K.cobj("dock", [outline], bas, z=3.0, extrude=1.2, bevel=2.4)
    g = K.gold("g", rough=0.2)
    # gold edge line along the top edge (either side of the mount)
    for x0, x1 in ((10, cx - dx - 10), (cx + dx + 10, w - 10)):
        if x1 - x0 > 8:
            K.cobj("edge", [[(x0, 7), (x1, 7), (x1, 9.2), (x0, 9.2)]], g, z=6.9, extrude=0.3, bevel=0.5, res=0)
    # the mount: a bronze collar ring around the disc
    br = K.gold("br", tone=(0.55, 0.32, 0.14), rough=0.35, aged=0.3)
    K.cobj("mount", [K.circle(cx, cy, rs + 2), K.circle(cx, cy, R * 0.88 + 1.0)[::-1]], br, z=5.2, extrude=1.0, bevel=1.8)
    K.cobj("mbead", [K.circle(cx, cy, rs + 2.2), K.circle(cx, cy, rs - 0.6)[::-1]], g, z=7.4, extrude=0.4, bevel=1.0, res=3)
    K.cobj("socket", [K.circle(cx, cy, R * 0.88 + 2)], K.carved("sock", K.BAS_W, wear=0.2), z=0.8, extrude=0.3, bevel=0.6)
    K.render(name)


def coin(name, sz=52, state="idle"):
    dz = -1.6 if state == "pressed" else 0.0
    K.stage(sz, sz, pad=8)
    K.rig(key=1.7 if state == "pressed" else 2.2)
    K.card(0, sz, K.CARD_SOFT, strength=1.25)
    c = sz / 2
    g = K.gold("g", rough=0.18)
    K.cobj("rim", [K.circle(c, c, c), K.circle(c, c, c - 5)[::-1]], g, z=3.6 + dz, extrude=0.8, bevel=1.6, res=3)
    K.cobj("face", [K.circle(c, c, c - 4.5)], K.obsidian("o"), z=2.2 + dz, extrude=0.4, bevel=1.0)
    K.render(name)


def cartouche(name, w, h):
    K.stage(w, h, pad=8)
    K.rig()
    K.card(0, h, K.CARD_SOFT, strength=1.2)
    g = K.gold("g", rough=0.18)
    r = h / 2
    from lib14 import B  # pill helper
    def pill(x0, y0, x1, y1, rr):
        pts = []
        for cx, cy, a0 in ((x1 - rr, y0 + rr, -90), (x1 - rr, y1 - rr, 0), (x0 + rr, y1 - rr, 90), (x0 + rr, y0 + rr, 180)):
            for i in range(13):
                a = math.radians(a0 + 90 * i / 12)
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        return pts
    K.cobj("rim", [pill(0, 0, w, h, r), pill(3.5, 3.5, w - 3.5, h - 3.5, r - 3.5)[::-1]], g, z=3.2, extrude=0.6, bevel=1.3, res=3)
    K.cobj("face", [pill(3, 3, w - 3, h - 3, r - 3)], K.obsidian("o"), z=1.8, extrude=0.3, bevel=0.8)
    K.render(name)


def emblem(name, sz=40):
    """The logo seal: a miniature of the sun-disc."""
    K.stage(sz, sz, pad=6)
    K.rig()
    K.card(0, sz, K.CARD_SOFT, strength=1.3)
    c = sz / 2
    g = K.gold("g", rough=0.18)
    K.cobj("body", [K.circle(c, c, 16)], K.gold("gh", rough=0.3), z=2.0, extrude=0.6, bevel=1.0)
    rays(c, 15, 20, 16, g, z=2.2)
    K.cobj("tq", [K.circle(c, c, 15), K.circle(c, c, 10.5)[::-1]], K.turquoise("t"), z=2.6, extrude=0.3, bevel=0.4)
    K.cobj("b", [K.circle(c, c, 10.6), K.circle(c, c, 8.6)[::-1]], g, z=3.4, extrude=0.4, bevel=0.8, res=3)
    K.gem("ruby", c, c, 8.4, K.glass_gem("ruby", K.RUBY, glow=0.4), z=3.0, h=0.6, seg=12)
    K.cobj("foil", [K.circle(c, c, 8.6)], K.gold("f", rough=0.08, scratch=0, grime=0), z=2.4, extrude=0.2, bevel=0)
    K.render(name)


def tablet(name, w, h, aged=0.0):
    """Result tablet: obsidian field in a stepped gold frame, a sun stud at the top."""
    K.stage(w, h, pad=PAD)
    K.rig()
    K.card(0, h, K.CARD_SOFT, strength=1.2)
    g = K.gold("g", rough=0.18, aged=aged)
    K.cobj("frame", [K.stepped_rect(0, 0, w, h, 8), K.stepped_rect(7, 7, w - 7, h - 7, 5)[::-1]], g, z=3.6, extrude=0.8, bevel=1.6, res=0)
    K.cobj("bead", [K.stepped_rect(11, 11, w - 11, h - 11, 4), K.stepped_rect(12.6, 12.6, w - 12.6, h - 12.6, 4)[::-1]], g, z=2.6, extrude=0.2, bevel=0.5, res=0)
    K.cobj("face", [K.stepped_rect(6, 6, w - 6, h - 6, 5)], K.obsidian("o"), z=1.4, extrude=0.3, bevel=0.8)
    # a small sun crest at the top centre (the relic's emblem)
    cx = w / 2
    K.cobj("cbody", [K.circle(cx, 0, 13)], K.gold("gh", rough=0.3, aged=aged), z=5.0, extrude=0.6, bevel=1.0)
    rays(cx, 12.5, 18, 16, g, z=5.2, cy=0)
    K.cobj("cfoil", [K.circle(cx, 0, 8.2)], K.gold("f", rough=0.08, scratch=0, grime=0), z=6.4, extrude=0.2, bevel=0)
    K.bezel("cbz", cx, 0, 8, g, z=7.0, w=2.0)
    K.gem("ruby", cx, 0, 8, K.glass_gem("ruby", K.RUBY, glow=0.4), z=6.8, h=0.62, seg=12)
    K.render(name)


JOBS = {
    "disc": lambda: disc("c2-disc"),
    "disc-pressed": lambda: disc("c2-disc-pressed", "pressed"),
    "disc-disabled": lambda: disc("c2-disc-disabled", "disabled"),
    "disc-cash": lambda: disc("c2-disc-cash", "cash"),
    "disc-hot": lambda: disc("c2-disc-hot", "hot"),
    "w-run": lambda: word("c2-w-run", "RUN", 30, 1.06, 124, 46),
    "w-run-dis": lambda: word("c2-w-run-dis", "RUN", 30, 1.06, 124, 46, aged=1.0),
    "w-cash": lambda: word("c2-w-cash", "CASH OUT", 11, 1.14, 100, 22),
    "w-escaped": lambda: word("c2-w-escaped", "ESCAPED", 26, 1.06, 250, 44),
    "w-fell": lambda: word("c2-w-fell", "THE WAY FELL", 19, 1.06, 270, 36, aged=1.0),
    "w-again": lambda: word("c2-w-again", "AGAIN", 22, 1.06, 124, 40),
    "dock-p": lambda: dock("c2-dock-p", 358),
    "dock-d": lambda: dock("c2-dock-d", 560),
    "coin": lambda: coin("c2-coin"),
    "coin-pressed": lambda: coin("c2-coin-pressed", state="pressed"),
    "cart": lambda: cartouche("c2-cart", 168, 44),
    "rkey": lambda: coin("c2-rkey", sz=44),
    "emblem": lambda: emblem("c2-emblem"),
    "result-p": lambda: tablet("c2-result-p", 358, 196),
    "result-d": lambda: tablet("c2-result-d", 440, 204),
}
want = sys.argv[1:]
for k, fn in JOBS.items():
    if want and k not in want:
        continue
    if not want and os.path.exists(os.path.join(K.OUT, f"c2-{k}.png")):
        continue
    fn()
