import * as THREE from 'three';
import { expect, it } from 'vitest';
import { groundY } from '../src/world/land';
import { buildLayout, isLand, LAND_TYPES, SECTION_TYPES } from '../src/world/sections';
import { GEN_SPEED, genIntensity, Track, WALLED as WALLED_TYPES } from '../src/world/track';
import { boundsKit } from './kitBounds';
import { collectLayouts, corridorFindings, findingLines, kitPoints } from './worldGeom';
import { LOOKS } from '../src/world/look';
import { FAMILY_CHROMA } from '../src/world/caustics';
import { STONES, STYLES, type StoneFamily } from '../src/world/style';

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

/**
 * World round 25: no two of the QA worlds open on the same view. Variants are built once for every
 * world, and three pairs of the 16 opened on the very same section (the same variant, the same way
 * round). A world's first section after the start is now its own layout: any two openings of one type
 * share at most half of what they lay out (pieces at the same metre, the same way round).
 */
it('opens every world on a view of its own', async () => {
  const track = new Track(boundsKit());
  await track.prepare({ foliage: 1, scenery: 1 });
  track.viewDistance = 165;
  const p = new THREE.Vector3();
  const open: { w: string; type: string; set: Set<string> }[] = [];
  for (const w of [3, 7, 11, 19, 23, 31, 42, 58, 64, 77, 83, 97, 105, 118, 126, 141]) {
    track.reset(`${w}-0.5`);
    track.update(0, 0);
    const sec = track.sections[1]!;
    const set = new Set<string>();
    for (const pl of sec.layout.props) {
      p.setFromMatrixPosition(pl.m);
      if (Math.abs(p.x) > 12) continue;
      set.add(`${pl.piece}@${Math.round((sec.mirror ? -1 : 1) * p.x)},${Math.round(p.z)}`);
    }
    open.push({ w: `w${w}`, type: sec.type, set });
  }
  const same: string[] = [];
  for (let i = 0; i < open.length; i++)
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i]!, b = open[j]!;
      if (a.type !== b.type) continue;
      let both = 0;
      for (const k of a.set) if (b.set.has(k)) both++;
      const share = both / Math.max(1, Math.min(a.set.size, b.set.size));
      if (share > 0.5) same.push(`${a.w} and ${b.w} (${a.type}): ${(share * 100).toFixed(0)} % shared`);
    }
  expect(same).toEqual([]);
}, 300000);

/**
 * World round 25: land sections meet without a step. The ravine's 6.5 m banks rose from its first metre
 * and, beside any other land (its floor at -0.3), ended in a hard-edged face: a flat, pale wedge standing
 * beside the way. At both ends of every land section the ground is the same profile, at every distance
 * out to the sides.
 */
it('meets the next land section on the same ground', () => {
  const bad: string[] = [];
  for (const type of LAND_TYPES) {
    for (let k = 0; k < 6; k++) {
      const L = buildLayout(type, `seam-${k}`, { foliage: 1, scenery: 1 });
      const ref = buildLayout('forest', `seam-${k}`, { foliage: 1, scenery: 1 });
      for (const zEnd of [0, -L.len]) {
        for (let x = -40; x <= 40; x += 2.5) {
          const g = groundY(L.ground!, x, zEnd, L.len, L.features?.lower ?? 0);
          // (The forest floor at an end: its noise faded out, so its length does not matter.)
          const f = groundY('land', x, zEnd === 0 ? 0 : -ref.len, ref.len);
          if (Math.abs(g - f) > 0.05) bad.push(`${type}/${k} end ${zEnd} x ${x}: ${g.toFixed(2)} against ${f.toFixed(2)}`);
        }
      }
    }
  }
  expect(bad.slice(0, 10)).toEqual([]);
});

/**
 * World round 25: on the lightest tier (no shadows) a section at the water's level draws its near and far
 * props in one call per material (phones peaked at 91-103 draw calls; the split is for shadows and for
 * far props to follow the water when stairs lower a section). Land is never lowered; a water section a
 * flight down keeps the split.
 */
