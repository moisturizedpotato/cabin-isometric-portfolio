import * as THREE from 'three';
import { OrbitControls } from './utils/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createInputHandler } from './systems/InputHandler.js';
import { createRenderer, createPostProcessing } from './systems/renderer.js';
import { createRaycasterManager } from './interactions/RaycasterManager.js';
import { Chess } from 'chess.js';
import { gsap } from 'gsap';
import './style.scss';
import { createAudioManager } from './audio.js';
import { createWaterStream, createSplashParticles, createBubbleGroup } from './effects.js';
import { createAnimationQueue } from './animationQueue.js';

let canvas;
let btnUp;
let btnDown;
let hud;
let hudText;
const sizes = { width: window.innerWidth, height: window.innerHeight };
let audioBtn;
let loadingText;
let segmentsContainer;
let enterButton;
let loadingScreen;

let raycasterManager;
let raycaster;
let pointer;
let inputHandler;

const loadingManager = new THREE.LoadingManager();
let scene;
let camera;
let renderer;
let controls;
let bloomComposer;
let finalComposer;
let darkBackground;
let darkenNonBloomed;
let restoreMaterial;
let resizePostProcessing;

let sounds;
let playSpatialSound;
let updateListener;
let toggleBgm;
let runQueueAnimation;

function setupAudioManager() {
  const audioManager = createAudioManager();
  sounds = audioManager.sounds;
  playSpatialSound = audioManager.playSpatialSound;
  updateListener = audioManager.updateListener;
  toggleBgm = audioManager.toggleBgm;
  runQueueAnimation = createAnimationQueue(gsap).runQueueAnimation;
}

function playHoverSound(type, isHovered, hitbox, targetMesh) {
  const toggleSounds = {
    cabinet: [sounds.cabinetOpen, sounds.cabinetClose],
    oven: [sounds.ovenOpen, sounds.ovenClose],
    officeChair: [sounds.chairSlideOff, sounds.chairSlideIn],
  };

  const soundPair = toggleSounds[type];
  if (soundPair) {
    playSpatialSound(isHovered ? soundPair[0] : soundPair[1], targetMesh);
    return;
  }

  if (!isHovered) return;

  if (type.includes('scaleUp') || hitbox.name.includes('utensil')) {
    playSpatialSound(sounds.utensils, targetMesh);
  } else if (type === 'soap') {
    playSpatialSound(sounds.bubbles, targetMesh);
  } else if (type === 'hangingLights') {
    playSpatialSound(targetMesh.name.includes('hanging_lights') ? sounds.hangingLights : sounds.highlight, targetMesh);
  } else if (type === 'laptopScreen') {
    playSpatialSound(sounds.laptop, targetMesh);
  } else if (hitbox.name.includes('glass') && hitbox.name.includes('raycaster')) {
    playSpatialSound(sounds.glass, targetMesh);
  }
}

const interactables = [];
let intersects = [];
let currentBoardState = {};
const chessPieces = {};
const floor_objs = [];
let deadWhiteCount = -0.5 * 1.4;
let deadBlackCount = -0.66429 * 1.4;
let currentFloorLevel = 0; 
const transparentOpacity = 0.2;
let tapWasHovered = false;

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
let waterStream;
let splashParticles;
let splashVelocities;
let splashCount;
let bubbleGroup;
let bubblesData;

function setupEffects() {
  waterStream = createWaterStream(waterStreamLength);
  const splashResult = createSplashParticles();
  splashParticles = splashResult.splashParticles;
  splashVelocities = splashResult.splashVelocities;
  splashCount = splashVelocities.length;

  const bubbleResult = createBubbleGroup(new THREE.TextureLoader(), '/images/bubble_burst_spritesheet.png');
  bubbleGroup = bubbleResult.bubbleGroup;
  bubblesData = bubbleResult.bubblesData;
}

