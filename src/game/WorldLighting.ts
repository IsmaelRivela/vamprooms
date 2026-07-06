import * as THREE from 'three';

export interface LightFixture {
  position: THREE.Vector3;
  phase: number;
  /** 0 = estable, 1 = muy inestable */
  instability: number;
  /** Sala temática — luz estable y fuerte */
  gallery?: boolean;
}

const MAX_FIXTURE_LIGHTS = 8;
const MAX_GALLERY_LIGHTS = 6;

export class WorldLighting {
  readonly ambient: THREE.AmbientLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fill: THREE.DirectionalLight;
  readonly galleryFill: THREE.DirectionalLight;
  private readonly fixtureLights: THREE.PointLight[] = [];
  private readonly galleryLights: THREE.PointLight[] = [];
  private fixtures: LightFixture[] = [];

  constructor(scene: THREE.Scene) {
    this.ambient = new THREE.AmbientLight(0xc8b888, 0.72);
    this.hemi = new THREE.HemisphereLight(0xe8dcc0, 0x6a5a40, 0.38);
    this.fill = new THREE.DirectionalLight(0xfff0d0, 0.28);
    this.fill.position.set(0, 12, 4);
    this.galleryFill = new THREE.DirectionalLight(0xfff8e8, 0.55);
    this.galleryFill.position.set(0, 16, 2);
    scene.add(this.ambient, this.hemi, this.fill, this.galleryFill);

    for (let i = 0; i < MAX_FIXTURE_LIGHTS; i++) {
      const pl = new THREE.PointLight(0xfff4dc, 0, 18, 1.4);
      pl.visible = false;
      scene.add(pl);
      this.fixtureLights.push(pl);
    }
    for (let i = 0; i < MAX_GALLERY_LIGHTS; i++) {
      const pl = new THREE.PointLight(0xfffaf0, 0, 22, 1.2);
      pl.visible = false;
      scene.add(pl);
      this.galleryLights.push(pl);
    }
  }

  setFixtures(fixtures: LightFixture[]): void {
    this.fixtures = fixtures;
  }

  update(time: number, playerPos: THREE.Vector3, flashlightOn = false, inGalleryZone = false): void {
    const backrooms = this.fixtures.filter((f) => !f.gallery);
    const gallery = this.fixtures.filter((f) => f.gallery);

    const nearestBack = [...backrooms]
      .map((f) => ({ f, d: f.position.distanceToSquared(playerPos) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_FIXTURE_LIGHTS);

    for (let i = 0; i < MAX_FIXTURE_LIGHTS; i++) {
      const light = this.fixtureLights[i]!;
      const entry = nearestBack[i];
      if (!entry || inGalleryZone) {
        light.intensity = 0;
        light.visible = false;
        continue;
      }
      const { f } = entry;
      light.visible = true;
      light.position.copy(f.position);
      const flick =
        Math.sin(time * (6 + f.instability * 8) + f.phase) * 0.18 +
        Math.sin(time * 19.3 + f.phase * 2) * 0.08 +
        (Math.random() > 0.992 - f.instability * 0.008 ? -0.35 : 0);
      const base = 1.35 - f.instability * 0.25;
      light.intensity = Math.max(0.65, base + flick);
      light.color.setHex(flick < -0.25 ? 0xd8d0a8 : 0xfff6dc);
    }

    const nearestGallery = [...gallery]
      .map((f) => ({ f, d: f.position.distanceToSquared(playerPos) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_GALLERY_LIGHTS);

    for (let i = 0; i < MAX_GALLERY_LIGHTS; i++) {
      const light = this.galleryLights[i]!;
      const entry = nearestGallery[i];
      if (!entry || !inGalleryZone) {
        light.intensity = 0;
        light.visible = false;
        continue;
      }
      light.visible = true;
      light.position.copy(entry.f.position);
      light.intensity = 2.1 + Math.sin(time * 1.2 + entry.f.phase) * 0.06;
      light.color.setHex(0xfffaf0);
    }

    if (inGalleryZone) {
      this.ambient.intensity = 0.95 + Math.sin(time * 0.5) * 0.02;
      this.hemi.intensity = 0.52;
      this.fill.intensity = 0.42;
      this.galleryFill.intensity = 0.62;
    } else {
      const ambientBase = flashlightOn ? 0.4 : 0.68;
      this.hemi.intensity = flashlightOn ? 0.22 : 0.38;
      this.fill.intensity = 0.28;
      this.galleryFill.intensity = 0;
      this.ambient.intensity = ambientBase + Math.sin(time * 0.9) * 0.04;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.ambient, this.hemi, this.fill, this.galleryFill);
    for (const l of this.fixtureLights) scene.remove(l);
    for (const l of this.galleryLights) scene.remove(l);
  }
}
