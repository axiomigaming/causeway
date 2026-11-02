import * as THREE from 'three';
import { expect, it } from 'vitest';
import { groundY } from '../src/world/land';
import { buildLayout, isLand, LAND_TYPES } from '../src/world/sections';
import { GEN_SPEED, genIntensity, Track, WALLED as WALLED_TYPES } from '../src/world/track';
import { boundsKit } from './kitBounds';

/**
 * World round 23 (owner: "non deve essere sempre acqua ai lati, ma anche tipo foresta"): over twelve
 * worlds, the route mixes land, walled and open-water sections; the first land comes within a few seconds
 * of the start, and no stretch of nominal run has open water on both sides (no land, no gorge, cliff or
 * tunnel walls) for more than OPEN_MAX seconds. MIX_OUT=<file> writes the report (MIX_SEEDS, MIX_LEN,
 * MIX_FROM/MIX_SEQ for the section list). The pieces have their real bounds (kitBounds.ts): with empty
 * ones every landmark corner was clear here, while in the game it never was, and its open run-up was
 * staged again and again — 65 % of the route was "approach" over open water. Corners must come, and the
 * run-ups stay a small share.
 */
const OPEN_MAX = 15;
const FIRST_LAND_MAX = 8;

const WALLED = new Set<string>(WALLED_TYPES);
const timeAt = (() => {
  const tab: number[] = [0];
  for (let s = 5; s < 6000; s += 5) tab.push(tab[tab.length - 1]! + 5 / GEN_SPEED(genIntensity(s)));
  return (s: number) => tab[Math.min(tab.length - 1, Math.floor(s / 5))]!;
})();

it('mixes land, walls and water, with no long open-water stretch', async () => {
  const track = new Track(boundsKit());
  await track.prepare({ foliage: 1, scenery: 1 });
  track.viewDistance = 165;
  const LEN = Number(process.env.MIX_LEN ?? 2400);
  const count: Record<string, number> = {};
  let landM = 0, wallM = 0, allM = 0;
  const lines: string[] = [];
  let worstAll = 0, worstOpenAll = 0, worstFirst = 0;
  for (const n of (process.env.MIX_SEEDS ?? '3,7,11,19,23,31,42,58,64,77,83,97').split(',')) {
    track.reset(/^\d+$/.test(n) ? `${n}-0.5` : n);
    const seen: { type: string; s0: number; len: number }[] = [];
    const got = new Set<unknown>();
    for (let s = 0; s < LEN; s += 20) {
      track.update(s, 0);
      for (const sec of track.sections) if (!got.has(sec)) { got.add(sec); seen.push({ type: sec.type, s0: sec.s0, len: sec.len }); }
    }
    let run0 = -1, worstWater = 0, worstAt = 0, firstLand = -1, open = 0, worstOpen = 0, open0 = 0, worstOpenAt = 0;
    for (const sec of seen) {
      if (sec.s0 > LEN) break;
      count[sec.type] = (count[sec.type] ?? 0) + 1;
      allM += sec.len;
      const land = isLand(sec.type as never);
      if (land) landM += sec.len;
      if (WALLED.has(sec.type)) wallM += sec.len;
      if (land && firstLand < 0) firstLand = timeAt(sec.s0);
      if (!land && !WALLED.has(sec.type)) { if (open === 0) open0 = sec.s0; open += timeAt(sec.s0 + sec.len) - timeAt(sec.s0); if (open > worstOpen) { worstOpen = open; worstOpenAt = open0; } } else open = 0;
      if (!land) { if (run0 < 0) run0 = sec.s0; }
      else if (run0 >= 0) {
        const dt = timeAt(sec.s0) - timeAt(run0);
        if (dt > worstWater) { worstWater = dt; worstAt = run0; }
        run0 = -1;
      }
    }
    worstAll = Math.max(worstAll, worstWater);
    worstOpenAll = Math.max(worstOpenAll, worstOpen);
    worstFirst = Math.max(worstFirst, firstLand < 0 ? 1e9 : firstLand);
    lines.push(`w${n}: first land at ${firstLand.toFixed(1)}s, longest stretch without land ${worstWater.toFixed(1)}s, open water both sides ${worstOpen.toFixed(1)}s (from ${Math.round(worstOpenAt)}m; no-land from ${Math.round(worstAt)}m), run seq: ${seen.filter((x) => x.s0 < Number(process.env.MIX_SEQ ?? 1200) && x.s0 >= Number(process.env.MIX_FROM ?? 0)).map((x) => `${x.type}@${Math.round(x.s0)}`).join(',')}`);
  }
  const fs = await import('node:fs');
  const out = [
    `share by length: land ${(100 * landM / allM).toFixed(1)}%, walled ${(100 * wallM / allM).toFixed(1)}%, open water ${(100 * (1 - (landM + wallM) / allM)).toFixed(1)}%`,
    `worst stretch without land ${worstAll.toFixed(1)}s; worst open water on both sides (no land, no gorge/cliff/tunnel walls) ${worstOpenAll.toFixed(1)}s`,
    'counts: ' + Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '),
    ...lines,
  ].join('\n');
  if (process.env.MIX_OUT) fs.writeFileSync(process.env.MIX_OUT, out + '\n');
  const landShare = landM / allM;
  expect(worstOpenAll, out).toBeLessThanOrEqual(OPEN_MAX);
  expect(worstFirst, out).toBeLessThanOrEqual(FIRST_LAND_MAX);
  expect(landShare, out).toBeGreaterThan(0.25);
  expect(landShare + wallM / allM, out).toBeLessThan(0.75);
  expect((count.turnL ?? 0) + (count.turnR ?? 0), out).toBeGreaterThanOrEqual(12);
  expect((count.approach ?? 0) / Object.values(count).reduce((a, b) => a + b, 0), out).toBeLessThan(0.15);
}, 600000);

