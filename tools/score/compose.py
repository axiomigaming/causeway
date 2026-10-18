"""CAUSEWAY theme: composes, arranges, renders and encodes the adaptive score.

    python3 tools/score/compose.py            (needs: fluidsynth, ffmpeg, numpy, scipy, soundfile, mido)

The theme is written here as notes (a D minor tune, i-VI-III-VII | i-VI-iv-V, with a pan-flute hook you can
hum), arranged in layers that the game stacks with the run tier, and rendered offline:

  * melodic parts: MuseScore_General.sf3 (MIT; FluidR3 lineage, see THIRD_PARTY_NOTICES.md) through fluidsynth,
    one part at a time, humanised (timing, velocity, legato, vibrato, swells);
  * percussion: the recorded taiko / djembe / frame drum / shaker / pulse one-shots already shipped in
    public/audio (Freesound, credited), placed by a humanised sequencer;
  * room: convolution with the recorded church impulse response (public/audio/ir_room), per-part sends.

Every loop is rendered for two full cycles and the second cycle is kept, so reverb and note tails wrap
around and the loop is seamless; all layers of a segment share one length to the sample, so the game can
start them together and they stay locked. Outputs: public/audio/th_*.webm (Opus) + .m4a (AAC), merged into
public/audio/manifest.json under group "theme" (with bpm / bars for the runtime, src/audio/theme.ts).
"""
import hashlib
import json
import os
import random
import subprocess
import sys
import tempfile

import mido
import numpy as np
import soundfile as sf
from scipy.signal import fftconvolve

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AUD = os.path.join(ROOT, 'public', 'audio')
CACHE = os.path.join(ROOT, '.cache', 'music')
SF_URL = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3'
SF_SHA = '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3'
SR = 48000
PPQ = 480
SEED = 11
os.makedirs(CACHE, exist_ok=True)
rng = random.Random(SEED)


def soundfont():
    p = os.path.join(CACHE, 'MuseScore_General.sf3')
    if not os.path.exists(p):
        subprocess.run(['curl', '-sS', '-L', '-o', p + '.part', SF_URL], check=True)
        os.replace(p + '.part', p)
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if h != SF_SHA:
        sys.exit(f'unexpected soundfont hash {h}')
    return p


SF2 = soundfont()

# ------------------------------------------------------------------ harmony
# Chords: (root semitones from D, quality). D minor, so the tune is i-VI-III-VII | i-VI-iv-V and the
# answer VI-VII-i-i | iv-VI-V-V.
CH = {'Dm': (0, 'm'), 'Bb': (-4, 'M'), 'F': (3, 'M'), 'C': (-2, 'M'), 'Gm': (5, 'm'), 'A': (7, 'M'), 'D': (0, 'M')}
PROG = {'A': ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], 'B': ['Bb', 'C', 'Dm', 'Dm', 'Gm', 'Bb', 'A', 'A']}
D4 = 62


def tones(ch, key=0):
    r, q = CH[ch]
    return [r + key, r + key + (3 if q == 'm' else 4), r + key + 7]


def near(pcs, lo, hi):
    """every midi note in [lo, hi] whose pitch class is in pcs (semitones from D)"""
    return [n for n in range(lo, hi + 1) if (n - 2) % 12 in {p % 12 for p in pcs}]


# ------------------------------------------------------------------ the tune (beats, dur, midi)
MEL = {
    'A': [
        [(0, .5, 69), (.5, .5, 74), (1, .5, 76), (1.5, 1, 77), (2.5, .5, 76), (3, 1, 74)],
        [(0, .75, 77), (.75, .25, 76), (1, .5, 74), (1.5, .5, 72), (2, 2, 74)],
        [(0, .5, 72), (.5, .5, 77), (1, .5, 79), (1.5, 1, 81), (2.5, .5, 79), (3, 1, 77)],
        [(0, .75, 76), (.75, .25, 74), (1, .5, 72), (1.5, .5, 76), (2, 2, 79)],
        [(0, .5, 81), (.5, .5, 79), (1, .5, 77), (1.5, 1, 81), (2.5, .5, 79), (3, 1, 77)],
        [(0, .75, 77), (.75, .25, 79), (1, .5, 77), (1.5, .5, 74), (2, 2, 70)],
        [(0, .5, 67), (.5, .5, 70), (1, .5, 74), (1.5, 1, 79), (2.5, .5, 77), (3, 1, 76)],
        [(0, 1.5, 73), (1.5, .5, 76), (2, 2, 69)],
    ],
    'B': [
        [(0, 1.5, 77), (1.5, .5, 79), (2, 1, 81), (3, 1, 82)],
        [(0, 1.5, 84), (1.5, .5, 82), (2, 1, 81), (3, 1, 79)],
        [(0, 2, 81), (2, 1, 77), (3, 1, 74)],
        [(0, .5, 76), (.5, .5, 77), (1, .5, 76), (1.5, .5, 74), (2, 2, 69)],
        [(0, 1.5, 82), (1.5, .5, 81), (2, 1, 79), (3, 1, 74)],
        [(0, 1.5, 77), (1.5, .5, 79), (2, 1, 77), (3, 1, 74)],
        [(0, 1, 76), (1, 1, 73), (2, 1, 76), (3, 1, 79)],
        [(0, 3, 81)],
    ],
}


