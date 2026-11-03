// Coverage of the floor pieces' upward faces in the real kit: a 0.5 m grid over the piece's bounds,
// each cell the highest upward-facing triangle centre's y found in it (or '.').
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const [src, ...names] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
for (const node of doc.getRoot().listNodes()) {
  if (!names.includes(node.getName())) continue;
  const prim = node.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
  const t = node.getTranslation(), s = node.getScale();
  const cells = new Map();
  const P = [0, 0, 0], Q = [0, 0, 0], R = [0, 0, 0];
  let minY = 1e9, maxY = -1e9;
  for (let i = 0; i < idx.getCount(); i += 3) {
    pos.getElement(idx.getScalar(i), P); pos.getElement(idx.getScalar(i + 1), Q); pos.getElement(idx.getScalar(i + 2), R);
    const e1 = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]], e2 = [R[0] - P[0], R[1] - P[1], R[2] - P[2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const len = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]);
    const cx = (P[0] + Q[0] + R[0]) / 3, cy = (P[1] + Q[1] + R[1]) / 3, cz = (P[2] + Q[2] + R[2]) / 3;
    minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
    if (ny / len < 0.8) continue;
    const k = `${Math.floor(cx / 0.5)},${Math.floor(cz / 0.5)}`;
    cells.set(k, Math.max(cells.get(k) ?? -1e9, cy));
  }
  console.log(node.getName(), 'translation', t.map((v) => v.toFixed(2)).join(','), 'scale', s.join(','), 'y', minY.toFixed(2), maxY.toFixed(2));
  for (let zc = 1; zc >= -9; zc--) {
    let row = '';
    for (let xc = -5; xc < 5; xc++) {
      const v = cells.get(`${xc},${zc}`);
      row += v === undefined ? '   . ' : (v >= 0 ? ' ' : '') + v.toFixed(2);
    }
    console.log(String(zc * 0.5).padStart(5), row);
  }
}