function bindDomElements() {
  canvas = document.querySelector('#experience-canvas');
  btnUp = document.getElementById('btn-floor-up');
  btnDown = document.getElementById('btn-floor-down');
  hud = document.getElementById('hover-hud');
  hudText = document.getElementById('hud-text');
  audioBtn = document.getElementById('audio-toggle');
  loadingText = document.getElementById('loading-text');
  segmentsContainer = document.getElementById('loading-bar-segments');
  enterButton = document.getElementById('enter-button');
  loadingScreen = document.getElementById('loading-screen');
}

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const progress = (itemsLoaded / itemsTotal) * 100;
  loadingText.innerText = `INITIALIZING... ${Math.floor(progress)}%`;
  
  // Create the segmented block effect (max 12 blocks for a 320px container)
  const numSegments = Math.floor((progress / 100) * 12);
  segmentsContainer.innerHTML = ''; // Clear old segments
  
  for (let i = 0; i < numSegments; i += 1) {
    const seg = document.createElement('div');
    seg.className = 'segment';
    segmentsContainer.appendChild(seg);
  }
};
let bgmPlaying = false;

let clock;
let chess;
let history;

function setupScene() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  chess = new Chess();
  chess.loadPgn('1. d4 Nf6 2. c4 d5 3. Nc3 Bf5 4. Qa4+ Bd7 5. Qb3 dxc4 6. Qxc4 Be6 7. Qb5+ Bd7 8.Qd3 a6 9. e4 e6 10. Nf3 Bb4 11. Qc2 O-O 12. Bg5 h6 13. Bh4 Bxc3+ 14. bxc3 g5 15.Nxg5 hxg5 16. Bxg5 Kg7 17. e5 Kg8 18. Bxf6 Qe8 19. Bd3 Bc6 20. Bh7# 1-0');
  history = chess.history({ verbose: true });
}

function setupRendererAndCamera() {
  scene.background = new THREE.Color('#111111'); // Dark grey background

  camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
  camera.position.set(5.811391771542539, 2.4932501863561063, -3.156645731723698);

  renderer = createRenderer(canvas, sizes);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.target.set(2.554647, 0.0027, 0.313789);

  const isMobile = window.innerWidth < 768;
  const camX = 5.811;
  const camY = 2.493;
  const camZ = -3.156;
  const mobileOffset = isMobile ? 1.5 : 1.0;
  camera.position.set(camX * mobileOffset, camY, camZ * mobileOffset);
  controls.update();
}

