import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { ModelDisplayOptions } from '../data/projects';
import { createPS1Material } from '../rendering/PS1Renderer';
import { loadImageTexture } from './AssetTextures';
import {
  applyFoliageMaterialSettings,
  isNatureModelSrc,
  resolveNatureTextureUrl,
} from './NatureTextures';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const PSX_LIVING_TEXTURES = '/assets/itch/psx-living/Textures/';
const NATURE_TEXTURES = '/assets/itch/nature/textures/';
const CIGARETTE_TEXTURES = '/assets/itch/cigarettes/Textures/';

const loadingManager = new THREE.LoadingManager();
loadingManager.setURLModifier((url) => {
  const file = decodeURIComponent(url.split(/[/\\]/).pop() ?? url);
  if (!/\.(jpe?g|png)$/i.test(file)) return url;
  if (url.includes('Cigarette') || url.includes('cigarette')) {
    return `${CIGARETTE_TEXTURES}${file}`;
  }
  if (url.includes('exploration') || url.includes('Flashlight')) {
    return `/assets/itch/exploration/${file}`;
  }
  if (url.includes('nature') || url.includes('bushes') || url.includes('trees') || url.includes('grass')) {
    return `${NATURE_TEXTURES}${file}`;
  }
  return `${PSX_LIVING_TEXTURES}${file}`;
});

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setDRACOLoader(dracoLoader);

const fbxLoader = new FBXLoader(loadingManager);
const sceneCache = new Map<string, THREE.Object3D>();
/** Evita parsear el mismo FBX/GLB decenas de veces en paralelo (salas VAMPS). */
const sceneLoadInflight = new Map<string, Promise<THREE.Object3D>>();

function fixTexture(tex: THREE.Texture | null | undefined) {
  if (!tex) return;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
}

function convertMaterial(source: THREE.Material): THREE.MeshLambertMaterial {
  if (source instanceof THREE.MeshLambertMaterial) {
    fixTexture(source.map);
    fixTexture(source.alphaMap);
    if (source.vertexColors) source.vertexColors = true;
    return source;
  }
  if (source instanceof THREE.MeshBasicMaterial) {
    const mat = createPS1Material(
      source.map ? 0xffffff : source.color.getHex(),
      source.map ?? undefined,
    );
    mat.name = source.name;
    if (source.alphaMap) {
      mat.alphaMap = source.alphaMap;
      fixTexture(mat.alphaMap);
    }
    if (source.transparent) {
      mat.transparent = true;
      mat.opacity = source.opacity;
      mat.alphaTest = source.alphaTest;
    }
    if (source.side !== THREE.FrontSide) mat.side = source.side;
    if (source.vertexColors) mat.vertexColors = source.vertexColors;
    return mat;
  }

  const std = source as THREE.MeshStandardMaterial & {
    map?: THREE.Texture;
    alphaMap?: THREE.Texture;
    color?: THREE.Color;
  };
  const hasMap = !!std.map;
  const baseColor = std.color?.getHex?.() ?? 0xbbbbbb;
  const mat = createPS1Material(hasMap ? 0xffffff : baseColor, std.map ?? undefined);
  mat.name = source.name;

  if (std.map) fixTexture(mat.map);
  if (std.alphaMap) {
    mat.alphaMap = std.alphaMap;
    fixTexture(mat.alphaMap);
  }
  const stdExt = std as THREE.MeshStandardMaterial & { alphaMode?: string; alphaCutoff?: number };
  if (stdExt.alphaMode === 'MASK' || stdExt.alphaMode === 'BLEND') {
    mat.transparent = true;
    mat.alphaTest = stdExt.alphaCutoff ?? 0.4;
  }
  if (std.transparent || (std.opacity !== undefined && std.opacity < 1)) {
    mat.transparent = true;
    mat.opacity = std.opacity ?? 1;
  }
  if (std.side !== undefined && std.side !== THREE.FrontSide) mat.side = std.side;
  if (std.vertexColors) mat.vertexColors = std.vertexColors;

  return mat;
}