/**
 * World round 24: what a land section lays down is seen. The overgrown plaza's lower terrace (slabs a
 * flight down, -1.6) lay 1.3 m under the forest floor, which ran on at -0.3 over it: the court and its
 * footing were buried, and the frame showed a bare plane. Every paving slab placed as a prop on land
 * stands on or above the ground the section builds (slabs are seated a few centimetres into it).
 */
it('lays no paving under the ground of a land section', () => {
  const p = new THREE.Vector3();
  const bad: string[] = [];
  let checked = 0;
  for (const type of LAND_TYPES) {
    for (let k = 0; k < 24; k++) {
      const L = buildLayout(type, `bury-${k}`, { foliage: 1, scenery: 1 });
      if (!L.ground) continue;
      for (const pl of L.props) {
        if (!/^floor_/.test(pl.piece)) continue;
        p.setFromMatrixPosition(pl.m);
        if (Math.abs(p.x) < 2.9) continue; // (the causeway's own course: the ground stays under its footing)
        // The slab's top at its centre and toward its corners.
        for (const [dx, dz] of [[0, 0], [1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]] as const) {
          const z = p.z + dz;
          if (z > -2.5 || z < -L.len + 2.5) continue; // (the ends come back to grade under the next section's ground)
          const g = groundY(L.ground, p.x + dx, z, L.len, L.features?.lower ?? 0);
          checked++;
          if (g > p.y + 0.12) bad.push(`${type}/${k} ${pl.piece} at (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${z.toFixed(1)}): ground ${g.toFixed(2)}`);
        }
      }
    }
  }
  expect(checked).toBeGreaterThan(100);
  expect(bad.slice(0, 12)).toEqual([]);
});

/**
 * World round 24: the paving tiles' aHalf (their half-width, for the parapet strip's grime and moss) is
 * set on the kit's shared geometry; a slab placed as a prop carried it into the section's merged mesh,
 * where the position is the section's (|x| of metres): the strip's moss and litter covered the whole
 * slab (camouflage), and merged with a piece without it, the merge failed and the mesh was dropped.
 */
it("merges props without the tiles' edge attribute, and drops none", async () => {
  const track = new Track(boundsKit());
  await track.prepare({ foliage: 1, scenery: 1 });
  track.viewDistance = 165;
  track.reset('7-0.5');
  let meshes = 0, paving = 0;
  const seen = new Set<unknown>();
  for (let s = 0; s < 900; s += 20) {
    track.update(s, 0);
    for (const sec of track.sections) {
      if (seen.has(sec)) continue;
      seen.add(sec);
      let n = 0;
      const names = new Set<string>();
      sec.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name === 'ground' || m.name === 'falls') return;
        n++;
        names.add(m.name);
        expect(m.geometry.getAttribute('aHalf'), `${sec.type} ${m.name}`).toBeUndefined();
      });
      // (boundsKit gives every piece one material: paving beside the path shares the near mesh with the
      // walls and rubble there, the merge that failed on the mixed attribute.)
      const p = new THREE.Vector3();
      const paved = sec.layout.props.some((pl) => pl.piece.startsWith('floor_') && Math.abs(p.setFromMatrixPosition(pl.m).x) <= 7.5);
      if (paved) {
        expect(names.has('stone|near'), `${sec.type}: paving laid out beside the path, no near mesh built (${[...names].join(', ')})`).toBe(true);
        paving++;
      }
      meshes += n;
    }
  }
  expect(meshes).toBeGreaterThan(50);
  expect(paving, 'no section with paving props was checked').toBeGreaterThan(0);
}, 300000);
