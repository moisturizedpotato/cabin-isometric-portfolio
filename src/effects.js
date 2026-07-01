import * as THREE from 'three';

export function createWaterStream(length = 0.09) {
  const geometry = new THREE.BoxGeometry(0.008, 1, 0.02);
  geometry.translate(0, -0.5, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.5 });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.y = 0;
  return mesh;
}

export function createSplashParticles(count = 10) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    positions[index] = 0;
    positions[index + 1] = 0;
    positions[index + 2] = 0;

    velocities.push({
      x: (Math.random() - 0.5) * 0.03,
      y: Math.random() * 0.001 + 0.1,
      z: (Math.random() - 0.5) * 0.03,
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ size: 0.006, color: 0x88ddff, transparent: true, opacity: 0.8 });
  return {
    splashParticles: new THREE.Points(geometry, material),
    splashVelocities: velocities,
  };
}

export function createBubbleGroup(textureLoader, url, count = 15) {
  const texture = textureLoader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const bubblesData = [];

  for (let i = 0; i < count; i += 1) {
    const spriteTexture = texture.clone();
    spriteTexture.repeat.set(1 / 7, 1);
    spriteTexture.offset.set(Math.floor(Math.random() * 2) * (1 / 7), 0);

    const material = new THREE.SpriteMaterial({
      map: spriteTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.026, 0.026, 0.026);
    sprite.position.y = -999;
    group.add(sprite);

    bubblesData.push({
      sprite,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0005 + Math.random() * 0.005,
      popHeight: 0,
    });
  }

  return { bubbleGroup: group, bubblesData, bubbleTexture: texture };
}

export function updateSpriteSheet(texture, frames, fps, elapsedTime) {
  if (!texture) return;
  texture.offset.x = (Math.floor(elapsedTime * fps) % frames) / frames;
}
