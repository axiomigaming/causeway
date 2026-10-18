"""Compose concept boards and 200 % close-ups from out13/ renders.
    python3 board13.py <1|2> <outdir>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
C = sys.argv[1]
OUTD = sys.argv[2]
os.makedirs(OUTD, exist_ok=True)
R = os.path.join(HERE, "out13")
A = os.path.join(HERE, "art")
T = os.path.join(HERE, "ttf")

INFO = {
    "1": dict(
        title="Concept 1  ·  Temple Plaque",
        why="Cast gold set into carved stone. The CTA is a temple plaque: chipped warm limestone, a recessed oxblood panel, a gold inlay line and emeralds in gold bezels. Classical Roman capitals, as if cut for the causeway's builders. Calm and architectural; the gold carries the drama.",
        disp=("Cinzel Black", "Cinzel-Black.ttf"), ui=("Barlow Semi Condensed", "BarlowSemiCondensed-SemiBold.ttf"),
        words=["c1-w-run", "c1-w-cash"], pal=["#7a6a54", "#9c8566", "#3a130a", "#e9c46a", "#0b6b3c", "#f3e7cf"],
        crops=dict(cta=(690, 812), dock=(528, 702), top=(44, 146), res=(160, 388)),
    ),
    "2": dict(
        title="Concept 2  ·  Sun Relic",
        why="The CTA is an object, not a bar: a polished cast-gold sun-disc with a turquoise mosaic ring, a ruby and jade studs, mounted in a basalt dock. Heavy modern capitals in gold on obsidian. The ring wakes up during a run (turquoise, then ember) and the amount lives in the relic's heart.",
        disp=("Unbounded Black", "Unbounded-Black.ttf"), ui=("Manrope", "Manrope-VF.ttf"),
        words=["c2-w-run", "c2-w-cash"], pal=["#141312", "#2a1c16", "#1b9a95", "#f0c75e", "#9e0a12", "#f2ece0"],
        crops=dict(cta=(604, 826), dock=(516, 826), top=(44, 150), res=(176, 404)),
    ),
}[C]

F = lambda name, size: ImageFont.truetype(os.path.join(T, name), size)
SANS_B = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
SANS = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
BG = (16, 14, 13)
INK = (236, 228, 214)
MUTE = (160, 150, 136)
GOLD = (233, 196, 106)


def load(v, s, scale=None):
    im = Image.open(os.path.join(R, f"c{C}-{v}-{s}.png")).convert("RGB")
    if scale:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    return im


def rmask(w, h, r):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
    return m


def wrap(d, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) > width:
            lines.append(cur)
            cur = w
        else:
            cur = t
    lines.append(cur)
    return lines


# ----------------------------------------------------------------- the board
PH = [("setup", "RUN · idle, stake controls"), ("pressed", "RUN · pressed"), ("low", "CASH OUT · low heat"), ("high", "CASH OUT · high heat"),
      ("escaped", "Result · escaped"), ("fell", "Result · the way fell")]
DK = [("setup", "Desktop 1440 · setup"), ("high", "Desktop 1440 · CASH OUT high heat"), ("escaped", "Desktop 1440 · escaped")]
M, G = 48, 24
PW, PHH = 390, 844
W = 2 * M + 6 * PW + 5 * G
DS = 0.545
DW, DH = round(1440 * DS), round(900 * DS)
HEAD = 330
H = HEAD + PHH + 44 + 40 + DH + 44 + 40
img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
d.text((M, 40), INFO["title"], font=F(INFO["disp"][1], 44), fill=GOLD)
y = 108
for line in wrap(d, INFO["why"], F("Manrope-VF.ttf", 20), 1180):
    d.text((M, y), line, font=F("Manrope-VF.ttf", 20), fill=INK)
    y += 30
# type specimen
sx = M + 1260
d.text((sx, 44), "TYPE", font=SANS_B, fill=MUTE)
x = sx
for wname in INFO["words"]:
    wi = Image.open(os.path.join(A, wname + ".png"))
    wi = wi.resize((wi.width // 2, wi.height // 2), Image.LANCZOS)
    img.paste(wi, (x, 70), wi)
    x += wi.width + 12
d.text((sx, 140), f"Display · {INFO['disp'][0]} (OFL), cast in Blender: flat face, 45° chamfer, dark seat", font=SANS, fill=INK)
uf = F(INFO["ui"][1], 30)
if INFO["ui"][1].endswith("VF.ttf"):
    try:
        uf.set_variation_by_axes([700])
    except Exception:
        pass
d.text((sx, 170), "Cash out 1,284.50 · Stake 25.00 · 0123456789", font=uf, fill=INK)
d.text((sx, 214), f"UI and money · {INFO['ui'][0]} (OFL), tabular lining figures", font=SANS, fill=INK)
d.text((sx, 252), "PALETTE", font=SANS_B, fill=MUTE)
for i, c in enumerate(INFO["pal"]):
    d.rounded_rectangle((sx + i * 52, 276, sx + i * 52 + 42, 318), 6, fill=c, outline=(60, 54, 48))
# phones
py = HEAD
for i, (s, lab) in enumerate(PH):
    x = M + i * (PW + G)
    im = load("phone", s, 0.5)
    img.paste(im, (x, py), rmask(PW, PHH, 36))
    d.text((x + 4, py + PHH + 12), lab, font=SANS_B, fill=INK)
# desktops
dy = py + PHH + 44 + 40
for i, (s, lab) in enumerate(DK):
    x = M + i * (DW + G + 6)
    im = load("desktop", s, DS)
    img.paste(im, (x, dy), rmask(DW, DH, 10))
    d.text((x + 4, dy + DH + 12), lab + "  (shown at 55 %)", font=SANS_B, fill=INK)
img.save(os.path.join(OUTD, f"concept-{C}.png"), optimize=True)
print("board", img.size)

# ----------------------------------------------------------------- 200 % close-ups (phone renders are DPR 2)
cr = INFO["crops"]
items = [
    ("setup", "cta", "RUN · idle"), ("hover", "cta", "RUN · hover (light sweep on the gold)"), ("pressed", "cta", "RUN · pressed (sinks, shadow tightens)"),
    ("focus", "cta", "RUN · keyboard focus"), ("disabled", "cta", "RUN · disabled (aged gold, cool stone)"), ("low", "cta", "CASH OUT · low heat"),
    ("high", "cta", "CASH OUT · high heat (ember seams, warm bloom)"), ("setup", "dock", "Stake controls"), ("setup", "top", "Top bar · logo, balance, sound, menu, history"),
    ("escaped", "res", "Result · escaped"), ("fell", "res", "Result · the way fell"),
]
tiles = []
for s, k, lab in items:
    a, b = cr[k]
    im = Image.open(os.path.join(R, f"c{C}-phone-{s}.png")).convert("RGB").crop((0, a * 2, 780, b * 2))
    tiles.append((im, lab))
CW = 780
cols = 2
rows = []
for i in range(0, len(tiles), cols):
    rows.append(tiles[i:i + cols])
HH = 90 + sum(max(t[0].height for t in r) + 52 for r in rows)
WW = 2 * M + cols * CW + (cols - 1) * G
ci = Image.new("RGB", (WW, HH), BG)
cd = ImageDraw.Draw(ci)
cd.text((M, 30), INFO["title"] + "  ·  state close-ups at 200 % (390 px phone, 2× pixels)", font=F("Manrope-VF.ttf", 26), fill=GOLD)
y = 90
for r in rows:
    for j, (im, lab) in enumerate(r):
        x = M + j * (CW + G)
        cd.text((x, y), lab, font=SANS_B, fill=INK)
        ci.paste(im, (x, y + 26))
    y += max(t[0].height for t in r) + 52
ci.save(os.path.join(OUTD, f"concept-{C}-closeups.png"), optimize=True)
print("closeups", ci.size)
