/**
 * Genera public/assets/asset-catalog.json organizado por carpetas de ~/Desktop/3d
 * Uso: node scripts/build-asset-catalog.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(SCRIPT_DIR, '..');
const PUBLIC = join(PROJECT, 'public');
const ASSETS = join(PUBLIC, 'assets');
const OUT = join(ASSETS, 'asset-catalog.json');
const ALL_FBX_PUBLIC = join(ASSETS, 'itch/psx-living/Models/All.fbx');
const THREE_D = join(homedir(), 'Desktop/3d');

const ROOMS = [
  { id: 'la-tulipana', label: 'La Tulipana' },
  { id: 'copydad', label: 'Copydad' },
  { id: 'vamps-brand', label: 'VAMPS Brand' },
  { id: 'vamps-pharma', label: 'VAMPS Pharma' },
  { id: 'vamps-back2school', label: 'Back2School' },
];

/** Orden de carpetas raíz en ~/Desktop/3d */
const FOLDER_ORDER = [
  'All',
  'Exploration objects',
  'PSXCigarette Pack[FIXED]',
  'PSX_Assets',
  'SBS - Tiny Texture Pack - 128x128',
  'retro_nature_pack',
  'Proyecto BACKROOMS',
];

const SBS_FOLDER = 'SBS - Tiny Texture Pack - 128x128';
const SBS_PUBLIC = join(ASSETS, 'textures/tiny');
const PSX_ASSETS_PUBLIC = join(ASSETS, 'itch/psx-assets');

function walk(dir, acc = [], filter) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc, filter);
    else if (filter(name)) acc.push(p);
  }
  return acc;
}

function publicUrl(absPath) {
  if (!absPath.startsWith(PUBLIC)) return null;
  return '/' + relative(PUBLIC, absPath).replace(/\\/g, '/');
}

function defaultFitSize(src, rel3d = '') {
  const n = (src + rel3d).toLowerCase();
  if (n.includes('/trees/') || n.includes('/trees\\')) return 3.2;
  if (n.includes('/bushes/')) return 1.4;
  if (n.includes('/grass/')) return 1.6;
  if (n.includes('pedestal')) return 0.55;
  if (n.includes('shelf') || n.includes('medicine')) return 1.8;
  if (n.includes('exploration') || n.includes('cigarette')) return 0.35;
  if (n.includes('pharma/3d')) return 0.42;
  return 1.0;
}

function labelFromPath(name) {
  return name.replace(/\.(glb|fbx|png|jpe?g)$/i, '').replace(/[+_-]/g, ' ');
}

function labelFromTextureFile(name) {
  return name
    .replace(/-128x128\.png$/i, '')
    .replace(/\.(png|jpe?g)$/i, '')
    .replace(/[+_]/g, ' ');
}

