// reveal.mjs, then names the meshes under ?px=x,y;x,y (as world16/pick.mjs).
import reveal from '../world13/reveal.mjs';
export default async function (page, out) {
  await reveal(page, out);
  const r = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /deps\/three(\.module)?\.js/.test(n));
    const THREE = await import(url);
    const g = window.__game;
    g.runner.root.visible = true;
    for (const l of g.track.landmarks.list) l.main.visible = true;
    const cam = g.rig.camera;
    const res = [];
    const rc = new THREE.Raycaster();
    for (const p of new URLSearchParams(location.search).get('px').split(';')) {
      const [x, y] = p.split(',').map(Number);
      rc.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), cam);
      const hits = rc.intersectObjects(g.scene.children, true).filter((h) => h.object.visible).slice(0, 4);
      res.push(`${p}: ` + hits.map((h) => `${h.object.name || h.object.parent?.name} d=${h.distance.toFixed(1)} parent=${h.object.parent?.name ?? ''}`).join(' | '));
    }
    return res;
  });
  for (const l of r) console.log('PICK', l);
}
