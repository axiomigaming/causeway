"""Concept 1 — TEMPLE PLAQUE: cast gold set in carved stone.
    python3 c1.py [job ...]      (jobs below; default all missing)

Sprites (2x, transparent, real contact shadows) land in art/c1-*.png. Plates and word-marks are
separate layers so states compose in CSS (pressed sinks, hover sweeps the gold, heat swaps the
panel for the ember-cracked one).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib14 as K  # noqa: E402

FONT = "Cinzel-Black"
PAD = 14


def plate(name, w, h, state="idle"):
    """The CTA plaque: chipped limestone frame with wide end caps, a recessed panel, a gold inlay
    line, emeralds in gold bezels on the caps."""
    dis = state == "disabled"
    dz = -2.5 if state == "pressed" else 0.0
    K.stage(w, h, pad=PAD)
    K.rig(key=1.7 if state == "pressed" else 2.2)
    K.card(0, h, K.CARD_SOFT, strength=1.25 if not dis else 0.8)
    cap, side, s = 40, 12, 8
    lime = K.carved("lime", K.SAND_COOL if dis else K.SAND)
    outer = K.chipped(K.stepped_rect(0, 0, w, h, s), seed=3, step=4.0, depth=0.7, bites=0.03)
    inner = K.stepped_rect(cap, side, w - cap, h - side, 5)
    # plinth: a darker step the plaque stands on
    plinth = K.chipped(K.stepped_rect(-3, -3, w + 3, h + 3, s + 1), seed=4, step=4.0, depth=0.8, bites=0.03)
    K.cobj("plinth", [plinth], K.carved("plinth", K.SAND_COOL if dis else K.SAND_DK, wear=1.2), z=1.6 + dz, extrude=0.6, bevel=1.4)
    K.cobj("frame", [outer, inner[::-1]], lime, z=4.6 + dz, extrude=1.2, bevel=3.0)
    if state == "hot":
        pm = K.ember_stone("panel", K.OXBLOOD, heat=1.0)
    else:
        pm = K.carved("panel", K.ASH2 if dis else K.OXB, grime=0.7, wear=0.3, pits=0.5)
    K.cobj("panel", [K.stepped_rect(cap - 7, side - 7, w - cap + 7, h - side + 7, 6)], pm, z=3.4 + dz, extrude=0.4, bevel=1.0)
    g = K.gold("gold", aged=1.0 if dis else 0.0, rough=0.2)
    line_o = K.stepped_rect(cap + 4, side + 4, w - cap - 4, h - side - 4, 4)
    line_i = K.stepped_rect(cap + 6.5, side + 6.5, w - cap - 6.5, h - side - 6.5, 3)
    K.cobj("inlay", [line_o, line_i[::-1]], g, z=5.1 + dz, extrude=0.3, bevel=0.6, res=0)
    gem_m = K.flat("gemdis", (0.05, 0.06, 0.06, 1), 0.25) if dis else K.glass_gem("emerald", K.EMERALD, ior=1.58, glow=0.4)
    for cx in (cap / 2, w - cap / 2):
        K.bezel("bez", cx, h / 2, 7.0, g, z=7.6 + dz, w=2.2)
        K.cobj("foil", [K.circle(cx, h / 2, 7.2)], K.gold("foil", rough=0.08, scratch=0.0, grime=0.0), z=7.2 + dz, extrude=0.2, bevel=0.0)
        K.gem("gem", cx, h / 2, 7.0, gem_m, z=7.4 + dz, h=0.62, seg=12)
        # two small gold step glyphs flanking each gem on the cap
        for sy in (-1, 1):
            y = h / 2 + sy * 17
            K.cobj("tick", [[(cx - 6, y - 2), (cx + 6, y - 2), (cx + 6, y + 2), (cx - 6, y + 2)]], g, z=8.0 + dz, extrude=0.4, bevel=0.7, res=0)
    K.render(name)


def word(name, body, cap_h, track, w, h, aged=0.0, maxw=None):
    """A cast-gold word-mark on its own transparent layer, with the shadow it throws on the panel."""
    K.stage(w, h, pad=8)
    K.rig()
    K.card(h / 2 - cap_h / 2, h / 2 + cap_h / 2, K.CARD_WORD, strength=1.55 if not aged else 0.95)
    K.cast_word(body, K.font(FONT), w / 2, h / 2, cap_h, 0.3, K.gold("wg", aged=aged, rough=0.16), track=track,
                seat=K.flat("seat", "#160904", 0.5), maxw=maxw)
    K.render(name)


def key(name, sz=48, state="idle"):
    """Secondary key: a small basalt tablet in a thin worn-limestone socket (quiet)."""
    dz = -1.5 if state == "pressed" else 0.0
    K.stage(sz, sz, pad=8)
    K.rig(key=1.6 if state == "pressed" else 2.0)
    K.card(0, sz, K.CARD_SOFT, strength=1.0)
    lime = K.carved("lime", K.SAND)
    outer = K.chipped(K.stepped_rect(0, 0, sz, sz, 4), seed=5, step=2.5, depth=0.6, bites=0.04)
    K.cobj("sock", [outer, K.stepped_rect(5, 5, sz - 5, sz - 5, 3)[::-1]], lime, z=3.2 + dz, extrude=0.6, bevel=1.4)
    K.cobj("face", [K.stepped_rect(5.5, 5.5, sz - 5.5, sz - 5.5, 3)], K.carved("bas", K.BAS_W, wear=0.4, pits=0.4), z=2.4 + dz, extrude=0.5, bevel=1.4)
    K.render(name)


def slot(name, w, h):
    """The stake field: a recessed basalt slot with a gold hairline (9-slice 16)."""
    K.stage(w, h, pad=8)
    K.rig()
    K.card(0, h, K.CARD_SOFT, strength=1.0)
    lime = K.carved("lime", K.SAND)
    outer = K.chipped(K.stepped_rect(0, 0, w, h, 5), seed=7, step=3, depth=0.7, bites=0.04)
    K.cobj("rim", [outer, K.stepped_rect(6, 6, w - 6, h - 6, 3)[::-1]], lime, z=3.4, extrude=0.6, bevel=1.6)
    K.cobj("well", [K.stepped_rect(5, 5, w - 5, h - 5, 3)], K.carved("bas", K.BAS_W, wear=0.3, pits=0.3), z=1.0, extrude=0.3, bevel=0.8)
    g = K.gold("g", rough=0.22)
    K.cobj("hair", [K.stepped_rect(9, 9, w - 9, h - 9, 2), K.stepped_rect(10.4, 10.4, w - 10.4, h - 10.4, 2)[::-1]], g, z=2.0, extrude=0.2, bevel=0.4, res=0)
    K.render(name)


def tablet(name, w, h, crest=False, inlay=True):
    """A stone tablet: limestone frame, basalt face, optional gold inlay line and gold crest stud."""
    K.stage(w, h, pad=PAD)
    K.rig()
    K.card(0, h, K.CARD_SOFT, strength=1.15)
    lime = K.carved("lime", K.SAND)
    b = 9 if h > 60 else 6
    outer = K.chipped(K.stepped_rect(0, 0, w, h, 7 if h > 60 else 5), seed=11, step=4, depth=0.7, bites=0.03)
    plinth = K.chipped(K.stepped_rect(-2.5, -2.5, w + 2.5, h + 2.5, 8 if h > 60 else 6), seed=12, step=4, depth=0.8, bites=0.03)
    K.cobj("plinth", [plinth], K.carved("plinth", K.SAND_DK, wear=1.2), z=1.5, extrude=0.5, bevel=1.2)
    K.cobj("frame", [outer, K.stepped_rect(b, b, w - b, h - b, 4)[::-1]], lime, z=4.2, extrude=1.0, bevel=2.6)
    K.cobj("face", [K.stepped_rect(b - 1, b - 1, w - b + 1, h - b + 1, 4)], K.carved("bas", K.BAS_W, wear=0.4, pits=0.4), z=1.5, extrude=0.4, bevel=1.0)
    g = K.gold("g", rough=0.2)
    if inlay:
        i0, i1 = b + 5, b + 7
        K.cobj("inl", [K.stepped_rect(i0, i0, w - i0, h - i0, 3), K.stepped_rect(i1, i1, w - i1, h - i1, 2)[::-1]], g, z=2.8, extrude=0.3, bevel=0.5, res=0)
    if crest:
        cx = w / 2
        K.cobj("crestseat", [K.circle(cx, 0, 13)], lime, z=6.2, extrude=0.8, bevel=1.6)
        K.bezel("bez", cx, 0, 8, g, z=8.6, w=2.6)
        K.cobj("foil", [K.circle(cx, 0, 8.2)], K.gold("foil", rough=0.08, scratch=0.0, grime=0.0), z=8.0, extrude=0.2, bevel=0.0)
        K.gem("ruby", cx, 0, 8, K.glass_gem("ruby", K.RUBY, ior=1.76, glow=0.4), z=8.3, h=0.62)
    K.render(name)


def logo(name, w=150, h=48):
    cap = 15 if w >= 140 else 11.5
    K.stage(w, h, pad=PAD)
    K.rig()
    K.card(0, h, K.CARD_SOFT, strength=1.15)
    lime = K.carved("lime", K.SAND)
    outer = K.chipped(K.stepped_rect(0, 0, w, h, 5), seed=13, step=2.5, depth=0.8, bites=0.05)
    K.cobj("frame", [outer, K.stepped_rect(6, 6, w - 6, h - 6, 3)[::-1]], lime, z=3.6, extrude=0.6, bevel=1.8)
    K.cobj("face", [K.stepped_rect(5, 5, w - 5, h - 5, 3)], K.carved("bas", K.OXB, wear=0.3, pits=0.3), z=1.4, extrude=0.3, bevel=0.9)
    K.card(h / 2 - cap / 2, h / 2 + cap / 2, K.CARD_WORD, strength=1.55, z=30)
    K.cast_word("CAUSEWAY", K.font(FONT), w / 2, h / 2, cap, 2.2, K.gold("wg", rough=0.16), track=1.16, seat=K.flat("seat", "#160904", 0.5), maxw=w - 26)
    K.render(name)


JOBS = {
    "plate-p": lambda: plate("c1-plate-p", 358, 88),
    "plate-p-pressed": lambda: plate("c1-plate-p-pressed", 358, 88, "pressed"),
    "plate-p-disabled": lambda: plate("c1-plate-p-disabled", 358, 88, "disabled"),
    "plate-p-hot": lambda: plate("c1-plate-p-hot", 358, 88, "hot"),
    "plate-d": lambda: plate("c1-plate-d", 420, 92),
    "plate-d-pressed": lambda: plate("c1-plate-d-pressed", 420, 92, "pressed"),
    "plate-d-hot": lambda: plate("c1-plate-d-hot", 420, 92, "hot"),
    "w-run": lambda: word("c1-w-run", "RUN", 30, 1.22, 150, 48),
    "w-run-dis": lambda: word("c1-w-run-dis", "RUN", 30, 1.22, 150, 48, aged=1.0),
    "w-cash": lambda: word("c1-w-cash", "CASH OUT", 17, 1.10, 150, 32),
    "w-escaped": lambda: word("c1-w-escaped", "ESCAPED", 30, 1.12, 260, 48),
    "w-fell": lambda: word("c1-w-fell", "THE WAY FELL", 22, 1.08, 280, 40, aged=1.0),
    "w-again": lambda: word("c1-w-again", "RUN AGAIN", 24, 1.12, 230, 42),
    "key": lambda: key("c1-key"),
    "key-pressed": lambda: key("c1-key-pressed", state="pressed"),
    "slot": lambda: slot("c1-slot", 200, 52),
    "bal": lambda: tablet("c1-bal", 176, 48, inlay=False),
    "logo": lambda: logo("c1-logo"),
    "result-p": lambda: tablet("c1-result-p", 358, 196, crest=True),
    "result-d": lambda: tablet("c1-result-d", 440, 204, crest=True),
    "dock-p": lambda: tablet("c1-dock-p", 358, 148, inlay=False),
    "dock-d": lambda: tablet("c1-dock-d", 420, 148, inlay=False),
    "logo-p": lambda: logo("c1-logo-p", 112, 48),
}
want = sys.argv[1:]
for k, fn in JOBS.items():
    if want and k not in want:
        continue
    if not want and os.path.exists(os.path.join(K.OUT, f"c1-{k}.png")):
        continue
    fn()
