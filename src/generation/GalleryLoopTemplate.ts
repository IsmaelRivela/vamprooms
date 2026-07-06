import type {
  DungeonGraph,
  GridPos,
  RoomConnection,
  RoomDoor,
  RoomKind,
  RoomNode,
  Side,
} from './DungeonGenerator';

const DOOR5 = 2;
const DOOR3 = 1;

function corridorCellsNS(doorX: number, zFrom: number, zTo: number): GridPos[] {
  const cells: GridPos[] = [];
  const step = zFrom <= zTo ? 1 : -1;
  for (let z = zFrom; z !== zTo + step; z += step) cells.push({ x: doorX, z });
  return cells;
}

function corridorCellsEW(doorZ: number, xFrom: number, xTo: number): GridPos[] {
  const cells: GridPos[] = [];
  const step = xFrom <= xTo ? 1 : -1;
  for (let x = xFrom; x !== xTo + step; x += step) cells.push({ x, z: doorZ });
  return cells;
}

interface AttachFixed {
  childX: number;
  childZ: number;
  parentDoor: RoomDoor;
  childDoor: RoomDoor;
  cells: GridPos[];
}

function attachFixed(
  parent: Pick<RoomNode, 'gridPos' | 'width' | 'depth'>,
  side: Side,
  childW: number,
  childD: number,
  corridorLen: number,
  parentOff: number,
  childOff: number,
): AttachFixed {
  const px = parent.gridPos.x;
  const pz = parent.gridPos.z;

  if (side === 'north') {
    const doorX = px + parentOff;
    return {
      childX: doorX - childOff,
      childZ: pz - corridorLen - childD,
      parentDoor: { side: 'north', offset: parentOff },
      childDoor: { side: 'south', offset: childOff },
      cells: corridorCellsNS(doorX, pz - 1, pz - corridorLen),
    };
  }
  if (side === 'south') {
    const doorX = px + parentOff;
    return {
      childX: doorX - childOff,
      childZ: pz + parent.depth + corridorLen,
      parentDoor: { side: 'south', offset: parentOff },
      childDoor: { side: 'north', offset: childOff },
      cells: corridorCellsNS(doorX, pz + parent.depth, pz + parent.depth + corridorLen - 1),
    };
  }
  if (side === 'east') {
    const doorZ = pz + parentOff;
    return {
      childX: px + parent.width + corridorLen,
      childZ: doorZ - childOff,
      parentDoor: { side: 'east', offset: parentOff },
      childDoor: { side: 'west', offset: childOff },
      cells: corridorCellsEW(doorZ, px + parent.width, px + parent.width + corridorLen - 1),
    };
  }
  const doorZ = pz + parentOff;
  return {
    childX: px - corridorLen - childW,
    childZ: doorZ - childOff,
    parentDoor: { side: 'west', offset: parentOff },
    childDoor: { side: 'east', offset: childOff },
    cells: corridorCellsEW(doorZ, px - corridorLen, px - 1),
  };
}

interface RoomSpec {
  key: string;
  kind: RoomKind;
  w: number;
  d: number;
  projectId?: string;
  variantId?: string;
  lightingZone?: 'gallery' | 'backrooms';
  loopExit?: boolean;
}

interface LinkSpec {
  from: string;
  to: string;
  side: Side;
  childSide: Side;
  len: number;
  parentOff?: number;
  childOff?: number;
  /** Segunda entrada a sala ya colocada — no recalcula posición */
  merge?: boolean;
}

function key(x: number, z: number) {
  return `${x},${z}`;
}

