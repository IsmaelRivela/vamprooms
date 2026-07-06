import * as THREE from 'three';
import type { Interactable } from '../world/RoomBuilder';
import type { WorldPickable } from '../world/LayoutProps';
import { CELL } from '../world/RoomBuilder';

const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 6;
const LOOK_SENS = 0.0022;
const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function isTypingInForm(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return true;
  }
  return (el as HTMLElement).isContentEditable;
}

export class Player {
  position = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  readonly velocity = new THREE.Vector3();

  private keys = new Set<string>();
  private locked = false;
  private readonly inputAbort = new AbortController();

  constructor(private dom: HTMLElement) {
    const signal = this.inputAbort.signal;

    dom.addEventListener(
      'click',
      () => {
        dom.focus({ preventScroll: true });
        this.requestLock();
      },
      { signal },
    );

    document.addEventListener(
      'pointerlockchange',
      () => {
        this.locked = document.pointerLockElement === dom;
      },
      { signal },
    );

    window.addEventListener('keydown', (e) => this.onKeyDown(e), { capture: true, signal });
    window.addEventListener('keyup', (e) => this.onKeyUp(e), { capture: true, signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });

    document.addEventListener(
      'mousemove',
      (e) => {
        if (!this.locked) return;
        this.yaw -= e.movementX * LOOK_SENS;
        this.pitch -= e.movementY * LOOK_SENS;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
      },
      { signal },
    );
  }

  get isPointerLocked(): boolean {
    return this.locked;
  }

  private onKeyDown(e: KeyboardEvent) {
    if (!MOVE_KEYS.has(e.code)) return;
    if (isTypingInForm()) return;
    e.preventDefault();
    this.keys.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }

  requestLock() {
    if (document.pointerLockElement === this.dom) return;
    void this.dom.requestPointerLock();
  }

  spawnAt(pos: THREE.Vector3, yaw = 0) {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.keys.clear();
  }

  resolveSpawn(colliders: THREE.Box3[]) {
    if (!this.collides(this.position, colliders)) return;
    for (let r = 0.4; r <= 4; r += 0.4) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const test = new THREE.Vector3(
          this.position.x + Math.cos(a) * r,
          this.position.y,
          this.position.z + Math.sin(a) * r,
        );
        if (!this.collides(test, colliders)) {
          this.position.copy(test);
          return;
        }
      }
    }
  }

  update(dt: number, colliders: THREE.Box3[]) {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(forward);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * dt);
      this.tryMove(move, colliders);
    }
  }

  private readonly lookTarget = new THREE.Vector3();

  applyToCamera(camera: THREE.PerspectiveCamera) {
    camera.position.copy(this.position);
    this.lookTarget.set(
      this.position.x - Math.sin(this.yaw) * Math.cos(this.pitch),
      this.position.y + Math.sin(this.pitch),
      this.position.z - Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    camera.lookAt(this.lookTarget);
    camera.updateMatrixWorld(true);
  }

  private tryMove(delta: THREE.Vector3, colliders: THREE.Box3[]) {
    const axes = [
      new THREE.Vector3(delta.x, 0, 0),
      new THREE.Vector3(0, 0, delta.z),
    ];

    for (const axis of axes) {
      if (axis.lengthSq() === 0) continue;
      const next = this.position.clone().add(axis);
      if (!this.collides(next, colliders)) {
        this.position.copy(next);
      }
    }
  }

  private collides(pos: THREE.Vector3, colliders: THREE.Box3[]): boolean {
    const box = new THREE.Box3(
      new THREE.Vector3(pos.x - PLAYER_RADIUS, 0, pos.z - PLAYER_RADIUS),
      new THREE.Vector3(pos.x + PLAYER_RADIUS, PLAYER_HEIGHT, pos.z + PLAYER_RADIUS),
    );

    const limit = 80;
    if (Math.abs(pos.x) > limit * CELL || Math.abs(pos.z) > limit * CELL) return true;

    for (const c of colliders) {
      if (box.intersectsBox(c)) return true;
    }
    return false;
  }

  dispose() {
    this.keys.clear();
    this.inputAbort.abort();
    if (document.pointerLockElement === this.dom) {
      document.exitPointerLock();
    }
  }
}

export function findNearestInteractable(
  playerPos: THREE.Vector3,
  yaw: number,
  interactables: Interactable[],
  maxDist = 2.8,
): Interactable | null {
  const look = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  let best: (typeof interactables)[0] | null = null;
  let bestScore = Infinity;

  for (const item of interactables) {
    const to = item.position.clone().sub(playerPos);
    to.y = 0;
    const dist = to.length();
    if (dist > maxDist) continue;
    to.normalize();
    const dot = look.dot(to);
    if (dot < 0.55) continue;
    const score = dist - dot;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export function findNearestPickable(
  playerPos: THREE.Vector3,
  yaw: number,
  pickables: WorldPickable[],
  maxDist = 2.4,
): WorldPickable | null {
  const look = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  let best: WorldPickable | null = null;
  let bestScore = Infinity;

  for (const item of pickables) {
    if (!item.root.visible) continue;
    const to = item.position.clone().sub(playerPos);
    to.y = 0;
    const dist = to.length();
    if (dist > maxDist) continue;
    to.normalize();
    const dot = look.dot(to);
    if (dot < 0.5) continue;
    const score = dist - dot;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}
