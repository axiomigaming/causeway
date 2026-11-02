// shoot.mjs step script (world round 24): one seeded run, real chase camera, UI hidden, stills at
// run times ?ts=3,25,55 (start ~1.2x, middle ~5x, late ~30x). Writes <out>-t<T>.png and prints
// STATE per still (section under the runner, draw calls, triangles, multiplier).
//   ?qa&w=<seed>&q=<tier>[&ts=3,25,55]
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
  const ts = (new URL(page.url()).searchParams.get('ts') ?? '3,25,55').split(',').map(Number);
  for (const t of ts) {
    const r = await page.evaluate((t) => {
      const g = window.__game;
      g.debugStep(t - window.__runT);
      window.__runT = t;
      const sec = g.track.sectionAt(g.debugState.s);
      return { t, s: +g.debugState.s.toFixed(1), sec: sec?.type, var: sec?.variant?.name ?? sec?.variant?.id, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, mult: +g.live.mult.toFixed(2), look: g.track.look?.name, style: g.track.style?.name };
    }, t);
    await page.screenshot({ path: `${out}-t${t}.png`, timeout: 900000 });
    console.log('STATE', JSON.stringify(r));
  }
}
