// shoot.mjs step script: world5/shoot-sec.mjs, then the empty-sides measure on the same frame.
// Rays through a grid over the lower two thirds of the left and right thirds of the frame: a ray is
// "empty" if past the water it meets nothing within 40 m (open water to the horizon, or sky). Prints
// SIDES {left, right} (fraction empty) and EMPTY when either side is over 40 %.
import sec from '../world5/shoot-sec.mjs';
export default async function (page, out) {
  await sec(page, out);
  const r = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /deps\/three(\.module)?\.js/.test(n));
    const THREE = await import(url);
    const g = window.__game;
    const cam = g.rig.camera;
    cam.updateMatrixWorld();
    const rc = new THREE.Raycaster();
    rc.far = 40;
    const targets = [];
    g.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const n = o.name || '';
      if (/^water|foam|falls|sunDisc|sky|mote|rain|debris/i.test(n)) return;
      if (o.material && o.material.transparent && /foam|spray|mist/.test(o.material.name || '')) return;
      targets.push(o);
    });
    const res = {};
    for (const [side, x0, x1] of [['left', 0.0, 1 / 3], ['right', 2 / 3, 1.0]]) {
      let empty = 0, n = 0;
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          const u = x0 + (x1 - x0) * (i + 0.5) / 6;
          const v = 1 / 3 + (2 / 3) * (j + 0.5) / 6; // lower two thirds (v from the top)
          rc.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), cam);
          const hit = rc.intersectObjects(targets, false)[0];
          n++;
          if (!hit) empty++;
        }
      }
      res[side] = +(empty / n).toFixed(2);
    }
    return res;
  });
  console.log('SIDES', JSON.stringify(r), r.left > 0.4 || r.right > 0.4 ? 'EMPTY' : 'ok');
}
