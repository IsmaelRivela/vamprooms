import * as THREE from 'three';
import type { ProjectTheme } from '../data/projects';
import type { RoomThemeOverride } from './RoomLayout';
import { createPS1Material } from '../rendering/PS1Renderer';
import { loadImageTexture } from './AssetTextures';

const T = '/assets/textures/tiny';

/** Texturas backrooms del usuario (~/Desktop/3d/texture/) */
export const BACKROOMS_TEXTURES = {
  wall: '/assets/textures/backrooms/pared.png',
  floor: '/assets/textures/backrooms/moqueta.webp',
} as const;

/** Rutas del pack SBS Tiny 128×128 */
export const Tiny = {
  tile: (n: number) => `${T}/Tile/Tile_${String(n).padStart(2, '0')}-128x128.png`,
  grass: (n: number) => `${T}/Grass/Grass_${String(n).padStart(2, '0')}-128x128.png`,
  wood: (n: number) => `${T}/Wood/Wood_${String(n).padStart(2, '0')}-128x128.png`,
  bricks: (n: number) => `${T}/Bricks/Bricks_${String(n).padStart(2, '0')}-128x128.png`,
  roofs: (n: number) => `${T}/Roofs/Roofs_${String(n).padStart(2, '0')}-128x128.png`,
} as const;

export interface TexturePick {
  id: string;
  label: string;
  src: string;
  group: 'tile' | 'grass' | 'wood' | 'bricks' | 'roofs';
}

const TEX_COUNT: Record<TexturePick['group'], number> = {
  tile: 20,
  grass: 10,
  wood: 12,
  bricks: 20,
  roofs: 8,
};

export function listTinyTexturePicks(): TexturePick[] {
  const picks: TexturePick[] = [];
  const add = (group: TexturePick['group'], fn: (n: number) => string, label: (n: number) => string) => {
    for (let n = 1; n <= TEX_COUNT[group]; n++) {
      picks.push({ id: `${group}-${n}`, label: label(n), src: fn(n), group });
    }
  };
  add('tile', Tiny.tile, (n) => `Tile ${n}`);
  add('grass', Tiny.grass, (n) => `Grass ${n}`);
  add('wood', Tiny.wood, (n) => `Wood ${n}`);
  add('bricks', Tiny.bricks, (n) => `Bricks ${n}`);
  add('roofs', Tiny.roofs, (n) => `Roofs ${n}`);
  return picks;
}

export const WALL_THEME_LABELS: Record<ProjectTheme['wall'], string> = {
  backrooms: 'Backrooms',
  nature: 'Nature',
  florist: 'Floristería',
  'brick-alley': 'Ladrillo callejón',
  wardrobe: 'Armario / madera',
  'brand-red': 'VAMPS rojo',
  clinical: 'Clínico',
  locker: 'Taquillas',
  'xp-blue': 'XP azul',
};

export const FLOOR_THEME_LABELS: Record<ProjectTheme['floor'], string> = {
  carpet: 'Moqueta',
  grass: 'Césped',
  'dirt-wood': 'Madera sucia',
  concrete: 'Hormigón',
  'clinical-tile': 'Baldosa clínica',
  linoleum: 'Linóleo',
  checker: 'Damero',
};

export function createTiledMaterial(
  src: string,
  repeatX = 2,
  repeatY = 2,
  tint = 0xffffff,
): THREE.MeshLambertMaterial {
  const mat = createPS1Material(tint);
  void loadImageTexture(src).then((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    mat.map = tex;
    mat.needsUpdate = true;
  });
  return mat;
}

export async function preloadTinyThemeTextures(theme: ProjectTheme): Promise<void> {
  const { wallSrc, floorSrc } = pickThemeTextures(theme);
  await Promise.all([loadImageTexture(wallSrc), loadImageTexture(floorSrc)]);
}

