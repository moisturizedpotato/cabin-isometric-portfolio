import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTextureLibrary, loadCabin } from './world/cabin.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadEnvironment } from './world/environment.js';
import { createInputHandler } from './systems/InputHandler.js';
import { createRenderer, createPostProcessing } from './systems/renderer.js';
import { createRaycasterManager } from './interactions/RaycasterManager.js';
import { Chess } from 'chess.js';
import {gsap} from 'gsap';
import './style.scss'
import { Howl, Howler } from 'howler';

// --- AUDIO SETUP ---
const sounds = {
  bgm: new Howl({ src: ['/audio/background.wav'], loop: true, volume: 0.3 }),
  potBoil: new Howl({ src: ['/audio/boiling_pot.mp3'], loop: true, volume: 0.8 }),
  cabinetOpen: new Howl({ src: ['/audio/cabinet_door_open.wav'] }),
  cabinetClose: new Howl({ src: ['/audio/oven_close.wav'] }), // Reusing as requested
  ovenOpen: new Howl({ src: ['/audio/oven_open.wav'] }),
  ovenClose: new Howl({ src: ['/audio/oven_close.wav'] }),
  targetHover: new Howl({ src: ['/audio/target_hover.wav'] }),
  doorOpen: new Howl({ src: ['/audio/door_opening.mp3'] }),
  doorClose: new Howl({ src: ['/audio/door_closing.mp3'] }),
  drawerOpen: new Howl({ src: ['/audio/drawer_open.wav'], volume: 1.2 }),
  drawerClose: new Howl({ src: ['/audio/drawer_close.wav'], volume: 1.2 }),
  glass: new Howl({ src: ['/audio/glass.wav'] }),
  laptop: new Howl({ src: ['/audio/laptop_code.wav'], volume: 0.7 }),
  utensils: new Howl({ src: ['/audio/utensils.wav'] }),
  bubbles: new Howl({ src: ['/audio/bubbles.mp3'] }),
  hangingLights: new Howl({ src: ['/audio/hanging_lights.wav'], volume:0.6 }),
  tapOpen: new Howl({ src: ['/audio/tap_open.wav'], volume: 0.5 }),
  tapClose: new Howl({ src: ['/audio/tap_close.wav'], volume: 0.5 }),
  uiClick: new Howl({ src: ['/audio/ui_hover.mp3'] }),
  highlight: new Howl({src: ['/audio/tap_light.mp3'], volume: 0.5}),
  chairSlideOff: new Howl({src: ["/audio/chair_slide_off.wav"], volume: 0.4}),
  chairSlideIn: new Howl({src: ["/audio/chair_slide_in.wav"], volume: 0.4}),
  pop: new Howl({ src: ['/audio/pop.wav'], volume: 1.2 }),
  acWind: new Howl({src: ['/audio/ac_wind.wav'], volume: 0.6}),
  whoosh: new Howl({ src: ['/audio/whoosh.mp3'] })
};

// Helper function to play sound at a 3D Mesh location
function playSpatialSound(sound, mesh) {
  if (!mesh) return;
  const pos = new THREE.Vector3();
  mesh.getWorldPosition(pos);
  const id = sound.play();
  sound.pos(pos.x, pos.y, pos.z, id);
  // Configure 3D falloff distance
  sound.pannerAttr({ pannerModel: 'HRTF', refDistance: 1, maxDistance: 10, rolloffFactor: 2 }, id);
  return id;
}


const raycasterManager = createRaycasterManager();
const { raycaster, pointer } = raycasterManager;
const loadingManager = new THREE.LoadingManager();

const interactables = [];
let intersects = [];
const doorMeshes = [];
let currentBoardState = {};
const chessPieces = {};
const floor_objs = [];
let cabinetDoors = {
  '1': { left: null, right: null },
  '2': { left: null, right: null }
};
let deadWhiteCount = -0.5 * 1.4;
let deadBlackCount = -0.66429 * 1.4;
let currentFloorLevel = 0; 
const transparentOpacity = 0.2;
let tapIsHovered = false;
let tapWasHovered = false;
let soapIsHovered = false;
let isDoorOpen = false;
let isAnimating = false;
let doorWasHovered = { '1': false, '2': false };

const doorHitboxes = [];
const CAMERA_BOUNDS = {
  minPan: new THREE.Vector3(
2.123708182501076,
0.1,
0.23236511252797676), // Minimum X, Y, Z
  maxPan: new THREE.Vector3(3.3264561167933016,
1,
0.2592356070361481),    // Maximum X, Y, Z
  minZoom: 0.5,                          // Closest the camera can get
  maxZoom: 4,
  minPolarAngle: Math.PI / 32, // 45 degrees (don't look too far down)
  maxPolarAngle: Math.PI / 2 - 0.1, // 90 degrees (don't look past the horizon/floor)
  minAzimuthAngle: Math.PI / 2 + Math.PI / 4, // -45 degrees (left limit)
  maxAzimuthAngle: -Math.PI / 2                         // Furthest the camera can zoom out
};

// --- NEW: WATER & SPLASH SETUP ---
const waterStreamLength = 0.09; // Change this if the water doesn't perfectly reach the bottom of your sink!

// Using BoxGeometry (Cube) instead of CylinderGeometry
const waterGeo = new THREE.BoxGeometry(0.008, 1, 0.02); 
waterGeo.translate(0, -0.5, 0); // Translate origin to the top so it scales downwards properly
const waterMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.5 });
const waterStream = new THREE.Mesh(waterGeo, waterMat);
waterStream.scale.y = 0; // Start hidden (off)

// Setup cheap splash particles (Points naturally render as tiny 2D squares/cubes)
const splashCount = 10;
const splashGeo = new THREE.BufferGeometry();
const splashPositions = new Float32Array(splashCount * 3);
const splashVelocities = [];

for (let i = 0; i < splashCount; i++) {
  splashVelocities.push({
    x: (Math.random() - 0.5) * 0.03,
    y: Math.random() * 0.001 + 0.1,
    z: (Math.random() - 0.5) * 0.03
  });
}
splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
const splashMat = new THREE.PointsMaterial({ size: 0.006, color: 0x88ddff, transparent: true, opacity: 0.8 });
const splashParticles = new THREE.Points(splashGeo, splashMat);


// ==========================================
// 2. SOAP BUBBLES SETUP (SPRITE SHEET)
// ==========================================
const bubbleTexture = new THREE.TextureLoader().load('/images/bubble_burst_spritesheet.png');
bubbleTexture.colorSpace = THREE.SRGBColorSpace;

