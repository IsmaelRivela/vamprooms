import { buildGalleryLoopGraph, getOccupiedCells, gridKey as gridKeyOccupied } from './GalleryLoopTemplate';

export type GenericRoomKind = 'office' | 'corridor' | 'junction' | 'fluorescent' | 'storage';
export type RoomKind = GenericRoomKind | 'project';
export type Side = 'north' | 'south' | 'east' | 'west';

export interface GridPos {
  x: number;
  z: number;
}

export interface RoomDoor {
  side: Side;
  offset: number;
}

export interface RoomNode {
  id: string;
  kind: RoomKind;
  gridPos: GridPos;
  width: number;
  depth: number;
  connections: string[];
  projectId?: string;
  variantId?: string;
  seed: number;
  lightingZone?: 'gallery' | 'backrooms';
  loopExit?: boolean;
}

const GALLERY_CELL = 2.4;

export function isPlayerInRoom(room: RoomNode, pos: { x: number; z: number }): boolean {
  const x0 = room.gridPos.x * GALLERY_CELL;
  const z0 = room.gridPos.z * GALLERY_CELL;
  const x1 = x0 + room.width * GALLERY_CELL;
  const z1 = z0 + room.depth * GALLERY_CELL;
  return pos.x >= x0 && pos.x < x1 && pos.z >= z0 && pos.z < z1;
}

export function isPlayerInGalleryZone(graph: DungeonGraph, pos: { x: number; z: number }): boolean {
  const gx = Math.floor(pos.x / GALLERY_CELL);
  const gz = Math.floor(pos.z / GALLERY_CELL);
  for (const room of graph.rooms) {
    if (room.kind !== 'project' && room.lightingZone !== 'gallery') continue;
    const { x, z } = room.gridPos;
    if (gx >= x && gx < x + room.width && gz >= z && gz < z + room.depth) return true;
  }
  return false;
}

export interface RoomConnection {
  from: string;
  to: string;
  fromDoor: RoomDoor;
  toDoor: RoomDoor;
  cells: GridPos[];
  entranceFrom: GridPos;
  entranceTo: GridPos;
}

export interface DungeonGraph {
  rooms: RoomNode[];
  connections: RoomConnection[];
  spawnRoomId: string;
  seed: number;
}

export interface GeneratorConfig {
  seed?: number;
  genericRoomCount: number;
  gridCellSize: number;
  roomMinSize: number;
  roomMaxSize: number;
  corridorMinLength?: number;
  corridorMaxLength?: number;
  /** Cada cuántas expansiones intentar una temática (1 = casi siempre) */
  projectSpacing?: number;
  /** Mínimo de puertas por sala de proyecto — entrada + salida (default 2) */
  minProjectDoors?: number;
  /** Cuántas salas temáticas apuntar por mapa (repite proyectos/variantes) */
  targetProjectRooms?: number;
  /** Cadena fija spawn → una sala por proyecto, conectadas en serie (default true) */
  portfolioHub?: boolean;
  /** Anillo fijo con carriles espejados + expansión procedural (default true) */
  galleryLoop?: boolean;
  /** Repeticiones de salas temáticas en zona procedural */
  proceduralProjectRepeats?: number;
}

const GENERIC_KINDS: GenericRoomKind[] = [
  'office',
  'corridor',
  'junction',
  'fluorescent',
  'storage',
];

