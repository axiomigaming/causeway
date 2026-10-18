import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUNDS } from '../src/audio/catalog';
import { MANIFEST, SampleBank, SamplePlayer, pickFormat, snapSlices, type Loaded } from '../src/audio/samples';
import { BPM, barHits, humanise, idleHits, layersFor } from '../src/audio/score';
import { bedMix, findOnset, mulberry32, pickVariant, resolveSfx, strengthCutoff, strengthGain, surfaceFor, voiceCap, voiceSlot, type VoiceInfo } from '../src/audio/select';

describe('variant selection', () => {
  it('never plays the same variant twice in a row, and reaches every variant', () => {
    const rnd = mulberry32(7);
    for (const n of [2, 3, 6]) {
      let last = -1;
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) {
        const v = pickVariant(n, last, rnd);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
        expect(v).not.toBe(last);
        seen.add(v);
        last = v;
      }
      expect(seen.size).toBe(n);
    }
  });

  it('handles one variant and bad history', () => {
    const rnd = mulberry32(1);
    expect(pickVariant(1, 0, rnd)).toBe(0);
    expect(pickVariant(0, -1, rnd)).toBe(0);
    expect(pickVariant(4, 99, rnd)).toBeLessThan(4);
  });

  it('strength maps to level and brightness monotonically, clamped, never NaN', () => {
    expect(strengthGain(1)).toBeCloseTo(1);
    expect(strengthGain(0, -18)).toBeCloseTo(Math.pow(10, -18 / 20));
    expect(strengthGain(0.3)).toBeLessThan(strengthGain(0.6));
    expect(strengthGain(NaN)).toBeGreaterThan(0);
    expect(strengthGain(9)).toBeCloseTo(1);
    expect(strengthCutoff(0)).toBeCloseTo(1200);
    expect(strengthCutoff(1)).toBeCloseTo(16000);
    expect(strengthCutoff(0.5)).toBeLessThan(strengthCutoff(0.8));
  });
});

describe('voice stealing', () => {
  const v = (sound: string, priority: number, started: number, ends: number): VoiceInfo => ({ sound, priority, started, ends });

  it('uses a free slot while there is room', () => {
    expect(voiceSlot([v('impact', 2, 0, 1)], 4, 'impact', 4, 2)).toBe('free');
  });

  it('renews a sound over its own cap from its oldest voice (a burst of debris does not pile up)', () => {
    const pool = [v('debris', 0, 0.2, 2), v('debris', 0, 0.1, 2), v('slam', 3, 0, 3)];
    expect(voiceSlot(pool, 32, 'debris', 2, 0)).toBe(1);
  });

  it('when full, steals the lowest priority (nearest its end among equals), never a more important voice', () => {
    const pool = [v('slam', 3, 0, 5), v('debris', 0, 0, 3), v('dust', 0, 0, 1), v('impact', 2, 0, 2)];
    expect(voiceSlot(pool, 4, 'impact', 4, 2)).toBe(2);
    expect(voiceSlot([v('slam', 3, 0, 5), v('coins', 3, 0, 5)], 2, 'debris', 4, 0)).toBe('drop');
  });

  it('many impacts at once never exceed the cap', () => {
    const cap = 12;
    let pool: VoiceInfo[] = [];
    const rnd = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const name = ['impact', 'debris', 'dust', 'rockfall'][i % 4]!;
      const pr = SOUNDS[name]!.priority;
      const slot = voiceSlot(pool, cap, name, SOUNDS[name]!.max, pr);
      if (slot === 'drop') continue;
      if (slot !== 'free') pool.splice(slot, 1);
      pool.push(v(name, pr, i * 0.01, i * 0.01 + 0.5 + rnd()));
      pool = pool.filter((x) => x.ends > i * 0.01);
      expect(pool.length).toBeLessThanOrEqual(cap);
      expect(pool.filter((x) => x.sound === name).length).toBeLessThanOrEqual(SOUNDS[name]!.max);
    }
  });

  it('caps voices lower on phones and low-end devices', () => {
    expect(voiceCap({ cores: 2, memoryGb: 2 })).toBeLessThan(voiceCap({ cores: 4, memoryGb: 4, mobile: true }));
    expect(voiceCap({ cores: 4, memoryGb: 4, mobile: true })).toBeLessThan(voiceCap({ cores: 8, memoryGb: 8 }));
  });
});

