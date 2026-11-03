// shoot.mjs step script (world round 25): perf-run's 60 s run (seed=perf), every 2 s one frame drawn;
// for frames over ?over= draw calls (default 80), the meshes in the camera frustum grouped by kind
// (name up to '|' or ':', with the zone), largest count first. Also every world's ?w=.
export default async function (page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  const r = await page.evaluate(async () => {
    const qs = new URLSearchParams(location.search);
    const over = +(qs.get('over') ?? 80);
    const g = window.__game;
    g.autoQuality = false;
    g.paused = true;
    const p = g.toSetup();
    g.debugStep(1.2);
    await p;
    const start = g.virtualNow + 1100;
    g.elapsed = () => g.virtualNow - start;
    g.lead();
    g.debugStep(1.2);
    const cam = g.rig.camera;
    const C = cam.constructor; // (three's classes off live objects: no import)
    const out = [];
    let max = 0;
    for (let k = 0; k < 30; k++) {
      g.debugStep(2);
      const calls = g.renderer.info.render.calls;
      max = Math.max(max, calls);
      if (calls <= over) continue;
      const by = {};
      cam.updateMatrixWorld();
      const proj = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
      const e = proj.elements;
      g.scene.traverseVisible((o) => {
        if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
        const geo = o.geometry;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        if (o.frustumCulled !== false && geo.boundingSphere) {
          const c = geo.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
          const rad = geo.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
          // clip-space test of the sphere centre, padded by its radius (rough frustum check)
          const x = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12], y = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13], w = e[3] * c.x + e[7] * c.y + e[11] * c.z + e[15];
          const pad = rad * 2;
          if (w < -rad || Math.abs(x) > w + pad || Math.abs(y) > w + pad) return;
        }
        const n = (o.name || o.parent?.name || o.type).replace(/:.*$/, '');
        by[n] = (by[n] ?? 0) + (Array.isArray(o.material) ? o.material.length : 1);
      });
      const sec = g.track.sectionAt(g.debugState.s);
      out.push({ t: (k + 1) * 2, calls, sec: sec?.type, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([a, b]) => `${a}:${b}`).join(' ') });
    }
    void C;
    return { max, out };
  });
  console.log('CALLS max', r.max);
  for (const o of r.out) console.log('FRAME', JSON.stringify(o));
}