const bubbleGroup = new THREE.Group();
const bubblesData = [];
const bubbleCount = 15;

for (let i = 0; i < bubbleCount; i++) {
  const uniqueTexture = bubbleTexture.clone();
  
  const cols = 7;
  const rows = 1;
  uniqueTexture.repeat.set(1 / cols, 1 / rows); 
  
  const col = Math.floor(Math.random() * 2);
  const row = 0;
  uniqueTexture.offset.set(col * (1 / cols), row);

  const bMat = new THREE.SpriteMaterial({ 
    map: uniqueTexture, 
    transparent: true, 
    depthWrite: false, 
    blending: THREE.AdditiveBlending 
  });

  const sprite = new THREE.Sprite(bMat);
  sprite.scale.set(0.026, 0.026, 0.026); 
  sprite.position.y = -999; // Hide underground initially
  
  bubbleGroup.add(sprite);
  
  bubblesData.push({
    sprite: sprite,
    phase: Math.random() * Math.PI * 2, 
    speed: 0.0005 + (Math.random() * 0.005) 
  });
}


const canvas = document.querySelector('#experience-canvas');
const btnUp = document.getElementById('btn-floor-up');
const btnDown = document.getElementById('btn-floor-down');
const hud = document.getElementById('hover-hud');
const hudText = document.getElementById('hud-text');
const sizes = { width: window.innerWidth, height: window.innerHeight };
const audioBtn = document.getElementById('audio-toggle');
const loadingText = document.getElementById('loading-text');
const segmentsContainer = document.getElementById('loading-bar-segments');
const enterButton = document.getElementById('enter-button');
const loadingScreen = document.getElementById('loading-screen');

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const progress = (itemsLoaded / itemsTotal) * 100;
  loadingText.innerText = `INITIALIZING... ${Math.floor(progress)}%`;
  
  // Create the segmented block effect (max 12 blocks for a 320px container)
  const numSegments = Math.floor((progress / 100) * 12);
  segmentsContainer.innerHTML = ''; // Clear old segments
  
  for(let i = 0; i < numSegments; i++) {
    const seg = document.createElement('div');
    seg.className = 'segment';
    segmentsContainer.appendChild(seg);
  }
};
let bgmPlaying = false;

const scene = new THREE.Scene();
const clock = new THREE.Clock();

const chess = new Chess();
chess.loadPgn('1. d4 Nf6 2. c4 d5 3. Nc3 Bf5 4. Qa4+ Bd7 5. Qb3 dxc4 6. Qxc4 Be6 7. Qb5+ Bd7 8.Qd3 a6 9. e4 e6 10. Nf3 Bb4 11. Qc2 O-O 12. Bg5 h6 13. Bh4 Bxc3+ 14. bxc3 g5 15.Nxg5 hxg5 16. Bxg5 Kg7 17. e5 Kg8 18. Bxf6 Qe8 19. Bd3 Bc6 20. Bh7# 1-0');
const history = chess.history({ verbose: true });

scene.background = new THREE.Color('#111111'); // Dark grey background

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
// camera.position.set(
// 2.7398029971484745,
// 0.8794004125894785,
// -2.9957373670464307);
camera.position.set(
5.811391771542539,
2.4932501863561063,
-3.156645731723698);

const renderer = createRenderer(canvas, sizes);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// controls.target.set( 
// 2.5546474760257314,
// 0.002700000017881676,
// 0.3137892400795657);
controls.target.set( 
2.554647,
0.0027,
0.313789);

const isMobile = window.innerWidth < 768;
  
  // Base position
  const camX = 5.811;
  const camY = 2.493;
  const camZ = -3.156;

  // If mobile, pull the camera back slightly by multiplying Z and X
  const mobileOffset = isMobile ? 1.5 : 1.0; 
  camera.position.set(camX * mobileOffset, camY, camZ * mobileOffset);

const textureLoader = new THREE.TextureLoader();
const { textureMap, loadedTextures } = createTextureLibrary(textureLoader);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setDRACOLoader(dracoLoader);

function runQueueAnimation(targetMesh, wantsOpen, Axis, targetValue, animType = 'rotation', duration = 0.5) {
  // 1. Record desired state
  targetMesh.userData.wantsOpen = wantsOpen;
  // 2. Create runner if it doesn't exist
  if (!targetMesh.userData.runAnimation) {
    targetMesh.userData.runAnimation = () => {
      if (targetMesh.userData.isAnimating) return;
      const isOpen = targetMesh.userData.isOpen || false;
      const currentlyWantsOpen = targetMesh.userData.wantsOpen;
      
      // If it's already in the correct state, do nothing
      if (isOpen === currentlyWantsOpen) return;
      targetMesh.userData.isAnimating = true;
  if (animType === 'customRotation') {
        const customAxis = new THREE.Vector3(1, 0, 0).normalize();
        gsap.to(targetMesh.userData, {
          customAngle: currentlyWantsOpen ? -Math.PI / 2 : 0,
          duration: duration, 
          ease: "power2.out",
          overwrite: true,
          onUpdate: () => {
            const q = new THREE.Quaternion().setFromAxisAngle(customAxis, targetMesh.userData.customAngle);
            targetMesh.quaternion.copy(targetMesh.userData.initialQuaternion);
            targetMesh.quaternion.multiply(q);
          },
          onComplete: () => {
            targetMesh.userData.isAnimating = false;
            targetMesh.userData.isOpen = currentlyWantsOpen;
            targetMesh.userData.runAnimation(); 
          }
        });
      } 
      // --- 2. Material Color / Emissive ---
      else if (animType === 'color') {
        const targetBrightness = currentlyWantsOpen ? targetValue : 1.0;
        gsap.to(targetMesh.material.color, {
          r: targetBrightness,
          g: targetBrightness,
          b: targetBrightness,
          duration: duration,
          ease: "power2.out",
          overwrite: true,
          onComplete: () => {
            targetMesh.userData.isAnimating = false;
            targetMesh.userData.isOpen = currentlyWantsOpen;
            targetMesh.userData.runAnimation(); 
          }
        });
      } 
      else if (animType === "translation") {
        const initialPos = targetMesh.userData.initialPos;
        gsap.to(targetMesh.position, {
          [Axis]: currentlyWantsOpen ? initialPos[Axis] + targetValue: initialPos[Axis],
          duration: duration,
          ease: "power1.inOut",
          onComplete: () => {
            targetMesh.userData.isAnimating = false;
            targetMesh.userData.isOpen = currentlyWantsOpen;
            targetMesh.userData.runAnimation(); 
          }
        });
      }
      else if (animType === "scale") {
        const initialScale = targetMesh.userData.initialScale;
        gsap.to(targetMesh.scale, {
          x: currentlyWantsOpen ? initialScale.x * targetValue : initialScale.x,
          y: currentlyWantsOpen ? initialScale.y * targetValue : initialScale.y,
          z: currentlyWantsOpen ? initialScale.z * targetValue : initialScale.z,
          duration: duration,
          ease: "power1.out",
          onComplete: () => {
            targetMesh.userData.isAnimating = false;
            targetMesh.userData.isOpen = currentlyWantsOpen;
            targetMesh.userData.runAnimation(); 
          }
        });
      }
      // --- 3. Standard Euler Rotation ---
      else {
        const initialRot = targetMesh.userData.initialRot;
        gsap.to(targetMesh.rotation, {
          [Axis]: currentlyWantsOpen ? initialRot[Axis] + targetValue : initialRot[Axis],
          duration: duration,
          ease: "power2.out",
          overwrite: true,
          onComplete: () => {
            targetMesh.userData.isAnimating = false;
            targetMesh.userData.isOpen = currentlyWantsOpen;
            targetMesh.userData.runAnimation(); 
          }
        });
      }
    };
  }
  // 3. Execute queue
  targetMesh.userData.runAnimation();
}

