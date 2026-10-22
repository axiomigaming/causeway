// shoot.mjs step script: a close look at a moss cushion. Sets up the world as world5/shoot-sec.mjs,
// finds the highest vertex of the section meshes named ?mesh=<prefix> (moss: 'moss|', before round 17
// 'flora|'), and puts the camera ?d m from it, looking down at it.
import sec from '../world5/shoot-sec.mjs';
export default async function (page, out) {
  await sec(page, `${out}.setup`);
  const r = await page.evaluate(() => {
    const qs = new URLSearchParams(location.search);
    const g = window.__game;
    const prefix = qs.get('mesh') ?? 'moss|';
    const d = +(qs.get('d') ?? 1.4);
    let best = null;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith(prefix) || !o.visible) return;
      const pos = o.geometry.getAttribute('position');
      const v = o.position.clone();
      for (let i = 0; i < pos.count; i += 7) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        // Near the runner: within 25 m ahead of the camera.
        const dz = v.distanceTo(g.rig.camera.position);
        if (dz > 25) continue;
        if (!best || v.y > best.y) best = v.clone();
      }
    });
    if (!best) return { error: 'no ' + prefix };
    const cam = g.rig.camera;
    cam.position.set(best.x + d * 0.7, best.y + d * 0.55, best.z + d * 0.7);
    cam.lookAt(best.x, best.y - 0.15, best.z);
    cam.updateMatrixWorld();
    g.post.render(0);
    return { at: best.toArray().map((x) => +x.toFixed(2)) };
  });
  await page.screenshot({ path: `${out}.png`, timeout: 900000 });
  console.log('STATE', JSON.stringify(r));
}
