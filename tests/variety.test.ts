import { expect, it } from 'vitest';
import { isLand } from '../src/world/sections';
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