function extractFbxObjectNames(fbxPath) {
  if (!existsSync(fbxPath)) return [];
  const buf = readFileSync(fbxPath);
  const names = new Set();
  for (const chunk of buf.toString('latin1').split('\0')) {
    const line = chunk.trim();
    if (/^[A-Za-z][A-Za-z0-9 _]+_\d{2}$/.test(line)) names.add(line);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Mapea ruta relativa dentro de ~/Desktop/3d → URL servida en public/ */
function resolvePublicSrc(rel3d) {
  const norm = rel3d.replace(/\\/g, '/');
  const file = basename(norm);

  if (norm === 'All/Models/All.fbx') {
    return existsSync(ALL_FBX_PUBLIC) ? '/assets/itch/psx-living/Models/All.fbx' : null;
  }

  if (norm.startsWith('retro_nature_pack/models/glTF/')) {
    const sub = norm.replace('retro_nature_pack/models/glTF/', '');
    const abs = join(ASSETS, 'itch/nature', sub);
    return existsSync(abs) ? publicUrl(abs) : null;
  }

  if (norm.startsWith('Exploration objects/')) {
    const abs = join(ASSETS, 'itch/exploration', file);
    return existsSync(abs) ? publicUrl(abs) : null;
  }

  if (norm.startsWith('PSXCigarette Pack[FIXED]/')) {
    const abs = join(ASSETS, 'itch/cigarettes', file);
    return existsSync(abs) ? publicUrl(abs) : null;
  }

  if (norm.startsWith('PSX_Assets/')) {
    const rel = norm.replace('PSX_Assets/', '');
    const abs = join(ASSETS, 'itch/psx-assets', rel);
    if (existsSync(abs)) return publicUrl(abs);
    const glbName = basename(norm).replace(/\.(blend|blend1)$/i, '.glb');
    const exported = join(ASSETS, 'itch/psx-assets/models', slug(labelFromPath(glbName)) + '.glb');
    if (existsSync(exported)) return publicUrl(exported);
    const exportedAlt = join(ASSETS, 'itch/psx-assets/models', glbName);
    if (existsSync(exportedAlt)) return publicUrl(exportedAlt);
    return null;
  }

  if (norm.startsWith('PSX_Assets/exported_glb/')) {
    const file = basename(norm);
    const abs = join(ASSETS, 'itch/psx-assets/models', file);
    return existsSync(abs) ? publicUrl(abs) : null;
  }

  return null;
}

function categoryFor3dPath(rel3d) {
  const parts = rel3d.replace(/\\/g, '/').split('/');
  const top = parts[0];

  if (top === 'retro_nature_pack') {
    const kind = parts.find((p) => ['trees', 'grass', 'bushes'].includes(p)) ?? 'otros';
    return {
      id: `3d-${slug(top)}--${kind}`,
      label: `${top} / ${kind}`,
      folder: top,
      order: FOLDER_ORDER.indexOf(top),
    };
  }

  if (top === 'Exploration objects' && parts.length > 1) {
    return {
      id: `3d-${slug(top)}--${slug(parts[1])}`,
      label: `${top} / ${parts[1]}`,
      folder: top,
      order: FOLDER_ORDER.indexOf(top),
    };
  }

  if (top === 'PSXCigarette Pack[FIXED]' && parts.length > 2) {
    return {
      id: `3d-cigarettes--${slug(parts[2])}`,
      label: `${top} / ${parts[2]}`,
      folder: top,
      order: FOLDER_ORDER.indexOf(top),
    };
  }

  return {
    id: `3d-${slug(top)}`,
    label: top,
    folder: top,
    order: FOLDER_ORDER.indexOf(top) >= 0 ? FOLDER_ORDER.indexOf(top) : 99,
  };
}

function slug(s) {
  return s.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function makeItem({ id, label, src, rel3d, objectName, fitSize, deployed, kind = 'model' }) {
  return {
    id,
    label,
    src,
    kind,
    ...(kind === 'model' ? { defaultFitSize: fitSize ?? 1 } : {}),
    ...(objectName ? { objectName } : {}),
    ...(rel3d ? { source3d: rel3d } : {}),
    deployed,
  };
}

const categoriesMap = new Map();

function addToCategory(cat, item) {
  if (!categoriesMap.has(cat.id)) {
    categoriesMap.set(cat.id, { id: cat.id, label: cat.label, folder: cat.folder, order: cat.order, items: [] });
  }
  categoriesMap.get(cat.id).items.push(item);
}

// —— All.fbx sub-objetos ——
const fbxSrc = '/assets/itch/psx-living/Models/All.fbx';
const fbxNames = extractFbxObjectNames(ALL_FBX_PUBLIC);
const allDeployed = existsSync(ALL_FBX_PUBLIC);
for (const objectName of fbxNames) {
  addToCategory(
    { id: '3d-all', label: 'All', folder: 'All', order: 0 },
    makeItem({
      id: `psx-${objectName.replace(/\s+/g, '-')}`,
      label: objectName.replace(/_/g, ' '),
      src: fbxSrc,
      rel3d: 'All/Models/All.fbx',
      objectName,
      fitSize: objectName.startsWith('Plants') ? 0.9 : objectName.startsWith('Shelf') ? 1.5 : 1.0,
      deployed: allDeployed,
    }),
  );
}

// —— Escaneo ~/Desktop/3d ——
if (existsSync(THREE_D)) {
  const models3d = walk(
    THREE_D,
    [],
    (name) => /\.(glb|fbx)$/i.test(name) && name !== 'All.fbx',
  ).filter((abs) => {
    const rel = relative(THREE_D, abs).replace(/\\/g, '/');
    if (rel.includes('/OBJ/')) return false;
    if (rel.startsWith('retro_nature_pack/models/FBX/')) return false;
    return true;
  });

  for (const abs of models3d) {
    const rel3d = relative(THREE_D, abs).replace(/\\/g, '/');
    const src = resolvePublicSrc(rel3d);
    const cat = categoryFor3dPath(rel3d);
    addToCategory(
      cat,
      makeItem({
        id: slug(rel3d),
        label: labelFromPath(basename(rel3d)),
        src: src ?? `/assets/itch/_missing/${basename(rel3d)}`,
        rel3d,
        fitSize: defaultFitSize(src ?? '', rel3d),
        deployed: !!src,
      }),
    );
  }
} else {
  console.warn(`No se encontró ${THREE_D} — solo catálogo desde public/assets`);
}

// —— PSX_Assets: modelos GLB exportados ——
const psxModelsPublic = join(PSX_ASSETS_PUBLIC, 'models');
if (existsSync(psxModelsPublic)) {
  for (const file of readdirSync(psxModelsPublic).filter((f) => /\.glb$/i.test(f))) {
    const abs = join(psxModelsPublic, file);
    const src = publicUrl(abs);
    addToCategory(
      {
        id: '3d-psx-assets--models',
        label: 'PSX_Assets / modelos',
        folder: 'PSX_Assets',
        order: FOLDER_ORDER.indexOf('PSX_Assets'),
      },
      makeItem({
        id: slug(`psx-model-${file}`),
        label: labelFromPath(file),
        src: src ?? '',
        rel3d: `PSX_Assets/exported_glb/${file}`,
        fitSize: 1.2,
        deployed: !!src,
      }),
    );
  }
}

// —— PSX_Assets: texturas PNG/JPG (+ aviso .blend sin exportar) ——
const psxTex3d = join(THREE_D, 'PSX_Assets/Textures');
if (existsSync(psxTex3d)) {
  for (const file of readdirSync(psxTex3d)) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    const rel3d = `PSX_Assets/Textures/${file}`;
    const absPublic = join(PSX_ASSETS_PUBLIC, 'Textures', file);
    const src = existsSync(absPublic) ? publicUrl(absPublic) : null;
    addToCategory(
      {
        id: '3d-psx-assets--textures',
        label: 'PSX_Assets / Textures',
        folder: 'PSX_Assets',
        order: FOLDER_ORDER.indexOf('PSX_Assets'),
      },
      makeItem({
        id: slug(rel3d),
        label: labelFromTextureFile(file),
        src: src ?? `/assets/itch/psx-assets/Textures/${file}`,
        rel3d,
        kind: 'texture',
        deployed: !!src,
      }),
    );
  }
}
const psxBlend = join(THREE_D, 'PSX_Assets/living_room_assets.blend');
if (existsSync(psxBlend)) {
  addToCategory(
    {
      id: '3d-psx-assets--blend',
      label: 'PSX_Assets / fuentes Blender',
      folder: 'PSX_Assets',
      order: FOLDER_ORDER.indexOf('PSX_Assets'),
    },
    makeItem({
      id: 'psx-living-room-blend',
      label: 'living room assets.blend',
      src: '',
      rel3d: 'PSX_Assets/living_room_assets.blend',
      kind: 'source',
      deployed: false,
    }),
  );
}

// —— SBS Tiny Texture Pack (desde public/assets/textures/tiny) ——
const SBS_GROUPS = ['Tile', 'Grass', 'Wood', 'Bricks', 'Roofs'];
for (const group of SBS_GROUPS) {
  const dir = join(SBS_PUBLIC, group);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => /\.png$/i.test(f))) {
    const abs = join(dir, file);
    const src = publicUrl(abs);
    const rel3d = `${SBS_FOLDER}/128x128/${group}/${file}`;
    addToCategory(
      {
        id: `3d-sbs--${slug(group)}`,
        label: `${SBS_FOLDER} / ${group}`,
        folder: SBS_FOLDER,
        order: FOLDER_ORDER.indexOf(SBS_FOLDER),
      },
      makeItem({
        id: slug(`${group}-${file}`),
        label: labelFromTextureFile(file),
        src: src ?? '',
        rel3d,
        kind: 'texture',
        deployed: !!src,
      }),
    );
  }
}