const SIDES: Side[] = ['north', 'south', 'east', 'west'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function id(prefix: string, n: number) {
  return `${prefix}-${n}`;
}

function key(x: number, z: number) {
  return `${x},${z}`;
}

function doorOffset(rng: () => number, span: number): number {
  const max = Math.max(0, span - 1);
  return Math.floor(rng() * (max + 1));
}

function corridorCellsNS(doorX: number, zFrom: number, zTo: number): GridPos[] {
  const cells: GridPos[] = [];
  const step = zFrom <= zTo ? 1 : -1;
  for (let z = zFrom; z !== zTo + step; z += step) {
    cells.push({ x: doorX, z });
  }
  return cells;
}

function corridorCellsEW(doorZ: number, xFrom: number, xTo: number): GridPos[] {
  const cells: GridPos[] = [];
  const step = xFrom <= xTo ? 1 : -1;
  for (let x = xFrom; x !== xTo + step; x += step) {
    cells.push({ x, z: doorZ });
  }
  return cells;
}

interface AttachResult {
  childX: number;
  childZ: number;
  parentDoor: RoomDoor;
  childDoor: RoomDoor;
  cells: GridPos[];
}

function computeAttachment(
  parent: RoomNode,
  side: Side,
  childW: number,
  childD: number,
  corridorLen: number,
  rng: () => number,
): AttachResult {
  const px = parent.gridPos.x;
  const pz = parent.gridPos.z;

  if (side === 'north') {
    const parentOff = doorOffset(rng, parent.width);
    const childOff = doorOffset(rng, childW);
    const doorX = px + parentOff;
    return {
      childX: doorX - childOff,
      childZ: pz - corridorLen - childD,
      parentDoor: { side: 'north', offset: parentOff },
      childDoor: { side: 'south', offset: childOff },
      cells: corridorCellsNS(doorX, pz - 1, pz - corridorLen - childD + childD),
    };
  }
  if (side === 'south') {
    const parentOff = doorOffset(rng, parent.width);
    const childOff = doorOffset(rng, childW);
    const doorX = px + parentOff;
    return {
      childX: doorX - childOff,
      childZ: pz + parent.depth + corridorLen,
      parentDoor: { side: 'south', offset: parentOff },
      childDoor: { side: 'north', offset: childOff },
      cells: corridorCellsNS(doorX, pz + parent.depth, pz + parent.depth + corridorLen),
    };
  }
  if (side === 'east') {
    const parentOff = doorOffset(rng, parent.depth);
    const childOff = doorOffset(rng, childD);
    const doorZ = pz + parentOff;
    return {
      childX: px + parent.width + corridorLen,
      childZ: doorZ - childOff,
      parentDoor: { side: 'east', offset: parentOff },
      childDoor: { side: 'west', offset: childOff },
      cells: corridorCellsEW(doorZ, px + parent.width, px + parent.width + corridorLen),
    };
  }
  const parentOff = doorOffset(rng, parent.depth);
  const childOff = doorOffset(rng, childD);
  const doorZ = pz + parentOff;
  return {
    childX: px - corridorLen - childW,
    childZ: doorZ - childOff,
    parentDoor: { side: 'west', offset: parentOff },
    childDoor: { side: 'east', offset: childOff },
    cells: corridorCellsEW(doorZ, px - corridorLen, px - 1),
  };
}

export function getRoomDoors(roomId: string, graph: DungeonGraph): RoomDoor[] {
  const doors: RoomDoor[] = [];
  for (const conn of graph.connections) {
    if (conn.from === roomId) doors.push(conn.fromDoor);
    if (conn.to === roomId) doors.push(conn.toDoor);
  }
  return doors;
}

function getUsedSides(roomId: string, graph: DungeonGraph): Set<Side> {
  return new Set(getRoomDoors(roomId, graph).map((d) => d.side));
}

function getFreeSides(room: RoomNode, graph: DungeonGraph): Side[] {
  const used = getUsedSides(room.id, graph);
  return SIDES.filter((s) => !used.has(s));
}

export function generateDungeon(
  projectIds: string[],
  getVariantIds: (projectId: string) => string[],
  config: GeneratorConfig,
): DungeonGraph {
  const seed = config.seed ?? Math.floor(Math.random() * 1_000_000);

  if (config.galleryLoop !== false) {
    return generateGalleryLoopDungeon(projectIds, getVariantIds, config, seed);
  }

  const rng = mulberry32(seed);
  const corrMin = config.corridorMinLength ?? 2;
  const corrMax = config.corridorMaxLength ?? 4;
  const projectSpacing = config.projectSpacing ?? 1;
  const minProjectDoors = config.minProjectDoors ?? 2;
  const targetProjectRooms = config.targetProjectRooms ?? 18;

  const rooms: RoomNode[] = [];
  const connections: RoomConnection[] = [];
  const occupied = new Set<string>();
  let projectRoomCount = 0;

  const markRect = (x: number, z: number, w: number, d: number) => {
    for (let ix = x; ix < x + w; ix++) {
      for (let iz = z; iz < z + d; iz++) occupied.add(key(ix, iz));
    }
  };

  const markCells = (cells: GridPos[]) => {
    for (const c of cells) occupied.add(key(c.x, c.z));
  };

  const canPlaceRoom = (x: number, z: number, w: number, d: number, padding = 1) => {
    for (let ix = x - padding; ix < x + w + padding; ix++) {
      for (let iz = z - padding; iz < z + d + padding; iz++) {
        if (occupied.has(key(ix, iz))) return false;
      }
    }
    return true;
  };

  const cellInsideAnyRoom = (cx: number, cz: number): boolean => {
    for (const room of rooms) {
      const { x, z } = room.gridPos;
      if (cx >= x && cx < x + room.width && cz >= z && cz < z + room.depth) return true;
    }
    return false;
  };

  const canPlaceCells = (cells: GridPos[]) =>
    cells.every((c) => !occupied.has(key(c.x, c.z)) && !cellInsideAnyRoom(c.x, c.z));

  let roomCounter = 0;

  const addRoom = (
    kind: RoomKind,
    x: number,
    z: number,
    w: number,
    d: number,
    extra?: Partial<RoomNode>,
  ): RoomNode | null => {
    if (!canPlaceRoom(x, z, w, d)) return null;
    const room: RoomNode = {
      id: id('room', roomCounter++),
      kind,
      gridPos: { x, z },
      width: w,
      depth: d,
      connections: [],
      seed: Math.floor(rng() * 1_000_000),
      ...extra,
    };
    markRect(x, z, w, d);
    rooms.push(room);
    return room;
  };

  const linkRooms = (
    parent: RoomNode,
    child: RoomNode,
    parentDoor: RoomDoor,
    childDoor: RoomDoor,
    cells: GridPos[],
  ) => {
    parent.connections.push(child.id);
    child.connections.push(parent.id);
    connections.push({
      from: parent.id,
      to: child.id,
      fromDoor: parentDoor,
      toDoor: childDoor,
      cells,
      entranceFrom: cells[0]!,
      entranceTo: cells[cells.length - 1]!,
    });
  };

  const randomRoomSize = () => ({
    w: config.roomMinSize + Math.floor(rng() * (config.roomMaxSize - config.roomMinSize + 1)),
    d: config.roomMinSize + Math.floor(rng() * (config.roomMaxSize - config.roomMinSize + 1)),
  });

  const graphRef = (): DungeonGraph => ({ rooms, connections, spawnRoomId: '', seed });

  const tryAttachFixedSide = (
    parent: RoomNode,
    side: Side,
    kind: RoomKind,
    w: number,
    d: number,
    extra?: Partial<RoomNode>,
  ): RoomNode | null => {
    if (!getFreeSides(parent, graphRef()).includes(side)) return null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const corridorLen = corrMin + Math.floor(rng() * (corrMax - corrMin + 1));
      const attach = computeAttachment(parent, side, w, d, corridorLen, rng);
      if (!canPlaceRoom(attach.childX, attach.childZ, w, d)) continue;
      if (!canPlaceCells(attach.cells)) continue;
      const child = addRoom(kind, attach.childX, attach.childZ, w, d, extra);
      if (!child) continue;
      markCells(attach.cells);
      linkRooms(parent, child, attach.parentDoor, attach.childDoor, attach.cells);
      return child;
    }
    return null;
  };

  const tryAttach = (
    parent: RoomNode,
    kind: RoomKind,
    w: number,
    d: number,
    extra?: Partial<RoomNode>,
    opts?: { sides?: Side[]; forbidSameProject?: boolean },
  ): RoomNode | null => {
    if (
      opts?.forbidSameProject &&
      parent.kind === 'project' &&
      extra?.projectId &&
      parent.projectId === extra.projectId
    ) {
      return null;
    }

    const free = getFreeSides(parent, graphRef());
    let sides = free.filter((s) => !opts?.sides || opts.sides.includes(s));
    sides = sides.sort(() => rng() - 0.5);

    for (const side of sides) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const corridorLen = corrMin + Math.floor(rng() * (corrMax - corrMin + 1));
        const attach = computeAttachment(parent, side, w, d, corridorLen, rng);

        if (!canPlaceRoom(attach.childX, attach.childZ, w, d)) continue;
        if (!canPlaceCells(attach.cells)) continue;

        const child = addRoom(kind, attach.childX, attach.childZ, w, d, extra);
        if (!child) continue;

        markCells(attach.cells);
        linkRooms(parent, child, attach.parentDoor, attach.childDoor, attach.cells);
        return child;
      }
    }
    return null;
  };

  /** Cualquier sala con al menos una pared libre — para colocar proyectos */
  const attachmentCandidates = (near?: RoomNode): RoomNode[] => {
    const list = rooms.filter((r) => getFreeSides(r, graphRef()).length > 0);
    if (!near) return list.sort((a, b) => a.connections.length - b.connections.length);
    const nx = near.gridPos.x + near.width / 2;
    const nz = near.gridPos.z + near.depth / 2;
    return list.sort((a, b) => {
      const ax = a.gridPos.x + a.width / 2;
      const az = a.gridPos.z + a.depth / 2;
      const bx = b.gridPos.x + b.width / 2;
      const bz = b.gridPos.z + b.depth / 2;
      const da = (ax - nx) ** 2 + (az - nz) ** 2;
      const db = (bx - nx) ** 2 + (bz - nz) ** 2;
      if (a.connections.length !== b.connections.length) {
        return a.connections.length - b.connections.length;
      }
      return da - db;
    });
  };

  const portfolioHub = config.portfolioHub !== false;

  const attachGenericFrom = (parent: RoomNode): RoomNode | null => {
    if (portfolioHub && parent.kind === 'project') return null;
    const { w, d } = randomRoomSize();
    return tryAttach(parent, pick(rng, GENERIC_KINDS), w, d);
  };

  /** Garantiza al menos `minDoors` conexiones (entrada + salida) */
  const ensureExit = (room: RoomNode, minDoors = 2): void => {
    if (getFreeSides(room, graphRef()).length === 0) return;
    let attempts = 0;
    while (room.connections.length < minDoors && getFreeSides(room, graphRef()).length > 0 && attempts < 12) {
      attempts++;
      const next = attachGenericFrom(room);
      if (!next) break;
    }
  };

  const openDeadEnds = (): number => {
    let opened = 0;
    for (const room of [...rooms]) {
      if (room.connections.length === 1 && getFreeSides(room, graphRef()).length > 0) {
        if (attachGenericFrom(room)) opened++;
      }
    }
    return opened;
  };

  const tryPlaceProject = (
    projectId: string,
    variantId: string,
    near?: RoomNode,
    forbidSameProject = false,
  ): RoomNode | null => {
    const extra = { projectId, variantId };
    const sizes = [4, 4, 5, 4, 5];

    for (const size of sizes) {
      const parents = attachmentCandidates(near).sort(() => rng() - 0.5);
      for (const parent of parents) {
        const placed = tryAttach(parent, 'project', size, size, extra, {
          forbidSameProject,
        });
        if (placed) return placed;
      }
    }
    return null;
  };

  const pickRandomProject = (): { projectId: string; variantId: string } => {
    const projectId = pick(rng, projectIds);
    return { projectId, variantId: pick(rng, getVariantIds(projectId)) };
  };

  const placeThematicRoom = (near?: RoomNode, forbidAdjacentSame = false): boolean => {
    if (projectRoomCount >= targetProjectRooms) return false;
    const { projectId, variantId } = pickRandomProject();
    const placed = tryPlaceProject(projectId, variantId, near, forbidAdjacentSame);
    if (placed) {
      projectRoomCount++;
      ensureExit(placed, minProjectDoors);
      return true;
    }
    return false;
  };

  const pickExpansionParent = (): RoomNode | null => {
    const candidates = rooms
      .filter((r) => {
        if (portfolioHub && r.kind === 'project') return false;
        return getFreeSides(r, graphRef()).length > 0;
      })
      .sort((a, b) => a.connections.length - b.connections.length);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(rng() * Math.min(candidates.length, 8))]!;
  };

  const ensureAllProjectExits = (): void => {
    if (portfolioHub) return;
    for (const room of rooms.filter((r) => r.kind === 'project')) {
      ensureExit(room, minProjectDoors);
    }
    for (let pass = 0; pass < 8; pass++) {
      let fixed = 0;
      for (const room of rooms.filter((r) => r.kind === 'project')) {
        if (room.connections.length < minProjectDoors && getFreeSides(room, graphRef()).length > 0) {
          if (attachGenericFrom(room)) fixed++;
        }
      }
      if (fixed === 0) break;
    }
  };

  const spawnW = 5 + Math.floor(rng() * 2);
  const spawnD = 5 + Math.floor(rng() * 2);
  const spawn = addRoom('junction', 0, 0, spawnW, spawnD);
  if (!spawn) throw new Error('Failed to place spawn room');

  const attachBackroomsBranch = (parent: RoomNode, sides: Side[]) => {
    for (const side of sides.sort(() => rng() - 0.5)) {
      if (!getFreeSides(parent, graphRef()).includes(side)) continue;
      const kind = pick(rng, GENERIC_KINDS);
      const w = 3 + Math.floor(rng() * 3);
      const d = 3 + Math.floor(rng() * 3);
      if (tryAttachFixedSide(parent, side, kind, w, d)) return true;
    }
    return false;
  };

  if (portfolioHub) {
    // Hub portfolio: spawn → P1 → P2 → P3 → P4 → P5 (cadena al este)
    let chainTail = spawn;
    const projectSize = 5;
    for (const projectId of projectIds) {
      const variants = getVariantIds(projectId);
      const variantId = variants[0] ?? 'default';
      const placed = tryAttachFixedSide(chainTail, 'east', 'project', projectSize, projectSize, {
        projectId,
        variantId,
      });
      if (placed) {
        projectRoomCount++;
        chainTail = placed;
      }
    }

    // Ramas backrooms desde el spawn (norte, sur, oeste)
    attachBackroomsBranch(spawn, ['south', 'north', 'west']);

    for (let i = 0; i < config.genericRoomCount; i++) {
      const parent = pickExpansionParent();
      if (!parent) break;
      attachGenericFrom(parent);
    }

    // Segunda salida en la última sala del portfolio (solo pasillos genéricos, no desde salas temáticas)
    if (chainTail !== spawn && chainTail.kind !== 'project') {
      ensureExit(chainTail, minProjectDoors);
    }
  } else {
    attachGenericFrom(spawn);
    attachGenericFrom(spawn);

    placeThematicRoom(spawn);
    placeThematicRoom(spawn);
    const nearSpawn = rooms.filter((r) => r.id !== spawn.id && spawn.connections.includes(r.id));
    for (const hub of nearSpawn) {
      placeThematicRoom(hub);
    }

    for (let i = 0; i < config.genericRoomCount; i++) {
      const parent = pickExpansionParent();
      if (!parent) break;

      const wantThematic =
        projectRoomCount < targetProjectRooms &&
        (i % projectSpacing === 0 || rng() < 0.72);

      if (wantThematic) {
        if (!placeThematicRoom(parent, true)) {
          const generic = attachGenericFrom(parent);
          if (generic) placeThematicRoom(generic);
        }
      } else {
        const generic = attachGenericFrom(parent);
        if (generic && projectRoomCount < targetProjectRooms && rng() < 0.65) {
          placeThematicRoom(generic);
        }
      }
    }

    for (let attempt = 0; attempt < targetProjectRooms * 3 && projectRoomCount < targetProjectRooms; attempt++) {
      const parent = pickExpansionParent();
      if (!parent) break;
      if (!placeThematicRoom(parent)) {
        attachGenericFrom(parent);
      }
    }

    for (const projectId of projectIds) {
      const hasProject = rooms.some((r) => r.kind === 'project' && r.projectId === projectId);
      if (hasProject) continue;
      const variantId = pick(rng, getVariantIds(projectId));
      const placed = tryPlaceProject(projectId, variantId, spawn, true);
      if (placed) {
        projectRoomCount++;
        ensureExit(placed, minProjectDoors);
      }
    }
  }

  // ── Post-proceso: salidas en salas temáticas + menos callejones ──
  ensureAllProjectExits();
  for (let pass = 0; pass < 6 && openDeadEnds() > 0; pass++) {}
  ensureAllProjectExits();

  if (spawn.connections.length < 2) {
    ensureExit(spawn, 2);
  }

  return { rooms, connections, spawnRoomId: spawn.id, seed };
}

