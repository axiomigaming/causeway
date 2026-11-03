// shoot.mjs step script (world round 24): near-side dressing close-ups. One seeded run (as run3.mjs),
// stopped at each run time in ?ts=; at each, the lens stands at the path's edge 1.5 m up and looks out
// and ahead over the dressing within ~5 m of the path, on the left and on the right.
// Writes <out>-t<T>-L.png / -R.png and prints STATE (section, what the frame's centre shows).
//   ?qa&w=<seed>&q=<tier>[&ts=8,30]
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
  const ts = (new URL(page.url()).searchParams.get('ts') ?? '8,30').split(',').map(Number);
  for (const t of ts) {
    await page.evaluate((t) => {
      const g = window.__game;
      g.debugStep(t - window.__runT);
      window.__runT = t;
    }, t);
    for (const side of [-1, 1]) {
      const r = await page.evaluate((side) => {
        const g = window.__game;
        const s = g.debugState.s;
        const f = { pos: g.rig.camera.position.clone(), yaw: 0 };
        g.track.path.sample(s + 3, f);
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
        const sec = g.track.sectionAt(s + 3);
        const pick = g.debugPick([[0.5, 0.5], [0.3, 0.7], [0.7, 0.7]]);
        return { side, s: +s.toFixed(1), sec: sec?.type, pick: pick.map((p) => `${p.name}@${p.dist}`).join(' ') };
      }, side);
      await page.screenshot({ path: `${out}-t${t}-${side < 0 ? 'L' : 'R'}.png`, timeout: 900000 });
      console.log('STATE', JSON.stringify({ t, ...r }));
    }
  }
}
