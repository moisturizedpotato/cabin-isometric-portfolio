import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export function loadEnvironment(scene, manager) {
  const textureLoader = new THREE.TextureLoader();
  const previewTexture = textureLoader.load('/images/night_sky-v2.webp');
  previewTexture.mapping = THREE.EquirectangularReflectionMapping;
  previewTexture.colorSpace = THREE.SRGBColorSpace;

  scene.environment = previewTexture;
  scene.background = previewTexture;
  scene.backgroundIntensity = 0.4;

  const loadHighQualityEnvironment = () => {
    const exrLoader = new EXRLoader(manager);
    exrLoader.setDataType(THREE.HalfFloatType);

    exrLoader.load(
      '/images/night_sky-v2.exr',
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.background = texture;
        scene.backgroundIntensity = 1;
        scene.backgroundRotation.y = Math.PI / 32;
        scene.backgroundRotation.z = Math.PI / 16 + Math.PI / 32;
      },
      undefined,
      (error) => {
        console.warn('EXR environment load failed, using preview texture instead.', error);
      },
    );
  };

  const scheduleEnvironmentLoad = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => loadHighQualityEnvironment(), { timeout: 2000 });
      return;
    }

    window.setTimeout(loadHighQualityEnvironment, 1500);
  };

  scheduleEnvironmentLoad();

  return Promise.resolve(previewTexture);
}