function setupPostProcessing() {
  ({ bloomComposer, finalComposer, darkBackground, darkenNonBloomed, restoreMaterial, resizePostProcessing } =
    createPostProcessing(scene, camera, renderer, sizes));
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setDRACOLoader(dracoLoader);

let shiftPressed = false;

let windowKeyDownHandler;
let windowKeyUpHandler;
let windowTouchStartHandler;
let windowTouchMoveHandler;
let windowTouchEndHandler;
let windowResizeHandler;
let btnUpClickHandler;
let btnDownClickHandler;
let audioBtnClickHandler;
let enterButtonClickHandler;

function bindUiEventHandlers() {
  if (btnUp && btnDown) {
    btnUpClickHandler = () => {
      sounds.uiClick.play();
      if (currentFloorLevel < 2) {
        currentFloorLevel++;
        gsap.to(camera.position, { y: camera.position.y + 0.1, duration: 0.5, ease: 'power2.out' });
        updateFloorOpacity();
      }
    };
    btnUp.addEventListener('click', btnUpClickHandler);

    btnDownClickHandler = () => {
      sounds.uiClick.play();
      if (currentFloorLevel > 0) {
        currentFloorLevel--;
        gsap.to(camera.position, { y: camera.position.y - 0.1, duration: 0.5, ease: 'power2.out' });
        updateFloorOpacity();
      }
    };
    btnDown.addEventListener('click', btnDownClickHandler);
  }

  if (audioBtn) {
    audioBtnClickHandler = () => {
      if (sounds.uiClick) sounds.uiClick.play();
      bgmPlaying = toggleBgm(bgmPlaying);
      audioBtn.innerText = bgmPlaying ? 'TURN: OFF' : 'TURN: ON';
    };
    audioBtn.addEventListener('click', audioBtnClickHandler);
  } else {
    console.warn('Could not find the #audio-toggle button in the HTML!');
  }
}

function unbindUiEventHandlers() {
  if (btnUp && btnUpClickHandler) btnUp.removeEventListener('click', btnUpClickHandler);
  if (btnDown && btnDownClickHandler) btnDown.removeEventListener('click', btnDownClickHandler);
  if (audioBtn && audioBtnClickHandler) audioBtn.removeEventListener('click', audioBtnClickHandler);
  if (enterButton && enterButtonClickHandler) enterButton.removeEventListener('click', enterButtonClickHandler);
}

function setupRaycasterAndInput() {
  raycasterManager = createRaycasterManager();
  raycaster = raycasterManager.raycaster;
  pointer = raycasterManager.pointer;

  inputHandler = createInputHandler({
    onInteraction: {
      updatePointer: (nextPointer) => {
        pointer.x = nextPointer.x;
        pointer.y = nextPointer.y;
      },
      handle: handleRaycasterInteraction
    }
  });

  inputHandler.bind();
}

function cleanup() {
  removeGlobalEventListeners();
  unbindUiEventHandlers();
  if (inputHandler?.unbind) inputHandler.unbind();
}

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
// UI event bindings are handled by bindUiEventHandlers()

function handleRaycasterInteraction() {
  if (intersects.length === 0) return;

  const object = intersects[0].object;
  if (!object.name.includes('target')) return;

  const targetMesh = object.userData.targets?.[0];
  if (!targetMesh) return;

  const interactionDefinitions = {
    frontDoor: { open: sounds.doorOpen, close: sounds.doorClose, targetValue: Math.PI / 2, animType: 'rotation', duration: 1.0 },
    drawer1: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.12, animType: 'translation', duration: 1.0 },
    drawer2: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.12, animType: 'translation', duration: 1.0 },
    drawer3: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.14, animType: 'translation', duration: 1.0 },
    drawer4: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.16, animType: 'translation', duration: 1.0 },
    wardrobe: { open: sounds.cabinetOpen, close: sounds.cabinetClose, targetValue: Math.PI / 3, animType: 'rotation', duration: 0.5 },
  };

  const currentType = object.userData.type;
  const definition = interactionDefinitions[currentType];
  if (!definition) return;

  object.userData.wantsOpen = !object.userData.wantsOpen;
  playSpatialSound(object.userData.wantsOpen ? definition.open : definition.close, targetMesh);
  runQueueAnimation(targetMesh, object.userData.wantsOpen, object.userData.Axis, definition.targetValue, definition.animType, definition.duration);
}

const keys = { w: false, a: false, s: false, d: false, q: false, e: false };
const moveSpeed = 3.0; // Units per second

function setupGlobalEventListeners() {
  windowKeyDownHandler = (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    if (event.key === 'Shift') shiftPressed = true;
  };
  window.addEventListener('keydown', windowKeyDownHandler);

  windowKeyUpHandler = (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
    if (event.key === 'Shift') shiftPressed = false;
  };
  window.addEventListener('keyup', windowKeyUpHandler);

  windowTouchStartHandler = (event) => {
    if (event.target === canvas || event.target.closest('#experience-canvas')) {
      if (event.touches.length === 1) {
        raycasterManager.updatePointerFromEvent(event);
        event.preventDefault();
      }
    }
  };
  window.addEventListener('touchstart', windowTouchStartHandler, { passive: false });

  windowTouchEndHandler = (event) => {
    if (event.target === canvas || event.target.closest('#experience-canvas')) {
      handleRaycasterInteraction();
      event.preventDefault();
    }
  };
  window.addEventListener('touchend', windowTouchEndHandler, { passive: false });

  windowResizeHandler = () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    resizePostProcessing(sizes.width, sizes.height);

    camera.aspect = sizes.width / sizes.height;
    const isMobile = sizes.width < 768;
    const mobileOffset = isMobile ? 1.5 : 1.0;

    camera.position.x = 5.811 * mobileOffset;
    camera.position.z = -3.756 * mobileOffset;
    camera.updateProjectionMatrix();
    adjustHudForMobile();
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };
  window.addEventListener('resize', windowResizeHandler);
}

