import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Kit } from '../src/world/assets';
import { Track } from '../src/world/track';

/**
 * World round 21: no stretch of the run may show empty sides — open water or void to the horizon with
 * nothing near. From the chase camera (5 m behind the runner, 2.5 m up, looking down the way), each
 * side of the frame must hold something with presence (not grass, moss or lily pads) within 40 m:
 * ahead 3–40 m, 3.5–40 m out to that side, inside the camera's horizontal view.
 * The check samples every 4 m of several long runs, at full and at phone density, and fails if more
 * than EMPTY_MAX of the side views are empty.
 */
const EMPTY_MAX = 0.08;
/** The lower side thirds of the chase frame: the near water and banks either side of the way. */
const NEAR_AHEAD = 28;
const NEAR_LAT = 22;
const SMALL = /^(grass_|fern_|moss_|lily_|foam_|scatter_|spill_|vines_|leaf|rubble_|drum_)/;

function kit(): Kit {
  const geo = new Map<string, THREE.BufferGeometry>();
  const matOf = new Map<string, string>();
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const n of ['floor_0', 'floor_1', 'floor_2', 'floor_wide_0', 'floor_narrow_0', 'planks_0', 'planks_1', 'stairs_0', 'floor_medallion_0']) {
    geo.set(n, box);
    matOf.set(n, 'stone');
  }
  const mat = new Map<string, THREE.Material>([['stone', new THREE.MeshBasicMaterial()]]);
  return { geo, mat, matOf } as unknown as Kit;
}

export function emptySides(track: Track, seed: string, length = 1800, step = 4): { empty: number; total: number; worst: string[] } {
  track.reset(seed);
  const f = { pos: new THREE.Vector3(), yaw: 0 };
  const pts: { x: number; z: number; sec: string }[] = [];
  const seen = new Set<unknown>();
  const p = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let empty = 0;
  let total = 0;
  const worst: string[] = [];
  for (let s = 20; s < length; s += step) {
    track.update(s, 0);
    for (const sec of track.sections) {
      if (seen.has(sec)) continue;
      seen.add(sec);
      for (const pl of sec.layout.props) {
        if (SMALL.test(pl.piece)) continue;
        m.copy(sec.root.matrix).multiply(pl.m);
        p.setFromMatrixPosition(m);
        pts.push({ x: p.x, z: p.z, sec: sec.type });
      }
    }
    for (const l of track.landmarks.list) {
      if (seen.has(l)) continue;
      seen.add(l);
      p.setFromMatrixPosition(l.root.matrix);
      pts.push({ x: p.x, z: p.z, sec: 'landmark' });
    }
    track.path.sample(s, f);
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
    const cx = f.pos.x - fx * 5, cz = f.pos.z - fz * 5;
    const here = track.sectionAt(s)?.type ?? '?';
    for (const side of [-1, 1]) {
      total++;
      const ok = pts.some((q) => {
        const dx = q.x - cx, dz = q.z - cz;
        const ahead = dx * fx + dz * fz;
        const lat = (dx * rx + dz * rz) * side;
        return ahead > 3 && ahead < NEAR_AHEAD && lat > 3.5 && lat < NEAR_LAT && lat < ahead * 0.9 + 4;
      });
      if (!ok) {
        empty++;
        if (worst.length < 30) worst.push(`${here}@${s}${side > 0 ? 'R' : 'L'}`);
      }
    }
  }
  return { empty, total, worst };
}

describe('empty sides', () => {
  for (const d of [1, 0.4]) {
    it(`no stretch shows empty water to the horizon at the sides (density ${d})`, async () => {
      const track = new Track(kit());
      await track.prepare({ foliage: d, scenery: d });
      track.viewDistance = d < 1 ? 110 : 165;
      let empty = 0;
      let total = 0;
      const notes: string[] = [];
      for (const seed of ['sides-1', 'sides-2', 'sides-3', 'sides-4', 'sides-5', 'sides-6']) {
        const r = emptySides(track, seed);
        empty += r.empty;
        total += r.total;
        notes.push(`${seed}: ${r.empty}/${r.total} ${r.worst.slice(0, 8).join(' ')}`);
      }
      const frac = empty / total;
      if (process.env.SIDES_REPORT) (await import('node:fs')).appendFileSync(process.env.SIDES_REPORT, `EMPTY d=${d} ${(frac * 100).toFixed(1)}%\n${notes.join('\n')}\n`);
      expect(frac, notes.join('\n')).toBeLessThan(EMPTY_MAX);
    }, 300000);
  }
});
