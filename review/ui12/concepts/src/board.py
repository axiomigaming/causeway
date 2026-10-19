"""Combined round-12 board: every direction side by side (setup row over mid-run row), lettered.
    python3 board.py <out.png>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
LET = "ABCDEFGH"
NAMES = {
    "A": "Obsidian & Jade", "B": "Sunstone Medallion", "C": "Arcade Runner", "D": "Expedition Kit",
    "E": "Treasure Ingot", "F": "Jungle Noir", "G": "Feathered Serpent", "H": "Glowstone (wildcard)",
}
TAG = {
    "A": "black glass, jade line, hairline gold", "B": "round dial CTA, multiplier ring", "C": "chunky glossy mobile-game",
    "D": "planks, rope, brass, map paper", "E": "cast-gold ingot, chest plaque", "F": "smoked glass, gold pill, modern",
    "G": "mosaic serpent, quetzal plumes", "H": "glowing glyphs in night basalt",
}
S = 0.6
PW, PH = int(390 * S), int(844 * S)
M, GAP = 28, 18
W = 2 * M + 8 * PW + 7 * GAP
TOP = 112
H = TOP + 64 + PH + 14 + PH + 40
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
reg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
let = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 34)
img = Image.new("RGB", (W, H), (18, 16, 16))
d = ImageDraw.Draw(img)
d.text((M, 26), "CAUSEWAY · round 12 · buttons and top bar, eight directions", font=big, fill=(255, 255, 255))
d.text((M, 70), "Each column: setup (stake dock + RUN) above mid-run (5.12× with CASH OUT 128.00). Phones rendered at 390 px, shown here at 60 %. Full sheets: A.png … H.png", font=reg, fill=(190, 182, 170))


def rmask(w, h, r):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
    return m


for i, k in enumerate(LET):
    src = Image.open(os.path.join(HERE, "out", k + ".png")).convert("RGB")
    x = M + i * (PW + GAP)
    d.text((x, TOP), k, font=let, fill=(242, 193, 78))
    d.text((x + 34, TOP + 4), NAMES[k], font=bold, fill=(255, 255, 255))
    d.text((x + 34, TOP + 24), TAG[k], font=reg, fill=(170, 162, 150))
    for j, px in enumerate((24, 438)):
        ph = src.crop((px, 140, px + 390, 140 + 844)).resize((PW, PH), Image.LANCZOS)
        y = TOP + 64 + j * (PH + 14)
        img.paste(ph, (x, y), rmask(PW, PH, 20))
img.save(sys.argv[1])
print(img.size)
