import * as THREE from 'three';
import type { Project, ProjectVariant, ModelDisplayOptions } from '../data/projects';
import type {
  DungeonGraph,
  GenericRoomKind,
  RoomDoor,
  RoomNode,
  Side,
} from '../generation/DungeonGenerator';
import { getRoomDoors } from '../generation/DungeonGenerator';
import {
  createPS1Material,
  snapGeometry,
} from '../rendering/PS1Renderer';
import { createDefaultCorridorMaterials, createMaterialsWithOverride } from './TinyTextures';
import { loadPS1Model, createModelPlaceholder } from './ModelLoader';
import { addThemedProps, createThemedMaterials } from './ProjectThemes';
import { createFramedImage } from './AssetTextures';
import { loadLayout, type RoomLayout } from './RoomLayout';
import { buildLayoutPropsForRoom, worldPositionForProp, type WorldPickable } from './LayoutProps';
import { CopydadLaserSystem } from './CopydadSecurityLasers';
import type { LightFixture } from '../game/WorldLighting';

const CELL = 2.4;
const WALL_H = 2.8;
const WALL_THICK = 0.2;
const DOOR_W = CELL * 0.92;
const DOOR_H = 2.15;
const FRAME_W = 0.1;

export interface Interactable {
  id: string;
  project: Project;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
}

export interface BuiltWorld {
  root: THREE.Group;
  colliders: THREE.Box3[];
  interactables: Interactable[];
  spawnPosition: THREE.Vector3;
  modelAnchors: ModelAnchor[];
  layoutRoots: THREE.Group[];
  lightFixtures: LightFixture[];
  copydadLasers: CopydadLaserSystem[];
  pickables: WorldPickable[];
}

