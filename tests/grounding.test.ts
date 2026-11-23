import * as THREE from 'three';
import { beforeAll, expect, it } from 'vitest';
import { Obstacles } from '../src/world/obstacles';
import { Path } from '../src/world/path';
import { STAIR_RISE, type Layout } from '../src/world/sections';
import { propZone } from '../src/world/track';
import { BEAMS, beamFindings, carriedFindings, collectLayouts, findingLines, FOLIAGE, footingFindings, groundingFindings, kitPoints, pointsKit, SupportField, WL } from './worldGeom';

/**
 * World round 26 (owner: things fly, float, sink): every piece the track lays over 16 worlds' first
 * 1.2 km, at desktop High's and phone Low's densities, rests on something — the land, the paving, a
 * solid piece, or under the water's surface the bed — checked on the kit's real geometry: no gap over
 * 5 cm under it, no more than 30 % of its footprint under the ground, nothing standing on the water.
 */
let pts: Map<string, Float32Array>;
let layouts: Map<Layout, string>;

beforeAll(async () => {
  pts = await kitPoints();
  layouts = await collectLayouts();
}, 600_000);

it('lays every piece on something: no gap over 5 cm under it, nothing a third sunk, nothing floating', () => {
  expect(layouts.size).toBeGreaterThan(150);
  const found = [...layouts].flatMap(([L, name]) => groundingFindings(L, pts, 0.05, 0.3).map((f) => ({ name, ...f })));
  expect(findingLines(found)).toEqual([]);
}, 600_000);

/**
 * World round 28 (the critic: a piece hanging in mid-air over the water): a water section a flight down
 * (after stairs) keeps its near props with the path and raises the rest to the water (track.ts propZone).
 * Laid that way, every piece still rests on something. Before, the islet rocks sank with the path while
 * the shrub masses and bananas on them rose to the surface: 29 pieces with 0.2–1.1 m of air under them.
 */
it('lays every piece on something in a water section a flight down', () => {
  const p = new THREE.Vector3();
  let n = 0;
  const found = [...layouts].flatMap(([L, name]) => {
    if (L.ground || /^stairs/.test(L.type)) return [];
    n++;
    const props = L.props.map((pl) => {
      const z = propZone(pl.piece, p.setFromMatrixPosition(pl.m));
      return z === 'near' || z === 'grit' ? pl : { piece: pl.piece, m: new THREE.Matrix4().makeTranslation(0, STAIR_RISE, 0).multiply(pl.m) };
    });
    return groundingFindings({ ...L, props }, pts, 0.05, 0.3, WL + STAIR_RISE).map((f) => ({ name: `${name} (a flight down)`, ...f }));
  });
  expect(n).toBeGreaterThan(100);
  expect(findingLines(found)).toEqual([]);
}, 600_000);

it('carries every slab over open water on a footing, a pier or a wall', () => {
  const found = [...layouts].flatMap(([L, name]) => footingFindings(L, pts).map((f) => ({ name, ...f })));
  expect(findingLines(found)).toEqual([]);
}, 600_000);

it('sets every crown on its own trunk', () => {
  let n = 0;
  for (const [L, name] of layouts) {
    L.props.forEach((pl, k) => {
      if (!pl.piece.endsWith('_crown') || !/^(palm_|tree_big_|jungle_)\d/.test(pl.piece)) return;
      const t = L.props[k - 1];
      expect(t?.piece, `${name}: ${pl.piece}`).toBe(pl.piece.replace(/_crown$/, '_trunk'));
      expect(t!.m.equals(pl.m), `${name}: ${pl.piece} off its trunk`).toBe(true);
      n++;
    });
  }
  expect(n).toBeGreaterThan(100);
});

/**
 * World round 28 (the critic: the slide-under lintel's left end hung well above the stump under it, a
 * statue beside the right end its only "support"; in a closer frame it ran off both edges carried by
 * nothing): every beam a layout lays bears on something at both ends — a pier, a jamb, the ground, the
 * bed under the water.
 */
it('carries every beam at both ends', () => {
  let n = 0;
  const found = [...layouts].flatMap(([L, name]) => {
    n += L.props.filter((p) => BEAMS.test(p.piece)).length;
    return beamFindings(L, pts).map((f) => ({ name, ...f }));
  });
  expect(n).toBeGreaterThan(5);
  expect(findingLines(found)).toEqual([]);
}, 120_000);

/**
 * The obstacle director's overhead set pieces (the lintel he slides under, the trunk across the way), as
 * the world builds them for any seed: the member bears on a jamb at each end, and each jamb stands on
 * the way (its foot at or below the deck).
 */
it('carries the slide-under lintel and trunk on their jambs at both ends', () => {
  const path = new Path();
  path.reset({ pos: new THREE.Vector3(), yaw: 0 });
  path.push(200);
  const ob = new Obstacles(pointsKit(pts), new THREE.Group(), path);
  const found: string[] = [];
  const pointsOf = (m: THREE.Mesh) => (m.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
  for (const kind of ['beam', 'bough'] as const)
    for (let seed = 0; seed < 120; seed++) {
      const o = ob.spawn(kind, 50, seed);
      const kids = o.root.children as THREE.Mesh[];
      const member = kids.find((k) => /beam_lintel|jungle_\d_trunk|column_fallen/.test(k.name));
      if (!member) {
        found.push(`${kind}/${seed}: no member`);
        continue;
      }
      const field = new SupportField();
      kids.forEach((k, i) => {
        if (k === member || FOLIAGE.test(k.name.split('|')[1] ?? '')) return;
        field.add(pointsOf(k), i);
        if (/pillar_/.test(k.name)) {
          let lo = Infinity;
          for (let j = 1; j < pointsOf(k).length; j += 3) lo = Math.min(lo, pointsOf(k)[j]!);
          if (lo > 0.02) found.push(`${kind}/${seed}: a jamb stands ${lo.toFixed(2)} m above the way`);
        }
      });
      for (const f of carriedFindings(kind, pointsOf(member), new THREE.Vector3(1, 0, 0), (x, y, z) => field.at(x, z, 0.25) >= y - 0.05)) found.push(`${kind}/${seed}: ${f.what} @${f.at.join(',')}`);
      ob.remove(o);
    }
  expect(found.slice(0, 12)).toEqual([]);
}, 120_000);