class Part:
    """one instrument line: notes (beat, dur, midi, vel) on one program, plus expression and pan"""

    def __init__(self, prog, bank=0, pan=64, gain=1.0, wet=0.2, legato=1.0, jitter=0.006, vib=False, chan=0, swell=None):
        self.prog, self.bank, self.pan, self.gain, self.wet = prog, bank, pan, gain, wet
        self.legato, self.jitter, self.vib, self.chan, self.swell = legato, jitter, vib, chan, swell
        self.notes = []

    def add(self, beat, dur, note, vel):
        self.notes.append((beat, dur, int(note), int(max(1, min(127, vel)))))


def midi_file(part, bpm, path, seconds=None):
    m = mido.MidiFile(ticks_per_beat=PPQ)
    t = mido.MidiTrack()
    m.tracks.append(t)
    ch = part.chan
    ev = [(0, mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(bpm)))]
    if ch != 9:  # the drum channel takes its kit from the program alone
        ev += [(0, mido.Message('control_change', channel=ch, control=0, value=part.bank))]
    ev += [(0, mido.Message('program_change', channel=ch, program=part.prog)),
           (0, mido.Message('control_change', channel=ch, control=10, value=part.pan)),
           (0, mido.Message('control_change', channel=ch, control=7, value=110)),
           (0, mido.Message('control_change', channel=ch, control=11, value=127))]
    spb = 60 / bpm
    for (b, d, n, v) in part.notes:
        j = rng.gauss(0, part.jitter) / spb * PPQ
        on = max(0, int(round(b * PPQ + j)))
        off = max(on + 10, int(round((b + d * part.legato) * PPQ + j)))
        v = v + rng.randint(-5, 5)
        ev.append((on, mido.Message('note_on', channel=ch, note=n, velocity=int(max(1, min(127, v))))))
        ev.append((off, mido.Message('note_off', channel=ch, note=n, velocity=0)))
        if part.vib and d >= 1.0:
            # Vibrato blooms into long notes, as a player would.
            for k in range(6):
                tt = on + int((0.35 + 0.1 * k) * d * PPQ)
                ev.append((tt, mido.Message('control_change', channel=ch, control=1, value=min(60, 12 * k))))
            ev.append((off, mido.Message('control_change', channel=ch, control=1, value=0)))
    for (b, d, a, z) in (part.swell or []):
        # CC11 ramps: (beat, dur, from, to)
        steps = 24
        for k in range(steps + 1):
            tt = int((b + d * k / steps) * PPQ)
            ev.append((tt, mido.Message('control_change', channel=ch, control=11, value=int(a + (z - a) * k / steps))))
    if seconds:
        # fluidsynth stops at the last event: a harmless controller at the very end keeps every release tail
        ev.append((int(seconds / spb * PPQ), mido.Message('control_change', channel=ch, control=110, value=0)))
    ev.sort(key=lambda e: (e[0], 0 if e[1].type == 'note_off' else 1))
    last = 0
    for tt, msg in ev:
        t.append(msg.copy(time=tt - last))
        last = tt
    m.save(path)


def render_part(part, bpm, seconds):
    with tempfile.TemporaryDirectory() as td:
        mid = os.path.join(td, 'p.mid')
        wav = os.path.join(td, 'p.wav')
        midi_file(part, bpm, mid, seconds)
        subprocess.run(['fluidsynth', '-ni', '-g', '0.5', '-R', '0', '-C', '0', '-r', str(SR), '-F', wav, SF2, mid],
                       check=True, capture_output=True)
        x, sr = sf.read(wav, dtype='float32', always_2d=True)
    n = int(seconds * SR)
    out = np.zeros((n, 2), np.float32)
    k = min(n, len(x))
    out[:k] = x[:k] * part.gain
    return out


