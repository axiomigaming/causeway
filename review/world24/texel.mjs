// Texel density of every kit piece: atlas texels per metre (sqrt of UV area x atlas px^2 over surface
// area), per material, as shipped (high set: atlases capped at 2048 px).
//   node review/world24/texel.mjs public/assets/kit.high.glb [filter]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [src, filter = ''] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const texSize = new Map();
for (const t of doc.getRoot().listTextures()) {
  const m = await sharp(Buffer.from(t.getImage())).metadata();
  texSize.set(t, m.width);
}
const rows = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const s = node.getScale();
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const tex = mat?.getBaseColorTexture();
    if (!tex) continue;
    const px = texSize.get(tex);
    const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices();
    if (!pos || !uv) continue;
    const P = [0, 0, 0], Q = [0, 0, 0], R = [0, 0, 0], a = [0, 0], b = [0, 0], c = [0, 0];
    let wa = 0, ua = 0;
    const n = idx ? idx.getCount() : pos.getCount();
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getScalar(i) : i, i1 = idx ? idx.getScalar(i + 1) : i + 1, i2 = idx ? idx.getScalar(i + 2) : i + 2;
      pos.getElement(i0, P); pos.getElement(i1, Q); pos.getElement(i2, R);
      for (const V of [P, Q, R]) { V[0] *= s[0]; V[1] *= s[1]; V[2] *= s[2]; }
      const e1 = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]], e2 = [R[0] - P[0], R[1] - P[1], R[2] - P[2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      wa += Math.hypot(cx, cy, cz) / 2;
      uv.getElement(i0, a); uv.getElement(i1, b); uv.getElement(i2, c);
      ua += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    if (wa <= 0) continue;
    rows.push({ name: node.getName(), mat: mat.getName(), px, area: wa, tpm: Math.sqrt((ua * px * px) / wa) });
  }
}
rows.sort((x, y) => x.tpm - y.tpm);
for (const r of rows) if (!filter || new RegExp(filter).test(r.name + ' ' + r.mat)) console.log(`${r.tpm.toFixed(0).padStart(5)} tex/m  ${r.mat.padEnd(14)} ${r.name.padEnd(28)} ${r.area.toFixed(1)} m2  (${r.px}px)`);
