import { beforeAll, expect, it } from 'vitest';
import type { Layout } from '../src/world/sections';
import { collectLayouts, findingLines, groundingFindings, kitPoints } from './worldGeom';

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
