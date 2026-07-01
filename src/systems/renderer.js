import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createRenderer(canvas, sizes) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  return renderer;
}

export function createPostProcessing(scene, camera, renderer, sizes) {
  const renderPass = new RenderPass(scene, camera);

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(sizes.width, sizes.height),
    0.3,
    0.0,
    0.2,
  );
  bloomComposer.addPass(bloomPass);

  const finalRenderPass = new RenderPass(scene, camera);
  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(finalRenderPass);

  const BLOOM_SCENE = 1;
  const bloomLayer = new THREE.Layers();
  bloomLayer.set(BLOOM_SCENE);

  const darkMaterial = new THREE.MeshBasicMaterial({ color: 'black' });
  const darkBackground = new THREE.Color('black');
  const materials = {};

  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(baseTexture, vUv) + vec4(1.0) * texture2D(bloomTexture, vUv);
        }
      `,
    }),
    'baseTexture',
  );
  mixPass.needsSwap = true;
  finalComposer.addPass(mixPass);

  function darkenNonBloomed(obj) {
    if (obj.isMesh && bloomLayer.test(obj.layers) === false) {
      materials[obj.uuid] = obj.material;
      obj.material = darkMaterial;
    }
  }

  function restoreMaterial(obj) {
    if (materials[obj.uuid]) {
      obj.material = materials[obj.uuid];
      delete materials[obj.uuid];
    }
  }

  function resizePostProcessing(width, height) {
    bloomComposer.setSize(width, height);
    finalComposer.setSize(width, height);
  }
  const outputPass = new OutputPass();
  finalComposer.addPass(outputPass);

  return {
    bloomComposer,
    finalComposer,
    bloomLayer,
    BLOOM_SCENE,
    darkBackground,
    darkMaterial,
    darkenNonBloomed,
    materials,
    restoreMaterial,
    resizePostProcessing,
  };
}
