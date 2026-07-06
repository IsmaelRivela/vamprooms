import * as THREE from 'three';
import { configureImageTexture } from '../world/AssetTextures';

export interface GlitchScreenMaterial extends THREE.ShaderMaterial {
  uniforms: {
    map: { value: THREE.Texture };
    time: { value: number };
    power: { value: number };
  };
}

export function createGlitchScreenMaterial(map: THREE.Texture): GlitchScreenMaterial {
  configureImageTexture(map);

  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      time: { value: 0 },
      power: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float time;
      uniform float power;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 uv = vUv;

        if (power < 0.5) {
          float n = hash(uv * 18.0 + time * 0.4) * 0.025;
          gl_FragColor = vec4(vec3(0.018 + n), 1.0);
          return;
        }

        float tick = floor(time * 14.0);
        float burst = step(0.88, hash(vec2(tick, 0.37)));
        float micro = step(0.965, hash(vec2(tick, uv.y * 3.0)));

        float band = floor(uv.y * 28.0);
        uv.x += (hash(vec2(band, tick)) - 0.5) * burst * 0.11;
        uv.y += (hash(vec2(band + 7.0, tick)) - 0.5) * micro * 0.025;

        float split = (burst * 0.018) + micro * 0.006;
        vec3 col;
        col.r = texture2D(map, uv + vec2(split, 0.0)).r;
        col.g = texture2D(map, uv).g;
        col.b = texture2D(map, uv - vec2(split, 0.0)).b;

        float scan = 0.82 + 0.18 * sin(uv.y * 520.0 + time * 18.0);
        col *= scan;

        if (micro > 0.5) {
          col = mix(col, vec3(1.0), 0.35);
        }

        col *= 1.05 + burst * 0.25;
        col = floor(col * 40.0 + 0.5) / 40.0;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthWrite: true,
    side: THREE.DoubleSide,
  }) as GlitchScreenMaterial;
}
