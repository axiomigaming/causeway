// shoot.mjs step script (world round 26): what the way stands on. One seeded run (as near.mjs), stopped
// at each run time in ?ts=; at each: the chase camera as played (C), then the lens out on the water
// 6.5 m to the side, 0.7 m over the surface, looking at the way's edge 4 m ahead (S), then low and ahead
// on the other side, looking back along the edge (A). UI hidden.
// Writes <out>-t<T>-C.png / -S.png / -A.png and prints STATE (section, what the frame's centre shows).
//   ?qa&w=<seed>&q=<tier>[&ts=2,14][&side=1]
export default async function (page, out) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  await page.evaluate(async () => {
    const g = window.__game;
    g.autoQuality = false;
    g.paused = true;
    document.querySelector('#app')?.style.setProperty('visibility', 'hidden');
    const p = g.toSetup();
    g.debugStep(1.2);
    await p;
    const start = g.virtualNow + 1100;
    g.elapsed = () => g.virtualNow - start;
    g.lead();
    window.__runT = -1.1;
  });
  const q = new URL(page.url()).searchParams;
  const ts = (q.get('ts') ?? '2,14').split(',').map(Number);
  const side = Number(q.get('side') ?? 1);
  for (const t of ts) {
    await page.evaluate((t) => {
      const g = window.__game;
      g.debugStep(t - window.__runT);
      window.__runT = t;
      g.post.render(0);
    }, t);
    await page.screenshot({ path: `${out}-t${t}-C.png`, timeout: 900000 });
    for (const view of ['S', 'A']) {
      const r = await page.evaluate(({ view, side }) => {
        const g = window.__game;
        const s = g.debugState.s;
        const f = { pos: g.rig.camera.position.clone(), yaw: 0 };
        g.track.path.sample(s + 4, f);
        const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
        const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
        const cam = g.rig.camera;
        const WL = -2.2;
        const place = () => {
          if (view === 'S') {
            cam.position.set(f.pos.x + rx * side * 6.5, WL + 0.7, f.pos.z + rz * side * 6.5);
            cam.lookAt(f.pos.x + rx * side * 1.5, f.pos.y - 0.9, f.pos.z + rz * side * 1.5);
          } else {
            cam.position.set(f.pos.x - rx * side * 4.5 + fx * 7, WL + 1.0, f.pos.z - rz * side * 4.5 + fz * 7);
            cam.lookAt(f.pos.x - rx * side * 2.0 - fx * 1, f.pos.y - 0.8, f.pos.z - rz * side * 2.0 - fz * 1);
          }
          cam.updateMatrixWorld();
        };
        place();
        g.debugStep(1 / 30);
        place();
        g.post.render(0);
        const sec = g.track.sectionAt(s + 4);
        const pick = g.debugPick([[0.5, 0.5], [0.3, 0.6], [0.7, 0.6]]);
        return { view, s: +s.toFixed(1), sec: sec?.type, pick: pick.map((p) => `${p.name}@${p.dist}`).join(' ') };
      }, { view, side });
      await page.screenshot({ path: `${out}-t${t}-${view}.png`, timeout: 900000 });
      console.log('STATE', JSON.stringify({ t, ...r }));
    }
  }
}