it('draws sections at the water level without a near/far split on the lightest tier', async () => {
  const track = new Track(boundsKit());
  await track.prepare({ foliage: 0.45, scenery: 0.4 });
  track.viewDistance = 95;
  track.reset('7-0.5');
  let level = 0, lowered = 0;
  for (const w of ['7-0.5', '11-0.5', '23-0.5', '64-0.5']) {
    track.reset(w);
    for (let s = 0; s < 900; s += 20) {
      track.update(s, 0);
      for (const sec of track.sections) {
        const names: string[] = [];
        sec.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) names.push(o.name);
        });
        const far = names.filter((n) => n.endsWith('|far'));
        if (Math.abs(sec.seg.p0.y) < 1e-3) {
          level++;
          expect(far, `${sec.type} at the water's level`).toEqual([]);
        } else {
          lowered++;
          expect(isLand(sec.type)).toBe(false);
          // (World round 26: a flight down as well, its far props raised to the water in the merge.)
          expect(far, `${sec.type} a flight down`).toEqual([]);
        }
      }
    }
  }
  expect(level).toBeGreaterThan(20);
  expect(lowered).toBeGreaterThan(0);
}, 300000);

/**
 * World round 26 (owner: the runner passes through things): over 16 worlds' first 1.2 km, at desktop
 * High's and phone Low's densities, nothing solid stands in a box 0.6 m wide and 2 m tall over the floor
 * along the running line (the designed obstacles are not in the layouts; grass and ferns may brush his
 * legs). Checked on the kit's real geometry (worldGeom.ts).
 */
it('keeps the running line clear: nothing solid in a 0.6 m by 2 m box along it', async () => {
  const pts = await kitPoints();
  const layouts = await collectLayouts();
  expect(layouts.size).toBeGreaterThan(150);
  const found = [...layouts].flatMap(([L, name]) => corridorFindings(L, pts, 0.3, 2.0).map((f) => ({ name, ...f })));
  expect(findingLines(found)).toEqual([]);
}, 600000);

/**
 * World round 27 (the owner: on a phone, held upright, the openings looked alike): a world's opening
 * sections carry hero features on their near side, aimed ~44 m and ~64 m into it — every world at least
 * one, nearly all two — and the 16 worlds between them show at least four of the five kinds.
 */
it("gives every world's opening a hero feature, of varied kinds", async () => {
  const track = new Track(boundsKit());
  await track.prepare({ foliage: 0.45, scenery: 0.4 });
  track.viewDistance = 95;
  const kinds = new Map<string, string>();
  for (const w of [3, 7, 11, 19, 23, 31, 42, 58, 64, 77, 83, 97, 105, 118, 126, 141]) {
    track.reset(`${w}-0.5`);
    track.update(0, 0);
    // (World round 27: the world's first two sections after the start are its own.)
    const opens = track.sections.filter((s) => s.type !== 'start').slice(0, 2);
    expect(opens.length, `w${w}`).toBe(2);
    let n = 0;
    for (const open of opens) for (const k of open.layout.features?.hero?.split('+') ?? []) kinds.set(`w${w}/${n++}`, k);
    expect(n, `w${w}`).toBeGreaterThanOrEqual(1);
  }
  expect(kinds.size).toBeGreaterThanOrEqual(28);
  expect(new Set(kinds.values()).size).toBeGreaterThanOrEqual(4);
}, 300000);

