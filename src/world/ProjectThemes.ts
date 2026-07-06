import * as THREE from 'three';
import type { Project, ProjectTheme } from '../data/projects';
import { createTinyThemedMaterials } from './TinyTextures';

export type WallTheme = ProjectTheme['wall'];
export type FloorTheme = ProjectTheme['floor'];

export interface ThemedMaterials {
  wall: THREE.Material;
  floor: THREE.Material;
  ceil: THREE.Material;
}

function finishCanvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGrassTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a7830';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    ctx.fillStyle = Math.random() > 0.5 ? '#4a9040' : '#2a6020';
    ctx.fillRect(x, y, 2, 3);
  }
  const flowers = ['#ed5b51', '#f0d878', '#fbf2f0', '#e888aa', '#ffffff'];
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    ctx.fillStyle = flowers[Math.floor(Math.random() * flowers.length)];
    ctx.beginPath();
    ctx.arc(x, y, 2 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0e040';
    ctx.fillRect(x - 0.5, y - 1, 1, 2);
  }
  return finishCanvasTex(c);
}

export function createNatureWallpaperTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f5f0e4';
  ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const ox = col * 42 + 8;
      const oy = row * 32 + 6;
      ctx.fillStyle = '#5a9850';
      ctx.beginPath();
      ctx.ellipse(ox + 12, oy + 14, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78b868';
      for (let l = 0; l < 5; l++) {
        ctx.beginPath();
        ctx.ellipse(ox + l * 5, oy + 8 + (l % 2) * 4, 6, 4, l * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ed5b51';
      ctx.beginPath();
      ctx.arc(ox + 18, oy + 10, 3, 0, Math.PI * 2);
      ctx.arc(ox + 6, oy + 16, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finishCanvasTex(c);
}

export function createWoodFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#6a5040' : '#5a4030';
    ctx.fillRect(0, i * 16, 128, 16);
    ctx.strokeStyle = '#3a2818';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, i * 16);
    ctx.lineTo(128, i * 16);
    ctx.stroke();
  }
  return finishCanvasTex(c);
}

export function createBrickWallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#585048';
  ctx.fillRect(0, 0, 128, 128);
  const brick = '#8a6858';
  const mortar = '#484038';
  for (let row = 0; row < 8; row++) {
    const off = row % 2 === 0 ? 0 : 16;
    for (let col = -1; col < 5; col++) {
      ctx.fillStyle = brick;
      ctx.fillRect(off + col * 32, row * 16 + 1, 30, 14);
      ctx.fillStyle = mortar;
      ctx.fillRect(off + col * 32, row * 16, 30, 1);
    }
  }
  return finishCanvasTex(c);
}

export function createClinicalWallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8ecf0';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#c8d0d8';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 64; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(64, i);
    ctx.stroke();
  }
  return finishCanvasTex(c);
}

export function createClinicalFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d0d8e0';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#b8c4cc';
  for (let x = 0; x < 64; x += 16) {
    for (let y = 0; y < 64; y += 16) {
      if ((x + y) % 32 === 0) ctx.fillRect(x + 1, y + 1, 14, 14);
    }
  }
  return finishCanvasTex(c);
}

export function createBrandWallTexture(accent: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const hex = `#${accent.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = hex;
  for (let y = 0; y < 128; y += 32) {
    ctx.fillRect(0, y, 128, 4);
  }
  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = hex;
  ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    ctx.fillText('V', 64, 40 + i * 44);
  }
  return finishCanvasTex(c);
}

export function createLinoleumTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8a858';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#b89848';
  for (let i = 0; i < 64; i += 8) {
    ctx.fillRect(i, 0, 4, 64);
    ctx.fillRect(0, i, 64, 4);
  }
  return finishCanvasTex(c);
}

export function createCheckerFloorTexture(c1: string, c2: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < 64; x += 8) {
    for (let y = 0; y < 64; y += 8) {
      ctx.fillStyle = (x + y) % 16 === 0 ? c1 : c2;
      ctx.fillRect(x, y, 8, 8);
    }
  }
  return finishCanvasTex(c);
}

export function createBackroomsWallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d8cc88';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#c4b870';
  for (let y = 0; y < 128; y += 16) ctx.fillRect(0, y, 128, 2);
  return finishCanvasTex(c);
}

export function createBackroomsFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#a89458';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#887040';
  for (let x = 0; x < 64; x += 8) {
    for (let y = 0; y < 64; y += 8) {
      if ((x + y) % 16 === 0) ctx.fillRect(x, y, 4, 4);
    }
  }
  return finishCanvasTex(c);
}

export function createThemedMaterials(theme: ProjectTheme, accent = 0xff0600): ThemedMaterials {
  return createTinyThemedMaterials(theme, accent);
}

/** Props decorativos por proyecto — desactivado: usamos GLBs vía room layouts */
export function addThemedProps(
  _group: THREE.Group,
  _project: Project,
  _cx: number,
  _cz: number,
  _x: number,
  _z: number,
  _w: number,
  _d: number,
  _rng: () => number,
) {
  /* props reales en LayoutProps / defaultRoomProps */
}
