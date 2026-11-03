// shoot.mjs step script (world round 24): the run as run3.mjs to ?t=, then what lies under screen
// points ?pts=x,y;x,y (0..1 from the top left): mesh, material, distance, and the hit's world normal.
export default async function (page, out) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  const r = await page.evaluate(async () => {
    const qs = new URLSearchParams(location.search);
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
    g.debugStep(+(qs.get('t') ?? 3) + 1.1);
    const pts = (qs.get('pts') ?? '0.5,0.5').split(';').map((s) => s.split(',').map(Number));
    const sec = g.track.sectionAt(g.debugState.s);
    const near = g.track.sections.filter((x) => x.s0 < g.debugState.s + 60 && x.s0 + x.len > g.debugState.s - 10).map((x) => `${x.type}@${Math.round(x.s0)}${x.mirror ? 'm' : ''}`);
    return { s: g.debugState.s, sec: sec?.type, near, picks: g.debugPick(pts) };
  });
  await page.screenshot({ path: `${out}.png`, timeout: 900000 });
  console.log('PICK', JSON.stringify(r));
}
