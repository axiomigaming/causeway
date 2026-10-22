// shoot.mjs step script: the camera turned round at the start of a world, looking back down the
// causeway behind the start line (what a result shot at a low multiplier sees).
//   ?w=<seed>&cam=x,y,z&at=x,y,z   (start-local: +z is behind the start)
export default async function (page, out) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  const r = await page.evaluate(() => {
    const qs = new URLSearchParams(location.search);
    const g = window.__game;
    document.querySelector('#app')?.style.setProperty('visibility', 'hidden');
    const w = qs.get('w');
    const now = Date.now, rnd = Math.random;
    if (w) { Date.now = () => +w; Math.random = () => 0.5; }
    g.newWorld('setup');
    Date.now = now;
    Math.random = rnd;
    if (qs.get('look') && g.track.forceLook) g.track.forceLook(qs.get('look'));
    g.debugStep(0.5);
    g.debugStep(0.1);
    const cam = g.rig.camera;
    const [cx, cy, cz] = (qs.get('cam') ?? '2.5,3,-6').split(',').map(Number);
    const [ax, ay, az] = (qs.get('at') ?? '0,-1,20').split(',').map(Number);
    cam.position.set(cx, cy, cz);
    cam.lookAt(ax, ay, az);
    cam.updateMatrixWorld();
    g.post.render(0);
    return { state: g.debugState };
  });
  await page.screenshot({ path: `${out}.png`, timeout: 900000 });
  console.log('STATE', JSON.stringify(r));
}