# ------------------------------------------------------------------ recorded percussion
def load_slices(name):
    man = json.load(open(os.path.join(AUD, 'manifest.json')))['sounds'][name]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(AUD, man['webm']['file']), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    out = []
    for s, d, pk in man['slices']:
        a = int(max(0, (s - 0.06) * SR))
        seg = x[a:int((s + 0.08) * SR)]
        on = np.argmax(np.abs(seg) >= pk * 0.05) if len(seg) else 0
        st = a + on - int(0.003 * SR)
        out.append(x[max(0, st):max(0, st) + int(d * SR)].copy())
    return out


DR = {n: load_slices(n) for n in ['m_taiko', 'm_taiko_hi', 'm_djembe_bass', 'm_djembe_tone', 'm_djembe_slap', 'm_frame', 'm_shaker', 'm_pulse', 'm_boom']}
IR = None


def ir():
    global IR
    if IR is None:
        man = json.load(open(os.path.join(AUD, 'manifest.json')))['sounds']['ir_room']
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(AUD, man['webm']['file']), '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                             capture_output=True, check=True).stdout
        x = np.frombuffer(raw, np.float32).reshape(-1, 2)
        s, d, _ = man['slices'][0]
        y = x[int(s * SR):int((s + d) * SR)].copy()
        y /= np.sqrt(np.sum(y ** 2) / 2) + 1e-9
        IR = y * 0.5
    return IR


class Drums:
    """recorded one-shots on a grid: hits (beat, inst, vel, pan, variant|None)"""

    def __init__(self, gain=1.0, wet=0.12):
        self.hits, self.gain, self.wet = [], gain, wet

    def add(self, beat, inst, vel, pan=0.0, var=None):
        self.hits.append((beat, inst, vel, pan, var))

    def render(self, bpm, seconds):
        n = int(seconds * SR)
        out = np.zeros((n, 2), np.float32)
        spb = 60 / bpm
        last = {}
        for b, inst, vel, pan, var in self.hits:
            vs = DR[inst]
            if var is None:
                choices = [i for i in range(len(vs)) if i != last.get(inst)] or [0]
                var = rng.choice(choices)
            last[inst] = var
            x = vs[var]
            loose = 0.008 if inst in ('m_taiko', 'm_boom') else 0.004 if inst == 'm_shaker' else 0.006
            t = b * spb + rng.gauss(0, loose / 2)
            a = int(max(0, t) * SR)
            g = vel * (0.9 + 0.2 * rng.random()) * self.gain
            # resample for +-30 cents of pitch variety
            r = 2 ** (rng.uniform(-30, 30) / 1200)
            idx = np.arange(0, len(x) - 1, r)
            y = np.interp(idx, np.arange(len(x)), x).astype(np.float32) * g
            k = min(len(y), n - a)
            if k <= 0:
                continue
            lp, rp = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            out[a:a + k, 0] += y[:k] * lp
            out[a:a + k, 1] += y[:k] * rp
        return out


def mixdown(parts, bpm, seconds):
    """dry sum and reverb send of a set of parts / drum grids"""
    dry = np.zeros((int(seconds * SR), 2), np.float32)
    send = np.zeros_like(dry)
    for p in parts:
        x = p.render(bpm, seconds) if isinstance(p, Drums) else render_part(p, bpm, seconds)
        dry += x
        send += x * p.wet
    return dry, send


def with_room(dry, send, wrap):
    """add the recorded church; with `wrap` the reverb tail folds onto the start (seamless loops)"""
    h = ir()
    wet = np.stack([fftconvolve(send[:, c], h[:, c]) for c in range(2)], axis=1).astype(np.float32)
    out = dry.copy()
    n = len(out)
    out += wet[:n]
    if wrap:
        tail = wet[n:]
        while len(tail):
            k = min(n, len(tail))
            out[:k] += tail[:k]
            tail = tail[k:]
    return out


# ------------------------------------------------------------------ arrangement
def bar_len(bpm):
    return 4 * 60 / bpm


