import * as THREE from 'three';
import { loadPS1Model } from '../world/ModelLoader';
import { createPS1Material, snapGeometry } from '../rendering/PS1Renderer';

const PACK_SRC = '/assets/itch/cigarettes/PackCigarettesStandard.fbx';

interface SmokePuff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  velocity: THREE.Vector3;
}

export class CigaretteItem {
  readonly viewModel = new THREE.Group();
  private held = false;
  private worldProp: THREE.Object3D | null = null;
  private readonly puffs: SmokePuff[] = [];
  private readonly spawnPos = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    camera.add(this.viewModel);
    this.viewModel.visible = false;
    void this.loadViewModel();
  }

  get isHeld(): boolean {
    return this.held;
  }

  private async loadViewModel(): Promise<void> {
    try {
      const { pivot } = await loadPS1Model(PACK_SRC, 0.09, {
        spin: false,
        floorAlign: false,
        rotation: [0, Math.PI * 0.15, 0],
      });
      pivot.position.set(-0.2, -0.16, -0.28);
      pivot.rotation.set(0.15, 0.4, -0.08);
      this.viewModel.add(pivot);
    } catch {
      const fallback = new THREE.Mesh(
        snapGeometry(new THREE.BoxGeometry(0.05, 0.08, 0.02)),
        createPS1Material(0xcc2222),
      );
      fallback.position.set(-0.2, -0.14, -0.26);
      this.viewModel.add(fallback);
    }
  }

  pickUp(propRoot: THREE.Object3D): void {
    if (this.held) return;
    this.worldProp = propRoot;
    propRoot.visible = false;
    this.held = true;
    this.viewModel.visible = true;
  }

  puff(camera: THREE.PerspectiveCamera): void {
    if (!this.held) return;

    camera.updateMatrixWorld(true);
    camera.getWorldPosition(this.spawnPos);
    camera.getWorldDirection(this.forward);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);

    this.spawnPos
      .addScaledVector(this.forward, 0.32)
      .addScaledVector(this.right, -0.1)
      .addScaledVector(this.up, -0.06);

    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const size = 0.035 + Math.random() * 0.04;
      const geo = snapGeometry(new THREE.IcosahedronGeometry(size, 0));
      const material = new THREE.MeshBasicMaterial({
        color: 0xd8d8d8,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.copy(this.spawnPos);
      mesh.position.x += (Math.random() - 0.5) * 0.06;
      mesh.position.y += (Math.random() - 0.5) * 0.04;
      mesh.position.z += (Math.random() - 0.5) * 0.06;
      this.scene.add(mesh);

      const velocity = this.forward.clone().multiplyScalar(0.15 + Math.random() * 0.12);
      velocity.y += 0.35 + Math.random() * 0.25;
      velocity.x += (Math.random() - 0.5) * 0.08;
      velocity.z += (Math.random() - 0.5) * 0.08;

      this.puffs.push({
        mesh,
        material,
        age: 0,
        life: 1.1 + Math.random() * 0.6,
        velocity,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i]!;
      puff.age += dt;
      const t = puff.age / puff.life;
      if (t >= 1) {
        this.scene.remove(puff.mesh);
        puff.mesh.geometry.dispose();
        puff.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.mesh.position.addScaledVector(puff.velocity, dt);
      puff.velocity.y += dt * 0.18;
      puff.velocity.multiplyScalar(1 - dt * 0.35);
      const scale = 1 + t * 2.2;
      puff.mesh.scale.setScalar(scale);
      puff.material.opacity = 0.55 * (1 - t * t);
    }
  }

  dispose(): void {
    this.held = false;
    this.viewModel.visible = false;
    this.viewModel.removeFromParent();
    if (this.worldProp) this.worldProp.visible = true;
    this.worldProp = null;
    for (const puff of this.puffs) {
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      puff.material.dispose();
    }
    this.puffs.length = 0;
  }
}
