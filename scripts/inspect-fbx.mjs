import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { readFileSync } from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/inspect-fbx.mjs <file.fbx>');
  process.exit(1);
}

const loader = new FBXLoader();
const buffer = readFileSync(path);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const root = loader.parse(arrayBuffer, path.replace(/[^/\\]+$/, ''));

const meshes = [];
root.traverse((obj) => {
  if (obj.isMesh) {
    const tris = obj.geometry?.index
      ? obj.geometry.index.count / 3
      : (obj.geometry?.attributes?.position?.count ?? 0) / 3;
    meshes.push({ name: obj.name || '(unnamed)', tris: Math.round(tris), parent: obj.parent?.name ?? '' });
  }
});

const names = new Set();
root.traverse((obj) => {
  if (obj.name) names.add(obj.name);
});

console.log('Root children:', root.children.length);
console.log('Total named nodes:', names.size);
console.log('Meshes:', meshes.length);
console.log('\n--- Mesh list ---');
for (const m of meshes.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`${m.name} (${m.tris} tris) parent=${m.parent}`);
}
console.log('\n--- All node names (sample) ---');
[...names].sort().slice(0, 120).forEach((n) => console.log(n));
if (names.size > 120) console.log(`... +${names.size - 120} more`);
