import type { FloorTheme, WallTheme } from './ProjectThemes';
import { publicUrl } from '../utils/publicUrl';

/** Overrides de superficies de sala (editable en layout editor). */
export interface RoomThemeOverride {
  wall?: WallTheme;
  floor?: FloorTheme;
  /** PNG del pack tiny — anula el preset de pared */
  wallTexture?: string;
  floorTexture?: string;
  wallRepeat?: [number, number];
  floorRepeat?: [number, number];
  ceilTint?: number;
}

export interface PlacedProp {
  id: string;
  label: string;
  src: string;
  kind: 'model' | 'image';
  /** Offset desde el centro de la sala (default). X=izq/der, Z=atrás/adelante */
  space?: 'room' | 'world';
  position: [number, number, number];
  /** Rotación en radianes (legacy) */
  rotation?: [number, number, number];
  /** Rotación en grados — más fácil de editar a mano */
  rotationDeg?: [number, number, number];
  /** Rotación local del modelo (útil con spin: tumbado en el mesh, giro en Y en el pivot) */
  modelRotationDeg?: [number, number, number];
  scale: number;
  /** Altura objetivo del modelo antes de aplicar scale (metros) */
  fitSize?: number;
  /** Ajuste fino vertical tras apoyar en suelo */
  yOffset?: number;
  /** Rotación continua (productos en pedestal) */
  spin?: boolean;
  /** Objeto recogible en primera persona */
  pickup?: 'cigarette';
  /** Sub-objeto dentro de un FBX multi-asset (ej. All.fbx → "Plants_03") */
  objectName?: string;
}

export interface RoomLayout {
  version: 1;
  projectId: string;
  /** Texturas suelo/pared (opcional; si falta usa theme del proyecto) */
  theme?: RoomThemeOverride;
  props: PlacedProp[];
}

export function propRotation(prop: PlacedProp): [number, number, number] {
  if (prop.rotationDeg) {
    const d = Math.PI / 180;
    return [prop.rotationDeg[0] * d, prop.rotationDeg[1] * d, prop.rotationDeg[2] * d];
  }
  return prop.rotation ?? [0, 0, 0];
}

function isZeroDeg(deg: [number, number, number]): boolean {
  return deg.every((v) => v === 0);
}

export function propModelRotation(prop: PlacedProp): [number, number, number] | undefined {
  const d = Math.PI / 180;
  if (prop.modelRotationDeg && !isZeroDeg(prop.modelRotationDeg)) {
    return [prop.modelRotationDeg[0] * d, prop.modelRotationDeg[1] * d, prop.modelRotationDeg[2] * d];
  }
  if (prop.spin && prop.rotationDeg && !isZeroDeg(prop.rotationDeg)) {
    return [prop.rotationDeg[0] * d, prop.rotationDeg[1] * d, prop.rotationDeg[2] * d];
  }
  return undefined;
}

export async function loadLayout(projectId: string): Promise<RoomLayout> {
  try {
    const res = await fetch(publicUrl(`room-layouts/${projectId}.json`));
    if (res.ok) return (await res.json()) as RoomLayout;
  } catch {
    /* offline dev */
  }
  return { version: 1, projectId, props: [] };
}