def arrange_run(sections, key=0, tier4=False, cycles=2):
    """the run layers for a sequence of sections (e.g. ['A','B']), repeated `cycles` times.
    Returns {layer: [Part|Drums]}; layer 0 ostinato + light drums + kalimba hint, 1 bass + melody,
    2 strings + denser drums, 3 brass + counter-melody (+ choir, cymbals at tier 4)."""
    L = {i: [] for i in range(4)}
    mar = Part(12, pan=44, gain=0.55, wet=0.15, legato=0.9)
    kal = Part(108, pan=86, gain=0.5, wet=0.25)
    d0 = Drums(gain=0.55, wet=0.1)
    flute = Part(75, pan=64, gain=0.9, wet=0.3, vib=True, legato=0.96, jitter=0.008)
    bass = Part(33, pan=64, gain=0.85, wet=0.03, legato=0.8)
    sub = Part(80, bank=8, pan=64, gain=0.25, wet=0.0, legato=0.95)
    pad = Part(49, bank=17, pan=64, gain=0.5, wet=0.35, legato=1.0, swell=[])
    pizz = Part(45, pan=86, gain=0.55, wet=0.25)
    stac = Part(48, pan=40, gain=0.35, wet=0.2, legato=0.45)
    d2 = Drums(gain=0.6, wet=0.14)
    brass = Part(61, pan=52, gain=0.55, wet=0.25, legato=0.85)
    horns = Part(60, pan=80, gain=0.6, wet=0.3, legato=1.0)
    timp = Part(47, pan=64, gain=0.7, wet=0.25)
    d3 = Drums(gain=0.65, wet=0.16)
    choir = Part(52, pan=64, gain=0.55, wet=0.4, legato=1.0)
    cym = Part(48, bank=128, chan=9, pan=64, gain=0.35, wet=0.3)
    seq = sections * cycles
    prev_h = 64
    for si, sec in enumerate(seq):
        for bi, ch in enumerate(PROG[sec]):
            B = (si * 8 + bi) * 4
            ts = tones(ch, key)
            root = ts[0]
            # ostinato: marimba eighths through the chord
            third = ts[1] - root
            base = min(near([root], 55, 66))
            for k, off in enumerate([0, 7, 12, 7, third + 12, 7, 12, 7]):
                mar.add(B + k * 0.5, 0.5, base + off, 92 if k % 4 == 0 else 74 if k % 2 == 0 else 64)
            # the hint: the hook's opening on kalimba (bars 1 and 5 of each section)
            if bi in (0, 4):
                for (b, d, n) in MEL[sec][bi]:
                    kal.add(B + b, d, n + key - 12, 70)
            # light drums: pulse on 1 and the and-of-3, frame drum on 2 and 4, soft shaker eighths
            d0.add(B, 'm_pulse', 0.9)
            d0.add(B + 2.5, 'm_pulse', 0.45)
            d0.add(B + 1, 'm_frame', 0.6, -0.2)
            d0.add(B + 3, 'm_frame', 0.65, -0.2)
            if rng.random() < 0.3:
                d0.add(B + 3.75, 'm_frame', 0.25, -0.2)
            for k in range(8):
                d0.add(B + k * 0.5, 'm_shaker', 0.32 if k % 2 == 0 else 0.22, 0.35)
            # melody (pan flute) and bass
            for (b, d, n) in MEL[sec][bi]:
                flute.add(B + b, d, n + key, 96 if b == 0 else 86)
            br = min(near([root], 38, 49))
            for (b, o, v) in [(0, 0, 100), (1, 0, 80), (1.5, 12, 84), (2, 0, 92), (3, 7, 82), (3.5, 12, 86)]:
                bass.add(B + b, 0.45, br + o, v)
            sub.add(B, 1.9, br - 12, 70)
            sub.add(B + 2, 1.9, br - 12, 64)
            # strings: a pad that swells through the bar, pizzicato offbeats, staccato drive
            voic = sorted(near(ts, 57, 76))[:3] if bi % 2 == 0 else sorted(near(ts, 60, 79))[:3]
            for n in voic:
                pad.add(B, 4, n, 72)
            pad.swell.append((B, 4, 70, 110))
            ps = near(ts, 62, 79)
            for k, b in enumerate([0.5, 1.5, 2.5, 3.5]):
                pizz.add(B + b, 0.25, ps[(k * 2 + bi) % len(ps)], 84)
            sr_ = min(near([root], 50, 61))
            for k in range(16):
                if k % 4 == 3 and rng.random() < 0.5:
                    continue
                stac.add(B + k * 0.25, 0.25, sr_ + (7 if k % 4 == 2 else 0), 88 if k % 4 == 0 else 66)
            # denser drums: djembe pattern, taiko on 1 and 3
            pat = rng.choice([[(0, 'm_djembe_bass', .9), (.75, 'm_djembe_tone', .55), (1.5, 'm_djembe_tone', .7), (2.5, 'm_djembe_slap', .75), (3, 'm_djembe_tone', .6), (3.5, 'm_djembe_tone', .5)],
                              [(0, 'm_djembe_bass', .9), (.5, 'm_djembe_tone', .55), (1.5, 'm_djembe_slap', .7), (2, 'm_djembe_bass', .7), (2.75, 'm_djembe_tone', .6), (3.5, 'm_djembe_slap', .7)]])
            for b, i, v in pat:
                d2.add(B + b, i, v, 0.25)
            d2.add(B, 'm_taiko', 1.0, 0, 0)
            d2.add(B + 2, 'm_taiko', 0.75, 0, rng.choice([1, 2]))
            if bi == 7:
                for k, b in enumerate([2, 2.5, 3, 3.25, 3.5, 3.75]):
                    d2.add(B + b, 'm_taiko_hi', 0.5 + 0.08 * k, -0.15)
            # brass stabs and the horn counter-line
            vb = sorted(near(ts, 55, 67))[:3]
            for (b, d, v) in [(0, .5, 104), (1.5, .4, 88), (3, .5, 94)]:
                for n in vb:
                    brass.add(B + b, d, n, v)
            cands = near(ts[1:], 57, 72)
            h1 = min(cands, key=lambda n: abs(n - prev_h))
            h2 = min([c for c in cands if c != h1] or [h1], key=lambda n: abs(n - h1))
            horns.add(B, 2, h1, 86)
            horns.add(B + 2, 2, h2, 80)
            prev_h = h2
            d3.add(B + 1.5, 'm_taiko', 0.65, 0.1, rng.choice([1, 2]))
            d3.add(B + 2.75, 'm_taiko', 0.55, -0.1, rng.choice([1, 2]))
            d3.add(B + 3, 'm_taiko_hi', 0.5, 0.2)
            d3.add(B + 3.5, 'm_taiko_hi', 0.45, -0.2)
            if bi in (0, 4):
                tr = min(near([root], 45, 55))
                timp.add(B, 1, tr, 110)
            if bi == 7:
                for k in range(8):
                    timp.add(B + 2 + k * 0.25, 0.25, min(near([ts[0]], 45, 55)), 60 + 7 * k)
            if bi == 0:
                d3.add(B, 'm_boom', 0.5, 0, 0)
            if tier4:
                for n in sorted(near(ts, 60, 76))[:3]:
                    choir.add(B, 4, n, 82)
                if bi in (0, 4):
                    cym.add(B, 2, 49 if bi == 0 else 57, 96)
                d3.add(B + 0.5, 'm_taiko', 0.45, 0.1, rng.choice([1, 2]))
    L[0] = [mar, kal, d0]
    L[1] = [flute, bass, sub]
    L[2] = [pad, pizz, stac, d2]
    L[3] = [brass, horns, timp, d3] + ([choir, cym] if tier4 else [])
    return L