function gallerySpecs(projectIds: string[], getVariantIds: (id: string) => string[]): RoomSpec[] {
  const v = (pid: string) => getVariantIds(pid)[0] ?? 'default';
  const P = (k: string, pid: string): RoomSpec => ({
    key: k,
    kind: 'project',
    w: 5,
    d: 5,
    projectId: pid,
    variantId: v(pid),
    lightingZone: 'gallery',
  });

  return [
    { key: 'spawn', kind: 'office', w: 5, d: 5, lightingZone: 'backrooms' },
    { key: 'ln1', kind: 'junction', w: 3, d: 3 },
    { key: 'ls1', kind: 'junction', w: 3, d: 3 },
    { key: 'ln2', kind: 'corridor', w: 3, d: 3 },
    { key: 'ls2', kind: 'corridor', w: 3, d: 3 },
    { key: 'ln3', kind: 'junction', w: 3, d: 3 },
    { key: 'ls3', kind: 'junction', w: 3, d: 3 },
    P('tulipana', projectIds[0]!),
    P('copydad', projectIds[1]!),
    P('brand', projectIds[2]!),
    P('pharma', projectIds[3]!),
    P('back2school', projectIds[4]!),
    { key: 'exit', kind: 'junction', w: 5, d: 5, loopExit: true, lightingZone: 'backrooms' },
  ];
}

function galleryLinks(): LinkSpec[] {
  const L = (
    from: string,
    to: string,
    side: Side,
    childSide: Side,
    len: number,
    p = DOOR3,
    c = DOOR3,
    merge = false,
  ): LinkSpec => ({ from, to, side, childSide, len, parentOff: p, childOff: c, merge });

  return [
    L('spawn', 'ln1', 'north', 'south', 3, DOOR5, DOOR3),
    L('spawn', 'ls1', 'south', 'north', 3, DOOR5, DOOR3),
    L('ln1', 'ln2', 'east', 'west', 3),
    L('ls1', 'ls2', 'east', 'west', 3),
    L('ln2', 'ln3', 'east', 'west', 3),
    L('ls2', 'ls3', 'east', 'west', 3),
    L('ln3', 'tulipana', 'south', 'north', 2, DOOR3, DOOR5),
    L('ls3', 'tulipana', 'north', 'south', 4, DOOR3, DOOR5, true),
    L('tulipana', 'copydad', 'east', 'west', 3, DOOR5, DOOR5),
    L('copydad', 'brand', 'east', 'west', 3, DOOR5, DOOR5),
    L('brand', 'pharma', 'east', 'west', 3, DOOR5, DOOR5),
    L('pharma', 'back2school', 'east', 'west', 3, DOOR5, DOOR5),
    L('back2school', 'exit', 'east', 'west', 3, DOOR5, DOOR5),
  ];
}

/** Encuentra pasillo entre parent y child ya colocados (prueba offsets). */
function attachToPlacedChild(
  parent: RoomNode,
  child: RoomNode,
  side: Side,
  childSide: Side,
  len: number,
): AttachFixed | null {
  for (let pOff = 0; pOff < Math.max(parent.width, parent.depth); pOff++) {
    for (let cOff = 0; cOff < Math.max(child.width, child.depth); cOff++) {
      const attach = attachFixed(parent, side, child.width, child.depth, len, pOff, cOff);
      if (attach.childX === child.gridPos.x && attach.childZ === child.gridPos.z) {
        attach.parentDoor = { side, offset: pOff };
        attach.childDoor = { side: childSide, offset: cOff };
        return attach;
      }
    }
  }
  return null;
}

