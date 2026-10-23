// shoot.mjs step script: world5/shoot-sec.mjs, then reports the lily meshes' materials and world heights.
import sec from '../world5/shoot-sec.mjs';
export default async function (page, out) {
  await sec(page, out);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const res = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mn = Array.isArray(o.material) ? o.material[0]?.name : o.material?.name;
      if (!/lily|flora/.test(o.name + mn)) return;
      const p = o.geometry.getAttribute('position');
      const v = o.position.clone();
      let lo = 1e9, hi = -1e9;
      const ys = [];
      for (let i = 0; i < Math.min(p.count, 4000); i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
        if (i % 97 === 0) ys.push(+v.y.toFixed(3));
      }
      res.push(`${o.name} mat=${mn} n=${p.count} y=[${lo.toFixed(3)},${hi.toFixed(3)}] sample=${ys.slice(0, 12).join(',')}`);
    });
    return res.slice(0, 12);
  });
  for (const l of r) console.log('LILY', l);
}