def render_loop(layers, bpm, bars_per_cycle, cycles):
    """render each layer for `cycles` cycles; keep the last cycle with wrapped reverb"""
    total = bars_per_cycle * cycles * bar_len(bpm)
    cyc = bars_per_cycle * bar_len(bpm)
    n = int(round(cyc * SR))
    out = {}
    for k, parts in layers.items():
        dry, send = mixdown(parts, bpm, total + 0.01)
        full = with_room(dry, send, wrap=False)
        start = int(round((cycles - 1) * cyc * SR))
        seg = full[start:start + n].copy()
        # the previous cycle's tail is already in `seg`; add this cycle's spill past its end to its start
        spill = full[start + n:]
        if len(spill):
            k2 = min(n, len(spill))
            seg[:k2] += spill[:k2]
        out[k] = seg
    return out


def render_once(parts, bpm, seconds):
    dry, send = mixdown(parts, bpm, seconds)
    return with_room(dry, send, wrap=False)[:int(seconds * SR)]


# ------------------------------------------------------------------ the pieces
BPM_RUN, BPM_TOP, BPM_CALM = 112, 120, 84


def run_stems():
    """layers 0-3 for segments A and B (8 bars each at 112 BPM), cut out of a continuous A B A B render so
    each segment begins with the other's tail"""
    layers = arrange_run(['A', 'B'], cycles=2)
    full = render_loop(layers, BPM_RUN, 16, 2)
    n8 = int(round(8 * bar_len(BPM_RUN) * SR))
    res = {}
    for k, x in full.items():
        res[f'th_l{k}_a'] = x[:n8]
        res[f'th_l{k}_b'] = x[n8:2 * n8]
    return res


def top_loop():
    """tier 4: the A section a whole tone up (E minor), faster, everything plus choir and cymbals; one stem"""
    layers = arrange_run(['A'], key=2, tier4=True, cycles=2)
    parts = [p for k in range(4) for p in layers[k]]
    full = render_loop({0: parts}, BPM_TOP, 8, 2)
    return full[0]