/** Asigna texturas PSX cuando el FBX no las resolvió (objetos blancos). */
function guessPsxTextureUrl(hint: string): string {
  const name = hint.replace(/\.\d{3}$/, '').replace(/\.\d+$/, '');
  const lower = name.toLowerCase();

  if (/plant|grass|bush|tree|flower|tulip/i.test(lower)) return `${PSX_LIVING_TEXTURES}Plants.png`;
  if (/soap|shampoo|tooth|hygiene|medic|pill/i.test(lower)) return `${PSX_LIVING_TEXTURES}Hygiene.jpg`;
  if (/fabric|cloth|dirty|pillow|shirt|leather|clothing/i.test(lower)) return `${PSX_LIVING_TEXTURES}Fabric_02.jpg`;
  if (/flashlight/i.test(lower)) return `/assets/itch/exploration/Flashlight.png`;
  if (/metal|lamp|microwave|tv|refrigerator|electronic|emf|flash|spirit|camera/i.test(lower)) return `${PSX_LIVING_TEXTURES}Metal_02.jpg`;
  if (/book|paper|brochure/i.test(lower)) return `${PSX_LIVING_TEXTURES}Paper.jpg`;
  if (/food|cookie|box_cookies|pizza/i.test(lower)) return `${PSX_LIVING_TEXTURES}Foods.jpg`;
  if (/plastic|cigarette|pack/i.test(lower)) return `${PSX_LIVING_TEXTURES}Plastic_01.jpg`;
  if (/tile|clinical|floor/i.test(lower)) return `${PSX_LIVING_TEXTURES}Tiles_02.jpg`;
  if (/wood|shelf|table|chair|basket|box|bed|armchair|cabinet|washbasin|bathroom|counter|desk|gondola/i.test(lower)) {
    return `${PSX_LIVING_TEXTURES}Wood_08.jpg`;
  }
  return `${PSX_LIVING_TEXTURES}Wood_01.jpg`;
}

async function enrichMissingTextures(object: THREE.Object3D, modelSrc: string): Promise<void> {
  const natureDefault = resolveNatureTextureUrl(modelSrc);
  const tasks: Promise<void>[] = [];

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const raw of materials) {
      if (!(raw instanceof THREE.MeshLambertMaterial)) continue;
      const mat = raw;
      if (mat.map) {
        fixTexture(mat.map);
        if (isNatureModelSrc(modelSrc)) applyFoliageMaterialSettings(mat);
        continue;
      }

      const hints = [mat.name, child.name, child.parent?.name].filter(Boolean) as string[];
      const url =
        natureDefault ??
        (isNatureModelSrc(modelSrc) ? resolveNatureTextureUrl(`${modelSrc}/${hints[0] ?? ''}`) : null) ??
        guessPsxTextureUrl(hints[0] ?? child.name ?? '');

      tasks.push(
        loadImageTexture(url).then(
          (tex) => {
            mat.map = tex;
            mat.color.setHex(0xffffff);
            if (isNatureModelSrc(modelSrc) || natureDefault) applyFoliageMaterialSettings(mat);
            mat.needsUpdate = true;
          },
          () => {
            if (mat.color.getHex() === 0xffffff) mat.color.setHex(0x908070);
          },
        ),
      );
    }
  });

  await Promise.all(tasks);
}

function applyPS1ToModel(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mesh = child;
    if (mesh.geometry && !mesh.geometry.attributes.normal) {
      mesh.geometry.computeVertexNormals();
    }

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => convertMaterial(m));
    } else if (mesh.material) {
      mesh.material = convertMaterial(mesh.material);
    }
  });
}

function fitModel(object: THREE.Object3D, targetSize = 0.85, floorAlign = false): void {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim <= 0) return;

  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);

  box.setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(
    -center.x,
    floorAlign ? -box.min.y : -center.y,
    -center.z,
  );
}

function applyDisplayOptions(model: THREE.Object3D, opts?: ModelDisplayOptions) {
  if (!opts) return;
  if (opts.scaleMultiplier) model.scale.multiplyScalar(opts.scaleMultiplier);
  if (opts.rotation) {
    model.rotation.set(opts.rotation[0], opts.rotation[1], opts.rotation[2]);
  }
  if (opts.yOffset) model.position.y += opts.yOffset;
  if (opts.rotation && opts.floorAlign) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
  }
}

/** Overrides para GLBs con pivote/origen mal exportado (clave = fragmento del src). */
const BAD_PIVOT_OVERRIDES: Record<string, ModelDisplayOptions> = {
  'vampire+fang+ring': {
    rotation: [-0.47, 0, -1.57],
    scaleMultiplier: 0.55,
  },
};

export function displayOverrideForSrc(src: string): ModelDisplayOptions | undefined {
  for (const [key, opts] of Object.entries(BAD_PIVOT_OVERRIDES)) {
    if (src.includes(key)) return opts;
  }
  return undefined;
}

