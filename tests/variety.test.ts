import * as THREE from 'three';
import { expect, it } from 'vitest';
import { groundY } from '../src/world/land';
import { buildLayout, isLand, LAND_TYPES, SECTION_TYPES } from '../src/world/sections';
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
 * World round 24: paving laid as props (the overgrown plaza's court and its lower terrace) tiles its run
 * with no holes and no slab on another. A slab's origin is its front edge; turned end for end in place
 * it covered the tile before: two slabs on one tile, a 4 m hole on the next.
 */
it('lays paving props edge to edge', () => {
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  const bad: string[] = [];
  let runs = 0;
  for (const type of SECTION_TYPES) {
    for (let k = 0; k < 6; k++) {
      const L = buildLayout(type, `pave-${k}`, { foliage: 1, scenery: 1 });
      const lines = new Map<string, [number, number][]>();
      for (const pl of L.props) {
        if (!/^floor_[0-2]$/.test(pl.piece)) continue;
        p.setFromMatrixPosition(pl.m);
        d.set(0, 0, -1).transformDirection(pl.m); // where the slab runs from its origin
        if (Math.abs(d.x) > 0.01) continue; // (laid across: not a run along the way)
        const key = `${p.x.toFixed(1)}|${p.y.toFixed(2)}`;
        const span: [number, number] = d.z < 0 ? [p.z - 4, p.z] : [p.z, p.z + 4];
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key)!.push(span);
      }
      for (const [key, spans] of lines) {
        if (spans.length < 2) continue;
        runs++;
        spans.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) {
          const gap = spans[i]![0] - spans[i - 1]![1];
          if (Math.abs(gap) > 0.05) bad.push(`${type}/${k} line ${key}: ${gap > 0 ? 'hole' : 'overlap'} of ${Math.abs(gap).toFixed(1)} m at z ${spans[i]![0].toFixed(1)}`);
        }
      }
    }
  }
  expect(runs).toBeGreaterThan(5);
  expect(bad.slice(0, 12)).toEqual([]);
});

/**
 * World round 24: a shrub mass on an islet stays on its rock. A 5 m shrub on a 2.5 m boulder hung out
 * over the water on every side, and the opaque water cut its underside flat: boxy clumps of leaves
 * floating on the lagoon beside the way. Its crown overhangs the rock by at most a quarter.
 */
it('keeps the shrubs on islets on their rocks', () => {
  const SHRUB_R = [2.0, 2.95], ROCK_R = 1.85;
  const p = new THREE.Vector3(), q = new THREE.Vector3(), sc = new THREE.Vector3();
  const bad: string[] = [];
  let checked = 0;
  for (const type of SECTION_TYPES) {
    for (let k = 0; k < 6; k++) {
      const L = buildLayout(type, `islet-${k}`, { foliage: 1, scenery: 1 });
      const rocks = L.props.filter((pl) => pl.piece.startsWith('rock_mid_'));
      for (const pl of L.props) {
        const m = /^shrub_mass_(\d)$/.exec(pl.piece);
        if (!m) continue;
        p.setFromMatrixPosition(pl.m);
        if (p.y > -1.2) continue; // (only what stands at the water: islets sit at its surface, -2.2)
        // Its islet: a boulder right under it (islet() puts the shrub on the rock's centre).
        const rock = rocks.find((r) => q.setFromMatrixPosition(r.m).setY(p.y).distanceTo(p) < 0.6);
        if (!rock) continue;
        checked++;
        const rs = sc.setFromMatrixScale(rock.m).x;
        const ss = sc.setFromMatrixScale(pl.m).x;
        const over = (SHRUB_R[+m[1]!]! * ss) / (ROCK_R * rs);
        if (over > 1.26) bad.push(`${type}/${k} ${pl.piece} x${ss.toFixed(2)} on rock x${rs.toFixed(2)}: ${over.toFixed(2)}`);
      }
    }
  }
  expect(checked).toBeGreaterThan(20);
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