// At the top of your file
let shiftPressed = false;

window.addEventListener('keydown', (e) => { if(e.key === 'Shift') shiftPressed = true; });
window.addEventListener('keyup', (e) => { if(e.key === 'Shift') shiftPressed = false; });

function updateCameraConstraints() {
  // 1. Zoom/Dolly Lock (Using minDistance/maxDistance on OrbitControls)
  controls.minDistance = CAMERA_BOUNDS.minZoom;
  controls.maxDistance = CAMERA_BOUNDS.maxZoom;

  // 2. Movement/Pan Lock
  // Only allow panning if SHIFT is pressed
  controls.enablePan = shiftPressed;

  // 3. Clamp the Pan boundaries so user can't wander off into the void
  controls.target.clamp(CAMERA_BOUNDS.minPan, CAMERA_BOUNDS.maxPan);

  controls.minPolarAngle = CAMERA_BOUNDS.minPolarAngle;
  controls.maxPolarAngle = CAMERA_BOUNDS.maxPolarAngle;
  
  controls.minAzimuthAngle = CAMERA_BOUNDS.minAzimuthAngle;
  controls.maxAzimuthAngle = CAMERA_BOUNDS.maxAzimuthAngle;
}
function adjustHudForMobile() {
  const hud = document.getElementById('hover-hud');
  if (window.innerWidth < 768) {
    hud.style.fontSize = '12px';
    hud.style.padding = '6px 12px';
  } else {
    // Reset to default
    hud.style.fontSize = '';
    hud.style.padding = '';
  }
}
// --- 4. THE GRAND ENTRANCE EVENT ---
// to be joined with input handlers
if (btnUp && btnDown) {
  btnUp.addEventListener('click', () => {
    sounds.uiClick.play();
    if (currentFloorLevel < 2) {
      currentFloorLevel++;
      gsap.to(camera.position, {'y': camera.position.y + 0.1, duration: 0.5, ease: "power2.out"});
      updateFloorOpacity();
    }
  });
  btnDown.addEventListener('click', () => {
    sounds.uiClick.play();
    if (currentFloorLevel > 0) {
      currentFloorLevel--;
      gsap.to(camera.position, {'y': camera.position.y - 0.1, duration: 0.5, ease: "power2.out"});
      updateFloorOpacity();
    }
  });
}

if (audioBtn) {
  audioBtn.addEventListener('click', () => {
    console.log("Toggle clicked! Music was playing:", bgmPlaying);
    
    if (sounds.uiClick) sounds.uiClick.play();
    
    if (bgmPlaying) {
      // Turn music OFF
      if (sounds.bgm) sounds.bgm.pause();
      audioBtn.innerText = 'TURN: ON';
    } else {
      // Turn music ON
      if (sounds.bgm) sounds.bgm.play();
      audioBtn.innerText = 'TURN: OFF';
    }
    
    // Flip the state
    bgmPlaying = !bgmPlaying; 
  });
} else {
  console.warn("Could not find the #audio-toggle button in the HTML!");
}
function handleRaycasterInteraction() {
  if (intersects.length > 0) {
    const object = intersects[0].object;
    if (!object.name.includes('target')) return;
    const {Axis, initialRot} = object.userData;
    const targetMesh = object.userData.targets[0];
    if (object.userData.type === "frontDoor") {
      object.userData.wantsOpen = !object.userData.wantsOpen
      if (object.userData.wantsOpen) playSpatialSound(sounds.doorOpen, targetMesh);
      else playSpatialSound(sounds.doorClose, targetMesh);
      runQueueAnimation(targetMesh, object.userData.wantsOpen, Axis, Math.PI / 2, 'rotation', 1.0);
    }
    if (object.userData.type === "drawer1" || object.userData.type === "drawer2") {
      object.userData.wantsOpen = !object.userData.wantsOpen
      if (object.userData.wantsOpen) playSpatialSound(sounds.drawerOpen, targetMesh);
      else playSpatialSound(sounds.drawerClose, targetMesh);
      runQueueAnimation(targetMesh, object.userData.wantsOpen, Axis, -0.12, 'translation', 1.0);
    }
    if (object.userData.type === "drawer3") {
      object.userData.wantsOpen = !object.userData.wantsOpen
      if (object.userData.wantsOpen) playSpatialSound(sounds.drawerOpen, targetMesh);
      else playSpatialSound(sounds.drawerClose, targetMesh);
      runQueueAnimation(targetMesh, object.userData.wantsOpen, Axis, -0.14, 'translation', 1.0);
    }
    if (object.userData.type === "drawer4") {
      object.userData.wantsOpen = !object.userData.wantsOpen
      if (object.userData.wantsOpen) playSpatialSound(sounds.drawerOpen, targetMesh);
      else playSpatialSound(sounds.drawerClose, targetMesh);
      runQueueAnimation(targetMesh, object.userData.wantsOpen, Axis, -0.16, 'translation', 1.0);
    }
    if (object.userData.type === "wardrobe") {
      object.userData.wantsOpen = !object.userData.wantsOpen;
      if (object.userData.wantsOpen) playSpatialSound(sounds.cabinetOpen, targetMesh);
      else playSpatialSound(sounds.cabinetClose, targetMesh);
      runQueueAnimation(targetMesh, object.userData.wantsOpen, Axis, Math.PI / 3, 'rotation', 0.5);
    }
  }
}

