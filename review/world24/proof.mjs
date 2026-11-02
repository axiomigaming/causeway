// shoot.mjs step script (world round 24): a controlled before/after still. The world ?w=, and from the
// end of what is built at the start, the section types ?sec=a,b,c forced (track.forceNext, in every
// build); the run as run3.mjs for ?t= s, then the chase still (<out>.png) and, with ?side=-1|1, the
// near-side close-up as near.mjs (<out>-side.png). ?look= pins the light.
export default async function (page, out) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  const qs = new URL(page.url()).searchParams;
  const r = await page.evaluate(async () => {
    const qs = new URLSearchParams(location.search);
    const g = window.__game;
    g.autoQuality = false;
    g.paused = true;
    document.querySelector('#app')?.style.setProperty('visibility', 'hidden');
    const p = g.toSetup();
    g.debugStep(1.2);
    await p;
    if (qs.get('look') && g.track.forceLook) g.track.forceLook(qs.get('look'));
    if (qs.get('sec')) g.track.forceNext = qs.get('sec').split(',');
    const start = g.virtualNow + 1100;
    g.elapsed = () => g.virtualNow - start;
    g.lead();
    g.debugStep(+(qs.get('t') ?? 20) + 1.1);
    // ?obs=<kind>: a set piece placed ahead now, and ?obsT= s run toward it.
    if (qs.get('obs')) {
      g.debugObstacle(qs.get('obs'));
      g.debugStep(+(qs.get('obsT') ?? 1.5));
    }
    const sec = g.track.sectionAt(g.debugState.s);
    return { s: +g.debugState.s.toFixed(1), sec: sec?.type, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  });
  await page.screenshot({ path: `${out}.png`, timeout: 900000 });
  console.log('STATE', JSON.stringify(r));
  if (qs.get('side')) {
    const r2 = await page.evaluate(() => {
      const qs = new URLSearchParams(location.search);
      const side = +qs.get('side');
      const ahead = +(qs.get('ahead') ?? 3);
      const g = window.__game;
      const s = g.debugState.s;
      const f = { pos: g.rig.camera.position.clone(), yaw: 0 };
      g.track.path.sample(s + ahead, f);
      const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
      const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
      const cam = g.rig.camera;
      const place = () => {
        cam.position.set(f.pos.x + rx * side * 1.2, f.pos.y + 1.5, f.pos.z + rz * side * 1.2);
        cam.lookAt(f.pos.x + rx * side * 5 + fx * 4.5, f.pos.y + 0.2, f.pos.z + rz * side * 5 + fz * 4.5);
        cam.updateMatrixWorld();
      };
      place();
      g.debugStep(1 / 30);
      place();
      g.post.render(0);
      const pts = qs.get('pts') ? qs.get('pts').split(';').map((p) => p.split(',').map(Number)) : [];
      const sec = g.track.sectionAt(s + ahead);
      return { side, sec: sec?.type, mirror: sec?.mirror, lower: sec?.layout.features?.lower, picks: pts.length ? g.debugPick(pts).map((p) => `${p.name}:${p.mat}@${p.dist}`) : undefined };
    });
    await page.screenshot({ path: `${out}-side.png`, timeout: 900000 });
    console.log('SIDE', JSON.stringify(r2));
  }
}
