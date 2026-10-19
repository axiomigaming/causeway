"""3D type specimen: each candidate display face as cast gold on a slab of dark basalt.
    python3 spec14.py [Font-Name ...]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib14 as K  # noqa: E402

FONTS = sys.argv[1:] or [
    "Cinzel-Black", "Cinzel-Bold", "CinzelDecorative-Black", "Unbounded-Black", "FacultyGlyphic-Regular", "MarcellusSC-Regular",
    "PlayfairDisplaySC-Black", "SpectralSC-ExtraBold", "BowlbyOneSC-Regular", "HoltwoodOneSC-Regular", "Bungee-Regular", "RozhaOne-Regular",
]
W, H = 420, 84
for fname in FONTS:
    if os.path.exists(os.path.join(K.OUT, f"spec-{fname}.png")) and len(sys.argv) == 1:
        continue
    K.stage(W, H, pad=0)
    K.rig()
    slab = K.cobj("slab", [K.stepped_rect(0, 0, W, H, 6)], K.stone("bas", K.BASALT_WARM), z=0.0, extrude=1.0, bevel=1.0)
    cap = 34
    cy = H / 2
    K.card(cy - cap / 2, cy + cap / 2, K.CARD_WORD, strength=1.5)
    K.cast_word("CASH OUT", K.font(fname), W / 2, cy, cap, 2.0, K.gold(), track=1.06, seat=K.flat("seat", "#1a0c04", 0.5), maxw=W - 40)
    K.render(f"spec-{fname}")
