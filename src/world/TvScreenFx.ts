import * as THREE from 'three';
import { loadImageTexture } from './AssetTextures';
import { createGlitchScreenMaterial, type GlitchScreenMaterial } from '../rendering/GlitchScreenMaterial';
import { snapGeometry } from '../rendering/PS1Renderer';

const TV_FACE_TEX = '/assets/textures/vamps-tv-face.png';

let texturePromise: Promise<THREE.Texture> | null = null;
const tvUnits: TvUnit[] = [];

const _faceDir = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _localFace = new THREE.Vector3();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

export class TvUnit {
  readonly id: string;
  readonly anchor: THREE.Object3D;
  readonly screens: THREE.Mesh[] = [];
  readonly materials: GlitchScreenMaterial[] = [];
  readonly interactPosition = new THREE.Vector3();
  on = false;

  constructor(id: string, anchor: THREE.Object3D) {
    this.id = id;
    this.anchor = anchor;
    this.refreshInteractPosition();
  }

  refreshInteractPosition(): void {
    this.anchor.updateMatrixWorld(true);
    _box.setFromObject(this.anchor);
    _box.getCenter(this.interactPosition);
    this.interactPosition.y = Math.max(this.interactPosition.y, _box.min.y + 0.55);
  }

  addScreen(mesh: THREE.Mesh, mat: GlitchScreenMaterial): void {
    this.screens.push(mesh);
    this.materials.push(mat);
    mat.uniforms.power.value = 0;
    mesh.material = mat;
  }

  toggle(): boolean {
    this.on = !this.on;
    const power = this.on ? 1 : 0;
    for (const mat of this.materials) mat.uniforms.power.value = power;
    return this.on;
  }

  dispose(): void {
    for (const mat of this.materials) mat.dispose();
  }
}

export function isTvModelSrc(src: string): boolean {
  const lower = src.toLowerCase();
  return (
    lower.includes('tv.glb') ||
    lower.includes('/tv_') ||
    /tv_\d+/i.test(lower) ||
    lower.endsWith('/tv.fbx')
  );
}

export function isTvProp(prop: { src: string; objectName?: string; id: string }): boolean {
  return isTvModelSrc(prop.src) || /tv/i.test(prop.objectName ?? '') || /tv/i.test(prop.id);
}

function loadTvFaceTexture(): Promise<THREE.Texture> {
  texturePromise ??= loadImageTexture(TV_FACE_TEX);
  return texturePromise;
}

/** Coloca un plano en la cara frontal del modelo según la rotación del prop en sala. */
function createScreenOverlay(
  anchor: THREE.Object3D,
  modelPivot: THREE.Object3D,
  tex: THREE.Texture,
): THREE.Mesh {
  modelPivot.updateMatrixWorld(true);
  anchor.updateMatrixWorld(true);

  _box.setFromObject(modelPivot, true);
  _box.getSize(_size);
  _box.getCenter(_center);

  anchor.getWorldDirection(_faceDir);
  _faceDir.y = 0;
  if (_faceDir.lengthSq() < 1e-6) _faceDir.set(0, 0, 1);
  _faceDir.normalize();

  _inv.copy(modelPivot.matrixWorld).invert();
  _localFace.copy(_faceDir).transformDirection(_inv).normalize();

  const ax = Math.abs(_localFace.x);
  const ay = Math.abs(_localFace.y);
  const az = Math.abs(_localFace.z);

  let planeW = _size.x * 0.78;
  let planeH = _size.y * 0.58;
  const pos = _center.clone();
  const rot = new THREE.Euler(0, 0, 0);
  const inset = 0.012;

  if (ax >= ay && ax >= az) {
    planeW = _size.z * 0.78;
    planeH = _size.y * 0.58;
    pos.x += Math.sign(_localFace.x) * (_size.x * 0.5 + inset);
    rot.y = _localFace.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else if (az >= ax && az >= ay) {
    planeW = _size.x * 0.78;
    planeH = _size.y * 0.58;
    pos.z += Math.sign(_localFace.z) * (_size.z * 0.5 + inset);
    rot.y = _localFace.z > 0 ? 0 : Math.PI;
  } else {
    planeW = _size.x * 0.78;
    planeH = _size.z * 0.78;
    pos.y += Math.sign(_localFace.y) * (_size.y * 0.5 + inset);
    rot.x = _localFace.y > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  pos.y += _size.y * 0.04;

  const mat = createGlitchScreenMaterial(tex);
  const plane = new THREE.Mesh(
    snapGeometry(new THREE.PlaneGeometry(Math.max(planeW, 0.05), Math.max(planeH, 0.05))),
    mat,
  );
  plane.position.copy(pos);
  plane.rotation.copy(rot);
  plane.name = 'tv-glitch-screen';
  modelPivot.add(plane);
  return plane;
}

function registerTv(anchor: THREE.Object3D, modelPivot: THREE.Object3D, tex: THREE.Texture): TvUnit {
  const id = (anchor.userData.layoutPropId as string | undefined) ?? anchor.uuid;
  const unit = new TvUnit(id, anchor);
  const plane = createScreenOverlay(anchor, modelPivot, tex);
  unit.addScreen(plane, plane.material as GlitchScreenMaterial);
  tvUnits.push(unit);
  return unit;
}

export async function applyTvGlitchScreensForProp(
  anchor: THREE.Object3D,
  modelPivot: THREE.Object3D,
  prop: { src: string; objectName?: string; id: string },
): Promise<TvUnit | null> {
  if (!isTvProp(prop)) return null;
  const tex = await loadTvFaceTexture();
  return registerTv(anchor, modelPivot, tex);
}

export function getTvUnits(): readonly TvUnit[] {
  return tvUnits;
}

export function findNearestTv(
  playerPos: THREE.Vector3,
  yaw: number,
  maxDist = 3.4,
): TvUnit | null {
  const look = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  let best: TvUnit | null = null;
  let bestScore = Infinity;

  for (const tv of tvUnits) {
    const to = tv.interactPosition.clone().sub(playerPos);
    to.y = 0;
    const dist = to.length();
    if (dist > maxDist) continue;
    to.normalize();
    const dot = look.dot(to);
    if (dot < 0.3) continue;
    const score = dist - dot * 1.2;
    if (score < bestScore) {
      bestScore = score;
      best = tv;
    }
  }
  return best;
}

export function updateTvGlitchScreens(time: number): void {
  for (const unit of tvUnits) {
    for (const mat of unit.materials) {
      mat.uniforms.time.value = time;
    }
  }
}

export function resetTvGlitchScreens(): void {
  for (const unit of tvUnits) unit.dispose();
  tvUnits.length = 0;
}
