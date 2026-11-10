import * as THREE from 'three';
import { beforeAll, expect, it } from 'vitest';
import { evalSeg } from '../src/world/path';
import type { Layout } from '../src/world/sections';
import { CHECK_SEEDS, collectLayouts, kitPoints, placedPoints } from './worldGeom';

/**
 * World round 27 (owner: he passes through things — on world 5's first flight up, his legs sank into the
 * steps and the steps filled the lower half of a phone's frame): the route climbs every flight of stairs
 * where its treads are. Along every stairs section the track lays over the check worlds (and world 5),
 * at both tiers, the top of each tread under the running line — on the kit's real geometry — stands
 * within 3 cm of the route's height there, and so do the landings' floors before and after the flight.
 */
let pts: Map<string, Float32Array>;
let layouts: Map<Layout, string>;

beforeAll(async () => {
  pts = await kitPoints();
  layouts = await collectLayouts(1200, [5, ...CHECK_SEEDS]);
}, 600_000);

/** The route's height `u` m into a section (in its own frame: it starts at the origin, heading −z). */
function routeY(L: Layout, u: number): number {
  return evalSeg({ s0: 0, len: L.len, p0: new THREE.Vector3(), yaw0: 0, turn: L.turn, dy: L.dy, ramp: L.ramp }, u, { pos: new THREE.Vector3(), yaw: 0 }).pos.y;
}

it('runs the route along the top of every tread and landing of every flight, within 3 cm', () => {
  const stairs = [...layouts].filter(([L]) => L.type === 'stairsUp' || L.type === 'stairsDown');
  expect(stairs.length).toBeGreaterThanOrEqual(4);
  const bad: string[] = [];
  let checked = 0;
  for (const [L, name] of stairs) {
    // The floor under the running line (|x| < 0.9 m), per 0.1 m along it: the highest tile point there.
    const top = new Map<number, number>();
    for (const t of L.tiles) {
      const g = pts.get(t.piece);
      if (!g) continue;
      const p = placedPoints(g, t.m);
      for (let i = 0; i < p.length; i += 3) {
        if (Math.abs(p[i]!) > 0.9) continue;
        const k = Math.round(-p[i + 2]! * 10);
        top.set(k, Math.max(top.get(k) ?? -Infinity, p[i + 1]!));
      }
    }
    // Every tread's middle (0.2 m, 0.6 m … 3.8 m in: the top within 5 cm of it), and the landing every
    // metre from 0.5 m past the flight to the section's end (the highest slab within 25 cm: the paving
    // is laid broken in places, a slab sunk or tipped a few centimetres).
    const treads = Array.from({ length: 10 }, (_, i) => [0.2 + 0.4 * i, 0] as const);
    const landing = Array.from({ length: Math.floor(L.len - 4.5) }, (_, i) => [4.5 + i, 2] as const);
    for (const [u, w] of [...treads, ...landing]) {
      let y: number | undefined;
      for (let k = Math.round(u * 10) - w; k <= Math.round(u * 10) + w; k++) {
        const v = top.get(k);
        if (v !== undefined) y = Math.max(y ?? -Infinity, v);
      }
      if (y === undefined) {
        bad.push(`${name}: nothing under the line ${u.toFixed(1)} m in`);
        continue;
      }
      checked++;
      const r = routeY(L, u);
      if (Math.abs(y - r) > 0.03) bad.push(`${name}: ${u.toFixed(1)} m in, floor ${y.toFixed(3)} route ${r.toFixed(3)}`);
    }
  }
  expect(bad.slice(0, 20)).toEqual([]);
  expect(checked).toBeGreaterThan(100);
}, 600_000);