def calm_loop():
    """title / setup / safe: the tune slowly on ocarina over kalimba, harp and a soft string pad"""
    oc = Part(79, pan=60, gain=0.7, wet=0.35, vib=True, legato=0.98, jitter=0.01)
    kal = Part(108, pan=84, gain=0.55, wet=0.3)
    harp = Part(46, pan=44, gain=0.6, wet=0.3)
    pad = Part(49, bank=17, pan=64, gain=0.35, wet=0.4, swell=[])
    d = Drums(gain=0.35, wet=0.25)
    for c in range(2):
        for bi, ch in enumerate(PROG['A']):
            B = (c * 8 + bi) * 4
            ts = tones(ch)
            if bi < 4 or c == 0:
                for (b, du, n) in MEL['A'][bi]:
                    oc.add(B + b, du, n, 74 if b == 0 else 64)
            for k, n in enumerate(sorted(near(ts, 62, 76))[:4] * 2):
                kal.add(B + k * 0.5, 0.5, n, 58 if k % 2 else 66)
            harp.add(B, 2, min(near([ts[0]], 38, 50)), 80)
            harp.add(B + 2, 2, min(near([ts[2]], 43, 55)), 66)
            for n in sorted(near(ts, 57, 72))[:3]:
                pad.add(B, 4, n, 60)
            pad.swell.append((B, 4, 60, 96))
            if bi % 2 == 0:
                d.add(B, 'm_frame', 0.5, -0.3)
    return render_loop({0: [oc, kal, harp, pad, d]}, BPM_CALM, 8, 2)[0]


def tense_loop():
    """after a fall: a low tremolo pedal, a soft heartbeat, a shakuhachi breath now and then (4 bars)"""
    trem = Part(44, pan=64, gain=0.55, wet=0.35, swell=[])
    shak = Part(77, pan=70, gain=0.45, wet=0.45, vib=True)
    timp = Part(47, pan=64, gain=0.5, wet=0.3)
    d = Drums(gain=0.5, wet=0.2)
    for c in range(2):
        for bi in range(4):
            B = (c * 4 + bi) * 4
            for n in (38, 45, 50):
                trem.add(B, 4, n, 62)
            trem.swell.append((B, 2, 50, 90))
            trem.swell.append((B + 2, 2, 90, 50))
            d.add(B, 'm_pulse', 0.6)
            d.add(B + 0.75, 'm_pulse', 0.35)
            if bi == 1:
                shak.add(B + 2, 1.5, 69, 70)
                shak.add(B + 3.5, 1.5, 70, 64)
            if bi == 3:
                timp.add(B + 3, 1, 45, 70)
    return render_loop({0: [trem, shak, timp, d]}, BPM_CALM, 4, 2)[0]


def fanfare(size):
    """the escape: the hook's head in D major, bigger with the cash-out tier (0 small, 1 medium, 2 big)"""
    bpm = BPM_RUN
    flute = Part(75, gain=0.9, wet=0.3, vib=True)
    pizz = Part(45, pan=84, gain=0.5, wet=0.25)
    mar = Part(12, pan=44, gain=0.5, wet=0.2)
    pad = Part(49, bank=17, gain=0.5, wet=0.4, swell=[(0, 6, 80, 120)])
    brass = Part(61, pan=52, gain=0.6, wet=0.3)
    horns = Part(60, pan=80, gain=0.55, wet=0.35)
    timp = Part(47, gain=0.7, wet=0.3)
    choir = Part(52, gain=0.55, wet=0.45)
    cym = Part(48, bank=128, chan=9, gain=0.35, wet=0.35)
    kal = Part(108, pan=86, gain=0.5, wet=0.35)
    d = Drums(gain=0.7, wet=0.18)
    parts = [flute, pizz, mar, pad, kal, d]
    if size == 0:
        # A D F# A, held, over D major
        for (b, du, n) in [(0, .5, 69), (.5, .5, 74), (1, .5, 78), (1.5, 2.5, 81)]:
            flute.add(b, du, n, 96)
        for n in (62, 66, 69):
            pad.add(0, 4, n, 70)
        for k, n in enumerate([74, 78, 81, 86]):
            kal.add(1.5 + k * 0.25, 0.5, n, 70)
        for b in (0, 1.5):
            pizz.add(b, .3, 62, 90)
        d.add(0, 'm_taiko', 0.8, 0, 0)
        return render_once(parts, bpm, 4.0)
    # medium and big: the "VI - VII - I" lift (Bb, C, D) under the hook
    parts += [brass, horns, timp]
    hits = [(0, 'Bb'), (0.75, 'C'), (1.5, 'D')] if size == 1 else [(0, 'Bb'), (1, 'C'), (2, 'D')]
    end = hits[-1][0]
    for b, ch in hits:
        dur = 0.6 if ch != 'D' else 3.5
        r = {'Bb': 58, 'C': 60, 'D': 62}[ch]
        q = 4
        for n in (r, r + q, r + 7, r + 12):
            brass.add(b, dur, n, 108 if ch == 'D' else 98)
        timp.add(b, 0.5, {'Bb': 46, 'C': 48, 'D': 50}[ch], 112)
        d.add(b, 'm_taiko', 0.9 if ch == 'D' else 0.7, 0, 0 if ch == 'D' else rng.choice([1, 2]))
    for (b, du, n) in [(end - 1.5, .5, 69), (end - 1, .5, 74), (end - .5, .5, 78), (end, 3.5, 81)]:
        if b >= 0:
            flute.add(b, du, n + (12 if size == 2 else 0), 100)
    for n in (62, 66, 69, 74):
        pad.add(0, end + 3.5, n, 76)
    horns.add(end, 3.5, 66, 92)
    horns.add(end, 3.5, 69, 88)
    for k, n in enumerate([74, 78, 81, 86, 90]):
        kal.add(end + k * 0.2, 0.5, n, 74)
    if size == 2:
        parts += [choir, cym]
        for n in (62, 66, 69, 74):
            choir.add(end, 3.5, n, 92)
        cym.add(end, 3, 49, 110)
        for k in range(8):
            timp.add(end - 1 + k * 0.125, 0.125, 50, 60 + k * 7)
        d.add(end, 'm_boom', 0.6, 0, 0)
    return render_once(parts, bpm, (end + 3.5) * 60 / bpm + 2.2)


