import * as THREE from 'three';
import { expect, it } from 'vitest';
import { Debris } from '../src/world/debris';
import { boundsKit } from './kitBounds';

/**
 * World round 26 (QA: in the rockfall's end shot a large rock came to rest through the fallen runner's
 * head and shoulders): a rock dropped straight onto a keep-out volume (his body) ends up outside it.
 */
it('keeps falling pieces out of the fallen runner', () => {
  const d = new Debris(boundsKit());
  const body = new THREE.Vector3(0, 0.3, 0);
  d.keepOut.push({ c: body, r: 0.35 });
  const mesh = d.spawn('rock_mid_1', new THREE.Matrix4().compose(new THREE.Vector3(0.05, 4, 0), new THREE.Quaternion(), new THREE.Vector3(0.42, 0.42, 0.42)), new THREE.Vector3(0, -6, 0), new THREE.Vector3(0.5, 0, 0.3), () => 0);
  expect(mesh).not.toBeNull();
  let closest = Infinity;
  for (let k = 0; k < 6 * 60; k++) {
    d.update(1 / 60);
    mesh!.updateMatrixWorld();
    const c = new THREE.Box3().setFromObject(mesh!).getCenter(new THREE.Vector3());
    if (k > 30) closest = Math.min(closest, c.distanceTo(body));
  }
  // Its centre never comes within the body's radius (the rock is ~0.6 m across at this scale).
  expect(closest).toBeGreaterThan(0.35);
});
