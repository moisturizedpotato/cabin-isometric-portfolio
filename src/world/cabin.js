import * as THREE from 'three';

// 1. Updated texture map with all five baked textures
const textureMap = {
  first: '/textures/bakeone.webp',
  second: '/textures/baketwo.webp',
  third: '/textures/bakethree.webp',
  fourth: '/textures/bakefour.webp',
  fifth: '/textures/bakefive.webp',
};

export function createTextureLibrary(textureLoader) {
  const loadedTextures = {};

  Object.entries(textureMap).forEach(([key, value]) => {
    const texture = textureLoader.load(value);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    loadedTextures[key] = texture;
  });

  return {
    textureMap,
    loadedTextures,
  };
}

// 2. Stripped down loader function with unnecessary parameters removed
export function loadCabin({ scene, gltfLoader, textureMap, loadedTextures, interactables, chessPieces, floor_objs }) {
  const fireTexture = new THREE.TextureLoader().load('/images/fire.png');
  fireTexture.colorSpace = THREE.SRGBColorSpace;
  fireTexture.repeat.set(1 / 10, 1);

  const steamTexture = new THREE.TextureLoader().load('/images/steam-spritesheet.png');
  steamTexture.colorSpace = THREE.SRGBColorSpace;
  steamTexture.repeat.set(1 / 5, 1);

  const laptopScreenTexture = new THREE.TextureLoader().load('/images/laptop_screen.png');
  laptopScreenTexture.colorSpace = THREE.SRGBColorSpace;
  laptopScreenTexture.repeat.set(-1 / 102, 1);
  laptopScreenTexture.rotation = Math.PI;
  laptopScreenTexture.center.set(0.0, 0.5);

  const rgbUniforms = { uTime: { value: 0 } };
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      '/models/cabin_inside-v3.glb',
      (glb) => {
        const blades = [];
        let ac_flap = null;
        let pot = null;
        let potLid = null;
        let rockingChair = null;
        glb.scene.traverse((child) => {
          // Ignore anything that isn't a mesh (like cameras, lights, or empties)
          if (!child.isMesh) {
            return;
          }

          if (child.name.includes('raycaster')) {
            const targetName = child.name.replace(/_raycaster/i, '').replace(/_hide/i, '');
            const nameLower = child.name.toLowerCase();
            const targetObj = glb.scene.getObjectByName(targetName) || child;
            
            let type = 'unknown';
            let Axis = 'y'; 
            let targets = [];

           if (nameLower.includes('cabinet_door')) {
              type = 'cabinet';
              
              // Extract the ID (e.g., "cabinet_door_1" from "kitchen_cabinet_door_1_left_swing_fifth_raycaster")
              // We grab everything up to the first direction tag
              const baseMatch = targetName.toLowerCase().match(/(.*cabinet_door_\d+)/);
              const baseName = baseMatch ? baseMatch[0] : targetName.toLowerCase().replace('_raycaster', '');

              let foundLeft = false;
              let foundRight = false;

              glb.scene.traverse((node) => {
                if (node.name.toLowerCase().includes('raycaster')) return;
                
                const n = node.name.toLowerCase();
                
                // Match objects that contain our base name AND either _left or _right
                const isLeft = n.includes(baseName) && n.includes('_left');
                const isRight = n.includes(baseName) && n.includes('_right');
                
                if (!foundLeft && isLeft) {
                  node.userData.swingDirection = -1; 
                  targets.push(node);
                  foundLeft = true;
                } else if (!foundRight && isRight) {
                  node.userData.swingDirection = 1;
                  targets.push(node);
                  foundRight = true;
                }
              });
              
              if (targets.length === 0) {
                 console.warn("No doors found for base:", baseName);
                 targets.push(child);
              }
            } 
            else if (child.name.includes('oven')) {
              type = 'oven';
              if (nameLower.includes('1')) Axis = 'z';
              else if (nameLower.includes('2')) {
                Axis = 'y';
              }
              
              // Find the object: ensure we target the highest parent if available
              console.log(targetName);
              targets.push(targetObj);
            }
            else if (child.name.includes('tap_valve')) {
              type = 'tapValve';
              child.rotation.order = 'YXZ';
              Axis = 'x';
              targets.push(targetObj);
            }
            else if (child.name.includes('tap')) {
              type = 'tap';
              targets.push(targetObj);
            }
            else if (child.name.includes('soap')) {
              type = 'soap';
              targets.push(targetObj);
            }
            else if (child.name.includes('door_Third')) {
              type = 'frontDoor';
              Axis = 'y';
              targets.push(targetObj);
            }
            else if (child.name.includes('office_chair')) {
              type = 'officeChair';
              Axis = 'z';
              targets.push(targetObj);
            } else if (child.name.includes('laptop_screen')) {
              type = "laptopScreen";
              console.log(child);
              targets.push(targetObj);
            }
            
            else if (child.name.includes('emit') && !child.name.includes('orchid')) {
              type = 'hangingLights';
              targets.push(targetObj);
            } else if (child.name.includes('drawer')) {
              const baseMatch = targetName.toLowerCase().match(/\d+/);
              type = "drawer" + baseMatch[0];
              child.userData.initialPos = child.position.clone();
              Axis = 'z';
              targets.push(child);
            } else if (child.name.includes('scale_up') && !child.name.includes('pot')) {
              type = "scaleUp";
              if (child.name.includes('slight_rotate')) {
                type = type + "Rotate";
              }
              child.userData.initialScale = child.scale.clone();
              targets.push(child);
            } else if (child.name.includes('wardrobe')) {
              type = "wardrobe";
              Axis = 'y';
              targets.push(child);
            }

            // Automate initial rotation saving for everything we collected
            targets.forEach(t => {
              const info = t.name.replace(/_/g, ' '); 
              if (!t.userData.swingDirection) t.userData.swingDirection = 1;
          
              t.userData.initialRot = {
                  x: t.rotation.x,
                  y: t.rotation.y,
                  z: t.rotation.z
              };
            
              t.userData.initialQuaternion = t.quaternion.clone();
            
              // NEW
              t.userData.customAngle = 0;
            });

            child.userData = {
              ...child.userData, 
              targets: targets, 
              type: type,
              isHovered: false,
              Axis: Axis
            };

            interactables.push(child);
          }

          // Check if this mesh's name contains any of our texture tags
          let matchedKey = null;
          Object.keys(textureMap).forEach((key) => {
            if (child.name.includes(key)) {
              matchedKey = key;
            }
          });

          if (child.name.includes('fan')) {
            if (child.name.includes('rgb')) {
              child.material = new THREE.ShaderMaterial({
                uniforms: rgbUniforms,
                vertexShader: `
                  varying vec2 vUv;
                  void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                  }
                `,
                fragmentShader: `
                  uniform float uTime;
                  varying vec2 vUv;
                  void main() {
                    // Generates a smooth, continuous RGB shifting wave
                    vec3 rgb = 0.5 + 0.5 * cos(uTime * 2.0 + vUv.xyx * 5.0 + vec3(0.0, 2.0, 4.0));
                    gl_FragColor = vec4(rgb, 1.0);
                  }
                `,
                side: THREE.DoubleSide
              });
              return; // Skip other material checks
            }
            else if (child.name.includes('blade')) {
              child.material = new THREE.MeshStandardMaterial({
                map: matchedKey ? loadedTextures[matchedKey] : null,
                emissive: 0xffffff, // Color of the glow
                emissiveIntensity: 0.2, // Slight emission strength
                transparent: true
              });
              blades.push(child); // Save reference for animation
              return;
            }
          }
          else if (child.name.includes('fire')) {
            child.material = new THREE.MeshBasicMaterial({
              map: fireTexture,
              transparent: true,
              alphaTest: 0.05,
              side: THREE.DoubleSide, // Renders on both sides of the plane
              depthWrite: false,      // Prevents Z-fighting/sorting issues with overlapping planes
              blending: THREE.AdditiveBlending // Makes the fire glow naturally
            });
            child.renderOrder = 999;
            child.scale.set(0.07, 0.075, 0.075);
            return;
          }
          else if (child.name.includes('smoke')) {
            child.material = new THREE.MeshBasicMaterial({
              map: steamTexture,
              transparent: true,
              alphaTest: 0.05,
              side: THREE.DoubleSide, // Renders on both sides of the plane
              depthWrite: false,      // Prevents Z-fighting/sorting issues with overlapping planes
              blending: THREE.AdditiveBlending // Makes the fire glow naturally
            });
            child.renderOrder = 999;
            child.scale.set(0.07, 0.075, 0.075);
            return;
          } else if (child.name.includes('laptop_screen') && !child.name.includes('hide')) {
            console.log(child);
            child.material = new THREE.MeshBasicMaterial({
              map: laptopScreenTexture,
              side: THREE.FrontSide 
            });
            return;
          }
          else if (child.name.includes('hide')) {
              child.material = new THREE.MeshBasicMaterial({ 
                transparent: true, 
                opacity: 0, 
                depthWrite: false 
              });
              return;
          }
          else if (child.name.toLowerCase().includes('glass')) {
            if (child.name.includes("ceiling_glass_fourth_floor_2")) {console.log(child);}
              child.material = new THREE.MeshPhysicalMaterial({
              map: matchedKey ? loadedTextures[matchedKey] : null, // Mixes baked texture with glass
              color: 0x86562b,
              metalness: 0,
              roughness: 0.1,
              transmission: 0.0, 
              ior: 1.5,        
              transparent: true,
              side: THREE.FrontSide
            });
            child.renderOrder = 1;
            return;
          }
          else if (child.name.includes('flap'))
          {
            child.material = new THREE.MeshBasicMaterial({
              map: matchedKey ? loadedTextures[matchedKey] : null,
              transparent: true,
              side: THREE.DoubleSide
            });

            child.userData.initialRotation = child.rotation.clone();
            ac_flap = child;
            return;
          }
          else if (matchedKey) {
            const textureToUse = loadedTextures[matchedKey];

            // Using MeshBasicMaterial because "baked" textures already contain lighting data.
            // Change this to MeshStandardMaterial if you plan to add real-time 3D lights.
            child.material = new THREE.MeshBasicMaterial({
              map: textureToUse,
              transparent: true
            });

          if (child.name.includes('CookingPot'))
          {
            child.userData.initialPosition = child.position.clone();
            child.userData.initialRotation = child.rotation.clone();
            pot = child;
          }
          else if (child.name.includes('pot_lid'))
          {
            child.userData.initialPosition = child.position.clone();
            child.userData.initialRotation = child.rotation.clone();
            potLid = child;
          }
          else if (child.name.includes('rocking_chair'))
          {
            child.userData.initialRotation = child.rotation.clone();
            rockingChair = child;
          }
          else if (child.name.includes('chess') && !child.name.includes('board')) 
          {
            child.userData.initialPosition = child.position.clone();
            const match = child.name.match(/[a-h][1-8]/);
            if (match) {
              const square = match[0];
            child.userData.color = (square[1] === '1' || square[1] === '2') ? 'w':'b';
            chessPieces[square] = child;
            }else {console.warn("Found a chess piece but couldn't find its square in the name:", child.name);}
          }


          if (child.name.includes('floor_1') || child.name.includes('floor_2')) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = 0.2;
            floor_objs.push(child);
          }

          if (child.name.includes("trees_double")){
            console.log(child);
            if (child.material) child.material.side = THREE.DoubleSide;
          }
            // Ensure crisp rendering
            if (child.material.map) {
              child.material.map.minFilter = THREE.LinearFilter;
            }
            interactables.forEach((hitbox) => {
              if (hitbox.userData.type === 'hangingLights' && hitbox.userData.targets) {
                hitbox.userData.targets.forEach((targetMesh) => {
                  if (targetMesh.material) {
                    targetMesh.material = targetMesh.material.clone();
                  }
                });
              }
            });
          }
        });

        // Add the fully textured model to the scene
        scene.add(glb.scene);
        
        // Resolve the promise so your main.js knows it finished loading
        resolve({glb, rgbUniforms, blades, ac_flap, pot, potLid, fireTexture, rockingChair, steamTexture, interactables,
           chessPieces, floor_objs, laptopScreenTexture }); // tapBody, tapValve, soap, cabinetDoors, oven1, oven2
      },
      undefined, // onProgress callback (optional)
      reject     // onError callback
    );
  });
}