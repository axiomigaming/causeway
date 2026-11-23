import * as THREE from 'three';
import { beforeAll, expect, it } from 'vitest';
import { Landmarks } from '../src/world/landmarks';
import { STYLES, type LandmarkKind } from '../src/world/style';
import { WATER_Y } from '../src/world/water';
import { FOLIAGE, HANGING, kitPoints, pointsKit, SupportField } from './worldGeom';

/**
 * World round 28 (the critic: a rock hanging in mid-air over the water beside a palm): the hero landmarks
 * and the dressing each brings beside its approach stand in the river, so every solid piece of them
 * either reaches down into the water (to the bed it hides) or rests on another of their pieces — no gap
 * over 5 cm under any of its lowest points, nothing standing on the water's surface. On the kit's real
 * geometry. (Crowns, cliff greenery and trees on the cliff hang from what carries them: that is checked.)
 */
let pts: Map<string, Float32Array>;
beforeAll(async () => {
  pts = await kitPoints();
}, 120_000);

it('rests every landmark piece on the bed or on another of its pieces', () => {
  const kinds = [...new Set(STYLES.flatMap((s) => s.landmarks))] as LandmarkKind[];
  expect(kinds.length).toBe(5);
  const lm = new Landmarks(pointsKit(pts), new THREE.Group());
  const found: string[] = [];
  let checked = 0;
  for (const kind of kinds) {
    const l = lm.place(kind, 0, new THREE.Vector3(), 0, 0, 10);
    const parts: { piece: string; p: Float32Array }[] = [];
    l.root.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      parts.push({ piece: m.name.split('|')[1] ?? m.name, p: (m.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array });
    });
    const field = new SupportField();
    parts.forEach(({ piece, p }, k) => {
      if (!FOLIAGE.test(piece) && !HANGING.test(piece)) field.add(p, k);
    });
    parts.forEach(({ piece, p }, k) => {
      if (HANGING.test(piece) || FOLIAGE.test(piece)) return;
      checked++;
      let lo = Infinity;
      for (let i = 1; i < p.length; i += 3) lo = Math.min(lo, p[i]!);
      if (lo < WATER_Y - 0.05) return;
      let best = Infinity;
      for (let i = 0; i < p.length; i += 3) {
        if (p[i + 1]! > lo + 0.06) continue;
        best = Math.min(best, p[i + 1]! - field.at(p[i]!, p[i + 2]!, 0.3, k));
      }
      if (best > 0.05) found.push(`${kind}: ${piece} ${best === Infinity ? 'stands on nothing' : `flies ${best.toFixed(2)} m`}, its foot ${(lo - WATER_Y).toFixed(2)} m over the water`);
    });
    lm.clear();
  }
  expect(checked).toBeGreaterThan(25);
  expect(found).toEqual([]);
}, 120_000);