const inputHandler = createInputHandler({
  onInteraction: {
    updatePointer: (nextPointer) => {
      pointer.x = nextPointer.x;
      pointer.y = nextPointer.y;
    },
    handle: handleRaycasterInteraction
  }
});

inputHandler.bind();

const { bloomComposer, finalComposer, darkBackground, darkenNonBloomed, restoreMaterial, resizePostProcessing } = createPostProcessing(scene, camera, renderer, sizes);

const keys = { w: false, a: false, s: false, d: false, q: false, e: false };
const moveSpeed = 3.0; // Units per second

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = true;
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = false;
});

// window.addEventListener("click", (event) => {
//   if (currentIntersects.length > 0)
//   {
//     if (currentIntersects[0].object.name.includes('d7'))
//     {
//       currentIntersects[0].object.position.z -= 0.01;
//     }
//   }
// });

let lastTap = 0;
let touchPanning = false;
let startTouch = new THREE.Vector2();

window.addEventListener('touchstart', (event) => {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTap;

  // Detect Double Tap (within 300ms)
  if (tapLength < 300 && tapLength > 0) {
    event.preventDefault();
    touchPanning = true;
    startTouch.set(event.touches[0].clientX, event.touches[0].clientY);
    
    // Switch OrbitControls to PAN
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.enableDamping = false;
  }
  lastTap = currentTime;
});

window.addEventListener('touchmove', (event) => {
  if (touchPanning) {
    // Optional: add a small deadzone to prevent jitter
    // The browser handles the actual camera movement since we set mouseButtons to PAN
  }
}, { passive: false });

window.addEventListener('touchend', () => {
  if (touchPanning) {
    touchPanning = false;
    
    // Switch back to ROTATE
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.enableDamping = true;
  }
});

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  resizePostProcessing(sizes.width, sizes.height);

  camera.aspect = sizes.width / sizes.height;
  const isMobile = sizes.width < 768;
  const mobileOffset = isMobile ? 1.5 : 1.0;
  
  // Set position based on screen type
  camera.position.x = 5.811 * mobileOffset;
  camera.position.z = -3.756 * mobileOffset;
  camera.updateProjectionMatrix();
  adjustHudForMobile();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const RaycasterManager = {
  update(pointer, camera) {
    raycaster.setFromCamera(pointer, camera);
    intersects = raycaster.intersectObjects(interactables, false);
    document.body.style.cursor = intersects.length > 0 && intersects[0].object.name.includes('target')
      ? 'pointer'
      : 'default';
    return intersects;
  },
};

const PostProcessing = {
  render() {
    const currentBackground = scene.background;
    scene.background = darkBackground;
    scene.traverse(darkenNonBloomed);
    scene.updateMatrixWorld(true);

    bloomComposer.render();

    scene.background = currentBackground;
    scene.traverse(restoreMaterial);

    finalComposer.render();
  },
};



function updateFloorOpacity() {
  floor_objs.forEach((obj) => {
    if (obj.name.includes('floor_1')) {
      const target = currentFloorLevel >= 1 ? 1.0: transparentOpacity;
      gsap.to(obj.material, { opacity: target, duration: 0.5, ease: "power2.inOut" });
    } else if (obj.name.includes('floor_2')) {
      const target = currentFloorLevel >= 2 ? 1.0 : transparentOpacity;
      gsap.to(obj.material, { opacity: target, duration: 0.5, ease: "power2.inOut" });
    }
  });
}

function getSquarePosition(square) {
  const file = square.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
  const rank = parseInt(square[1]) - 1;   // '1' -> 0, '8' -> 7
  
  const squareSize = 0.027;  // The physical width of one square on your board
  const startX = 2.63;     // The X coordinate of the 'a' file
  const startZ = -0.905;      // The Z coordinate of the '1' rank

  return {
    x: startX - (file * squareSize),
    z: startZ + (rank * squareSize) // Z usually goes negative as you move 'up' the board
  };
}

function playMove(moveIndex) {
  // If game is over, reset after a 3 second delay
  if (moveIndex >= history.length) {
    gsap.delayedCall(3, resetChessGame);
    return;
  }

  const move = history[moveIndex];
  const activeMesh = currentBoardState[move.from];
  const targetPos = getSquarePosition(move.to);
  const isKnight = move.piece === 'n';

  // Create a GSAP timeline for this specific turn
  const tl = gsap.timeline({ 
    onComplete: () => gsap.delayedCall(0.5, () => playMove(moveIndex + 1)) // 0.5s pause between turns
  });

  // 1. HANDLE CAPTURES (Run simultaneously with the move)
  if (move.captured) {
    const capturedMesh = currentBoardState[move.to]; // Get the piece sitting on the target square
    
    if (capturedMesh) {
      const isBlack = capturedMesh.userData.color === 'b';
      
      // Black goes right (+X), White goes left (-X). Adjust these values based on your room layout!
      const graveyardX = isBlack ? 2.455 - 0.045: 2.455 + 0.2; 
      // Stack them neatly based on how many are dead
      const graveyardZ = isBlack ? (deadBlackCount) : (deadWhiteCount); 

      tl.to(capturedMesh.position, {
        x: graveyardX,
        z: graveyardZ,
        duration: 0.6,
        ease: "power2.inOut"
      }, 0); // The '0' forces this to start at the exact beginning of the timeline

      if (isBlack) deadBlackCount += 0.023; else deadWhiteCount -= 0.023;
    }
  }

  // 2. HANDLE MOVEMENT
  if (isKnight) {
    // Knights jump: Animate Y up and down, while simultaneously sliding X and Z
    tl.to(activeMesh.position, { 
      y: activeMesh.userData.initialPosition.y + 0.1, // Jump height
      duration: 0.3, 
      yoyo: true, 
      repeat: 1, 
      ease: "sine.inOut" 
    }, 0);
    tl.to(activeMesh.position, { x: targetPos.x, z: targetPos.z, duration: 0.6, ease: "power1.inOut" }, 0);
  } else {
    // Everyone else slides flat on the board
    tl.to(activeMesh.position, { x: targetPos.x, z: targetPos.z, duration: 0.6, ease: "power1.inOut" }, 0);
  }

  if (move.flags.includes('k') || move.flags.includes('q')) {
    const isWhite = move.color === 'w';
    const isKingside = move.flags.includes('k');
    
    // Deduce the Rook's start and end squares based on color and side
    let rookFrom, rookTo;
    
    if (isWhite) {
      rookFrom = isKingside ? 'h1' : 'a1';
      rookTo = isKingside ? 'f1' : 'd1';
    } else {
      rookFrom = isKingside ? 'h8' : 'a8';
      rookTo = isKingside ? 'f8' : 'd8';
    }

    const rookMesh = currentBoardState[rookFrom];
    
    if (rookMesh) {
      const rookTargetPos = getSquarePosition(rookTo);
      
      // Animate the Rook sliding over at the exact same time as the King
      tl.to(rookMesh.position, {
        x: rookTargetPos.x,
        z: rookTargetPos.z,
        duration: 0.6,
        ease: "power1.inOut"
      }, 0); // The '0' makes it run concurrently with the King's animation
      
      // Update internal state for the Rook
      currentBoardState[rookTo] = rookMesh;
      delete currentBoardState[rookFrom];
    }
  }

  // 3. UPDATE INTERNAL STATE
  currentBoardState[move.to] = activeMesh;
  delete currentBoardState[move.from];
}

