import * as THREE from 'three';
import type { RoomNode } from '../generation/DungeonGenerator';
import { isPlayerInRoom } from '../generation/DungeonGenerator';
import { snapGeometry } from '../rendering/PS1Renderer';
import { CELL } from './RoomBuilder';

const LASER_RED = 0xff1133;
const LASER_GREEN = 0x33ff66;

interface LaserBeam {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface RoomLaserGrid {
  room: RoomNode;
  beams: LaserBeam[];
  colorMix: number;
}

function createBeam(from: THREE.Vector3, to: THREE.Vector3): LaserBeam {
  const delta = new THREE.Vector3().subVectors(to, from);
  const len = delta.length();
  if (len < 0.05) {
    const geo = snapGeometry(new THREE.BoxGeometry(0.02, 0.02, 0.02));
    const material = new THREE.MeshBasicMaterial({ color: LASER_RED, visible: false });
    return { mesh: new THREE.Mesh(geo, material), material };
  }
  const geo = snapGeometry(new THREE.BoxGeometry(0.024, 0.024, len));
  const material = new THREE.MeshBasicMaterial({
    color: LASER_RED,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
  return { mesh, material };
}

function buildRoomGrid(room: RoomNode, group: THREE.Group): RoomLaserGrid {
  const margin = 0.55;
  const x0 = room.gridPos.x * CELL + margin;
  const z0 = room.gridPos.z * CELL + margin;
  const x1 = room.gridPos.x * CELL + room.width * CELL - margin;
  const z1 = room.gridPos.z * CELL + room.depth * CELL - margin;
  const beams: LaserBeam[] = [];
  const heights = [0.65, 0.95, 1.25, 1.55, 1.85, 2.15];
  const slices = 4;

  for (let zi = 0; zi <= slices; zi++) {
    const z = THREE.MathUtils.lerp(z0, z1, zi / slices);
    for (const h of heights) {
      beams.push(createBeam(new THREE.Vector3(x0, h, z), new THREE.Vector3(x1, h, z)));
    }
  }

  for (let xi = 0; xi <= slices; xi++) {
    const x = THREE.MathUtils.lerp(x0, x1, xi / slices);
    for (const h of heights) {
      beams.push(createBeam(new THREE.Vector3(x, h, z0), new THREE.Vector3(x, h, z1)));
    }
  }

  // Diagonales cruzadas en altura media — malla de seguridad
  const midH = 1.35;
  beams.push(createBeam(new THREE.Vector3(x0, midH, z0), new THREE.Vector3(x1, midH, z1)));
  beams.push(createBeam(new THREE.Vector3(x1, midH, z0), new THREE.Vector3(x0, midH, z1)));
  beams.push(createBeam(new THREE.Vector3(x0, 0.75, z0), new THREE.Vector3(x1, 2.05, z1)));
  beams.push(createBeam(new THREE.Vector3(x1, 0.75, z0), new THREE.Vector3(x0, 2.05, z1)));

  for (const beam of beams) {
    if (beam.material.visible !== false) group.add(beam.mesh);
  }

  return { room, beams, colorMix: 0 };
}

export class CopydadLaserSystem {
  private grids: RoomLaserGrid[] = [];
  private readonly red = new THREE.Color(LASER_RED);
  private readonly green = new THREE.Color(LASER_GREEN);
  private readonly beamColor = new THREE.Color();

  static build(room: RoomNode, parent: THREE.Group): CopydadLaserSystem | null {
    if (room.projectId !== 'copydad') return null;
    const system = new CopydadLaserSystem();
    const group = new THREE.Group();
    group.name = `copydad-lasers-${room.id}`;
    system.grids.push(buildRoomGrid(room, group));
    parent.add(group);
    return system;
  }

  update(dt: number, playerPos: THREE.Vector3) {
    for (const grid of this.grids) {
      const inside = isPlayerInRoom(grid.room, playerPos);
      const target = inside ? 1 : 0;
      grid.colorMix = THREE.MathUtils.lerp(grid.colorMix, target, Math.min(1, dt * 7));
      this.beamColor.copy(this.red).lerp(this.green, grid.colorMix);
      for (const beam of grid.beams) beam.material.color.copy(this.beamColor);
    }
  }

  dispose() {
    for (const grid of this.grids) {
      for (const beam of grid.beams) {
        beam.mesh.geometry.dispose();
        beam.material.dispose();
      }
    }
    this.grids = [];
  }
}