def loss_sting():
    """a fall: low brass falling D C Bb A, then a low D with timpani and tremolo strings (D minor)"""
    bpm = 100
    bone = Part(57, pan=54, gain=0.7, wet=0.3, legato=1.0)
    tuba = Part(58, pan=70, gain=0.7, wet=0.25, legato=1.0)
    trem = Part(44, gain=0.5, wet=0.35, swell=[(2.4, 4, 110, 40)])
    timp = Part(47, gain=0.8, wet=0.3)
    choir = Part(53, gain=0.35, wet=0.5)
    d = Drums(gain=0.8, wet=0.2)
    for k, n in enumerate([62, 60, 58, 57]):
        bone.add(k * 0.6, 0.62, n, 100 - k * 4)
        tuba.add(k * 0.6, 0.62, n - 12, 96 - k * 4)
    bone.add(2.4, 3.2, 50, 104)
    bone.add(2.4, 3.2, 53, 96)
    tuba.add(2.4, 3.2, 38, 108)
    for n in (38, 45, 50, 53):
        trem.add(2.4, 3.6, n, 84)
    for k in range(6):
        timp.add(1.65 + k * 0.125, 0.125, 45, 58 + k * 8)
    timp.add(2.4, 1.5, 38, 120)
    choir.add(2.4, 3.2, 62, 70)
    choir.add(2.4, 3.2, 65, 66)
    d.add(2.4, 'm_boom', 0.8, 0, 0)
    d.add(2.4, 'm_taiko', 1.0, 0, 0)
    return render_once([bone, tuba, trem, timp, choir, d], bpm, 6 * 60 / bpm + 2.5)


def fill():
    """one bar before a new tier: a taiko roll, a string swell on the dominant, a cymbal on the next downbeat"""
    bpm = BPM_RUN
    sw = Part(49, bank=17, gain=0.55, wet=0.35, swell=[(0, 4, 30, 127)])
    cym = Part(48, bank=128, chan=9, gain=0.4, wet=0.35)
    d = Drums(gain=0.75, wet=0.18)
    for n in (57, 61, 64, 69):
        sw.add(0, 4.2, n, 90)
    cym.add(4, 2, 49, 104)
    d.add(0, 'm_taiko', 0.8, 0, 0)
    for k in range(8):
        d.add(2 + k * 0.25, 'm_taiko_hi', 0.35 + 0.08 * k, (-1) ** k * 0.2)
    d.add(4, 'm_taiko', 1.0, 0, 0)
    return render_once([sw, cym, d], bpm, 4 * 60 / bpm + 2.4)