export function getObjectBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

/** Si el eje Y domina el bbox, rota 90° en X para tumbar el modelo en el plano XZ. */
export function autoLayFlatIfStanding(object: THREE.Object3D): boolean {
  const size = getObjectBounds(object).getSize(new THREE.Vector3());
  if (size.y <= size.x * 1.05 && size.y <= size.z * 1.05) return false;
  object.rotation.x += Math.PI / 2;
  object.updateMatrixWorld(true);
  return true;
}

/**
 * Corrige pivote descentrado: centro XZ en el origen del spin y base en Y=0 local.
 * `offset` es hijo directo de `pivot`; `content` es el subárbol orientado (tilt + model).
 */
export function alignSpinPivot(
  pivot: THREE.Object3D,
  offset: THREE.Object3D,
  content: THREE.Object3D,
): void {
  content.updateMatrixWorld(true);
  const box = getObjectBounds(content);
  const center = box.getCenter(new THREE.Vector3());
  const bottom = new THREE.Vector3(center.x, box.min.y, center.z);

  pivot.updateMatrixWorld(true);
  pivot.worldToLocal(center);
  pivot.worldToLocal(bottom);

  offset.position.set(-center.x, -bottom.y, -center.z);
}

export interface LoadModelOptions extends ModelDisplayOptions {
  spin?: boolean;
  /** Extrae un sub-objeto por nombre (FBX con muchos assets en un solo archivo). */
  objectName?: string;
}

function isFbxSrc(src: string): boolean {
  return src.toLowerCase().endsWith('.fbx');
}

function findNamedObject(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let match: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (obj.name === name) match = obj;
  });
  return match;
}

function extractNamedObject(root: THREE.Object3D, name: string): THREE.Group {
  const node = findNamedObject(root, name);
  if (!node) {
    console.warn(`ModelLoader: objectName "${name}" not found in ${root.name || 'scene'}`);
    return root.clone(true) as THREE.Group;
  }
  const wrapper = new THREE.Group();
  wrapper.name = name;
  wrapper.add(node.clone(true));
  return wrapper;
}

function loadGltfScene(src: string): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(src, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function loadFbxScene(src: string): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    fbxLoader.load(src, (obj) => resolve(obj), undefined, reject);
  });
}

async function loadRawScene(src: string): Promise<THREE.Object3D> {
  if (!sceneCache.has(src)) {
    if (!sceneLoadInflight.has(src)) {
      sceneLoadInflight.set(
        src,
        (isFbxSrc(src) ? loadFbxScene(src) : loadGltfScene(src))
          .then((scene) => {
            sceneCache.set(src, scene);
            return scene;
          })
          .finally(() => {
            sceneLoadInflight.delete(src);
          }),
      );
    }
    await sceneLoadInflight.get(src);
  }
  return sceneCache.get(src)!.clone(true);
}

export interface LoadedModel {
  object: THREE.Group;
  pivot: THREE.Group;
}

export function loadPS1Model(
  src: string,
  targetSize = 0.85,
  display?: LoadModelOptions,
): Promise<LoadedModel> {
  return loadRawScene(src).then(async (scene) => {
    let model: THREE.Object3D = scene;
    if (display?.objectName) {
      model = extractNamedObject(scene, display.objectName);
    }

    applyPS1ToModel(model);
    await enrichMissingTextures(model, src);
    fitModel(model, targetSize, display?.floorAlign ?? false);
    applyDisplayOptions(model, display);

    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.userData.spin = display?.spin !== false;

    return { object: model as THREE.Group, pivot };
  });
}

/** Fallback visible cuando falla la carga del GLB */
export function createModelPlaceholder(label: string, color = 0xc22424): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    createPS1Material(color),
  );
  body.position.y = 0.25;
  group.add(body);

  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a1408';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#f0e8c8';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label.slice(0, 12).toUpperCase(), 64, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;

  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.15),
    createPS1Material(0xffffff, tex),
  );
  tag.position.set(0, 0.65, 0);
  group.add(tag);

  return group;
}

export function spinModels(
  root: THREE.Object3D,
  dt: number,
  near?: THREE.Vector3,
  speed = 0.35,
  maxDist = 18,
) {
  root.traverse((obj) => {
    if (!obj.userData.spin) return;
    if (near) {
      const p = new THREE.Vector3();
      obj.getWorldPosition(p);
      if (p.distanceTo(near) > maxDist) return;
    }
    obj.rotation.y += dt * speed;
  });
}