// —— Props propios del proyecto (no están en ~/Desktop/3d) ——
const projectModels = walk(ASSETS, [], (name) => /\.(glb|fbx)$/i.test(name)).filter((abs) => {
  const rel = relative(ASSETS, abs).replace(/\\/g, '/');
  return (
    (rel.startsWith('rooms/') || rel.startsWith('vamps/')) &&
    !rel.includes('/itch/')
  );
});

for (const abs of projectModels) {
  const rel = relative(ASSETS, abs).replace(/\\/g, '/');
  const src = publicUrl(abs);
  if (!src) continue;
  const sub = rel.startsWith('vamps/') ? 'vamps' : 'rooms';
  addToCategory(
    {
      id: `proyecto-backrooms--${sub}`,
      label: `Proyecto BACKROOMS / ${sub}`,
      folder: 'Proyecto BACKROOMS',
      order: FOLDER_ORDER.indexOf('Proyecto BACKROOMS'),
    },
    makeItem({
      id: slug(rel),
      label: labelFromPath(basename(rel)),
      src,
      rel3d: `public/assets/${rel}`,
      fitSize: defaultFitSize(src),
      deployed: true,
    }),
  );
}

const categories = [...categoriesMap.values()]
  .map((c) => ({
    ...c,
    items: c.items.sort((a, b) => a.label.localeCompare(b.label)),
  }))
  .filter((c) => c.items.length > 0)
  .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

const deployedCount = categories.reduce((n, c) => n + c.items.filter((i) => i.deployed).length, 0);
const totalCount = categories.reduce((n, c) => n + c.items.length, 0);

const catalog = {
  version: 2,
  generatedAt: new Date().toISOString(),
  source3dRoot: THREE_D,
  rooms: ROOMS,
  categories,
};

writeFileSync(OUT, JSON.stringify(catalog, null, 2));
console.log(`Wrote ${OUT}`);
console.log(`  ${categories.length} categorías · ${deployedCount}/${totalCount} assets desplegados en public/`);