export function buildGalleryLoopGraph(
  projectIds: string[],
  getVariantIds: (id: string) => string[],
): { graph: DungeonGraph; exitRoomIds: string[] } {
  const specs = gallerySpecs(projectIds, getVariantIds);
  const specByKey = new Map(specs.map((s) => [s.key, s]));
  const links = galleryLinks();

  const posByKey = new Map<string, { x: number; z: number }>();
  posByKey.set('spawn', { x: 0, z: 10 });

  const tempParent = (k: string): RoomNode => {
    const spec = specByKey.get(k)!;
    const p = posByKey.get(k)!;
    return { id: k, kind: spec.kind, gridPos: p, width: spec.w, depth: spec.d, connections: [], seed: 0 };
  };

  for (const link of links) {
    if (!posByKey.has(link.from)) {
      throw new Error(`Gallery: parent "${link.from}" not placed before "${link.to}"`);
    }
    if (link.merge && posByKey.has(link.to)) continue;

    const parent = tempParent(link.from);
    const childSpec = specByKey.get(link.to)!;
    const attach = attachFixed(
      parent,
      link.side,
      childSpec.w,
      childSpec.d,
      link.len,
      link.parentOff ?? DOOR3,
      link.childOff ?? DOOR3,
    );

    if (!posByKey.has(link.to)) {
      posByKey.set(link.to, { x: attach.childX, z: attach.childZ });
    } else if (!link.merge) {
      const p = posByKey.get(link.to)!;
      if (p.x !== attach.childX || p.z !== attach.childZ) {
        throw new Error(`Gallery: "${link.to}" clash ${link.from}`);
      }
    }
  }

  const rooms: RoomNode[] = [];
  const byKey = new Map<string, RoomNode>();
  let roomCounter = 0;
  for (const spec of specs) {
    const pos = posByKey.get(spec.key);
    if (!pos) throw new Error(`Gallery: no position for ${spec.key}`);
    const room: RoomNode = {
      id: `gallery-${roomCounter++}`,
      kind: spec.kind,
      gridPos: pos,
      width: spec.w,
      depth: spec.d,
      connections: [],
      seed: roomCounter * 7919,
      projectId: spec.projectId,
      variantId: spec.variantId,
      lightingZone: spec.lightingZone,
      loopExit: spec.loopExit,
    };
    byKey.set(spec.key, room);
    rooms.push(room);
  }

  const occupied = new Set<string>();
  const markRect = (x: number, z: number, w: number, d: number) => {
    for (let ix = x; ix < x + w; ix++) {
      for (let iz = z; iz < z + d; iz++) {
        if (occupied.has(key(ix, iz))) throw new Error(`Gallery overlap at ${ix},${iz}`);
        occupied.add(key(ix, iz));
      }
    }
  };
  for (const room of rooms) markRect(room.gridPos.x, room.gridPos.z, room.width, room.depth);

  const connections: RoomConnection[] = [];
  for (const link of links) {
    const parent = byKey.get(link.from)!;
    const child = byKey.get(link.to)!;
    const childSpec = specByKey.get(link.to)!;

    let attach: AttachFixed | null;
    if (link.merge) {
      attach = attachToPlacedChild(parent, child, link.side, link.childSide, link.len);
      if (!attach) {
        attach = attachFixed(
          parent,
          link.side,
          childSpec.w,
          childSpec.d,
          link.len,
          link.parentOff ?? DOOR3,
          link.childOff ?? DOOR3,
        );
      }
    } else {
      attach = attachFixed(
        parent,
        link.side,
        childSpec.w,
        childSpec.d,
        link.len,
        link.parentOff ?? DOOR3,
        link.childOff ?? DOOR3,
      );
    }

    for (const c of attach.cells) {
      if (occupied.has(key(c.x, c.z))) {
        throw new Error(`Gallery corridor overlap ${c.x},${c.z} (${link.from}->${link.to})`);
      }
      occupied.add(key(c.x, c.z));
    }

    parent.connections.push(child.id);
    child.connections.push(parent.id);
    connections.push({
      from: parent.id,
      to: child.id,
      fromDoor: attach.parentDoor,
      toDoor: attach.childDoor,
      cells: attach.cells,
      entranceFrom: attach.cells[0]!,
      entranceTo: attach.cells[attach.cells.length - 1]!,
    });
  }

  const spawn = byKey.get('spawn')!;
  return {
    graph: { rooms, connections, spawnRoomId: spawn.id, seed: 0 },
    exitRoomIds: rooms.filter((r) => r.loopExit).map((r) => r.id),
  };
}

export function getOccupiedCells(graph: DungeonGraph): Set<string> {
  const occupied = new Set<string>();
  for (const room of graph.rooms) {
    for (let ix = room.gridPos.x; ix < room.gridPos.x + room.width; ix++) {
      for (let iz = room.gridPos.z; iz < room.gridPos.z + room.depth; iz++) {
        occupied.add(key(ix, iz));
      }
    }
  }
  for (const conn of graph.connections) {
    for (const c of conn.cells) occupied.add(key(c.x, c.z));
  }
  return occupied;
}

export { key as gridKey };