describe('slices, formats, world mapping', () => {
  it('snaps a slice onto its onset when the codec shifted the file', () => {
    const rate = 48000;
    const d = new Float32Array(rate);
    const shift = 0.044; // AAC priming at 48 kHz
    for (let i = 0; i < 2000; i++) d[Math.round((0.3 + shift) * rate) + i] = 0.5 * Math.exp(-i / 400);
    const [s] = snapSlices(d, rate, [[0.3, 0.2, 0.5]], false);
    expect(s!.start).toBeCloseTo(0.3 + shift - 0.003, 3);
    expect(findOnset(d, 0, 100, 0.1)).toBe(0); // nothing above threshold: unchanged
    expect(snapSlices(d, rate, [[0, 1, 1]], true)[0]).toEqual({ start: 0, dur: 1 });
  });

  it('prefers Opus in WebM, falls back to AAC where WebM Opus is not playable', () => {
    expect(pickFormat(() => 'probably')).toBe('webm');
    expect(pickFormat(() => '')).toBe('m4a');
    expect(
      pickFormat(() => {
        throw new Error('no');
      }),
    ).toBe('m4a');
  });

  it('refines stone into gravel or wet stone by section; wood stays wood', () => {
    const rnd = mulberry32(11);
    const count = (sec: string | null, s: string) => Array.from({ length: 400 }, () => surfaceFor(sec, 'stone', rnd)).filter((x) => x === s).length;
    expect(count('gorge', 'wet')).toBeGreaterThan(200);
    expect(count('ruins', 'gravel')).toBeGreaterThan(150);
    expect(count('corridor', 'stone')).toBeGreaterThan(250);
    expect(surfaceFor('gorge', 'wood', rnd)).toBe('wood');
    expect(bedMix('gorge').waterfall).toBe(1);
    expect(bedMix(null).waterfall).toBe(0);
  });

  it('generic sfx names resolve; unknown names are a no-op', () => {
    expect(resolveSfx('dust', 0.5)).toEqual({ sound: 'dust', strength: 0.5 });
    expect(resolveSfx('splash', 0.9)!.sound).toBe('splash_big');
    expect(resolveSfx('splash', 0.2)!.sound).toBe('splash_small');
    // The FX round's world events (game.ts → sounds.event): tier_up is handled by the score, not here.
    expect(resolveSfx('dust_burst', 1)).toEqual({ sound: 'dust', strength: 1 });
    expect(resolveSfx('stones_skitter', 0)!.sound).toBe('debris');
    expect(resolveSfx('tier_up', 0.5)).toBeNull();
    expect(resolveSfx('no-such-sound', 1)).toBeNull();
    expect(resolveSfx('toString', 1)).toBeNull();
    expect(resolveSfx('debris', NaN)!.strength).toBe(0.5);
    for (const n of ['impact', 'slam', 'grind', 'rumble', 'rockfall', 'crumble', 'debris', 'dust', 'splash', 'whoosh', 'gust', 'coins', 'sparkle']) expect(SOUNDS[resolveSfx(n, 0.7)!.sound]).toBeDefined();
  });
});

// ------------------------------------------------------------------ player with a fake AudioContext

class FakeParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  playbackRate = new FakeParam();
  type = '';
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started: number[] = [];
  stopped = false;
  onended: (() => void) | null = null;
  start(...a: number[]) {
    this.started = a;
  }
  stop() {
    this.stopped = true;
  }
}
function fakeCtx() {
  const sources: FakeSource[] = [];
  const ctx = {
    currentTime: 0,
    createBufferSource: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    createGain: () => new FakeNode(),
    createBiquadFilter: () => new FakeNode(),
    createStereoPanner: () => new FakeNode(),
  };
  return { ctx: ctx as unknown as BaseAudioContext, sources, raw: ctx };
}
const loaded = (n: number): Loaded => ({ buffer: { duration: 10 } as AudioBuffer, slices: Array.from({ length: n }, (_, i) => ({ start: i, dur: 0.5 })), loop: false });

describe('sample player and fallback', () => {
  const buses = () => {
    const b = new FakeNode() as unknown as AudioNode;
    return { sfx: b, foley: b, ui: b, amb: b, music: b, sting: b };
  };

  it('returns null for a sound that is not decoded yet, so the engine plays its procedural voice', () => {
    const { ctx } = fakeCtx();
    const bank = new SampleBank({ version: 1, sounds: {} }, 'audio/', 'webm');
    const p = new SamplePlayer(ctx, bank, buses(), 8);
    expect(p.has('impact')).toBe(false);
    expect(p.play('impact')).toBeNull();
    expect(p.play('not-in-catalog')).toBeNull();
  });

  it('plays a decoded sound with a fresh variant and a varied rate each time', () => {
    const { ctx, sources } = fakeCtx();
    const bank = new SampleBank({ version: 1, sounds: {} }, 'audio/', 'webm');
    bank.put('step_stone', loaded(6));
    const p = new SamplePlayer(ctx, bank, buses(), 8);
    p.rnd = mulberry32(5);
    const offsets: number[] = [];
    for (let i = 0; i < 20; i++) expect(p.play('step_stone', { strength: 0.8 })).not.toBeNull();
    for (const s of sources) offsets.push(s.started[1]!);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).not.toBe(offsets[i - 1]);
    const rates = new Set(sources.map((s) => s.playbackRate.value.toFixed(4)));
    expect(rates.size).toBeGreaterThan(10);
  });

  it('respects the voice cap under a pile-up and drops ornaments before important sounds', () => {
    const { ctx, sources } = fakeCtx();
    const bank = new SampleBank({ version: 1, sounds: {} }, 'audio/', 'webm');
    for (const n of ['impact', 'debris', 'slam']) bank.put(n, loaded(4));
    const p = new SamplePlayer(ctx, bank, buses(), 6);
    for (let i = 0; i < 30; i++) p.play(i % 2 ? 'debris' : 'impact');
    expect(p.active()).toBeLessThanOrEqual(6);
    expect(p.play('slam')).not.toBeNull();
    expect(p.active()).toBeLessThanOrEqual(6);
    expect(sources.filter((s) => s.stopped).length).toBeGreaterThan(0);
  });

  it('loops live outside the pool', () => {
    const { ctx } = fakeCtx();
    const bank = new SampleBank({ version: 1, sounds: {} }, 'audio/', 'webm');
    bank.put('bed_jungle', { ...loaded(1), loop: true });
    const p = new SamplePlayer(ctx, bank, buses(), 2);
    expect(p.play('bed_jungle', { loop: true })).not.toBeNull();
    expect(p.active()).toBe(0);
  });
});

