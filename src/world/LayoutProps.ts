import * as THREE from 'three';
import type { RoomLayout, PlacedProp } from './RoomLayout';
import { propRotation, propModelRotation } from './RoomLayout';
import type { Project } from '../data/projects';
import type { RoomNode } from '../generation/DungeonGenerator';
import { loadImageTexture } from './AssetTextures';
import { createPS1Material, snapGeometry } from '../rendering/PS1Renderer';
import {
  loadPS1Model,
  createModelPlaceholder,
  displayOverrideForSrc,
  autoLayFlatIfStanding,
  alignSpinPivot,
} from './ModelLoader';
import { applyTvGlitchScreensForProp, isTvProp } from './TvScreenFx';
import { CELL } from './RoomBuilder';

export interface LayoutPropsGroup {
  group: THREE.Group;
  props: THREE.Object3D[];
}

export interface WorldPickable {
  kind: 'cigarette';
  root: THREE.Object3D;
  position: THREE.Vector3;
}

export function getRoomWorldCenter(room: RoomNode): { cx: number; cz: number } {
  return {
    cx: room.gridPos.x * CELL + (room.width * CELL) / 2,
    cz: room.gridPos.z * CELL + (room.depth * CELL) / 2,
  };
}

export function worldPositionForProp(prop: PlacedProp, room?: RoomNode): THREE.Vector3 {
  const [lx, ly, lz] = prop.position;
  if ((prop.space ?? 'room') === 'room' && room) {
    const { cx, cz } = getRoomWorldCenter(room);
    return new THREE.Vector3(cx + lx, ly, cz + lz);
  }
  return new THREE.Vector3(lx, ly, lz);
}

export function roomLocalFromWorld(
  world: THREE.Vector3,
  room: RoomNode,
): [number, number, number] {
  const { cx, cz } = getRoomWorldCenter(room);
  return [world.x - cx, world.y, world.z - cz];
}

export function spawnLayoutProp(prop: PlacedProp, room?: RoomNode): THREE.Group {
  const root = new THREE.Group();
  root.name = `layout-prop-${prop.id}`;
  root.userData.layoutPropId = prop.id;
  if (prop.pickup) root.userData.pickup = prop.pickup;
  const pos = worldPositionForProp(prop, room);
  root.position.copy(pos);
  const modelRot = propModelRotation(prop);
  const rot = modelRot && prop.spin ? [0, 0, 0] as [number, number, number] : propRotation(prop);
  root.rotation.set(rot[0], rot[1], rot[2]);
  root.scale.setScalar(prop.scale);
  return root;
}

function snapGroupToFloor(group: THREE.Object3D) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
}

export async function fillLayoutProp(root: THREE.Group, prop: PlacedProp): Promise<void> {
  if (prop.kind === 'model') {
    try {
      const fit = prop.fitSize ?? 0.85;
      const modelRot = propModelRotation(prop);
      const srcOverride = displayOverrideForSrc(prop.src);
      const { object, pivot } = await loadPS1Model(prop.src, fit, {
        spin: false,
        floorAlign: !prop.spin,
        yOffset: prop.yOffset ?? 0,
        objectName: prop.objectName,
        ...srcOverride,
      });

      pivot.remove(object);

      const offset = new THREE.Group();
      const tilt = new THREE.Group();
      offset.add(tilt);
      tilt.add(object);

      if (modelRot) {
        tilt.rotation.set(modelRot[0], modelRot[1], modelRot[2]);
      } else if (prop.spin && !srcOverride?.rotation) {
        autoLayFlatIfStanding(object);
      }

      if (prop.spin) {
        alignSpinPivot(pivot, offset, tilt);
      } else {
        snapGroupToFloor(tilt);
      }

      pivot.add(offset);
      pivot.userData.spin = prop.spin ?? false;
      pivot.userData.layoutPropId = prop.id;
      root.add(pivot);
      if (isTvProp(prop)) {
        await applyTvGlitchScreensForProp(root, pivot, prop);
      }
    } catch {
      const ph = createModelPlaceholder(prop.label);
      root.add(ph);
    }
    return;
  }

  const tex = await loadImageTexture(prop.src);
  const mat = createPS1Material(0xffffff, tex);
  const aspect = tex.image ? (tex.image as HTMLImageElement).width / (tex.image as HTMLImageElement).height : 1;
  const h = 0.8;
  const w = h * aspect;
  const plane = new THREE.Mesh(snapGeometry(new THREE.PlaneGeometry(w, h)), mat);
  plane.userData.layoutPropId = prop.id;
  root.add(plane);
}

export async function buildLayoutPropsForRoom(
  layout: RoomLayout,
  _project: Project,
  room?: RoomNode,
): Promise<LayoutPropsGroup> {
  const group = new THREE.Group();
  group.name = `layout-${layout.projectId}`;
  const props: THREE.Object3D[] = [];

  await Promise.all(
    layout.props.map(async (prop) => {
      const root = spawnLayoutProp(prop, room);
      await fillLayoutProp(root, prop);
      group.add(root);
      props.push(root);
    }),
  );

  return { group, props };
}
