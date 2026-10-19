"""Type specimen sheet: each candidate display face cast in gold (Blender), the chosen two marked.
    python3 specsheet.py <out.png>"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

H = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(H, "art")
T = os.path.join(H, "ttf")
ROWS = [
    ("Cinzel-Black", "Cinzel Black", "CHOSEN · concept 1 (Temple Plaque): Roman inscriptional capitals; reads as cut for the builders"),
    ("Unbounded-Black", "Unbounded Black", "CHOSEN · concept 2 (Sun Relic): heavy, wide, modern; casts like a block of gold"),
    ("Cinzel-Bold", "Cinzel Bold", "lighter; the serifs go thin when cast at button size"),
    ("CinzelDecorative-Black", "Cinzel Decorative Black", "swash capitals read as fantasy, not adventure"),
    ("FacultyGlyphic-Regular", "Faculty Glyphic", "beautiful glyphic shapes, but one weight only: too thin to cast"),
    ("MarcellusSC-Regular", "Marcellus SC", "elegant but light; it disappears on the gold"),
    ("HoltwoodOneSC-Regular", "Holtwood One SC", "Western poster, wrong genre"),
]
f_b = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 17)
f_r = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
M = 40
rows = []
for key, name, note in ROWS:
    p = os.path.join(A, f"spec-{key}.png")
    if os.path.exists(p):
        im = Image.open(p).convert("RGBA")
        rows.append((im.resize((im.width // 2 * 1, im.height // 2 * 1), Image.LANCZOS), name, note, note.startswith("CHOSEN")))
W = 2 * M + 440 + 24 + 760
Hh = 120 + len(rows) * 112 + 200
img = Image.new("RGB", (W, Hh), (16, 14, 13))
d = ImageDraw.Draw(img)
tf = ImageFont.truetype(os.path.join(T, "Manrope-VF.ttf"), 26)
tf.set_variation_by_axes([700])
d.text((M, 32), "CAUSEWAY · round 13 · display type, cast in gold (Blender, 2× sprites shown at 1×)", font=tf, fill=(233, 196, 106))
d.text((M, 72), "Each face is real geometry: extruded glyphs, a flat face and a 45° chamfer, a dark seat, lit by the same studio and reflection card as the buttons.", font=f_r, fill=(190, 180, 166))
y = 120
for im, name, note, chosen in rows:
    if chosen:
        d.rounded_rectangle((M - 10, y - 8, W - M + 10, y + 100), 10, outline=(233, 196, 106), width=2)
    img.paste(im, (M, y), im)
    d.text((M + 440 + 24, y + 22), name + "  (OFL)", font=f_b, fill=(240, 232, 218))
    d.text((M + 440 + 24, y + 50), note, font=f_r, fill=(233, 196, 106) if chosen else (170, 160, 146))
    y += 112
# UI faces
y += 10
d.text((M, y), "UI and money (live text, tabular lining figures)", font=f_b, fill=(240, 232, 218))
y += 34
bar = ImageFont.truetype(os.path.join(T, "BarlowSemiCondensed-SemiBold.ttf"), 30)
d.text((M, y), "Barlow Semi Condensed · 1,284.50  31,250.00  0123456789", font=bar, fill=(243, 231, 207))
d.text((M + 900, y + 8), "concept 1", font=f_r, fill=(170, 160, 146))
y += 48
man = ImageFont.truetype(os.path.join(T, "Manrope-VF.ttf"), 30)
try:
    man.set_variation_by_axes([800])
except Exception:
    pass
d.text((M, y), "Manrope ExtraBold · 1,284.50  31,250.00  0123456789", font=man, fill=(242, 236, 224))
d.text((M + 900, y + 8), "concept 2", font=f_r, fill=(170, 160, 146))
img.save(sys.argv[1], optimize=True)
print(img.size)
