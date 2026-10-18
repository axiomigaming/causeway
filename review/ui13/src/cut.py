"""Cut static, overlap-free instances out of variable fonts: python3 cut.py"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "py"))
from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.varLib import instancer  # noqa: E402

T = os.path.join(HERE, "ttf")
JOBS = [
    ("cinzel-Cinzel.ttf", {"wght": 900}, "Cinzel-Black.ttf"),
    ("cinzel-Cinzel.ttf", {"wght": 700}, "Cinzel-Bold.ttf"),
    ("Unbounded-VF.ttf", {"wght": 900}, "Unbounded-Black.ttf"),
    ("Unbounded-VF.ttf", {"wght": 700}, "Unbounded-Bold.ttf"),
]
for src, loc, dst in JOBS:
    f = TTFont(os.path.join(T, src))
    inst = instancer.instantiateVariableFont(f, loc, overlap=instancer.OverlapMode.REMOVE)
    inst.save(os.path.join(T, dst))
    print("cut", dst)