/**
 * World round 28 (the critic: worlds 3 and 7 had almost the same title shot — the same sandstone
 * causeway, arches, beams and palms, a slight colour shift between them). A world's identity at a glance
 * is the colour of its stone (the way, the parapets, the piers: most of every frame), its water, its
 * leaves and its air, under its light. Each is estimated here from the plan as the shaders apply it (a
 * representative baked sandstone texel moved to the stone family, the look's stone tint and sun; the
 * style's water, leaf season and sky; the look's haze) and compared in CIELAB (ΔE76).
 */
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexLin = (h: string | number) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b] as [number, number, number];
};
function lab([r, g, b]: [number, number, number]): [number, number, number] {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a: [number, number, number], b: [number, number, number]) => {
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
/** The baked sandstone of the way as the title shot shows it (sRGB 196, 140, 100). */
const SAND: [number, number, number] = [lin(196 / 255), lin(140 / 255), lin(100 / 255)];
function stoneLit(f: StoneFamily, look: (typeof LOOKS)[number]): [number, number, number] {
  const l = 0.2126 * SAND[0] + 0.7152 * SAND[1] + 0.0722 * SAND[2];
  const sun = hexLin(look.sun);
  const sl = 0.2126 * sun[0] + 0.7152 * sun[1] + 0.0722 * sun[2];
  return SAND.map((c, i) => {
    const fam = Math.max(0, l * f.colour[i]! + (c - l) * FAMILY_CHROMA);
    return (c + (fam - c) * f.k) * look.stoneTint[i]! * (sun[i]! / sl);
  }) as [number, number, number];
}
function identity(seed: string) {
  const p = Track.planOf(seed);
  const look = LOOKS[p.look]!, style = STYLES[p.style]!, stone = STONES[p.stone]!;
  const leaf: [number, number, number] = [0.08 * 0.84 * style.foliage[0], 0.16 * 0.9 * style.foliage[1], 0.04 * 0.76 * style.foliage[2]];
  const air = hexLin(look.fog).map((c, i) => c * style.sky[i]!) as [number, number, number];
  return { seed, stone: stoneLit(stone, look), water: hexLin(style.waterShallow), leaf, air, name: `${look.name}/${style.name}/${stone.name}` };
}
const apart = (a: ReturnType<typeof identity>, b: ReturnType<typeof identity>) => dE(a.stone, b.stone) + 0.6 * (dE(a.water, b.water) + dE(a.leaf, b.leaf) + dE(a.air, b.air));

it('builds each world of a stone of its own, and no two worlds alike at a glance', async () => {
  // The families are far apart (the same light on each).
  for (let i = 0; i < STONES.length; i++)
    for (let j = i + 1; j < STONES.length; j++) expect(dE(stoneLit(STONES[i]!, LOOKS[0]!), stoneLit(STONES[j]!, LOOKS[0]!)), `${STONES[i]!.name} / ${STONES[j]!.name}`).toBeGreaterThan(14);
  // The critic's pair.
  const w3 = identity('3-0.5'), w7 = identity('7-0.5');
  expect(dE(w3.stone, w7.stone), `${w3.name} / ${w7.name}`).toBeGreaterThan(15);
  expect(apart(w3, w7)).toBeGreaterThan(40);
  // Worlds in a row (as the game picks them) share no stone, look, style or theme, and stand far apart.
  const track = new Track(boundsKit());
  await track.prepare({ foliage: 0.45, scenery: 0.4 });
  let prev = '';
  let worst = Infinity;
  const used = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const seed = prev ? (track as unknown as { vary(b: string): string }).vary(`row-${i}`) : `row-${i}`;
    track.reset(seed);
    if (prev) worst = Math.min(worst, apart(identity(prev), identity(seed)));
    used.add(track.stone.name);
    prev = seed;
  }
  expect(used.size).toBe(STONES.length);
  expect(worst).toBeGreaterThan(22);
  // Any two of the check worlds: at most a few pairs close (the sets are small; such a pair differs in its
  // theme — its route and sections — and the light or the stone).
  const ws = [3, 7, 11, 19, 23, 31, 42, 58, 64, 77, 83, 97, 105, 118, 126, 141].map((w) => identity(`${w}-0.5`));
  const close: string[] = [];
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (apart(ws[i]!, ws[j]!) < 15) close.push(`${ws[i]!.seed} ${ws[i]!.name} ~ ${ws[j]!.seed} ${ws[j]!.name}`);
  expect(close.length, close.join('\n')).toBeLessThanOrEqual(3);
}, 120_000);
