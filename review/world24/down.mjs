// shoot.mjs step script (world round 24, debugging): proof.mjs's setup, then rays straight down at
// section-local points ?at=x,z;x,z of the section under the runner: every mesh each ray meets, top down.
import proof from './proof.mjs';
export default async function (page, out) {
  await proof(page, out);
  const r = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /three(\.module)?(\.min)?\.js|deps\/three/.test(n));
    const THREE = await import(url);
    const qs = new URLSearchParams(location.search);
    const g = window.__game;
    const sec = g.track.sectionAt(g.debugState.s);
    g.scene.updateMatrixWorld(true);
    const out = [];
    const rc = new THREE.Raycaster();
    for (const [x, z] of qs.get('at').split(';').map((p) => p.split(',').map(Number))) {
      const o = new THREE.Vector3(x, 6, z).applyMatrix4(sec.root.matrixWorld);
      rc.set(o, new THREE.Vector3(0, -1, 0));
      const hits = rc.intersectObject(g.scene, true).filter((h) => h.object.isMesh && h.object.visible).slice(0, 4);
      out.push(`(${x},${z}): ` + hits.map((h) => `${h.object.parent?.name ?? ''}/${h.object.name}@y${(h.point.y - sec.root.matrixWorld.elements[13]).toFixed(2)}`).join(' > '));
    }
    return { mirror: sec.mirror, lower: sec.layout.features?.lower, s0: sec.s0, out };
  });
  console.log('DOWN', JSON.stringify(r));
}
