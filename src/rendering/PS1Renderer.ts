import * as THREE from 'three';

/** Material PS1 con Lambert — responde a linterna y fluorescentes */
export function createPS1Material(color: number, map?: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    color,
    map: map ?? null,
  });
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.minFilter = THREE.NearestFilter;
    map.magFilter = THREE.NearestFilter;
    map.generateMipmaps = false;
  }
  return mat;
}

export function snapGeometry(geometry: THREE.BufferGeometry, snap = 0.1): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position');
  if (!pos) return geometry;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.round(arr[i] / snap) * snap;
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createWallTexture(wallColor: string, stripeColor: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = stripeColor;
  for (let y = 0; y < 128; y += 16) {
    ctx.fillRect(0, y, 128, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export function createCarpetTexture(base: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = accent;
  for (let x = 0; x < 64; x += 8) {
    for (let y = 0; y < 64; y += 8) {
      if ((x + y) % 16 === 0) ctx.fillRect(x, y, 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export interface PS1RendererOptions {
  internalWidth?: number;
  internalHeight?: number;
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
}

/**
 * Pipeline PS1 estable:
 * - Res interna moderada (no 320x240 Doom)
 * - Upscale suave a pantalla
 * - Color banding + viñeta ligera en post
 */
export class PS1Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: THREE.WebGLRenderTarget;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly postScene: THREE.Scene;
  readonly postCamera: THREE.OrthographicCamera;
  readonly postMaterial: THREE.ShaderMaterial;

  internalWidth: number;
  internalHeight: number;

  constructor(canvas: HTMLCanvasElement, options: PS1RendererOptions = {}) {
    const aspect = window.innerWidth / window.innerHeight;
    this.internalHeight = options.internalHeight ?? 400;
    this.internalWidth = options.internalWidth ?? Math.round(this.internalHeight * aspect);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'low-power',
      depth: true,
      stencil: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = false;

    this.composer = new THREE.WebGLRenderTarget(this.internalWidth, this.internalHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.composer.texture.colorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    const fogColor = options.fogColor ?? 0x8a8070;
    this.scene.fog = new THREE.Fog(fogColor, options.fogNear ?? 28, options.fogFar ?? 100);
    this.scene.background = new THREE.Color(fogColor);

    this.camera = new THREE.PerspectiveCamera(63, aspect, 0.08, 120);
    this.scene.add(this.camera);

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.postMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.composer.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;

        vec3 ps1Quantize(vec3 c) {
          return floor(c * 48.0 + 0.5) / 48.0;
        }

        void main() {
          vec2 uv = vUv;
          vec2 dir = uv - 0.5;
          vec3 col = texture2D(tDiffuse, uv).rgb;
          col *= 0.96;
          col *= 1.0 - dot(dir, dir) * 0.1;
          col = ps1Quantize(col);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.internalWidth = Math.round(this.internalHeight * aspect);

    this.renderer.setSize(w, h, false);
    this.composer.setSize(this.internalWidth, this.internalHeight);

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  render(_time: number) {
    this.renderer.setRenderTarget(this.composer);
    this.renderer.render(this.scene, this.camera);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    this.composer.dispose();
    this.postMaterial.dispose();
    this.renderer.dispose();
  }
}
