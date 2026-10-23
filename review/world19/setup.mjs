// shoot.mjs step script: the setup stage (the world as the round-setup screen frames it), UI hidden.
//   ?qa&w=<seed>[&look=<name>]
export default async function (page, out) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  const r = await page.evaluate(() => {
    const qs = new URLSearchParams(location.search);
    const g = window.__game;
    document.querySelector('#app')?.style.setProperty('visibility', 'hidden');
    g.newWorld('setup');
    if (qs.get('look') && g.track.forceLook) g.track.forceLook(qs.get('look'));
    for (let i = 0; i < 8; i++) g.debugStep(0.25);
    return { state: g.debugState, look: g.track.look?.name, style: g.track.style?.name, theme: g.track.theme };
  });
  await page.screenshot({ path: `${out}.png`, timeout: 900000 });
  console.log('STATE', JSON.stringify(r));
}
