// shoot.mjs step script (world round 27): at each run time in ?ts=, three views — the sky and the far
// distance (H: the lens at the runner, 1.7 m up, looking down the way and 6 degrees up), the water's edge
// (E: the lens out over the water 3.6 m to the side, 0.9 m above it, looking at where the way's stone
// meets the water a few metres ahead), and the near foliage (F: the lens at the path's edge, 1.1 m up,
// looking down and out at the dressing within 3 m). UI hidden. Writes <out>-t<T>-H/E/F.png.
//   ?qa&w=<seed>&q=<tier>[&ts=4,30][&side=1]
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
  const ts = (q.get('ts') ?? '4,30').split(',').map(Number);
  const side = Number(q.get('side') ?? 1);
  for (const t of ts) {
    await page.evaluate((t) => {
      const g = window.__game;
      g.debugStep(t - window.__runT);
      window.__runT = t;
    }, t);
    for (const view of ['H', 'E', 'F']) {
      const r = await page.evaluate(({ view, side }) => {
        const g = window.__game;
        const s = g.debugState.s;
        const f = { pos: g.rig.camera.position.clone(), yaw: 0 };
        g.track.path.sample(s + 2, f);
        const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
        const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
        const cam = g.rig.camera;
        const WL = -2.2;
        const place = () => {
          if (view === 'H') {
            cam.position.set(f.pos.x, f.pos.y + 1.7, f.pos.z);
            cam.lookAt(f.pos.x + fx * 100, f.pos.y + 1.7 + 100 * Math.tan(0.105), f.pos.z + fz * 100);
          } else if (view === 'E') {
            cam.position.set(f.pos.x + rx * side * 3.6 - fx * 1.5, WL + 0.9, f.pos.z + rz * side * 3.6 - fz * 1.5);
            cam.lookAt(f.pos.x + rx * side * 2.4 + fx * 4, WL + 0.1, f.pos.z + rz * side * 2.4 + fz * 4);
          } else {
            cam.position.set(f.pos.x + rx * side * 1.6, f.pos.y + 1.1, f.pos.z + rz * side * 1.6);
            cam.lookAt(f.pos.x + rx * side * 3.6 + fx * 2.5, f.pos.y - 0.2, f.pos.z + rz * side * 3.6 + fz * 2.5);
          }
          cam.updateMatrixWorld();
        };
        place();
        g.debugStep(1 / 30);
        place();
        g.post.render(0);
        const sec = g.track.sectionAt(s + 2);
        return { view, s: +s.toFixed(1), sec: sec?.type };
      }, { view, side });
      await page.screenshot({ path: `${out}-t${t}-${view}.png`, timeout: 900000 });
      console.log('STATE', JSON.stringify({ t, ...r }));
    }
  }
}
