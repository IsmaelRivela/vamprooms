import * as THREE from 'three';
import type { Project } from '../data/projects';
import { createPS1Material } from '../rendering/PS1Renderer';
import { publicUrl } from '../utils/publicUrl';

const PLACEHOLDER = publicUrl('assets/placeholder.svg');

const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');

const cache = new Map<string, Promise<THREE.Texture>>();

export function configureImageTexture(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
}

export function loadImageTexture(src: string): Promise<THREE.Texture> {
  const key = publicUrl(src || 'assets/placeholder.svg');
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = new Promise<THREE.Texture>((resolve) => {
    loader.load(
      key,
      (tex) => {
        configureImageTexture(tex);
        resolve(tex);
      },
      undefined,
      () => {
        if (key === PLACEHOLDER) {
          resolve(new THREE.Texture());
          return;
        }
        loadImageTexture(PLACEHOLDER).then(resolve);
      },
    );
  });

  cache.set(key, promise);
  return promise;
}

/** Material con textura async — actualiza al cargar */
export function createImageMaterial(src: string): THREE.MeshLambertMaterial {
  const mat = createPS1Material(0xffffff);
  void loadImageTexture(src).then((tex) => {
    mat.map = tex;
    mat.needsUpdate = true;
  });
  return mat;
}

export function fitImageDimensions(
  maxW: number,
  maxH: number,
  imgW: number,
  imgH: number,
): { w: number; h: number; aspect: number } {
  if (!imgW || !imgH) return { w: maxW, h: maxH, aspect: maxW / maxH };
  const aspect = imgW / imgH;
  if (aspect >= maxW / maxH) {
    return { w: maxW, h: maxW / aspect, aspect };
  }
  return { w: maxH * aspect, h: maxH, aspect };
}

export async function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  const tex = await loadImageTexture(src);
  const img = tex.image as HTMLImageElement | undefined;
  return { w: img?.width ?? 1, h: img?.height ?? 1 };
}

export async function preloadProjectImages(projects: Project[]): Promise<void> {
  const srcs = new Set<string>([PLACEHOLDER]);
  for (const project of projects) {
    for (const asset of project.assets) {
      if (asset.type === 'image') srcs.add(asset.src);
    }
  }
  await Promise.all([...srcs].map((src) => loadImageTexture(src)));
}

export interface FramedImageOptions {
  src: string;
  maxW: number;
  maxH: number;
  frameDepth?: number;
  frameColor?: number;
  /** Tras cargar textura, ajusta tamaño del canvas al aspect ratio real */
  fitAspect?: boolean;
}

export interface FramedImageResult {
  frame: THREE.Mesh;
  canvas: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  updateAspect: () => Promise<void>;
}

export function createFramedImage(
  createPlane: (w: number, h: number) => THREE.BufferGeometry,
  createBox: (w: number, h: number, d: number) => THREE.BufferGeometry,
  opts: FramedImageOptions,
): FramedImageResult {
  const framePad = 0.08;
  const frameD = opts.frameDepth ?? 0.06;
  const frameColor = opts.frameColor ?? 0x3a3020;

  let cw = opts.maxW;
  let ch = opts.maxH;

  const material = createImageMaterial(opts.src);

  const canvas = new THREE.Mesh(createPlane(cw, ch), material);
  const frame = new THREE.Mesh(
    createBox(cw + framePad, ch + framePad, frameD),
    createPS1Material(frameColor),
  );

  const updateAspect = async () => {
    if (opts.fitAspect === false) return;
    const dims = await getImageDimensions(opts.src);
    const fit = fitImageDimensions(opts.maxW, opts.maxH, dims.w, dims.h);
    cw = fit.w;
    ch = fit.h;
    canvas.geometry.dispose();
    canvas.geometry = createPlane(cw, ch);
    frame.geometry.dispose();
    frame.geometry = createBox(cw + framePad, ch + framePad, frameD);
  };

  void updateAspect();

  return { frame, canvas, material, updateAspect };
}
