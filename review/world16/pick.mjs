// shoot.mjs step script: like world5/shoot-sec.mjs, then names the meshes under pixels ?px=x,y;x,y
// (raycast through the game camera; three is taken from the dev server's own deps module).
import sec from '../world5/shoot-sec.mjs';
export default async function (page, out) {
  await sec(page, out);
  const r = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /deps\/three(\.module)?\.js/.test(n));
    const THREE = await import(url);
    const g = window.__game;
    const cam = g.rig.camera;
    const W = innerWidth, H = innerHeight;
    const res = [];
    const rc = new THREE.Raycaster();
    for (const p of new URLSearchParams(location.search).get('px').split(';')) {
      const [x, y] = p.split(',').map(Number);
      rc.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), cam);
      const hits = rc.intersectObjects(g.scene.children, true).filter((h) => h.object.visible && !(new URLSearchParams(location.search).has('skipleaf') && /leaf|grit|glyph/.test(h.object.name))).slice(0, 5);
      res.push(`${p}: ` + hits.map((h) => {
        const o = h.object;
        const n = o.name || o.parent?.name || o.type;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        return `${n} [${m?.name || m?.type}] d=${h.distance.toFixed(1)} inst=${h.instanceId ?? '-'}`;
      }).join(' | '));
    }
    return res;
  });
  for (const l of r) console.log('PICK', l);
}
