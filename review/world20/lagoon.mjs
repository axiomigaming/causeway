// shoot.mjs step script: world5/shoot-sec.mjs, then the lens over the water beside the causeway,
// looking down at the footing, the shallows and the lily pads (as the FX water film's lagoon pan).
//   ?side=1|-1 &ahead=<m> &h=<m above the path>
import sec from '../world5/shoot-sec.mjs';
export default async function (page, out) {
  await sec(page, `${out}.run`);
  const r = await page.evaluate(() => {
    const qs = new URLSearchParams(location.search);
    const g = window.__game;
    const side = +(qs.get('side') ?? 1);
    const ahead = +(qs.get('ahead') ?? 10);
    const h = +(qs.get('h') ?? 2.6);
    const s = g.debugState.s;
    const f = { pos: g.rig.camera.position.clone(), yaw: 0 };
    g.track.path.sample(s + ahead, f);
    const fwd = { x: -Math.sin(f.yaw), z: -Math.cos(f.yaw) };
    const right = { x: Math.cos(f.yaw), z: -Math.sin(f.yaw) };
    const cam = g.rig.camera;
    // Over the path's edge, looking out and ahead over the water.
    cam.position.set(f.pos.x + right.x * side * 1.6, f.pos.y + h, f.pos.z + right.z * side * 1.6);
    cam.lookAt(f.pos.x + right.x * side * 5 + fwd.x * 6, f.pos.y - 2.2, f.pos.z + right.z * side * 5 + fwd.z * 6);
    cam.updateMatrixWorld();
    g.debugStep(0.05);
    cam.position.set(f.pos.x + right.x * side * 1.6, f.pos.y + h, f.pos.z + right.z * side * 1.6);
    cam.lookAt(f.pos.x + right.x * side * 5 + fwd.x * 6, f.pos.y - 2.2, f.pos.z + right.z * side * 5 + fwd.z * 6);
    cam.updateMatrixWorld();
    g.post.render(0);
    return { s, at: [f.pos.x, f.pos.z] };
  });
  await page.screenshot({ path: `${out}.png`, timeout: 900000 });
  console.log('STATE', JSON.stringify(r));
}