function removeGlobalEventListeners() {
  if (windowKeyDownHandler) window.removeEventListener('keydown', windowKeyDownHandler);
  if (windowKeyUpHandler) window.removeEventListener('keyup', windowKeyUpHandler);
  if (windowTouchStartHandler) window.removeEventListener('touchstart', windowTouchStartHandler);
  if (windowTouchMoveHandler) window.removeEventListener('touchmove', windowTouchMoveHandler, { passive: false });
  if (windowTouchEndHandler) window.removeEventListener('touchend', windowTouchEndHandler, { passive: false });
  if (windowResizeHandler) window.removeEventListener('resize', windowResizeHandler);
}

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
      const target = currentFloorLevel >= 1 ? 1.0 : transparentOpacity;
      gsap.to(obj.material, { opacity: target, duration: 0.5, ease: "power2.inOut" });
    } else if (obj.name.includes('floor_2')) {
      const target = currentFloorLevel >= 2 ? 1.0 : transparentOpacity;
      gsap.to(obj.material, { opacity: target, duration: 0.5, ease: "power2.inOut" });
    }
  });
}

const TAP_ROTATION_VALUE = Math.PI / 4;
const WATER_STREAM_OPEN_DURATION = 0.2;
const WATER_STREAM_CLOSE_DURATION = 0.25;

function ensureWaterEffects(targetPosition) {
  if (!targetPosition) return;
  if (!waterStream.parent) scene.add(waterStream);
  if (!splashParticles.parent) scene.add(splashParticles);
  waterStream.position.copy(targetPosition);
  waterStream.position.y -= waterStreamLength;
  splashParticles.position.copy(targetPosition);
  splashParticles.position.y -= waterStreamLength;
  waterStream.scale.y = 0;
}

function setWaterFlow(on, targetPosition) {
  if (!targetPosition) return;
  gsap.killTweensOf([waterStream.scale, waterStream.position]);
  if (on) {
    gsap.to(waterStream.scale, { y: waterStreamLength, duration: WATER_STREAM_OPEN_DURATION, ease: 'power1.inOut' });
  } else {
    gsap.to(waterStream.position, { y: targetPosition.y - waterStreamLength, duration: WATER_STREAM_CLOSE_DURATION, ease: 'power2.in' });
    gsap.to(waterStream.scale, { y: 0, duration: WATER_STREAM_CLOSE_DURATION, ease: 'power2.in' });
  }
}

function handleTapHoverState(valveHitbox, bodyHitbox, isHovered) {
  if (!valveHitbox || isHovered === tapWasHovered) return;

  tapWasHovered = isHovered;
  playSpatialSound(isHovered ? sounds.tapOpen : sounds.tapClose, valveHitbox);

  valveHitbox.userData.targets?.forEach((targetMesh) => {
    runQueueAnimation(targetMesh, isHovered, valveHitbox.userData.Axis, TAP_ROTATION_VALUE, 'rotation', 0.3);
  });

  const targetPos = bodyHitbox?.userData?.targets?.[0]?.position;
  ensureWaterEffects(targetPos);
  setWaterFlow(isHovered, targetPos);
}