// Start the game!
gsap.delayedCall(2, () => playMove(0));

function resetChessGame() {
  const tl = gsap.timeline({
    onComplete: () => gsap.delayedCall(2, () => playMove(0)) // Restart game after resetting
  });
  
  // Grab all 32 original pieces
  Object.values(chessPieces).forEach((piece) => {
    tl.to(piece.position, {
      x: piece.userData.initialPosition.x,
      y: piece.userData.initialPosition.y,
      z: piece.userData.initialPosition.z,
      duration: 1.5,
      ease: "power3.inOut"
    }, 0); // All fly back simultaneously
  });

  // Reset internal tracking memory
  currentBoardState = { ...chessPieces };
  deadWhiteCount = -0.5 * 1.4;
  deadBlackCount = -0.66429 * 1.4;
}

async function init() {

  const environmentPromise = loadEnvironment(scene, loadingManager);
  const cabinPromise = loadCabin({ 
    scene, 
    gltfLoader, 
    textureMap, 
    loadedTextures,
    interactables,
    chessPieces,
    floor_objs,
  });
  const cabin = await Promise.all([environmentPromise, cabinPromise]).then(([, loadedCabin]) => loadedCabin);
  const rgbUniforms = cabin.rgbUniforms;
  const fan_blades = cabin.blades;
  const ac_flap = cabin.ac_flap;
  const pot = cabin.pot;
  const rockingChair = cabin.rockingChair;
  const fireTexture = cabin.fireTexture;
  const steamTexture = cabin.steamTexture;
  const laptopScreenTexture = cabin.laptopScreenTexture;
  // --- ATTACH SOAP BUBBLES TO SOAP MESH ---
  const soapHitbox = interactables.find(h => h.userData.type === 'soap');
  if (soapHitbox && soapHitbox.userData.targets && soapHitbox.userData.targets.length > 0) {
    // Attach the bubble particle group directly to the visual soap mesh
    soapHitbox.userData.targets[0].add(bubbleGroup);
  }
  currentBoardState = { ...chessPieces };
  const potLid = cabin.potLid;

  if (ac_flap) {playSpatialSound(sounds.acWind, ac_flap);}
  if (pot) {
    playSpatialSound(sounds.potBoil, pot);
    gsap.to(pot.position, {
      x: pot.userData.initialPosition.x + 0.002,
      z: pot.userData.initialPosition.z - 0.002,
      duration: 0.08, 
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });
    gsap.to(pot.rotation, {
      z: pot.userData.initialRotation.z - 0.09,
      duration: 0.12, 
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });
  }
  if (rockingChair) {
    rockingChair.rotation.x = rockingChair.userData.initialRotation.x + 0.1;
    gsap.to(rockingChair.rotation, {
      x: rockingChair.userData.initialRotation.x - 0.1,
      duration: 1.0,
      yoyo: true,
      repeat: -1,
      ease: "power2.inOut"
    });
  }
  if (potLid) {
    gsap.to(potLid.position, {
      y: potLid.userData.initialPosition.y + 0.002, // Hop height
      duration: 0.12, 
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });
    // Smooth tilting/clattering
    gsap.to(potLid.rotation, {
      x: potLid.userData.initialRotation.x + 0.05,
      z: potLid.userData.initialRotation.z - 0.05,
      duration: 0.09, // Slightly out of sync with position for organic feel
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });
  // if (tapBody) {
  //   waterStream.position.copy(tapBody.position);
  //   scene.add(waterStream);
    
  //   // Position particles at the bottom of the stream
  //   splashParticles.position.copy(tapBody.position);
  //   splashParticles.position.y -= waterStreamLength; 
  //   scene.add(splashParticles);
  // }

  const finalCameraPos = { 
x
: 
2.535919813773918,
y
: 
0.9578030790152989,
z
: 
-2.6902596403193235 };
  const finalLookAt = { 
x
: 
2.5497777489426516,
y
: 
0.2553570744324973,
z
: 
0.04026464001318965 };
controls.enabled = false;
const scaleUpItems = [];
  interactables.forEach(hitbox => {
    if (hitbox.userData.type && hitbox.userData.type.toLowerCase().includes('scaleup')) {
      if (hitbox.userData.targets) {
        hitbox.userData.targets.forEach(mesh => {
          if (!mesh.userData.initialScale) mesh.userData.initialScale = mesh.scale.clone();
          if (!mesh.userData.initialRot) mesh.userData.initialRot = mesh.rotation.clone();
          
          const isTarget = hitbox.name.includes('target');
          mesh.scale.set(0, 0, 0); // Hide them initially

          if (!isTarget) {
            mesh.rotation.y = mesh.userData.initialRot.y - Math.PI;
            mesh.rotation.x = mesh.userData.initialRot.x - (Math.PI / 2);
          }
          scaleUpItems.push({ mesh, isTarget, initialScale: mesh.userData.initialScale, initialRot: mesh.userData.initialRot });
        });
      }
    }
  });

  function playPopInSequence(baseDelay = 1.0, staggerTime = 0.15) {
    scaleUpItems.forEach((item, index) => {
      const totalDelay = baseDelay + (index * staggerTime);
      gsap.to(item.mesh.scale, {
        x: item.initialScale.x, y: item.initialScale.y, z: item.initialScale.z,
        duration: 0.6, delay: totalDelay, ease: "back.out(1.7)",
        onStart: () => {
          if (item.isTarget) playSpatialSound(sounds.pop, item.mesh);
        }
      });
      if (!item.isTarget) {
        gsap.to(item.mesh.rotation, {
          x: item.initialRot.x, y: item.initialRot.y, z: item.initialRot.z,
          duration: 0.8, delay: totalDelay, ease: "back.out(1.2)" 
        });
      }
    });
  }

  // --- 3. REVEAL ENTER BUTTON ---
  // The models are loaded, hide the progress bar and show the button
  loadingText.style.display = 'none';
  document.getElementById('loading-bar-container').style.display = 'none';
  enterButton.style.display = 'block';

  let hasStarted = false;

  // --- 4. THE GRAND ENTRANCE EVENT ---
  enterButton.addEventListener('click', () => {

    if (hasStarted) return; 
    hasStarted = true;
    
    // Play Audio (Browser is now unlocked!)
    sounds.uiClick.play();
    gsap.delayedCall(0.8, () => {
      sounds.whoosh.play();
    });
    sounds.bgm.play();
    bgmPlaying = true;
    document.getElementById('audio-toggle').innerText = 'TURN: OFF'; // Sync your UI toggle

    // Fade out the Black Screen
    gsap.to(loadingScreen, {
      opacity: 0,
      duration: 2.0, // Fade duration
      ease: "power2.inOut",
      onComplete: () => {
        loadingScreen.style.display = 'none';
      }
    });

    // Animate Camera Fly-in
    const finalCameraPos = { x: 2.7398029971484745, y: 0.8794004125894785, z: -2.9957373670464307 };
    const finalLookAt = { x: 2.5546474760257314, y: 0.002700000017881676, z: 0.3137892400795657 };

    gsap.to(camera.position, {
      x: finalCameraPos.x, y: finalCameraPos.y, z: finalCameraPos.z,
      duration: 3.5, ease: "power3.inOut"
    });

    gsap.to(controls.target, {
      x: finalLookAt.x, y: finalLookAt.y, z: finalLookAt.z,
      duration: 3.5, ease: "power3.inOut",
      onUpdate: () => controls.update(),
      onComplete: () => controls.enabled = true // Give control back to the user
    });

    // Trigger the pop-in items! (0.5s initial delay, 0.1s stagger)
    playPopInSequence(1.3, 0.1); 
  });
  // ------------------------------
    
  }

  // 3. The Animation Loop
  const render = () => {
    // console.log(camera.position);
    // console.log("00000");
    // console.log(controls.target);
    const delta = clock.getDelta(); // Use delta time for consistent speed across frame rates
    const elapsedTime = clock.getElapsedTime();
    if (rgbUniforms) {
    rgbUniforms.uTime.value = clock.getElapsedTime(); // Animates the RGB wave
    }
    //spritesheet animations
    if (steamTexture) {
      const totalFrames = 5;
      const fps = 5; // Animation speed

      // Calculate which of the 10 frames to show based on elapsed time
      const currentFrame = Math.floor(elapsedTime * fps) % totalFrames;
      
      // Shift the texture to the right by Exactly 10% (640px / 6400px) per frame
      steamTexture.offset.x = currentFrame / totalFrames;
    }
    if (fireTexture) {
      const totalFrames = 10;
      const fps = 15; // Animation speed

      // Calculate which of the 10 frames to show based on elapsed time
      const currentFrame = Math.floor(elapsedTime * fps) % totalFrames;
      
      // Shift the texture to the right by Exactly 10% (640px / 6400px) per frame
      fireTexture.offset.x = currentFrame / totalFrames;
    }
    if (laptopScreenTexture) {
      const totalFrames = 102;
      const fps = 10; // Exactly 10 frames per second
      
      // Calculate which of the 102 frames to show based on elapsed time
      const currentFrame = Math.floor(elapsedTime * fps) % totalFrames;
      
      // Shift the texture horizontally
      laptopScreenTexture.offset.x = currentFrame / totalFrames;
    }
    //idle animations
    if (fan_blades) {
      fan_blades.forEach((blade) => {
        if (blade.name.includes('1') || blade.name.includes('5') || blade.name.includes('6') )
        {
          blade.rotation.x += 2.0 * delta;
        }
        else if (blade.name.includes('2') || blade.name.includes('3')) {
          blade.rotateX(-2 * delta); // Adjust '2.0' to change speed. Change '.z' to '.y' or '.x' depending on model orientation.
        }
        else if (blade.name.includes('4'))
        {
          blade.rotation.x -= 2.0 * delta;
        }
      });
    }
    if (ac_flap) {
      ac_flap.rotation.y = ac_flap.userData.initialRotation.y + (Math.sin(1.0 * elapsedTime) * Math.PI / 6);
    }

    //hover events
    RaycasterManager.update(pointer, camera);
    const hoveredObject = intersects.length > 0 ? intersects[0].object : null;

    // Only show HUD if we hit an object with a 'target' name
    if (hoveredObject && hoveredObject.name.includes('target')) {
      hud.style.display = 'flex';
      
      // Position the HUD near the cursor (with a small offset)
      hud.style.left = ((pointer.x + 1)* sizes.width) / 2  + 20 + 'px';
      hud.style.top = ((-pointer.y + 1)* sizes.height) / 2 + 'px';
      // Set the text based on the object's name
      const info = hoveredObject.name.replace(/_/g, ' ').replace('target', '');
      hudText.innerText = info;
    } else {
      // Hide the HUD if we aren't hovering over a target
      hud.style.display = 'none';
    }
    raycaster.camera = camera;
    const hoveredHitbox = intersects.length > 0 ? intersects[0].object : null;
    const tapIsHovered = hoveredHitbox?.userData.type === 'tap';

    // --- 1. TAP ANIMATION (Grouped) ---
    if (tapIsHovered !== tapWasHovered) {
      tapWasHovered = tapIsHovered;
    
      // Find the valve specifically to animate it
      const valveHitbox = interactables.find(h => h.userData.type === 'tapValve' && h.name.toLowerCase().includes('valve'));
      if (tapIsHovered) playSpatialSound(sounds.tapOpen, valveHitbox);
      else playSpatialSound(sounds.tapClose, valveHitbox);
      if (valveHitbox && valveHitbox.userData.targets) {
        const { targets, Axis } = valveHitbox.userData;
        
        targets.forEach((targetMesh) => {
          runQueueAnimation(targetMesh, tapIsHovered, Axis, Math.PI / 4, 'rotation', 0.3);
        });
      }
    
      // Water Stream Logic
      const bodyHitbox = interactables.find(h => h.userData.type === 'tap' && h.name.toLowerCase().includes('body'));
      if (bodyHitbox && bodyHitbox.userData.targets) {
        const targetPos = bodyHitbox.userData.targets[0].position;
            
        // Position the stream exactly at the tap
        waterStream.position.copy(targetPos);
            
        // VERY IMPORTANT: Make sure it starts completely hidden!
        waterStream.scale.y = 0; 
        // Wait to move it up so it scales downward nicely when turned on
        waterStream.position.y -= waterStreamLength; 
            
        scene.add(waterStream);
            
        // Position the splash particles at the bottom where the sink basin is
        splashParticles.position.copy(targetPos);
        splashParticles.position.y -= waterStreamLength; 
        scene.add(splashParticles);
      }
      if (bodyHitbox && bodyHitbox.userData.targets && bodyHitbox.userData.targets.length > 0) {
        const targetPos = bodyHitbox.userData.targets[0].position;
        gsap.killTweensOf([waterStream.scale, waterStream.position]);
        if (tapIsHovered) {
          if (tapIsHovered) playSpatialSound(sounds.tapOpen, valveHitbox);
          else playSpatialSound(sounds.tapClose, bodyHitbox);
          waterStream.position.copy(targetPos);
          gsap.to(waterStream.scale, { y: waterStreamLength, duration: 0.2, ease: "power1.inOut" });
        } else {
          // TURN OFF: Detach top and fall into the sink
          gsap.to(waterStream.position, { 
            y: targetPos.y - waterStreamLength, 
            duration: 0.25, 
            ease: "power2.in" // Accelerates as it falls (like gravity)
          });

          gsap.to(waterStream.scale, { 
            y: 0, 
            duration: 0.25, 
            ease: "power2.in" 
          });
        }
      }
    }

    interactables.forEach((hitbox) => {
      const isHovered = (hitbox === hoveredHitbox);

      if (isHovered !== hitbox.userData.isHovered) {
        hitbox.userData.isHovered = isHovered;
        const { type, targets, Axis } = hitbox.userData;

        if (!targets) return;

        if (isHovered && hitbox.name.includes('target')) {
          playSpatialSound(sounds.targetHover, hitbox);
        }

        targets.forEach((targetMesh) => {
          const swingDirection = targetMesh.userData.swingDirection || 1;
          const isCustom = targetMesh.name === "oven_2_glass_second";

          // --- NEW AUDIO LOGIC ---
          if (type === 'cabinet') {
            if (isHovered) playSpatialSound(sounds.cabinetOpen, targetMesh);
            else playSpatialSound(sounds.cabinetClose, targetMesh);
          } 
          else if (type === 'oven') {
            if (isHovered) playSpatialSound(sounds.ovenOpen, targetMesh);
            else playSpatialSound(sounds.ovenClose, targetMesh);
          }
          else if (type === 'officeChair') {
            if (isHovered) playSpatialSound(sounds.chairSlideOff, targetMesh);
            else playSpatialSound(sounds.chairSlideIn, targetMesh);
          }
          else if (isHovered) {
            // One-shot hover sounds
            if (type.includes('scaleUp') || hitbox.name.includes('utensil')) playSpatialSound(sounds.utensils, targetMesh);
            else if (type === 'soap') playSpatialSound(sounds.bubbles, targetMesh);
            else if (type === 'hangingLights') {if (targetMesh.name.includes("hanging_lights")) playSpatialSound(sounds.hangingLights, targetMesh); else playSpatialSound(sounds.highlight, targetMesh)}
            else if (type === 'laptopScreen') playSpatialSound(sounds.laptop, targetMesh);
            else if (hitbox.name.includes('glass') && hitbox.name.includes('raycaster')) playSpatialSound(sounds.glass, targetMesh);
          }
          
          // 1. Hanging Lights (Color Animation)
          if (type === 'hangingLights') {
            const targetBrightness = isHovered ? 3.5 : 1.0;
            if (targetMesh.material) {
              runQueueAnimation(targetMesh, isHovered, null, targetBrightness, 'color', 0.4);
            }
          } 
          
          // 2. Scaling Objects (Scale + Y Rotation)
          else if (type.includes('scaleUp') && !targetMesh.name.includes('pot')) {
            const scaleVal = 1.2;
            const rotVal = isHovered ? -Math.PI / 6 : 0;
            
            runQueueAnimation(targetMesh, isHovered, Axis, scaleVal, 'scale', 0.2);
            if (type === "scaleUpRotate") {
              gsap.to(targetMesh.rotation, {
                z: targetMesh.userData.initialRot.z + rotVal,
                duration: 0.3,
                ease: "power2.out"
              });
            }
          } 
          
          // 3. Standard Cabinets/Ovens/Chairs (Rotation)
          else {
            let targetValue = 0;
            let duration = 0.5;
            let animType = 'rotation';

            if (type === 'cabinet' || type === 'oven') {
              targetValue = (Math.PI / 2) * swingDirection;
              if (isCustom) {
                animType = 'customRotation';
                duration = 1.0;
              }
            } else if (type === 'officeChair') {
              targetValue = Math.PI / 6;
            } else {
              return; // Not a recognized interactive type
            }

            runQueueAnimation(targetMesh, isHovered, Axis, targetValue, animType, duration);
          }
        });
      }
    });

    // 3. SOAP & BUBBLES CONTINUOUS PHYSICS
    // Check if any soap hitbox is hovered
    const soapIsHovered = interactables.some(h => h.userData.type === 'soap' && h.userData.isHovered);

    bubblesData.forEach((data) => {
      const sprite = data.sprite;
      
      // Spawning
      if (soapIsHovered && sprite.position.y < -10) {
        if (Math.random() > 0.9) { 
          // Spawn bubbles using local coordinates relative to the soap's origin
          sprite.position.set(
            (Math.random() - 0.5) * 0.1, 
            0.05 + Math.random() * 0.05, // Shifted up by 0.05 local units to spawn on top
            (Math.random() - 0.5) * 0.1  
          );

          // Pop out 0.2 to 0.4 local units above the soap
          data.popHeight = 0.2 + (Math.random() * 0.2);
        }
      }

      // Floating physics
      if (sprite.position.y > -10) {
        sprite.position.y += data.speed;
        sprite.position.x += Math.sin(elapsedTime * 2 + data.phase) * 0.001;
        sprite.position.z += Math.cos(elapsedTime * 2 + data.phase) * 0.001;

        // Pop logic
        if (sprite.position.y > data.popHeight) {
          sprite.position.y = -999;
        }
      }
    });
   // --- CABINET DOOR ANIMATION LOGIC ---
    // Raycast against the invisible, stationary hitboxes instead of the moving meshes
  //   const doorIntersects = raycaster.intersectObjects(doorHitboxes, false);
  //   const currentHoveredPair = doorIntersects.length > 0 ? doorIntersects[0].object.userData.pairId : null;
     
  //   ['1', '2'].forEach(pairId => {
  //     const isHovered = (currentHoveredPair === pairId);
      
  //     // Trigger animation only when the mouse enters or leaves the invisible bounding box
  //     if (isHovered !== doorWasHovered[pairId]) {
  //       doorWasHovered[pairId] = isHovered;
  //       const pair = cabinetDoors[pairId];
        
  //       // Animate Left Panel
  //       if (pair.left) {
  //         gsap.to(pair.left.rotation, { 
  //           y: isHovered ? pair.left.userData.initialRotY - (Math.PI / 2) : pair.left.userData.initialRotY, 
  //           duration: 0.5, 
  //           ease: "power2.out",
  //           overwrite: true // Allows smooth direction-change if you quickly swipe your mouse
  //         });
  //       }
        
  //       // Animate Right Panel
  //       if (pair.right) {
  //         gsap.to(pair.right.rotation, { 
  //           y: isHovered ? pair.right.userData.initialRotY + (Math.PI / 2) : pair.right.userData.initialRotY, 
  //           duration: 0.5, 
  //           ease: "power2.out",
  //           overwrite: true
  //         });
  //       }
  //     }
  //   });
  //   // 1. Evaluate hover state in one ultra-fast line.
  // // If length is 0, JS instantly returns false and skips checking the name!
  //   // --- SOAP LOGIC ---
  //   if (soap) {
  //     const soapIntersects = raycaster.intersectObject(soap, false);
  //     soapIsHovered = soapIntersects.length > 0;

  //     bubblesData.forEach((data) => {
  //       const sprite = data.sprite;

  //       // Spawning
  //       if (soapIsHovered && sprite.position.y < -10) {
  //         if (Math.random() > 0.9) { 
  //           // Spawn bubbles using local coordinates relative to the soap's origin
  //           sprite.position.set(
  //             (Math.random() - 0.5) * 0.1, 
  //             0.05 + Math.random() * 0.05, // Shifted up by 0.05 local units to spawn on top
  //             (Math.random() - 0.5) * 0.1  
  //           );

  //           // Pop out 0.4 to 0.6 local units above the soap
  //           data.popHeight = 0.2 + (Math.random() * 0.2);
  //         }
  //       }

  //       // Floating physics
  //       if (sprite.position.y > -10) {
  //         sprite.position.y += data.speed;
  //         sprite.position.x += Math.sin(elapsedTime * 2 + data.phase) * 0.001;
  //         sprite.position.z += Math.cos(elapsedTime * 2 + data.phase) * 0.001;

  //         // Pop logic
  //         if (sprite.position.y > data.popHeight) {
  //           sprite.position.y = -999;
  //         }
  //       }
  //     });
  //   }
  //   tapIsHovered = currentIntersects.length > 0 && currentIntersects[0].object.name.includes("tap");

  //   // 2. Trigger animations ONLY when the state actually changes
  //   if (tapIsHovered !== tapWasHovered) {
  //     tapWasHovered = tapIsHovered;

  //     gsap.to(tapValve.rotation, {
  //       x: tapIsHovered ? tapValve.userData.initialRotationX + (Math.PI / 4) : tapValve.userData.initialRotationX,
  //       duration: 0.3,
  //       ease: "power2.out"
  //     });

  //     gsap.killTweensOf(waterStream.scale);
  //     gsap.killTweensOf(waterStream.position);

  //   if (tapIsHovered) {
  //       // TURN ON: Snap position back to the tap and grow downwards
  //       waterStream.position.copy(tapBody.position);
  //       gsap.to(waterStream.scale, {
  //         y: waterStreamLength,
  //         duration: 0.2,
  //         ease: "power1.inOut"
  //       });
  //     } else {
  //       // TURN OFF: Detach top and fall into the sink
  //       gsap.to(waterStream.position, {
  //         y: tapBody.position.y - waterStreamLength,
  //         duration: 0.25,
  //         ease: "power2.in" // Accelerates as it falls (like gravity)
  //       });
        
  //       gsap.to(waterStream.scale, {
  //         y: 0,
  //         duration: 0.25,
  //         ease: "power2.in"
  //       });
  //     }
  //   }

  //   // 3. Particle Physics (runs exactly as you wrote it)
    if (waterStream.scale.y > 0.089) {
      const positions = splashParticles.geometry.attributes.position.array;
      for (let i = 0; i < splashCount; i++) {
        const i3 = i * 3;

        // Apply velocity and gravity
        positions[i3] += splashVelocities[i].x;
        positions[i3 + 1] += splashVelocities[i].y;
        positions[i3 + 2] += splashVelocities[i].z;
        splashVelocities[i].y -= 0.005; // Gravity pull

        // Reset particle if it falls below the sink level
        if (positions[i3 + 1] < -0.1) {
          positions[i3] = 0;
          positions[i3 + 1] = 0;
          positions[i3 + 2] = 0;
          splashVelocities[i].y = Math.random() * 0.004 + 0.02; // Random upward bounce
        }
      }
      splashParticles.geometry.attributes.position.needsUpdate = true;
    } else {
      // Hide particles completely when tap is off
      const positions = splashParticles.geometry.attributes.position.array;
      for (let i = 0; i < splashCount * 3; i++) positions[i] = 0;
      splashParticles.geometry.attributes.position.needsUpdate = true;
    }

    // --- KEYBOARD MOVEMENT LOGIC ---
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward); // Get the direction camera is looking
    forward.y = 0; // Prevent flying into the sky when looking up
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(camera.up, forward).normalize(); // Calculate right vector

    const moveVec = new THREE.Vector3();

    if (keys.w) moveVec.add(forward);
    if (keys.s) moveVec.sub(forward);
    if (keys.a) moveVec.add(right);
    if (keys.d) moveVec.sub(right);
    if (keys.e) moveVec.y += 1; // Up
    if (keys.q) moveVec.y -= 1; // Down

    // Normalize to prevent faster diagonal movement, then scale by speed and delta
    if (moveVec.length() > 0) {
      moveVec.normalize().multiplyScalar(moveSpeed * delta);

      // Apply movement to BOTH camera and OrbitControls target to prevent snapping
      camera.position.add(moveVec);
      controls.target.add(moveVec);
    }
    // Update Howler 3D Listener to match Camera Position & Rotation
    Howler.pos(camera.position.x, camera.position.y, camera.position.z);
    
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    Howler.orientation(camDir.x, camDir.y, camDir.z, camera.up.x, camera.up.y, camera.up.z);
    updateCameraConstraints();
    controls.update(); // Required for damping
    PostProcessing.render();
    window.requestAnimationFrame(render);
  };



  render();
}

init();