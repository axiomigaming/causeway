import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Kit } from '../src/world/assets';
import { GEN_SPEED, Track } from '../src/world/track';
import { Rng } from '../src/engine/rng';

/**
 * World round 17: a world is a pure function of its seed. The same seed must lay the same route,
 * section for section and placement for placement, however the frames fall (a loaded device steps the
 * runner in long, uneven jumps), whatever the live multiplier was when each section was built, and on
 * every quality tier (a phone builds less ahead and lays out less scenery; the governor can step down mid-run).
 */
function kit(): Kit {
  const geo = new Map<string, THREE.BufferGeometry>();
  const matOf = new Map<string, string>();
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const n of ['floor_0', 'floor_1', 'floor_2', 'floor_wide_0', 'floor_narrow_0', 'planks_0', 'planks_1', 'stairs_0', 'floor_medallion_0']) {
    geo.set(n, box);
    matOf.set(n, 'stone');
  }
  // Real footprints for the big scenery, so corner clearance takes part.
  const block = new THREE.BoxGeometry(6, 4, 6);
  for (const n of ['temple_0', 'temple_1', 'tower_0', 'tower_1', 'rock_big_0', 'rock_big_1', 'rock_big_2', 'jungle_bank_0', 'jungle_bank_1', 'jungle_bank_2', 'arch_1', 'facade_0', 'facade_1', 'guardian_0', 'guardian_1'])
    geo.set(n, block);
  const mat = new Map<string, THREE.Material>([['stone', new THREE.MeshBasicMaterial()]]);
  return { geo, mat, matOf } as unknown as Kit;
}

/** Drive a world to `end` m with the given frame steps and live intensities; record every section and landmark as it appears. */
function lay(track: Track, seed: string, steps: () => number, live: () => number, end = 2400): { secs: string[]; marks: string[] } {
  track.reset(seed);
  const out: string[] = [];
  const marks: string[] = [];
  let seen = -1;
  const lm = new Set<string>();
  const m = new THREE.Matrix4();
  for (let s = 0; s < end; s += steps()) {
    track.update(s, live());
    for (const sec of track.sections) {
      if (sec.s0 <= seen) continue;
      seen = sec.s0;
      m.copy(sec.root.matrix);
      const e = m.elements.map((x) => x.toFixed(3)).join(',');
      out.push(`${sec.type} s0=${sec.s0.toFixed(3)} len=${sec.len} mirror=${sec.mirror} variant=${sec.variant.key} m=${e}`);
    }
    for (const l of track.landmarks.list) {
      const k = `${l.kind}@${l.s.toFixed(3)} ${l.root.matrix.elements.map((x) => x.toFixed(3)).join(',')}`;
      if (!lm.has(k)) (lm.add(k), marks.push(`landmark ${k}`));
    }
  }
  // (Landmarks apart: one may be recorded in the update before or after its corner's next section.)
  return { secs: out, marks };
}

describe('world generation', () => {
  it('is a pure function of the seed: frame timing, the live multiplier and the tier change nothing', async () => {
    const high = new Track(kit());
    await high.prepare({ foliage: 1, scenery: 1 });
    high.viewDistance = 165;
    const low = new Track(kit());
    await low.prepare({ foliage: 0.45, scenery: 0.4 });
    low.viewDistance = 95;
    for (const seed of ['det-1', 'det-2', 'det-3']) {
      // A smooth 60 fps run (0.1–0.2 m a frame) with the intensity climbing as it should...
      const r1 = new Rng(`frames/${seed}`);
      let i1 = 0;
      const a = lay(high, seed, () => r1.range(0.1, 0.2) * 1, () => (i1 = Math.min(1, i1 + 0.00005)));
      // ...a loaded device: long, uneven jumps and a jittering multiplier...
      const r2 = new Rng(`jank/${seed}`);
      const b = lay(high, seed, () => r2.range(0.5, 45), () => r2.range(0, 1));
      // ...and a phone (less ahead, less scenery), also janky.
      const r3 = new Rng(`phone/${seed}`);
      const c = lay(low, seed, () => r3.range(0.2, 30), () => r3.range(0, 1));
      expect(a.secs.length).toBeGreaterThan(60);
      expect(a.marks.length).toBeGreaterThanOrEqual(2); // (a style stages two landmarks)
      for (const k of ['secs', 'marks'] as const) {
        const n = Math.min(a[k].length, b[k].length, c[k].length);
        expect(n).toBeGreaterThanOrEqual(k === 'secs' ? 60 : 2);
        expect(b[k].slice(0, n)).toEqual(a[k].slice(0, n));
        expect(c[k].slice(0, n)).toEqual(a[k].slice(0, n));
      }
    }
  }, 300000);

  it('lays the same world for a seed whatever world was built before it (title, other rounds)', async () => {
    const t = new Track(kit());
    await t.prepare({ foliage: 1, scenery: 1 });
    const fresh = lay(t, '7-0.5', () => 25, () => 0);
    const plan = { theme: t.theme, look: t.look.name, style: t.style.name };
    for (const before of ['title-1', 'other-2', '7-0.5~']) {
      lay(t, before, () => 25, () => 0, 600);
      const again = lay(t, '7-0.5', () => 25, () => 0);
      expect({ theme: t.theme, look: t.look.name, style: t.style.name }).toEqual(plan);
      expect(again).toEqual(fresh);
    }
  }, 300000);

  it("keeps the nominal run's speed the game's speedOf", async () => {
    const { speedOf } = await import('../src/render/game');
    for (let i = 0; i <= 1; i += 0.05) expect(GEN_SPEED(i)).toBeCloseTo(speedOf(i), 9);
    // Importing the whole renderer module is slow under machine load; the check itself is instant.
  }, 60_000);
});
