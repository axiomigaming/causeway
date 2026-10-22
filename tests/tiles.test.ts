import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Kit } from '../src/world/assets';
import { Track } from '../src/world/track';

/** A kit with just enough geometry: every piece is a unit box, all on one material. */
function fakeKit(): Kit {
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

describe('walkable tiles', () => {
  it('know where they lie along the route, however they are rotated', async () => {
    const track = new Track(fakeKit());
    await track.prepare({ foliage: 1, scenery: 1 });
    track.reset('tiles');
    track.update(600, 0.5);
    const mid = new THREE.Vector3();
    const f = { pos: new THREE.Vector3(), yaw: 0 };
    let n = 0;
    for (const sec of track.sections) {
      for (const t of sec.tiles) {
        const len = t.sFar - t.sNear;
        expect(len).toBeGreaterThan(3.9);
        expect(len).toBeLessThan(t.piece === 'floor_wide_0' ? 10 : 9); // a corner's plaza spans its 7.1 m bend
        if (t.piece === 'floor_wide_0') continue; // the plaza slab is laid on the chord of an arc
        // The tile's own centre (4 m along its −Z) sits on the path at the middle of its s-range.
        const flip = new THREE.Vector3(0, 0, -2).applyMatrix4(t.world);
        mid.copy(flip);
        track.path.sample((t.sNear + t.sFar) / 2, f);
        expect(Math.hypot(mid.x - f.pos.x, mid.z - f.pos.z)).toBeLessThan(0.3);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
  });

  it('collapse spares tiles outside the range and tileAt finds the one underfoot', async () => {
    const track = new Track(fakeKit());
    await track.prepare({ foliage: 1, scenery: 1 });
    track.reset('collapse');
    track.update(200, 0.5);
    const s = 230; // ahead of the runner at 200 (sections behind are cleared)
    const under = track.tileAt(s)!;
    expect(under).toBeDefined();
    track.collapse(under.sFar + 0.01, under.sFar + 12);
    expect(under.alive).toBe(true);
    expect(track.tileAt(under.sFar + 2)).toBeUndefined();
  });

  it('are never mirrored, even in a mirrored section (a negative determinant draws a slab inside out)', async () => {
    const track = new Track(fakeKit());
    await track.prepare({ foliage: 1, scenery: 1 });
    track.reset('mirror');
    track.update(800, 0.5);
    let mirrored = 0;
    for (const sec of track.sections) {
      if (sec.mirror) mirrored++;
      for (const t of sec.tiles) expect(t.world.determinant()).toBeGreaterThan(0);
    }
    expect(mirrored).toBeGreaterThan(0);
  });

  it('every new world gets a run plan (theme and look) that differs from the last one', async () => {
    const track = new Track(fakeKit());
    await track.prepare({ foliage: 1, scenery: 1 });
    let prev = { theme: '', look: '' };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      track.reset(`plan-${i}`);
      const cur = { theme: track.theme, look: track.look.name };
      expect(cur.theme).not.toBe(prev.theme);
      expect(cur.look).not.toBe(prev.look);
      seen.add(cur.look);
      prev = cur;
    }
    expect(seen.size).toBe(4);
  });

  it('places obstacles across the route with honest clearances', async () => {
    const kit = fakeKit();
    // Stand-ins shaped like the kit's: trunks tall along y, fallen columns long along z.
    for (const n of ['jungle_0_trunk', 'jungle_1_trunk']) kit.geo.set(n, new THREE.CylinderGeometry(0.75, 0.75, 8, 12));
    for (const n of ['column_fallen_0', 'column_fallen_1']) kit.geo.set(n, new THREE.BoxGeometry(1, 1, 6, 1, 1, 6));
    kit.geo.set('pillar_2', new THREE.BoxGeometry(1, 3, 1));
    const track = new Track(kit);
    await track.prepare({ foliage: 0.4, scenery: 0.4 });
    track.reset('obstacles');
    track.update(0, 0);
    const want = { log: ['jump', 0.5, 1.0], pillar: ['jump', 0.5, 1.0], beam: ['slide', 1.1, 1.6], bough: ['slide', 0.9, 1.8] } as const;
    for (const [kind, [action, lo, hi]] of Object.entries(want)) {
      const o = track.spawnObstacle(kind as keyof typeof want, 30, 1);
      expect(o.action).toBe(action);
      expect(o.clearance).toBeGreaterThan(lo);
      expect(o.clearance).toBeLessThan(hi);
      expect(o.sNear).toBeLessThan(30);
      expect(o.sFar).toBeGreaterThan(30);
      expect(o.rest.length).toBe(o.root.children.length);
    }
    expect(track.obstacles.within(29, 31).length).toBe(4);
    track.update(200, 0);
    expect(track.obstacles.list.length).toBe(0);
  });

  it('stages hero landmarks ahead of an open approach, beyond a corner, well off the route', async () => {
    const track = new Track(fakeKit());
    await track.prepare({ foliage: 0.4, scenery: 0.4 });
    const f = { pos: new THREE.Vector3(), yaw: 0 };
    const at = new THREE.Vector3();
    let staged = 0;
    for (let w = 0; w < 6; w++) {
      track.reset(`landmarks-${w}`);
      for (let s = 0; s < 1500; s += 25) {
        track.update(s, 0.5);
        for (const l of track.landmarks.list) {
          if (l.root.userData.checked) continue;
          l.root.userData.checked = true;
          staged++;
          at.setFromMatrixPosition(l.root.matrix);
          const sec = track.sections.find((x) => Math.abs(x.s0 - l.s) < 1e-6)!;
          expect(sec.type === 'turnL' || sec.type === 'turnR').toBe(true);
          // Straight ahead of the approach (in view for the run-up)...
          track.path.sample(l.s - 30, f);
          const ahead = at.clone().sub(f.pos).setY(0);
          const fwd = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
          expect(ahead.angleTo(fwd)).toBeLessThan(0.3);
          // ...and never near the route the runner takes past it.
          for (let q = l.s - 30; q < Math.min(l.s + 250, track.path.length); q += 2) {
            track.path.sample(q, f);
            expect(Math.hypot(f.pos.x - at.x, f.pos.z - at.z)).toBeGreaterThan(25);
          }
        }
      }
    }
    expect(staged).toBeGreaterThan(5);
  });

  it('never routes a later stretch of the way through scenery already built (natural and forced corners)', async () => {
    // Stand-in geometry so the scenery has real footprints: a 6 m block (radius ≈4 m) for the big far pieces.
    const kit = fakeKit();
    const block = new THREE.BoxGeometry(6, 4, 6);
    for (const n of ['temple_0', 'temple_1', 'tower_0', 'tower_1', 'rock_big_0', 'rock_big_1', 'rock_big_2', 'jungle_bank_0', 'jungle_bank_1', 'jungle_bank_2', 'arch_1', 'facade_0', 'facade_1', 'guardian_0', 'guardian_1'])
      kit.geo.set(n, block);
    const track = new Track(kit);
    await track.prepare({ foliage: 1, scenery: 1 });
    const f = { pos: new THREE.Vector3(), yaw: 0 };
    let checked = 0;
    for (let w = 0; w < 8; w++) {
      track.reset(`clearance-${w}`);
      // Every other world forces corners right after the sections that end in a vista or scenery.
      if (w % 2) for (let k = 0; k < 6; k++) track.forceNext.push('corridor', 'corridor', 'corridor', k % 2 ? 'turnR' : 'turnL');
      let built = 0;
      for (let s = 0; s < 2500; s += 20) {
        track.update(s, 0.5);
        // The route built in this update keeps clear of the scenery of every section still standing
        // before it (despawned scenery is gone and cannot be run through). On the same heading,
        // scenery stands beside the way by design: only stretches after a corner are checked.
        for (const sec of track.sections) {
          const s1 = sec.s0 + sec.len;
          const yaw = sec.seg.yaw0 + sec.seg.turn;
          for (let q = Math.max(s1 + 1, built); q < track.path.length; q += 4) {
            track.path.sample(q, f);
            if (Math.abs(Math.sin(f.yaw - yaw)) < 0.3) continue;
            for (const [x, z, r] of sec.solid) {
              if (r === 0) continue;
              checked++;
              expect(Math.hypot(f.pos.x - x, f.pos.z - z), `route at ${q.toFixed(0)} vs scenery`).toBeGreaterThan(r + 4);
            }
          }
        }
        built = track.path.length;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  }, 300000);

  it('takes real 90° corners that alternate, stand apart and never double back', async () => {
    const track = new Track(fakeKit());
    await track.prepare({ foliage: 0.4, scenery: 0.4 });
    track.reset('corners');
    const types: string[] = [];
    let s = 0;
    let seen = 0;
    while (s < 6000) {
      s += 50;
      track.update(s, 0.6);
      for (const sec of track.sections) if (sec.s0 >= seen) ((seen = sec.s0 + 1e-6), types.push(sec.type));
    }
    let heading = 0;
    let since = 99;
    let corners = 0;
    for (const t of types) {
      if (t === 'turnL' || t === 'turnR') {
        heading += t === 'turnL' ? 1 : -1;
        expect(Math.abs(heading)).toBeLessThanOrEqual(1);
        expect(since).toBeGreaterThanOrEqual(3);
        since = 0;
        corners++;
      } else since++;
    }
    expect(corners).toBeGreaterThan(5);
    // No cliffs or tall walls next to a corner (their sides reach past the section ends).
    const BIG = ['gorge', 'cliff', 'ledge', 'tall', 'tunnel', 'colossi', 'gate'];
    types.forEach((t, i) => {
      if (t !== 'turnL' && t !== 'turnR') return;
      expect(BIG).not.toContain(types[i - 1]);
      if (i + 1 < types.length) expect(BIG).not.toContain(types[i + 1]);
    });
    // Every corner is a quarter turn, whichever way.
    for (const sec of track.sections) {
      if (sec.type === 'turnL') expect(sec.seg.turn).toBeCloseTo(Math.PI / 2, 6);
      if (sec.type === 'turnR') expect(sec.seg.turn).toBeCloseTo(-Math.PI / 2, 6);
    }
  });
});
