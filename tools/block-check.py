"""Blocky-tile detector for captures: counts axis-aligned 8x8 cells that are flat inside but stand off
their neighbours by a hard step on at least three sides (the "16-px squares near the sun" artefact:
distant leaf cards collapsing to solid squares, or any nearest-upsampled buffer).

    python3 tools/block-check.py shot.png [more.png ...] [--max 40]

Prints the count per image and exits 1 if any image has more than --max such cells.
"""
import sys
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
mx = 40
if '--max' in sys.argv:
    mx = int(sys.argv[sys.argv.index('--max') + 1])
bad = 0
def steps(a):
    """Pixels where the image steps by >= 4 levels between two flat runs of 6 px (both sides nearly
    constant): the edge of a flat tile. Natural edges (foliage, stone) are not flat on both sides; sky
    gradients do not step."""
    l = a[:, :-14]
    r = a[:, 14:]
    left = np.stack([a[:, i:i + a.shape[1] - 14] for i in range(0, 6)])
    right = np.stack([a[:, i:i + a.shape[1] - 14] for i in range(8, 14)])
    lm, rm = left.mean(0), right.mean(0)
    flat = (left.std(0) < 0.9) & (right.std(0) < 0.9)
    return flat & (np.abs(rm - lm) >= 4)
for p in args:
    a = np.asarray(Image.open(p).convert('L'), dtype=float)
    hs = steps(a)
    vs = steps(a.T)
    # A tile edge is a straight run (4+ px along it); a tile is where a vertical-edge run meets a
    # horizontal-edge run (a corner). Natural flat-sided shapes rarely make both.
    H, W = a.shape
    def runmask(m, axis):
        k = np.ones(4)
        c = np.apply_along_axis(lambda col: np.convolve(col, k, 'same'), axis, m.astype(float))
        return c >= 4
    hm = np.zeros((H, W), bool)
    hm[:, 7:7 + hs.shape[1]] = runmask(hs, 0)   # vertical edges (x-steps), running along y
    vm = np.zeros((H, W), bool)
    vm[7:7 + vs.shape[1], :] = runmask(vs, 0).T  # horizontal edges (y-steps), running along x
    def dil(m):
        o = m.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                o |= np.roll(np.roll(m, dy, 0), dx, 1)
        return o
    n = int((dil(hm) & dil(vm)).sum())
    flag = n > mx
    bad += flag
    print(f"{'FAIL' if flag else 'ok  '} {p}: {n} tile corners")
sys.exit(1 if bad else 0)
