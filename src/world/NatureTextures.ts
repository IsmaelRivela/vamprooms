import * as THREE from 'three';

const NATURE_TEXTURES = '/assets/itch/nature/textures/';

type Season = 'spring' | 'summer' | 'fall' | 'winter';

function seasonFromSrc(src: string): Season {
  if (/_winter/i.test(src)) return 'winter';
  if (/_fall/i.test(src)) return 'fall';
  if (/_spring/i.test(src)) return 'spring';
  return 'summer';
}

/** Billboards nature (grass/trees/bushes) — PNG con alpha en negro. */
export function applyFoliageMaterialSettings(mat: THREE.MeshLambertMaterial): void {
  mat.transparent = true;
  mat.alphaTest = 0.35;
  mat.side = THREE.DoubleSide;
  mat.depthWrite = false;
  mat.color.setHex(0xffffff);
}

export function isNatureModelSrc(src: string): boolean {
  return src.includes('/itch/nature/');
}

/** Resuelve textura atlas correcta para GLBs nature sin material embebido. */
export function resolveNatureTextureUrl(modelSrc: string): string | null {
  if (!isNatureModelSrc(modelSrc)) return null;

  const file = modelSrc.split('/').pop()?.replace(/\.glb$/i, '') ?? '';
  const season = seasonFromSrc(modelSrc);

  if (file.startsWith('grass')) {
    if (file.includes('patch_corner') || file.includes('patch')) {
      return `${NATURE_TEXTURES}grass/grass_patch_${season}.png`;
    }
    if (file.includes('bush')) {
      return `${NATURE_TEXTURES}grass/grass_bush_${season}.png`;
    }
    return `${NATURE_TEXTURES}grass/grass_${season}.png`;
  }

  const treeMatch = file.match(/^tree0?(\d+)/i);
  if (treeMatch) {
    const n = treeMatch[1].padStart(2, '0');
    return `${NATURE_TEXTURES}trees/tree${n}_${season}.png`;
  }

  const bushMatch = file.match(/^bush0?(\d+)/i);
  if (bushMatch) {
    const n = bushMatch[1];
    return `${NATURE_TEXTURES}bushes/bush${n}_${season}.png`;
  }

  return null;
}