export function getCorridors(graph: DungeonGraph) {
  return graph.connections;
}

function generateGalleryLoopDungeon(
  projectIds: string[],
  getVariantIds: (projectId: string) => string[],
  config: GeneratorConfig,
  seed: number,
): DungeonGraph {
  const rng = mulberry32(seed);
  const corrMin = config.corridorMinLength ?? 2;
  const corrMax = config.corridorMaxLength ?? 5;
  const proceduralRepeats = config.proceduralProjectRepeats ?? 10;

  const { graph: base, exitRoomIds } = buildGalleryLoopGraph(projectIds, getVariantIds);
  const rooms = base.rooms;
  const connections = base.connections;
  const occupied = getOccupiedCells(base);
  let roomCounter = rooms.length;
  let projectRepeatIndex = 0;

  const markRect = (x: number, z: number, w: number, d: number) => {
    for (let ix = x; ix < x + w; ix++) {
      for (let iz = z; iz < z + d; iz++) occupied.add(gridKeyOccupied(ix, iz));
    }
  };

  const markCells = (cells: GridPos[]) => {
    for (const c of cells) occupied.add(gridKeyOccupied(c.x, c.z));
  };

  const cellInsideAnyRoom = (cx: number, cz: number): boolean => {
    for (const room of rooms) {
      const { x, z } = room.gridPos;
      if (cx >= x && cx < x + room.width && cz >= z && cz < z + room.depth) return true;
    }
    return false;
  };

  const canPlaceRoom = (x: number, z: number, w: number, d: number, padding = 1) => {
    for (let ix = x - padding; ix < x + w + padding; ix++) {
      for (let iz = z - padding; iz < z + d + padding; iz++) {
        if (occupied.has(gridKeyOccupied(ix, iz))) return false;
      }
    }
    return true;
  };

  const canPlaceCells = (cells: GridPos[]) =>
    cells.every((c) => !occupied.has(gridKeyOccupied(c.x, c.z)) && !cellInsideAnyRoom(c.x, c.z));

  const graphRef = (): DungeonGraph => ({ rooms, connections, spawnRoomId: base.spawnRoomId, seed });

  const addRoom = (
    kind: RoomKind,
    x: number,
    z: number,
    w: number,
    d: number,
    extra?: Partial<RoomNode>,
  ): RoomNode | null => {
    if (!canPlaceRoom(x, z, w, d)) return null;
    const room: RoomNode = {
      id: id('room', roomCounter++),
      kind,
      gridPos: { x, z },
      width: w,
      depth: d,
      connections: [],
      seed: Math.floor(rng() * 1_000_000),
      ...extra,
    };
    markRect(x, z, w, d);
    rooms.push(room);
    return room;
  };

  const linkRooms = (
    parent: RoomNode,
    child: RoomNode,
    parentDoor: RoomDoor,
    childDoor: RoomDoor,
    cells: GridPos[],
  ) => {
    parent.connections.push(child.id);
    child.connections.push(parent.id);
    connections.push({
      from: parent.id,
      to: child.id,
      fromDoor: parentDoor,
      toDoor: childDoor,
      cells,
      entranceFrom: cells[0]!,
      entranceTo: cells[cells.length - 1]!,
    });
  };

  const getFreeSides = (room: RoomNode): Side[] => {
    const used = getUsedSides(room.id, graphRef());
    return SIDES.filter((s) => !used.has(s));
  };

  const tryAttach = (
    parent: RoomNode,
    kind: RoomKind,
    w: number,
    d: number,
    extra?: Partial<RoomNode>,
  ): RoomNode | null => {
    const sides = getFreeSides(parent).sort(() => rng() - 0.5);
    for (const side of sides) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const corridorLen = corrMin + Math.floor(rng() * (corrMax - corrMin + 1));
        const attach = computeAttachment(parent, side, w, d, corridorLen, rng);
        if (!canPlaceRoom(attach.childX, attach.childZ, w, d)) continue;
        if (!canPlaceCells(attach.cells)) continue;
        const child = addRoom(kind, attach.childX, attach.childZ, w, d, extra);
        if (!child) continue;
        markCells(attach.cells);
        linkRooms(parent, child, attach.parentDoor, attach.childDoor, attach.cells);
        return child;
      }
    }
    return null;
  };

  const randomRoomSize = () => ({
    w: config.roomMinSize + Math.floor(rng() * (config.roomMaxSize - config.roomMinSize + 1)),
    d: config.roomMinSize + Math.floor(rng() * (config.roomMaxSize - config.roomMinSize + 1)),
  });

  const attachGenericFrom = (parent: RoomNode): RoomNode | null => {
    const { w, d } = randomRoomSize();
    return tryAttach(parent, pick(rng, GENERIC_KINDS), w, d, { lightingZone: 'backrooms' });
  };

  const placeRepeatProject = (parent: RoomNode): RoomNode | null => {
    const projectId = projectIds[projectRepeatIndex % projectIds.length]!;
    projectRepeatIndex++;
    const variantId = getVariantIds(projectId)[0] ?? 'default';
    return tryAttach(parent, 'project', 5, 5, {
      projectId,
      variantId,
      lightingZone: 'gallery',
    });
  };

  const pickExpansionParent = (): RoomNode | null => {
    const candidates = rooms
      .filter((r) => getFreeSides(r).length > 0)
      .sort((a, b) => a.connections.length - b.connections.length);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(rng() * Math.min(candidates.length, 10))]!;
  };

  const exitRooms = exitRoomIds.map((eid) => rooms.find((r) => r.id === eid)!).filter(Boolean);
  let proceduralBudget = config.genericRoomCount;

  for (const exit of exitRooms) {
    attachGenericFrom(exit);
    proceduralBudget--;
  }

  for (let i = 0; i < proceduralBudget; i++) {
    const parent = pickExpansionParent();
    if (!parent) break;
    if (i % 3 === 2 && projectRepeatIndex < proceduralRepeats) {
      if (!placeRepeatProject(parent)) attachGenericFrom(parent);
    } else {
      attachGenericFrom(parent);
    }
  }

  for (let i = 0; projectRepeatIndex < proceduralRepeats && i < proceduralRepeats * 2; i++) {
    const parent = pickExpansionParent();
    if (!parent) break;
    if (!placeRepeatProject(parent)) attachGenericFrom(parent);
  }

  return { rooms, connections, spawnRoomId: base.spawnRoomId, seed };
}