function handleHoverInteraction(hitbox, isHovered) {
  if (isHovered === hitbox.userData.isHovered) return;
  hitbox.userData.isHovered = isHovered;
  const { type, targets, Axis } = hitbox.userData;
  if (!targets) return;

  if (isHovered && hitbox.name.includes('target') && !hitbox.name.includes('drawer')) {
    playSpatialSound(sounds.targetHover, hitbox);
  }

  targets.forEach((targetMesh) => {
    playHoverSound(type, isHovered, hitbox, targetMesh);

    if (type === 'hangingLights') {
      if (targetMesh.material) {
        runQueueAnimation(targetMesh, isHovered, null, 3.5, 'color', 0.4);
      }
      return;
    }

    if (type.includes('scaleUp') && !targetMesh.name.includes('Pot')) {
      runQueueAnimation(targetMesh, isHovered, Axis, 1.2, 'scale', 0.2);
      if (type === 'scaleUpRotate') {
        gsap.to(targetMesh.rotation, {
          z: targetMesh.userData.initialRot.z + (isHovered ? -Math.PI / 6 : 0),
          duration: 0.3,
          ease: 'power2.out'
        });
      }
      return;
    }

    let targetValue = 0;
    let duration = 0.5;
    let animType = 'rotation';

    if (type === 'cabinet' || type === 'oven') {
      targetValue = (Math.PI / 2) * (targetMesh.userData.swingDirection || 1);
      if (targetMesh.name === 'oven_2_glass_second') {
        animType = 'customRotation';
        duration = 1.0;
      }
    } else if (type === 'officeChair') {
      targetValue = Math.PI / 6;
    } else {
      return;
    }

    runQueueAnimation(targetMesh, isHovered, Axis, targetValue, animType, duration);
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
  bindDomElements();
  setupAudioManager();
  setupScene();
  setupEffects();
  setupRendererAndCamera();
  bindUiEventHandlers();
  setupRaycasterAndInput();
  setupPostProcessing();
  setupGlobalEventListeners();

  adjustHudForMobile();

  const [{ createTextureLibrary, loadCabin }, { loadEnvironment }] = await Promise.all([
    import('./world/cabin.js'),
    import('./world/environment.js')
  ]);

  const textureLoader = new THREE.TextureLoader();
  const { textureMap, loadedTextures } = createTextureLibrary(textureLoader);

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
  }

  controls.enabled = false;
  const scaleUpItems = [];
  interactables.forEach(hitbox => {
    if (hitbox.userData.type && hitbox.userData.type.toLowerCase().includes('scaleup') && !hitbox.name.includes('Pot')) {
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

    // hover events
    intersects = raycasterManager.getIntersections(camera, interactables);
    document.body.style.cursor = intersects.length > 0 && intersects[0].object.name.includes('target') ? 'pointer' : 'default';
    const hoveredObject = intersects.length > 0 ? intersects[0].object : null;

    // Only show HUD if we hit an object with a 'target' name
    const hoveredHitbox = intersects.length > 0 ? intersects[0].object : null;
    if (hoveredHitbox?.name.includes('target')) {
      hud.style.display = 'flex';
      
      // Position the HUD near the cursor (with a small offset)
      hud.style.left = ((pointer.x + 1) * sizes.width) / 2 + 20 + 'px';
      hud.style.top = ((-pointer.y + 1) * sizes.height) / 2 + 'px';
      const info = hoveredHitbox.name.replace(/_/g, ' ').replace('target', '');
      hudText.innerText = info;
    } else {
      hud.style.display = 'none';
    }

    const tapIsHovered = hoveredHitbox?.userData.type === 'tap';
    const valveHitbox = interactables.find(h => h.userData.type === 'tapValve' && h.name.toLowerCase().includes('valve'));
    const bodyHitbox = interactables.find(h => h.userData.type === 'tap' && h.name.toLowerCase().includes('body'));

    handleTapHoverState(valveHitbox, bodyHitbox, tapIsHovered);

    interactables.forEach((hitbox) => {
      const isHovered = hitbox === hoveredHitbox;
      handleHoverInteraction(hitbox, isHovered);
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
    // Update 3D audio listener to match Camera Position & Rotation
    updateListener(camera);
    updateCameraConstraints();
    controls.update(); // Required for damping
    PostProcessing.render();
    window.requestAnimationFrame(render);
  };



  render();
}

init();