function pickThemeTextures(theme: ProjectTheme): { wallSrc: string; floorSrc: string; wallRepeat: [number, number]; floorRepeat: [number, number] } {
  let wallSrc = Tiny.tile(2);
  let floorSrc = Tiny.tile(8);
  let wallRepeat: [number, number] = [2, 1];
  let floorRepeat: [number, number] = [4, 4];

  switch (theme.wall) {
    case 'nature':
    case 'florist':
      wallSrc = Tiny.tile(5);
      wallRepeat = [2, 2];
      break;
    case 'brick-alley':
      wallSrc = Tiny.bricks(3);
      wallRepeat = [2, 2];
      break;
    case 'clinical':
      wallSrc = Tiny.tile(1);
      wallRepeat = [3, 2];
      break;
    case 'brand-red':
      wallSrc = Tiny.bricks(18);
      wallRepeat = [2, 1];
      break;
    case 'wardrobe':
      wallSrc = Tiny.wood(4);
      wallRepeat = [2, 2];
      break;
    case 'locker':
      wallSrc = Tiny.tile(7);
      wallRepeat = [2, 2];
      break;
    case 'xp-blue':
      wallSrc = Tiny.tile(9);
      wallRepeat = [2, 2];
      break;
    case 'backrooms':
      wallSrc = BACKROOMS_TEXTURES.wall;
      wallRepeat = [2, 1];
      break;
    default:
      wallSrc = BACKROOMS_TEXTURES.wall;
      wallRepeat = [2, 1];
  }

  switch (theme.floor) {
    case 'carpet':
      floorSrc = BACKROOMS_TEXTURES.floor;
      floorRepeat = [3, 3];
      break;
    case 'grass':
      floorSrc = Tiny.grass(4);
      floorRepeat = [5, 5];
      break;
    case 'dirt-wood':
      floorSrc = Tiny.wood(9);
      floorRepeat = [4, 4];
      break;
    case 'clinical-tile':
      floorSrc = Tiny.tile(2);
      floorRepeat = [5, 5];
      break;
    case 'linoleum':
      floorSrc = Tiny.tile(11);
      floorRepeat = [4, 4];
      break;
    case 'checker':
      floorSrc = Tiny.tile(6);
      floorRepeat = [4, 4];
      break;
    case 'concrete':
      floorSrc = Tiny.bricks(1);
      floorRepeat = [4, 4];
      break;
    default:
      floorSrc = Tiny.grass(2);
      floorRepeat = [4, 4];
  }

  return { wallSrc, floorSrc, wallRepeat, floorRepeat };
}

export function createMaterialsWithOverride(
  baseTheme: ProjectTheme,
  override?: RoomThemeOverride,
  accent = 0xff0600,
): {
  wall: THREE.MeshLambertMaterial;
  floor: THREE.MeshLambertMaterial;
  ceil: THREE.MeshLambertMaterial;
} {
  const merged: ProjectTheme = {
    wall: override?.wall ?? baseTheme.wall,
    floor: override?.floor ?? baseTheme.floor,
    ceilTint: override?.ceilTint ?? baseTheme.ceilTint,
  };
  const mats = createTinyThemedMaterials(merged, accent);

  if (override?.wallTexture) {
    const rep = override.wallRepeat ?? [2, 2];
    mats.wall = createTiledMaterial(override.wallTexture, rep[0], rep[1]);
  }
  if (override?.floorTexture) {
    const rep = override.floorRepeat ?? [4, 4];
    mats.floor = createTiledMaterial(override.floorTexture, rep[0], rep[1]);
  }

  return mats;
}

export function createTinyThemedMaterials(theme: ProjectTheme, _accent = 0xff0600): {
  wall: THREE.MeshLambertMaterial;
  floor: THREE.MeshLambertMaterial;
  ceil: THREE.MeshLambertMaterial;
} {
  const { wallSrc, floorSrc, wallRepeat, floorRepeat } = pickThemeTextures(theme);
  const ceilTint = theme.ceilTint ?? 0xf0ead8;

  return {
    wall: createTiledMaterial(wallSrc, wallRepeat[0], wallRepeat[1]),
    floor: createTiledMaterial(floorSrc, floorRepeat[0], floorRepeat[1]),
    ceil: createPS1Material(ceilTint),
  };
}

/** Pasillos, spawn y salas genéricas — texturas pared / moqueta */
export function createDefaultCorridorMaterials(): {
  wall: THREE.MeshLambertMaterial;
  floor: THREE.MeshLambertMaterial;
  ceil: THREE.MeshLambertMaterial;
} {
  return {
    wall: createTiledMaterial(BACKROOMS_TEXTURES.wall, 2, 1),
    floor: createTiledMaterial(BACKROOMS_TEXTURES.floor, 3, 3),
    ceil: createPS1Material(0xd8d0b8),
  };
}

export async function preloadDefaultCorridorTextures(): Promise<void> {
  await Promise.all([
    loadImageTexture(BACKROOMS_TEXTURES.wall),
    loadImageTexture(BACKROOMS_TEXTURES.floor),
  ]);
}

/** Preload all tiny textures used by project themes at startup */
export async function preloadAllTinyTextures(themes: ProjectTheme[]): Promise<void> {
  await preloadDefaultCorridorTextures();
  await Promise.all(themes.map((t) => preloadTinyThemeTextures(t)));
}