describe('score', () => {
  it('adds a layer per tier and speeds up gently', () => {
    expect(layersFor(0)).toEqual([0]);
    expect(layersFor(1)).toEqual([0, 1]);
    expect(layersFor(2)).toEqual([0, 1, 2]);
    expect(layersFor(4)).toEqual([0, 1, 2, 3]);
    expect(BPM[4] - BPM[0]).toBeLessThanOrEqual(25);
  });

  it('bars vary (no two consecutive bars of a phrase need be identical) and stay on the grid', () => {
    const rnd = mulberry32(9);
    const sig = (b: number) =>
      barHits(2, b, rnd)
        .map((h) => `${h.inst}@${h.step}`)
        .join(',');
    const bars = Array.from({ length: 16 }, (_, b) => sig(b));
    expect(new Set(bars).size).toBeGreaterThan(8);
    for (const h of barHits(4, 3, rnd)) {
      expect(h.step).toBeGreaterThanOrEqual(0);
      expect(h.step).toBeLessThan(16);
      expect(h.vel).toBeGreaterThan(0);
      expect(h.vel).toBeLessThanOrEqual(1);
    }
    expect(idleHits(0, rnd).length).toBeLessThanOrEqual(3);
  });

  it('humanises within a few milliseconds, swinging the off-sixteenths late', () => {
    const rnd = mulberry32(2);
    const six = 60 / 100 / 4;
    for (let i = 0; i < 200; i++) {
      const on = humanise({ inst: 'm_shaker', step: 4, vel: 1, layer: 1 }, six, rnd);
      expect(Math.abs(on)).toBeLessThanOrEqual(0.004);
      const off = humanise({ inst: 'm_frame', step: 5, vel: 1, layer: 0 }, six, rnd);
      expect(off).toBeGreaterThan(0);
      expect(Math.abs(humanise({ inst: 'm_taiko', step: 0, vel: 1, layer: 2 }, six, rnd))).toBeLessThanOrEqual(0.009);
    }
  });
});

describe('shipped audio', () => {
  const dir = join(__dirname, '..', 'public', 'audio');
  const names = Object.keys(MANIFEST.sounds);

  it('every manifest file exists with the recorded size and hash, in both formats', () => {
    for (const n of names) {
      const s = MANIFEST.sounds[n]!;
      for (const f of [s.webm, s.m4a]) {
        const p = join(dir, f.file);
        expect(existsSync(p), f.file).toBe(true);
        const buf = readFileSync(p);
        expect(buf.length).toBe(f.bytes);
        expect(createHash('sha256').update(buf).digest('hex').slice(0, 10)).toBe(f.hash);
      }
      expect(s.slices.length).toBeGreaterThan(0);
    }
  });

  it('every shipped sound has a catalog entry (and so a bus, level and voice limits)', () => {
    for (const n of names) if (n !== 'ir_room') expect(SOUNDS[n], n).toBeDefined();
  });

  it('first load stays within 1.5 MB, the lazy groups within 2.5 MB more', () => {
    const bank = new SampleBank(MANIFEST, 'audio/', 'webm');
    expect(bank.groupBytes('core')).toBeLessThanOrEqual(1.5e6);
    expect(bank.groupBytes('beds') + bank.groupBytes('music')).toBeLessThanOrEqual(2.5e6);
  });

  it('footsteps have at least four variants per surface', () => {
    for (const s of ['step_stone', 'step_wood', 'step_gravel', 'step_wet']) if (MANIFEST.sounds[s]) expect(MANIFEST.sounds[s]!.slices.length, s).toBeGreaterThanOrEqual(4);
  });

  it('credits every recording used', () => {
    if (!names.length) return;
    const credits = readFileSync(join(dir, 'CREDITS.txt'), 'utf8');
    const notices = readFileSync(join(__dirname, '..', 'THIRD_PARTY_NOTICES.md'), 'utf8');
    type Rec = { attribution: string; license: string; source: string; foreign_landing_url: string };
    const sources = JSON.parse(readFileSync(join(__dirname, '..', 'tools', 'audio-sources.json'), 'utf8')) as { sources: { id: string; record: Rec }[]; sounds: Record<string, { variants: { src: string }[] }> };
    const used = new Set(Object.values(sources.sounds).flatMap((s) => s.variants.map((v) => v.src)));
    for (const id of used) {
      const rec = sources.sources.find((s) => s.id === id)!.record;
      expect(['cc0', 'by', 'pdm']).toContain(rec.license);
      expect(['freesound', 'jamendo']).toContain(rec.source);
      expect(credits).toContain(rec.attribution);
      expect(notices).toContain(rec.foreign_landing_url);
    }
  });
});