export interface ModelAnchor {
  project: Project;
  assetId: string;
  src: string;
  scale: number;
  label: string;
  display?: ModelDisplayOptions;
  anchor: THREE.Group;
  position: THREE.Vector3;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addBox(
  group: THREE.Group,
  colliders: THREE.Box3[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  solid = true,
) {
  const geo = snapGeometry(new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  group.add(mesh);
  if (solid) colliders.push(new THREE.Box3().setFromObject(mesh));
}

/** Sella huecos en esquinas donde se cruzan dos muros */
function addCornerPost(
  group: THREE.Group,
  x: number,
  z: number,
  mat: THREE.Material,
) {
  const s = WALL_THICK * 1.25;
  const geo = snapGeometry(new THREE.BoxGeometry(s, WALL_H, s));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, WALL_H / 2, z);
  group.add(mesh);
}

function buildFloorCeiling(
  group: THREE.Group,
  x: number,
  z: number,
  w: number,
  d: number,
  floorMat: THREE.Material,
  ceilMat: THREE.Material,
) {
  const fw = w * CELL;
  const fd = d * CELL;
  const cx = x * CELL + fw / 2;
  const cz = z * CELL + fd / 2;

  const floor = new THREE.Mesh(snapGeometry(new THREE.BoxGeometry(fw, 0.15, fd)), floorMat);
  floor.position.set(cx, -0.075, cz);
  group.add(floor);

  const ceil = new THREE.Mesh(snapGeometry(new THREE.BoxGeometry(fw, 0.12, fd)), ceilMat);
  ceil.position.set(cx, WALL_H, cz);
  group.add(ceil);
}

/** Huecos en coordenadas mundo [start, end] a lo largo del muro */
const OPPOSITE_SIDE: Record<Side, Side> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

function clampGaps(
  gaps: { start: number; end: number }[],
  spanStart: number,
  spanEnd: number,
): { start: number; end: number }[] {
  return gaps
    .map((g) => ({
      start: Math.max(spanStart, g.start),
      end: Math.min(spanEnd, g.end),
    }))
    .filter((g) => g.end - g.start > 0.08);
}

function doorGapsWorld(room: RoomNode, side: Side, doors: RoomDoor[]): { start: number; end: number }[] {
  const { x, z } = room.gridPos;
  const gaps: { start: number; end: number }[] = [];

  for (const door of doors.filter((d) => d.side === side)) {
    if (side === 'north' || side === 'south') {
      const wx = (x + door.offset) * CELL + (CELL - DOOR_W) / 2;
      gaps.push({ start: wx, end: wx + DOOR_W });
    } else {
      const wz = (z + door.offset) * CELL + (CELL - DOOR_W) / 2;
      gaps.push({ start: wz, end: wz + DOOR_W });
    }
  }
  return gaps.sort((a, b) => a.start - b.start);
}

function buildWallAlongX(
  group: THREE.Group,
  colliders: THREE.Box3[],
  z: number,
  xStart: number,
  xEnd: number,
  gaps: { start: number; end: number }[],
  mat: THREE.Material,
) {
  const clamped = clampGaps(gaps, xStart, xEnd);
  let cursor = xStart;
  for (const gap of clamped) {
    const segEnd = Math.min(gap.start, xEnd);
    if (segEnd - cursor > 0.05) {
      const w = segEnd - cursor;
      addBox(group, colliders, w, WALL_H, WALL_THICK, cursor + w / 2, WALL_H / 2, z, mat);
    }
    cursor = Math.max(cursor, gap.end);
  }
  if (xEnd - cursor > 0.05) {
    const w = xEnd - cursor;
    addBox(group, colliders, w, WALL_H, WALL_THICK, cursor + w / 2, WALL_H / 2, z, mat);
  }

  // Marco de puerta visible
  const frameMat = createPS1Material(0x3a3020);
  const trimMat = createPS1Material(0x8a7040);
  for (const gap of clamped) {
    const gw = gap.end - gap.start;
    addBox(group, colliders, gw + FRAME_W * 2, WALL_H - DOOR_H, WALL_THICK, (gap.start + gap.end) / 2, DOOR_H + (WALL_H - DOOR_H) / 2, z, mat);
    addBox(group, colliders, FRAME_W, DOOR_H, WALL_THICK * 1.4, gap.start - FRAME_W / 2, DOOR_H / 2, z, frameMat);
    addBox(group, colliders, FRAME_W, DOOR_H, WALL_THICK * 1.4, gap.end + FRAME_W / 2, DOOR_H / 2, z, frameMat);
    addBox(group, colliders, gw, 0.06, WALL_THICK * 1.5, (gap.start + gap.end) / 2, 0.03, z, trimMat, false);
  }
}

function buildWallAlongZ(
  group: THREE.Group,
  colliders: THREE.Box3[],
  x: number,
  zStart: number,
  zEnd: number,
  gaps: { start: number; end: number }[],
  mat: THREE.Material,
) {
  const clamped = clampGaps(gaps, zStart, zEnd);
  let cursor = zStart;
  for (const gap of clamped) {
    const segEnd = Math.min(gap.start, zEnd);
    if (segEnd - cursor > 0.05) {
      const d = segEnd - cursor;
      addBox(group, colliders, WALL_THICK, WALL_H, d, x, WALL_H / 2, cursor + d / 2, mat);
    }
    cursor = Math.max(cursor, gap.end);
  }
  if (zEnd - cursor > 0.05) {
    const d = zEnd - cursor;
    addBox(group, colliders, WALL_THICK, WALL_H, d, x, WALL_H / 2, cursor + d / 2, mat);
  }

  const frameMat = createPS1Material(0x3a3020);
  const trimMat = createPS1Material(0x8a7040);
  for (const gap of clamped) {
    addBox(group, colliders, WALL_THICK, WALL_H - DOOR_H, gap.end - gap.start + FRAME_W * 2, x, DOOR_H + (WALL_H - DOOR_H) / 2, (gap.start + gap.end) / 2, mat);
    addBox(group, colliders, WALL_THICK * 1.4, DOOR_H, FRAME_W, x, DOOR_H / 2, gap.start - FRAME_W / 2, frameMat);
    addBox(group, colliders, WALL_THICK * 1.4, DOOR_H, FRAME_W, x, DOOR_H / 2, gap.end + FRAME_W / 2, frameMat);
    addBox(group, colliders, WALL_THICK * 1.5, 0.06, gap.end - gap.start, x, 0.03, (gap.start + gap.end) / 2, trimMat, false);
  }
}

function buildRoomWalls(
  group: THREE.Group,
  colliders: THREE.Box3[],
  room: RoomNode,
  doors: RoomDoor[],
  wallMat: THREE.Material,
) {
  const { x, z } = room.gridPos;
  const fw = room.width * CELL;
  const fd = room.depth * CELL;
  const x0 = x * CELL;
  const z0 = z * CELL;

  buildWallAlongX(group, colliders, z0 - WALL_THICK / 2, x0, x0 + fw, doorGapsWorld(room, 'north', doors), wallMat);
  buildWallAlongX(group, colliders, z0 + fd + WALL_THICK / 2, x0, x0 + fw, doorGapsWorld(room, 'south', doors), wallMat);
  buildWallAlongZ(group, colliders, x0 - WALL_THICK / 2, z0, z0 + fd, doorGapsWorld(room, 'west', doors), wallMat);
  buildWallAlongZ(group, colliders, x0 + fw + WALL_THICK / 2, z0, z0 + fd, doorGapsWorld(room, 'east', doors), wallMat);

  addCornerPost(group, x0, z0, wallMat);
  addCornerPost(group, x0 + fw, z0, wallMat);
  addCornerPost(group, x0, z0 + fd, wallMat);
  addCornerPost(group, x0 + fw, z0 + fd, wallMat);
}

function corridorCellSet(cells: { x: number; z: number }[]): Set<string> {
  return new Set(cells.map((c) => `${c.x},${c.z}`));
}

function buildCorridors(
  group: THREE.Group,
  colliders: THREE.Box3[],
  graph: DungeonGraph,
  floorMat: THREE.Material,
  ceilMat: THREE.Material,
  wallMat: THREE.Material,
  lightFixtures: LightFixture[],
  rng: () => number,
) {
  const allCells: { x: number; z: number }[] = [];
  const openSides = new Map<string, Set<Side>>();

  for (const conn of graph.connections) {
    allCells.push(...conn.cells);
    const kFrom = `${conn.entranceFrom.x},${conn.entranceFrom.z}`;
    const kTo = `${conn.entranceTo.x},${conn.entranceTo.z}`;
    if (!openSides.has(kFrom)) openSides.set(kFrom, new Set());
    if (!openSides.has(kTo)) openSides.set(kTo, new Set());
    openSides.get(kFrom)!.add(OPPOSITE_SIDE[conn.fromDoor.side]);
    openSides.get(kTo)!.add(OPPOSITE_SIDE[conn.toDoor.side]);
  }

  const cellSet = corridorCellSet(allCells);

  for (const cell of allCells) {
    const { x, z } = cell;
    buildFloorCeiling(group, x, z, 1, 1, floorMat, ceilMat);

    const open = openSides.get(`${x},${z}`) ?? new Set<Side>();
    const hasN = cellSet.has(`${x},${z - 1}`);
    const hasS = cellSet.has(`${x},${z + 1}`);
    const hasW = cellSet.has(`${x - 1},${z}`);
    const hasE = cellSet.has(`${x + 1},${z}`);

    const cx = x * CELL + CELL / 2;
    const cz = z * CELL + CELL / 2;
    const x0 = x * CELL;
    const z0 = z * CELL;

    const nsCorridor = hasN || hasS || (!hasE && !hasW);
    const walls = {
      north: false as boolean,
      south: false as boolean,
      east: false as boolean,
      west: false as boolean,
    };

    if (nsCorridor) {
      walls.west = !hasW && !open.has('west');
      walls.east = !hasE && !open.has('east');
      if (walls.west) {
        buildWallAlongZ(group, colliders, x0 - WALL_THICK / 2, z0, z0 + CELL, [], wallMat);
      }
      if (walls.east) {
        buildWallAlongZ(group, colliders, x0 + CELL + WALL_THICK / 2, z0, z0 + CELL, [], wallMat);
      }
    }

    const ewCorridor = hasE || hasW;
    if (ewCorridor) {
      walls.north = !hasN && !open.has('north');
      walls.south = !hasS && !open.has('south');
      if (walls.north) {
        buildWallAlongX(group, colliders, z0 - WALL_THICK / 2, x0, x0 + CELL, [], wallMat);
      }
      if (walls.south) {
        buildWallAlongX(group, colliders, z0 + CELL + WALL_THICK / 2, x0, x0 + CELL, [], wallMat);
      }
    }

    if (walls.north && walls.west) addCornerPost(group, x0, z0, wallMat);
    if (walls.north && walls.east) addCornerPost(group, x0 + CELL, z0, wallMat);
    if (walls.south && walls.west) addCornerPost(group, x0, z0 + CELL, wallMat);
    if (walls.south && walls.east) addCornerPost(group, x0 + CELL, z0 + CELL, wallMat);

    if ((x + z) % 2 === 0) {
      const fixture = new THREE.Mesh(
        snapGeometry(new THREE.BoxGeometry(0.9, 0.06, 0.28)),
        createPS1Material(0xffffee),
      );
      fixture.position.set(cx, WALL_H - 0.1, cz);
      group.add(fixture);
      lightFixtures.push({
        position: new THREE.Vector3(cx, WALL_H - 0.15, cz),
        phase: rng() * Math.PI * 2,
        instability: 0.25 + rng() * 0.55,
      });
    }
  }
}

function addFluorescent(
  group: THREE.Group,
  x: number,
  z: number,
  w: number,
  d: number,
  rng: () => number,
  lightFixtures: LightFixture[],
  gallery = false,
) {
  const count = gallery ? 4 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
  const instability = gallery ? 0.02 + rng() * 0.04 : 0.15 + rng() * 0.45;
  for (let i = 0; i < count; i++) {
    const lx = x * CELL + (0.5 + rng() * (w - 1)) * CELL;
    const lz = z * CELL + (0.5 + rng() * (d - 1)) * CELL;

    const fixture = new THREE.Mesh(snapGeometry(new THREE.BoxGeometry(1.2, 0.08, 0.35)), createPS1Material(0xffffee));
    fixture.position.set(lx, WALL_H - 0.12, lz);
    group.add(fixture);
    lightFixtures.push({
      position: new THREE.Vector3(lx, WALL_H - 0.15, lz),
      phase: rng() * Math.PI * 2,
      instability,
      gallery,
    });
  }
}

function genericProps(
  group: THREE.Group,
  colliders: THREE.Box3[],
  kind: GenericRoomKind,
  x: number,
  z: number,
  w: number,
  d: number,
  rng: () => number,
) {
  const wood = createPS1Material(0x6a5a40);
  const trim = createPS1Material(0x8a7040);

  if (kind === 'storage') {
    const bx = x * CELL + rng() * w * CELL;
    const bz = z * CELL + rng() * d * CELL;
    addBox(group, colliders, 0.8, 1.0, 0.5, bx, 0.5, bz, wood);
  }
  if (kind === 'office') {
    const dx = x * CELL + w * CELL * 0.5;
    const dz = z * CELL + d * CELL * 0.5;
    addBox(group, colliders, 1.4, 0.75, 0.7, dx, 0.375, dz, createPS1Material(0x5a5040));
  }
  if (kind === 'junction') {
    const pillarX = x * CELL + (w * CELL) / 2;
    const pillarZ = z * CELL + (d * CELL) / 2;
    addBox(group, colliders, 0.5, WALL_H, 0.5, pillarX, WALL_H / 2, pillarZ, createPS1Material(0x8a8070));
  }
  if (kind === 'corridor') {
    const mx = x * CELL + (w * CELL) / 2;
    const mz = z * CELL + (d * CELL) / 2;
    addBox(group, colliders, 0.15, WALL_H, 0.15, mx, WALL_H / 2, mz, trim, false);
  }
  if (kind === 'fluorescent') {
    const lx = x * CELL + w * CELL * 0.5;
    const lz = z * CELL + d * CELL * 0.5;
    const fixture = new THREE.Mesh(
      snapGeometry(new THREE.BoxGeometry(1.4, 0.08, 0.35)),
      createPS1Material(0xffffee),
    );
    fixture.position.set(lx, WALL_H - 0.12, lz);
    group.add(fixture);
  }
}

function snapPlane(w: number, h: number) {
  return snapGeometry(new THREE.PlaneGeometry(w, h));
}

function snapBox(w: number, h: number, d: number) {
  return snapGeometry(new THREE.BoxGeometry(w, h, d));
}

/** Desplaza un punto hacia la normal interior de un poster (rotY) */
function posterInset(rotY: number, depth: number): THREE.Vector3 {
  return new THREE.Vector3(0, 0, depth).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
}

function mountFramedImage(
  group: THREE.Group,
  src: string,
  x: number,
  y: number,
  z: number,
  rotY: number,
  maxW: number,
  maxH: number,
  inset = 0.05,
) {
  const { frame, canvas } = createFramedImage(snapPlane, snapBox, {
    src,
    maxW,
    maxH,
    fitAspect: true,
  });
  const n = posterInset(rotY, inset);
  frame.position.set(x - n.x * 0.35, y - n.y * 0.35, z - n.z * 0.35);
  canvas.position.set(x + n.x, y + n.y, z + n.z);
  frame.rotation.y = rotY;
  canvas.rotation.y = rotY;
  group.add(frame);
  group.add(canvas);
  return canvas;
}

function createTitleTexture(title: string, accent: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `#${accent.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#1a1408';
  ctx.fillRect(8, 8, 496, 112);
  ctx.fillStyle = '#f0e8c8';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.toUpperCase(), 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function addWallPoster(
  group: THREE.Group,
  interactables: Interactable[],
  project: Project,
  asset: Project['assets'][0],
  wx: number,
  wy: number,
  wz: number,
  rotY: number,
) {
  const canvas = mountFramedImage(group, asset.src, wx, wy, wz, rotY, 1.35, 0.95, 0.05);
  const look = posterInset(rotY, 0.8);
  interactables.push({
    id: `${project.id}-${asset.id}-wall`,
    project,
    mesh: canvas,
    position: new THREE.Vector3(wx + look.x, wy, wz + look.z),
  });
}

const EMPTY_PROJECT_ROOMS = true;

function buildProjectDisplay(
  group: THREE.Group,
  interactables: Interactable[],
  modelAnchors: ModelAnchor[],
  project: Project,
  variant: ProjectVariant,
  x: number,
  z: number,
  w: number,
  d: number,
) {
  const cx = x * CELL + (w * CELL) / 2;
  const cz = z * CELL + (d * CELL) / 2;

  // Placa título en pared norte
  const titleTex = createTitleTexture(project.title, variant.wallTint);
  const titleMesh = new THREE.Mesh(
    snapGeometry(new THREE.PlaneGeometry(Math.min(w * 1.8, 3.6), 0.55)),
    createPS1Material(0xffffff, titleTex),
  );
  titleMesh.position.set(cx, 2.1, z * CELL + 0.18);
  group.add(titleMesh);

  // Kiosko info central (interactuable)
  const kiosk = new THREE.Mesh(
    snapGeometry(new THREE.BoxGeometry(0.7, 1.0, 0.45)),
    createPS1Material(variant.floorTint),
  );
  kiosk.position.set(cx, 0.5, cz - 0.8);
  group.add(kiosk);
  const heroAsset = project.assets.find((a) => a.type === 'image');
  const kioskScreen = mountFramedImage(
    group,
    heroAsset?.src ?? '/assets/placeholder.svg',
    cx,
    1.05,
    cz - 1.02,
    0,
    0.55,
    0.38,
    0.02,
  );
  interactables.push({
    id: `${project.id}-kiosk`,
    project,
    mesh: kioskScreen,
    position: new THREE.Vector3(cx, 1.05, cz - 0.5),
  });

  const layouts: Record<ProjectVariant['layout'], () => void> = {
    gallery: () => {
      let offset = -1.5;
      for (const asset of project.assets.filter((a) => a.type === 'image')) {
        const canvas = mountFramedImage(
          group,
          asset.src,
          cx + offset,
          1.5,
          z * CELL + 0.2,
          0,
          1.6,
          1.1,
        );

        const pedMesh = new THREE.Mesh(
          snapBox(0.5, 0.9, 0.5),
          createPS1Material(variant.floorTint),
        );
        pedMesh.position.set(cx + offset, 0.45, cz);
        group.add(pedMesh);

        interactables.push({
          id: `${project.id}-${asset.id}`,
          project,
          mesh: canvas,
          position: new THREE.Vector3(cx + offset, 1.5, z * CELL + 0.5),
        });
        offset += 1.8;
      }
    },
    arcade: () => {
      const cabMesh = new THREE.Mesh(snapBox(1.0, 1.8, 0.8), createPS1Material(0x2244aa));
      cabMesh.position.set(cx - 1, 0.9, cz);
      group.add(cabMesh);

      const imgAsset = project.assets.find((a) => a.type === 'image');
      const screenMesh = mountFramedImage(
        group,
        imgAsset?.src ?? '/assets/placeholder.svg',
        cx - 1,
        1.3,
        cz - 0.41,
        0,
        0.7,
        0.5,
        0.02,
      );

      interactables.push({ id: project.id, project, mesh: screenMesh, position: new THREE.Vector3(cx - 1, 1.3, cz) });
    },
    studio: () => {
      const deskMesh = new THREE.Mesh(snapBox(2.2, 0.7, 1.0), createPS1Material(0x4a4030));
      deskMesh.position.set(cx, 0.35, cz + 0.5);
      group.add(deskMesh);

      let offset = 0;
      for (const asset of project.assets.filter((a) => a.type === 'image')) {
        const monMesh = new THREE.Mesh(snapBox(0.9, 0.65, 0.08), createPS1Material(0x222222));
        monMesh.position.set(cx - 0.6 + offset, 1.0, cz + 0.3);
        group.add(monMesh);

        const dispMesh = mountFramedImage(
          group,
          asset.src,
          cx - 0.6 + offset,
          1.0,
          cz + 0.26,
          0,
          0.75,
          0.5,
          0.015,
        );

        interactables.push({
          id: `${project.id}-${asset.id}`,
          project,
          mesh: dispMesh,
          position: new THREE.Vector3(cx - 0.6 + offset, 1.0, cz + 0.8),
        });
        offset += 1.2;
      }
    },
    void: () => {
      const imgAsset = project.assets.find((a) => a.type === 'image') ?? project.assets[0];
      const monoMesh = mountFramedImage(
        group,
        imgAsset?.src ?? '/assets/placeholder.svg',
        cx,
        1.1,
        cz,
        0,
        2.0,
        2.2,
      );

      interactables.push({ id: project.id, project, mesh: monoMesh, position: new THREE.Vector3(cx, 1.1, cz + 1) });
    },
    showroom: () => {
      const models = project.assets.filter((a) => a.type === 'model');
      const images = project.assets.filter((a) => a.type === 'image');
      let modelOffset = -(models.length - 1) * 1.0;

      for (const asset of models) {
        const px = cx + modelOffset;

        const plinth = new THREE.Mesh(
          snapGeometry(new THREE.CylinderGeometry(0.35, 0.4, 0.08, 8)),
          createPS1Material(0x3a3530),
        );
        plinth.position.set(px, 0.04, cz);
        group.add(plinth);

        const anchor = new THREE.Group();
        anchor.position.set(px, 0.08, cz);
        group.add(anchor);

        modelAnchors.push({
          project,
          assetId: asset.id,
          src: asset.src,
          scale: asset.modelScale ?? 0.85,
          label: asset.label,
          display: asset.modelDisplay,
          anchor,
          position: new THREE.Vector3(px, 0.5, cz + 0.9),
        });

        interactables.push({
          id: `${project.id}-${asset.id}`,
          project,
          mesh: anchor,
          position: new THREE.Vector3(px, 0.5, cz + 0.9),
        });
        modelOffset += 2.0;
      }

      let imgOffset = -1.2;
      for (const asset of images) {
        const posterMesh = mountFramedImage(
          group,
          asset.src,
          cx + imgOffset,
          1.55,
          z * CELL + 0.16,
          0,
          1.1,
          0.75,
        );

        interactables.push({
          id: `${project.id}-${asset.id}`,
          project,
          mesh: posterMesh,
          position: new THREE.Vector3(cx + imgOffset, 1.55, z * CELL + 0.6),
        });
        imgOffset += 1.4;
      }
    },
  };

  layouts[variant.layout]();

  addThemedProps(group, project, cx, cz, x, z, w, d, mulberry32(project.id.length * 997 + variant.id.length));

  // Posters extra en paredes E/O (solo si el layout no las muestra ya en galería)
  if (variant.layout !== 'gallery' && variant.layout !== 'showroom') {
    const wallImages = project.assets.filter((a) => a.type === 'image').slice(0, 2);
    const eastX = x * CELL + w * CELL - 0.15;
    const westX = x * CELL + 0.15;
    wallImages.forEach((asset, i) => {
      if (i % 2 === 0) {
        addWallPoster(group, interactables, project, asset, eastX, 1.45, cz - 0.5 + i * 0.7, Math.PI / 2);
      } else {
        addWallPoster(group, interactables, project, asset, westX, 1.45, cz - 0.5 + i * 0.7, -Math.PI / 2);
      }
    });
  }

  // Props de ambiente según tags
  if (project.tags.includes('branding')) {
    addBox(group, [], 0.35, 0.35, 0.35, cx + 1.5, 0.175, cz + 1, createPS1Material(variant.lightColor));
  }
  if (project.tags.includes('3D')) {
    addBox(group, [], 0.5, 0.08, 0.5, cx - 1.5, 0.04, cz - 1, createPS1Material(0x888888), false);
  }
}

export function buildWorld(
  graph: DungeonGraph,
  projects: Project[],
  layoutsByProject: Record<string, RoomLayout> = {},
): BuiltWorld {
  const root = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const interactables: Interactable[] = [];
  const modelAnchors: ModelAnchor[] = [];
  const lightFixtures: LightFixture[] = [];
  const copydadLasers: CopydadLaserSystem[] = [];
  const worldRng = mulberry32(graph.seed);

  const defaultMats = createDefaultCorridorMaterials();
  const defaultWallMat = defaultMats.wall;
  const defaultFloorMat = defaultMats.floor;
  const defaultCeilMat = defaultMats.ceil;

  buildCorridors(root, colliders, graph, defaultFloorMat, defaultCeilMat, defaultWallMat, lightFixtures, worldRng);

  for (const room of graph.rooms) {
    const rng = mulberry32(room.seed);
    const doors = getRoomDoors(room.id, graph);
    const { x, z } = room.gridPos;
    const { width: w, depth: d } = room;

    let wallMat: THREE.Material = defaultWallMat;
    let floorMat: THREE.Material = defaultFloorMat;
    let ceilMat: THREE.Material = defaultCeilMat;

    if (room.kind === 'project' && room.projectId) {
      const project = projects.find((p) => p.id === room.projectId);
      const variant = project?.variants.find((v) => v.id === room.variantId);
      if (project && variant) {
        const layout = layoutsByProject[project.id];
        const themed = layout?.theme
          ? createMaterialsWithOverride(project.theme, layout.theme, variant.wallTint)
          : createThemedMaterials(project.theme, variant.wallTint);
        wallMat = themed.wall;
        floorMat = themed.floor;
        ceilMat = themed.ceil;
      }
    }

    buildFloorCeiling(root, x, z, w, d, floorMat, ceilMat);
    buildRoomWalls(root, colliders, room, doors, wallMat);
    const isGallery = room.kind === 'project' || room.lightingZone === 'gallery';
    addFluorescent(root, x, z, w, d, rng, lightFixtures, isGallery);

    if (room.kind === 'project' && room.projectId) {
      const project = projects.find((p) => p.id === room.projectId);
      if (project) {
        if (EMPTY_PROJECT_ROOMS) {
          const cx = x * CELL + (w * CELL) / 2;
          const cz = z * CELL + (d * CELL) / 2;
          interactables.push({
            id: `${project.id}-zone`,
            project,
            mesh: root,
            position: new THREE.Vector3(cx, 1.2, cz),
          });
        } else {
          const variant = project.variants.find((v) => v.id === room.variantId);
          if (variant) {
            buildProjectDisplay(root, interactables, modelAnchors, project, variant, x, z, w, d);
          }
        }
        const lasers = CopydadLaserSystem.build(room, root);
        if (lasers) copydadLasers.push(lasers);
      }
    } else {
      if (room.id !== graph.spawnRoomId) {
        genericProps(root, colliders, room.kind as GenericRoomKind, x, z, w, d, rng);
      }
    }
  }

  const spawnRoom = graph.rooms.find((r) => r.id === graph.spawnRoomId)!;
  const spawnPos = new THREE.Vector3(
    (spawnRoom.gridPos.x + spawnRoom.width / 2) * CELL,
    1.6,
    (spawnRoom.gridPos.z + spawnRoom.depth / 2) * CELL,
  );

  return { root, colliders, interactables, spawnPosition: spawnPos, modelAnchors, layoutRoots: [], lightFixtures, copydadLasers, pickables: [] };
}

export async function loadWorldLayouts(
  world: BuiltWorld,
  projects: Project[],
  graph: DungeonGraph,
): Promise<void> {
  for (const group of world.layoutRoots) {
    world.root.remove(group);
  }
  world.layoutRoots = [];
  world.pickables = [];

  const projectRooms = graph.rooms.filter((r) => r.kind === 'project' && r.projectId);

  await Promise.all(
    projectRooms.map(async (room) => {
      const project = projects.find((p) => p.id === room.projectId);
      if (!project || !room.projectId) return;

      const layout = await loadLayout(room.projectId);
      if (layout.props.length === 0) return;

      const { group } = await buildLayoutPropsForRoom(layout, project, room);
      world.root.add(group);
      world.layoutRoots.push(group);

      for (const prop of layout.props) {
        if (prop.pickup !== 'cigarette') continue;
        const root = group.getObjectByName(`layout-prop-${prop.id}`);
        if (!root) continue;
        const pos = worldPositionForProp(prop, room);
        world.pickables.push({ kind: 'cigarette', root, position: pos });
      }
    }),
  );
}

export async function loadWorldModels(world: BuiltWorld): Promise<void> {
  await Promise.all(
    world.modelAnchors.map(async (slot) => {
      try {
        const { pivot } = await loadPS1Model(slot.src, slot.scale, slot.display);
        slot.anchor.add(pivot);
      } catch (err) {
        console.warn(`Failed to load model: ${slot.src}`, err);
        slot.anchor.add(createModelPlaceholder(slot.label));
      }
    }),
  );
}

export { preloadProjectImages } from './AssetTextures';

export { CELL, WALL_H };
