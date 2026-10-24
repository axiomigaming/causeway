// shoot.mjs step script: world5/shoot-sec.mjs, then the frame's cost broken down by mesh name
// (triangles of meshes inside the camera frustum, per name), largest first.
import sec from '../world5/shoot-sec.mjs';
export default async function (page, out) {
  await sec(page, out);
  const r = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /deps\/three(\.module)?\.js/.test(n));
    const THREE = await import(url);
    const g = window.__game;
    const cam = g.rig.camera;
    cam.updateMatrixWorld();
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const by = {};
    const sph = new THREE.Sphere();
    g.scene.updateMatrixWorld(true);
    g.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      sph.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld);
      if (o.frustumCulled !== false && !fr.intersectsSphere(sph)) return;
      const n = (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      const k = o.name || o.parent?.name || 'mesh';
      by[k] = by[k] || [0, 0];
      by[k][0] += n;
      by[k][1] += 1;
    });
    return Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([k, v]) => `${k}:${Math.round(v[0] / 1000)}k/${v[1]}`).join(' ');
  });
  console.log('COST', r);
}
