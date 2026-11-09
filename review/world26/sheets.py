"""World round 26: review sheets (before = b82421e, prefix a26; after, b26) into review/world26/sheets.

    python3 review/world26/sheets.py [seeds...]
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sheets")
os.makedirs(OUT, exist_ok=True)
M = os.path.join(HERE, "..", "world24", "montage.py")
seeds = sys.argv[1:]
for args in (["--pair", "a26", "b26", "high", "high-before-after.jpg"], ["--pair", "a26", "b26", "low", "phone-before-after.jpg"],
             ["b26", "high", "high-after.jpg"], ["b26", "low", "phone-after.jpg"]):
    args[-1] = os.path.join(OUT, args[-1])
    subprocess.run([sys.executable, M, *args, *seeds], check=False)
