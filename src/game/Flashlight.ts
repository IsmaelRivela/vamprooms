import * as THREE from 'three';
import { loadPS1Model } from '../world/ModelLoader';
import { createPS1Material } from '../rendering/PS1Renderer';

const FLASHLIGHT_SRC = '/assets/itch/exploration/Flashlight.fbx';
const BASE_INTENSITY = 15;
/** Haz estrecho, borde casi duro, alcance largo */
const BEAM_ANGLE = Math.PI / 9.5;
const BEAM_PENUMBRA = 0.2;
const BEAM_DECAY = 2.0;
const BEAM_DISTANCE = 52;

export class Flashlight {
  readonly light: THREE.SpotLight;
  readonly target = new THREE.Object3D();
  /** Modelo visible — va en la cámara */
  readonly viewModel = new THREE.Group();
  private on = true;
  private readonly lightPos = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.light = new THREE.SpotLight(
      0xfff6e0,
      BASE_INTENSITY,
      BEAM_DISTANCE,
      BEAM_ANGLE,
      BEAM_PENUMBRA,
      BEAM_DECAY,
    );
    this.light.castShadow = false;

    scene.add(this.light);
    scene.add(this.target);
    this.light.target = this.target;

    camera.add(this.viewModel);
  }

  async loadModel(): Promise<void> {
    try {
      const { pivot } = await loadPS1Model(FLASHLIGHT_SRC, 0.22, {
        spin: false,
        floorAlign: false,
        rotation: [0, Math.PI, 0],
      });
      pivot.position.set(0.26, -0.24, -0.12);
      pivot.rotation.set(0.08, 0, 0);
      this.viewModel.add(pivot);
    } catch {
      const fallback = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.06, 0.18, 6),
        createPS1Material(0x444038),
      );
      fallback.rotation.x = Math.PI / 2;
      fallback.position.set(0.26, -0.22, -0.1);
      this.viewModel.add(fallback);
    }
  }

  /** Sincroniza la luz en world space — debe llamarse cada frame tras mover la cámara. */
  update(camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(this.lightPos);
    camera.getWorldDirection(this.aimDir);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);

    this.lightPos
      .addScaledVector(this.right, 0.22)
      .addScaledVector(this.up, -0.18)
      .addScaledVector(this.aimDir, 0.05);

    this.light.position.copy(this.lightPos);
    this.target.position.copy(this.lightPos).addScaledVector(this.aimDir, 20);
  }

  toggle(): boolean {
    this.on = !this.on;
    this.light.intensity = this.on ? BASE_INTENSITY : 0;
    return this.on;
  }

  get enabled(): boolean {
    return this.on;
  }

  updateFlicker(time: number): void {
    if (!this.on) return;
    const n = Math.sin(time * 11.0) * 0.12 + (Math.random() > 0.997 ? -0.6 : 0);
    this.light.intensity = Math.max(BASE_INTENSITY * 0.85, BASE_INTENSITY + n);
  }

  dispose(): void {
    this.light.removeFromParent();
    this.target.removeFromParent();
    this.viewModel.removeFromParent();
  }
}