# ------------------------------------------------------------------ output
def lufs_m(x):
    """momentary-max-ish loudness proxy (dB RMS of the loudest 400 ms)"""
    m = x.mean(axis=1)
    w = int(0.4 * SR)
    best = 0
    for i in range(0, max(1, len(m) - w), w // 4):
        best = max(best, float(np.mean(m[i:i + w] ** 2)))
    return 10 * np.log10(best + 1e-12)


def encode(name, x, loop, extra, kbps):
    wav = os.path.join(CACHE, f'{name}.wav')
    sf.write(wav, np.clip(x, -1, 1), SR, subtype='PCM_16')
    files = {}
    for fmt, args in [('webm', ['-c:a', 'libopus', '-b:a', f'{kbps}k', '-vbr', 'on', '-application', 'audio']),
                      ('m4a', ['-c:a', 'aac', '-b:a', f'{int(kbps * 1.5)}k', '-movflags', '+faststart'])]:
        f = f'{name}.{fmt}'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, *args, '-map_metadata', '-1', os.path.join(AUD, f)], check=True)
        b = open(os.path.join(AUD, f), 'rb').read()
        files[fmt] = {'file': f, 'bytes': len(b), 'hash': hashlib.sha256(b).hexdigest()[:10]}
    d = len(x) / SR
    ent = {'group': 'theme', 'channels': 2, 'slices': [[0, round(d, 5), round(float(np.abs(x).max()), 4)]], **({'loop': True} if loop else {}), **extra,
           'webm': files['webm'], 'm4a': files['m4a']}
    return ent


def main():
    out = {}
    print('run stems ...', flush=True)
    stems = run_stems()
    print('tier 4 ...', flush=True)
    top = top_loop()
    print('calm, tense ...', flush=True)
    calm, tense = calm_loop(), tense_loop()
    print('stingers ...', flush=True)
    fan = [fanfare(i) for i in range(3)]
    loss = loss_sting()
    fl = fill()
    # One gain for everything, so layers sum to the full mix and every piece sits in one balance: the full
    # tier-3 mix (all four layers) and the tier-4 loop peak at -1 dBFS.
    full = [sum(stems[f'th_l{k}_{s}'] for k in range(4)) for s in 'ab']
    pk = max(float(np.abs(x).max()) for x in full + [top])
    g = 0.89 / pk
    # Loudness matching between the pieces that replace one another (the run at tier 3, tier 4, calm, tense).
    ref = lufs_m(full[0] * g)
    print(f'gain {20 * np.log10(g):.1f} dB; tier-3 mix loudness {ref:.1f} dB RMS(400 ms)')

    def fit(x, target_rel=0.0):
        y = x * g
        lv = lufs_m(y)
        y = y * 10 ** ((ref + target_rel - lv) / 20)
        p = float(np.abs(y).max())
        return y * (0.89 / p) if p > 0.89 else y

    bar_run, bar_top, bar_calm = bar_len(BPM_RUN), bar_len(BPM_TOP), bar_len(BPM_CALM)
    for name, x in stems.items():
        out[name] = encode(name, x * g, True, {'bpm': BPM_RUN, 'bars': 8}, 80)
    out['th_top'] = encode('th_top', fit(top, 1.0), True, {'bpm': BPM_TOP, 'bars': 8}, 96)
    out['th_calm'] = encode('th_calm', fit(calm, -6.0), True, {'bpm': BPM_CALM, 'bars': 8}, 72)
    out['th_tense'] = encode('th_tense', fit(tense, -9.0), True, {'bpm': BPM_CALM, 'bars': 4}, 64)
    for i, x in enumerate(fan):
        out[f'th_win{i}'] = encode(f'th_win{i}', fit(x, -1.0 + 1.0 * i), False, {}, 96)
    out['th_lose'] = encode('th_lose', fit(loss, -1.0), False, {}, 96)
    out['th_fill'] = encode('th_fill', fit(fl, -4.0), False, {'bpm': BPM_RUN}, 80)
    mp = os.path.join(AUD, 'manifest.json')
    man = json.load(open(mp))
    for k in [k for k, v in man['sounds'].items() if v.get('group') == 'theme']:
        del man['sounds'][k]
    man['sounds'].update(out)
    json.dump(man, open(mp, 'w'), indent=1)
    open(mp, 'a').write('\n')
    tot = sum(v['webm']['bytes'] for v in out.values())
    tota = sum(v['m4a']['bytes'] for v in out.values())
    for k, v in out.items():
        print(f"{k:12} {v['slices'][0][1]:6.2f} s  {v['webm']['bytes'] / 1024:5.0f} KB opus  {v['m4a']['bytes'] / 1024:5.0f} KB aac")
    print(f'theme: {tot / 1024:.0f} KB opus, {tota / 1024:.0f} KB aac (budget 3 MB)')
    print(f'run bar {bar_run:.4f} s, top bar {bar_top:.4f} s, calm bar {bar_calm:.4f} s')
    if tot > 3e6:
        sys.exit('theme over budget')


if __name__ == '__main__':
    main()
