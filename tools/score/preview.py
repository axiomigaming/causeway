"""Preview mix of the theme as the game sequences it (review/audio12/preview.mp3).

    python3 tools/score/preview.py [out.mp3]

title (calm) -> a run through every tier (layers enter on bar lines after a fill; tier 4 is the lifted
loop) -> cash-out fanfare (big) -> calm safe loop -> a second run (tiers 0-2) -> fall: loss sting -> tense
loop. Uses the WAV renders in .cache/music (run tools/score/compose.py first). Music only: no SFX, beds or
UI. Bars and crossfades follow src/audio/theme.ts.
"""
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
C = os.path.join(ROOT, '.cache', 'music')
SR = 48000
W = {}


def w(name):
    if name not in W:
        W[name] = sf.read(os.path.join(C, f'{name}.wav'), dtype='float32', always_2d=True)[0]
    return W[name]


out = np.zeros((SR * 420, 2), np.float32)


def put(x, t, g=1.0, fade_in=0.0, fade_out=0.0, length=None):
    a = int(t * SR)
    x = x[: int(length * SR)] if length else x
    y = x * g
    if fade_in:
        k = min(len(y), int(fade_in * SR))
        y[:k] *= np.linspace(0, 1, k)[:, None]
    if fade_out:
        k = min(len(y), int(fade_out * SR))
        y[len(y) - k:] *= np.linspace(1, 0, k)[:, None]
    out[a:a + len(y)] += y


def loop(name, t, dur, g=1.0, fi=0.0, fo=0.0):
    x = w(name)
    reps = int(np.ceil(dur * SR / len(x))) + 1
    put(np.tile(x, (reps, 1))[: int(dur * SR)].copy(), t, g, fi, fo)


BAR = 4 * 60 / 112
t = 0.0
loop('th_calm', t, 16, 1.0, 0.5, 1.0)       # title
t = 16.0
# run 1: a segment per tier, the order the runtime might pick (A B A B ...), fill in the last bar
order = ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']
layers_by_seg = [[0], [0, 1], [0, 1], [0, 1, 2], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 3]]
for i, s in enumerate(order[:7]):
    for k in layers_by_seg[i]:
        put(w(f'th_l{k}_{s}').copy(), t)
    nxt = layers_by_seg[i + 1] if i + 1 < len(layers_by_seg) else None
    if nxt is None or nxt != layers_by_seg[i]:
        put(w('th_fill').copy(), t + 7 * BAR, 0.9)
    t += 8 * BAR
# tier 4: the lifted loop twice
loop('th_top', t, 32.0)
t += 32.0
put(w('th_win2').copy(), t)
loop('th_safe', t + 3.5, 14, 0.9, 2.0, 1.5)
t += 18.0
# run 2: tiers 0-2, then the fall mid-bar
for i, (s, ls) in enumerate([('a', [0]), ('b', [0, 1]), ('a', [0, 1, 2])]):
    for k in ls:
        put(w(f'th_l{k}_{s}').copy(), t, length=8 * BAR if i < 2 else 5.3 * BAR, fade_out=0 if i < 2 else 0.05)
    if i < 2:
        put(w('th_fill').copy(), t + 7 * BAR, 0.9)
    t += 8 * BAR if i < 2 else 5.3 * BAR
put(w('th_lose').copy(), t)
loop('th_tense', t + 4.0, 14, 1.0, 1.5, 2.0)
t += 18.0
mix = out[: int(t * SR)]
pk = float(np.abs(mix).max())
if pk > 0.95:
    mix *= 0.95 / pk
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'review', 'audio12', 'preview.mp3')
os.makedirs(os.path.dirname(dst), exist_ok=True)
wav = os.path.join(C, 'preview.wav')
sf.write(wav, mix, SR, subtype='PCM_16')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '160k', dst], check=True)
print(f'{dst}: {t:.1f} s')
