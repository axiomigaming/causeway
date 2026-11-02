// Splice re-baked groups from a fresh kit export into the shipped kit.glb: for every listed material,
// its atlases (colour, normal, ORM) and the meshes that use it (positions, normals, UVs, indices, by
// node name) are taken from the fresh export; every other piece and atlas is left byte for byte as it
// was (a full export re-encodes every atlas, and re-packing a reused group can move its UVs).
//   node tools/kit-splice.mjs <shipped kit.glb> <fresh kit.glb> <out.glb> M_rock,M_cliff,...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const [oldPath, newPath, outPath, matList] = process.argv.slice(2);
const mats = new Set(matList.split(','));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const A = await io.read(oldPath);
const B = await io.read(newPath);
const matsOf = (doc) => new Map(doc.getRoot().listMaterials().map((m) => [m.getName(), m]));
const ma = matsOf(A), mb = matsOf(B);
const slots = ['BaseColorTexture', 'NormalTexture', 'MetallicRoughnessTexture', 'OcclusionTexture', 'EmissiveTexture'];
for (const name of mats) {
  const a = ma.get(name), b = mb.get(name);
  if (!a || !b) throw new Error(`material ${name} missing (${!a ? 'shipped' : 'fresh'})`);
  for (const s of slots) {
    const ta = a[`get${s}`](), tb = b[`get${s}`]();
    if (!ta && !tb) continue;
    if (!ta || !tb) throw new Error(`${name}: ${s} present in one kit only`);
    ta.setImage(tb.getImage()).setMimeType(tb.getMimeType());
    console.log(`${name} ${s}: ${tb.getImage().byteLength} bytes`);
  }
}
const nodesB = new Map(B.getRoot().listNodes().map((n) => [n.getName(), n]));
const copy = (acc) => {
  const arr = acc.getArray();
  return A.createAccessor().setType(acc.getType()).setArray(arr.slice()).setNormalized(acc.getNormalized()).setBuffer(A.getRoot().listBuffers()[0]);
};
let n = 0;
for (const node of A.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const prims = mesh.listPrimitives();
  if (!prims.some((p) => mats.has(p.getMaterial()?.getName()))) continue;
  const other = nodesB.get(node.getName())?.getMesh();
  if (!other) throw new Error(`node ${node.getName()} missing in fresh kit`);
  const pb = other.listPrimitives();
  if (pb.length !== prims.length) throw new Error(`${node.getName()}: ${prims.length} vs ${pb.length} primitives`);
  prims.forEach((pa, i) => {
    const q = pb[i];
    if (pa.getMaterial()?.getName() !== q.getMaterial()?.getName()) throw new Error(`${node.getName()}[${i}]: material differs`);
    for (const sem of pa.listSemantics()) pa.setAttribute(sem, null);
    for (const sem of q.listSemantics()) pa.setAttribute(sem, copy(q.getAttribute(sem)));
    pa.setIndices(q.getIndices() ? copy(q.getIndices()) : null);
  });
  n++;
}
await A.transform(prune());
await io.write(outPath, A);
console.log(`spliced ${n} meshes and ${mats.size} materials into ${outPath}`);
