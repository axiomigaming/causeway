import * as THREE from 'three';
import { expect, it } from 'vitest';
import type { Kit } from '../src/world/assets';
import { bakeGrain } from '../src/world/grain';
import { buildLayout } from '../src/world/sections';
import { isUnderWay, Track } from '../src/world/track';
import { boundsKit } from './kitBounds';

/**
 * World round 29 (the ledge given up in most worlds: the cave-in opened onto the piers under the slabs).
 * The masonry under the walkable way — and only it — is drawn on its own, each pier with its span along
 * the route, so a cave-in can take the piers in its footprint (Track.hideUnder); the sections keep an
 * undrawn copy for what probes their geometry.
 */
it('draws the piers under the way apart, and a cave-in takes those in its footprint', async () => {
  const kit = boundsKit();
  // Classification: the stepping run's piers are under the way; a parapet's footing beside it is not.
  const lay = buildLayout('stepping', 'stepping#0', { foliage: 1, scenery: 1 });
  const bb = new THREE.Box3();
  const placed = (piece: string, m: THREE.Matrix4) => {
    const g = kit.geo.get(piece)!;
    if (!g.boundingBox) g.computeBoundingBox();
    return bb.copy(g.boundingBox!).applyMatrix4(m);
  };
  const under = lay.props.filter((pl) => kit.geo.has(pl.piece) && isUnderWay(lay, pl.piece, placed(pl.piece, pl.m)));
  expect(under.length).toBeGreaterThanOrEqual(lay.len / 4);
  const corr = buildLayout('corridor', 'corridor#0', { foliage: 1, scenery: 1 });
  for (const pl of corr.props) {
    if (!pl.piece.startsWith('foundation_')) continue;
    expect(isUnderWay(corr, pl.piece, placed(pl.piece, pl.m)), 'a parapet footing').toBe(false);
  }

  const track = new Track(kit);
  await track.prepare({ foliage: 1, scenery: 1 });
  track.forceNext = ['stepping', 'stepping', 'approach'];
  track.reset('ledge-under');
  track.update(40, 0);
  const sec = track.sections.find((s) => s.type === 'stepping' && s.under.length > 0);
  expect(sec, 'a stepping run with its piers').toBeDefined();
  // Drawn instanced, every one of them.
  expect(sec!.under.every((t) => t.index >= 0 && t.alive)).toBe(true);
  // The section's own merged meshes hold them only as an undrawn copy.
  const copies = sec!.root.children.filter((c) => c.userData.underWay);
  expect(copies.length).toBeGreaterThan(0);
  expect(copies.every((c) => !c.visible)).toBe(true);
  // Each spans a little of the route inside its section.
  for (const t of sec!.under) {
    expect(t.sFar - t.sNear).toBeGreaterThan(0.3);
    expect(t.sFar - t.sNear).toBeLessThan(1.5);
    expect(t.sNear).toBeGreaterThan(sec!.s0 - 1);
    expect(t.sFar).toBeLessThan(sec!.s0 + sec!.len + 1);
  }
  // A cave-in over 6 m takes the piers there, and only those.
  const s0 = sec!.s0 + 4, s1 = s0 + 6;
  const n = track.hideUnder(s0, s1);
  expect(n).toBeGreaterThan(0);
  for (const t of sec!.under) expect(t.alive, `${t.sNear.toFixed(1)}-${t.sFar.toFixed(1)}`).toBe(t.sFar <= s0 || t.sNear >= s1);
}, 120000);

/** A bent tube along a known axis (local x), as a root lies: its rings swept along the axis. */
function tube(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.15, 0.2, 3, 12, 20, true);
  g.rotateZ(Math.PI / 2);
  return g;
}

it('reads the way a root runs off its mesh (bark furrows follow it)', () => {
  const g = tube();
  const kit = { geo: new Map([['roots_0', g]]), matOf: new Map([['roots_0', 'bark']]), mat: new Map() } as unknown as Kit;
  bakeGrain(kit);
  const a = g.getAttribute('aGrain') as THREE.BufferAttribute;
  expect(a.itemSize).toBe(4);
  let sure = 0;
  for (let i = 0; i < a.count; i++) {
    if (a.getW(i) < 0.45) continue;
    sure++;
    expect(Math.abs(a.getX(i)), `vertex ${i}`).toBeGreaterThan(0.95);
  }
  expect(sure / a.count).toBeGreaterThan(0.8);
});
