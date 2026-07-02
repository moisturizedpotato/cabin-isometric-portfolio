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
let whiteOverlay;
let btnDown;
let hud;
let hudText;
const sizes = { width: window.innerWidth, height: window.innerHeight };
let audioBtn;
let loadingText;
let segmentsContainer;
let enterButton;
let loadingScreen;
let prospectOverlay;
let prospectModal;
let prospectClose;

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
let backBtn;

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
  minPan: new THREE.Vector3(2.123708182501076,
0.1,
0.23236511252797676), 
  maxPan: new THREE.Vector3(3.3264561167933016,
1,
0.2592356070361481),   
  minZoom: 0.5,                          
  maxZoom: 5,                             
  minPolarAngle: Math.PI / 32, 
  maxPolarAngle: Math.PI / 2 - 0.1, 
  minAzimuthAngle: Math.PI / 2 + Math.PI / 4, 
  maxAzimuthAngle: -Math.PI / 2                 
};

// --- NEW: WATER & SPLASH SETUP ---
const waterStreamLength = 0.09; // 
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
  backBtn = document.getElementById('back-button');
  whiteOverlay = document.getElementById('white-transition-overlay');
  prospectOverlay = document.getElementById('prospect-overlay');
  prospectModal = document.getElementById('prospect-modal');
  prospectClose = document.getElementById('prospect-close');
}

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const progress = (itemsLoaded / itemsTotal) * 100;
  loadingText.innerText = `INITIALIZING... ${Math.floor(progress)}%`;
  

  const numSegments = Math.floor((progress / 100) * 12);
  segmentsContainer.innerHTML = '';
  
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
  scene.background = new THREE.Color('#111111'); 

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
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

let windowKeyDownHandler;
let windowKeyUpHandler;
let windowTouchStartHandler;
let windowTouchMoveHandler;
let windowTouchEndHandler;
let windowResizeHandler;
let btnUpClickHandler;
let backBtnClickHandler;
let btnDownClickHandler;
let audioBtnClickHandler;
let enterButtonClickHandler;
let prospectWindowClickHandler;

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
  if (backBtn) {
        backBtnClickHandler = (event) => {
      event.preventDefault(); 

if (sounds.uiClick) sounds.uiClick.play();
      if (sounds.whoosh) sounds.whoosh.play();
      
      controls.enabled = false;

      const isMobile = window.innerWidth < 768;
      const mobileOffset = isMobile ? 1.5 : 1.0;
      
      const startCameraPos = { 
        x: 5.811 * mobileOffset, 
        y: 2.493, 
        z: -3.156 * mobileOffset 
      };
      const startLookAt = { 
        x: 2.554647, 
        y: 0.0027, 
        z: 0.313789 
      };


      gsap.to(camera.position, {
        x: startCameraPos.x,
        y: startCameraPos.y,
        z: startCameraPos.z,
        duration: 2.0, 
        ease: "power3.inOut"
      });

      
      gsap.to(controls.target, {
        x: startLookAt.x,
        y: startLookAt.y,
        z: startLookAt.z,
        duration: 2.0,
        ease: "power3.inOut",
        onUpdate: () => controls.update()
      });

      if (whiteOverlay) {
        whiteOverlay.style.display = 'block';
        whiteOverlay.style.pointerEvents = 'auto'; 
        
        gsap.to(whiteOverlay, {
          opacity: 1,
          duration: 2.0, 
          ease: "power2.inOut",
          onComplete: () => {
            
            window.location.href = backBtn.href;
          }
        });
      } else {
     
        setTimeout(() => { window.location.href = backBtn.href; }, 2000);
      }
     }
    backBtn.addEventListener('click', backBtnClickHandler);
    
    prospectWindowClickHandler = () => {
        if (sounds.uiClick) sounds.uiClick.play();
        
        gsap.to(prospectOverlay, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.in",
          onComplete: () => {
            prospectOverlay.style.display = 'none';
            prospectOverlay.style.pointerEvents = 'none';
          }
        });
      }
    if (prospectClose) {
      prospectClose.addEventListener('click', prospectWindowClickHandler);
    }
  }

  if (audioBtn) {
    audioBtnClickHandler = () => {
      if (sounds.uiClick) sounds.uiClick.play();
      bgmPlaying = toggleBgm(bgmPlaying);
      audioBtn.innerText = bgmPlaying ? 'TURN: OFF' : 'TURN: ON';
    };
    audioBtn.addEventListener('click', audioBtnClickHandler);
  }
}

function unbindUiEventHandlers() {
  if (btnUp && btnUpClickHandler) btnUp.removeEventListener('click', btnUpClickHandler);
  if (backBtn && backBtnClickHandler) backBtn.removeEventListener('click', backBtnClickHandler);
  if (btnDown && btnDownClickHandler) btnDown.removeEventListener('click', btnDownClickHandler);
  if (audioBtn && audioBtnClickHandler) audioBtn.removeEventListener('click', audioBtnClickHandler);
  if (enterButton && enterButtonClickHandler) enterButton.removeEventListener('click', enterButtonClickHandler);
  if (prospectClose && prospectWindowClickHandler) prospectClose.removeEventListener('click', prospectWindowClickHandler);
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
  controls.minDistance = CAMERA_BOUNDS.minZoom;
  controls.maxDistance = CAMERA_BOUNDS.maxZoom;


  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  controls.enablePan = shiftPressed || isTouchDevice;

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
    hud.style.fontSize = '';
    hud.style.padding = '';
  }
}
// --- 4. THE GRAND ENTRANCE EVENT ---
// to be joined with input handlers
// UI event bindings are handled by bindUiEventHandlers()

function handleRaycasterInteraction() {
  if (intersects.length === 0) return;

  const interactionDefinitions = {
    frontDoor: { open: sounds.doorOpen, close: sounds.doorClose, targetValue: Math.PI / 2, animType: 'rotation', duration: 1.0 },
    drawer1: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.12, animType: 'translation', duration: 1.0 },
    drawer2: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.12, animType: 'translation', duration: 1.0 },
    drawer3: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.14, animType: 'translation', duration: 1.0 },
    drawer4: { open: sounds.drawerOpen, close: sounds.drawerClose, targetValue: -0.16, animType: 'translation', duration: 1.0 },
    wardrobe: { open: sounds.cabinetOpen, close: sounds.cabinetClose, targetValue: Math.PI / 3, animType: 'rotation', duration: 0.5 },
  };

  const object = intersects[0].object;
  const currentType = object.userData.type;
  if (!object.name.includes('target')) return;

  const targetMesh = object.userData.targets?.[0];
  if (!targetMesh) return;

  if (object.name.includes('Pot')) {
    if (sounds.uiClick) playSpatialSound(sounds.uiClick, object);
    if (typeof window.openProspectModal === 'function') {
      window.openProspectModal();
    }
    return; 
  }
  if (currentType === 'socialLink') {
    if (sounds.uiClick) playSpatialSound(sounds.uiClick, targetMesh);
    window.open(object.userData.url, '_blank'); 
  }
  const definition = interactionDefinitions[currentType];
  if (!definition) return;
  object.userData.wantsOpen = !object.userData.wantsOpen;
  playSpatialSound(object.userData.wantsOpen ? definition.open : definition.close, targetMesh);
  runQueueAnimation(targetMesh, object.userData.wantsOpen, object.userData.Axis, definition.targetValue, definition.animType, definition.duration);
}

const keys = { w: false, a: false, s: false, d: false, q: false, e: false };
const moveSpeed = 3.0; 

window.openProspectModal = () => {
    if (!prospectOverlay) return;
    
    if (sounds.uiClick) sounds.uiClick.play();
    
    prospectOverlay.style.display = 'block';
    prospectOverlay.style.pointerEvents = 'auto'; // Block clicks to the 3D scene
    
    // Fade in background
    gsap.to(prospectOverlay, { opacity: 1, duration: 0.3, ease: "power2.out" });
    
    // Scale "pop" effect for the modal
    gsap.fromTo(prospectModal, 
      { scale: 0.9 }, 
      { scale: 1, duration: 0.4, ease: "back.out(1.5)" }
    );
  };

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

// --- AUTO-FIT HUD TEXT FUNCTION ---
function fitTextToBox(container, textElement) {
  const maxFontSize = 12; 
  const minFontSize = 10; 

  textElement.style.fontSize = maxFontSize + 'px';

  let currentSize = maxFontSize;
  

  while (textElement.scrollWidth > container.clientWidth && currentSize > minFontSize) {
    currentSize--;
    textElement.style.fontSize = currentSize + 'px';
  }
}

function handleHoverInteraction(hitbox, isHovered) {
  if (isHovered === hitbox.userData.isHovered) return;
  hitbox.userData.isHovered = isHovered;
  let info = '';
  const { type, targets, Axis } = hitbox.userData;
  if (!targets) return;

  if (isHovered) {
    if (hitbox.name.includes('target') && !hitbox.name.includes('drawer')) {
      playSpatialSound(sounds.targetHover, hitbox);
    }
    if (hitbox.name.includes('youtube')) {
      info = "Check out my youtube from here! Although there really isn't much to see there...";
    }
    if (hitbox.name.includes('github')) {
      info = "My github repos.";
    }
    if (hitbox.name.includes('linked_in')) {
      info = "My linked in profile if we wanna talk business.";
    }
    if (hitbox.name.includes('certificate_1')) {
      info = "Foundational level: Complete diploma: in progress";
    }
    if (hitbox.name.includes('chess_board')) {
      console.log(hitbox.name);
      info = "One of the few decent games i played. Click for profile.";
    }
    if (hitbox.name.includes('monitor_screen')) {
      info = "Go back to main page (under development).";
    }
    if (hitbox.name.includes('laptop_screen')) {
      info = "Check out my programing/3D modeling skillsets!";
    }
    if (hitbox.name.includes('Pot') || hitbox.name.includes('pot_lid')) {
      info = "See what I am cooking next!";
    }
    if (hitbox.name.includes('wardrobe')) {
      info = "There really isn't anything in there.";
    }
    if (hitbox.name.includes('certificate_2')) {
      info = "Click these to view my cerdly badges and certificates.";
    }
    if (hitbox.name.includes('certificate_4')) {
      info = "Oracle associate and professional cloud engineer certificates.";
    }
    if (hitbox.name.includes('certificate_3')) {
      info = "secured second place at IIT Roorkee's Nanonavigator 2026"
    }
    if (hitbox.name.includes('drawer')) {
      info = "A whole lot of nothing.";
    }
    if (hitbox.name.includes('door_Third')) {info="It does what it's supoosed to.";}
    if (hitbox.name.includes('poster_1')) {info="Minecraft, one of the jolliest memories of childhood.";}
    if (hitbox.name.includes('poster_2')) {info="Gotta appreciate the graphics of the game.";}
    if (hitbox.name.includes('link_figurine')) {info="The hero of time.";}
    if (hitbox.name.includes('mario_figurine')) {info="It's a me, Mario!";}
    hudText.innerText = info;
    hud.style.display = 'flex';
    fitTextToBox(hud, hudText);
  }

  targets.forEach((targetMesh) => {
    playHoverSound(type, isHovered, hitbox, targetMesh);

    if (type === 'hangingLights') {
      if (targetMesh.material) {
        runQueueAnimation(targetMesh, isHovered, null, 3.5, 'color', 0.4);
      }
      return;
    }

    if ((type.includes('scaleUp') || type.includes('socialLink')) && !targetMesh.name.includes('Pot') && !targetMesh.name.includes('chess_board')) {
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
  
  const squareSize = 0.027; 
  const startX = 2.63;     // The X coordinate of the 'a' file
  const startZ = -0.905;      // The Z coordinate of the '1' rank

  return {
    x: startX - (file * squareSize),
    z: startZ + (rank * squareSize) 
  };
}

function playMove(moveIndex) {
  if (moveIndex >= history.length) {
    gsap.delayedCall(3, resetChessGame);
    return;
  }

  const move = history[moveIndex];
  const activeMesh = currentBoardState[move.from];
  const targetPos = getSquarePosition(move.to);
  const isKnight = move.piece === 'n';


  const tl = gsap.timeline({ 
    onComplete: () => gsap.delayedCall(0.5, () => playMove(moveIndex + 1))
  });

  //HANDLE CAPTURES
  if (move.captured) {
    const capturedMesh = currentBoardState[move.to]; 
    
    if (capturedMesh) {
      const isBlack = capturedMesh.userData.color === 'b';
      
      const graveyardX = isBlack ? 2.455 - 0.045: 2.455 + 0.2; 
      const graveyardZ = isBlack ? (deadBlackCount) : (deadWhiteCount); 

      tl.to(capturedMesh.position, {
        x: graveyardX,
        z: graveyardZ,
        duration: 0.6,
        ease: "power2.inOut"
      }, 0);

      if (isBlack) deadBlackCount += 0.023; else deadWhiteCount -= 0.023;
    }
  }

  //HANDLE MOVEMENT
  if (isKnight) {
    tl.to(activeMesh.position, { 
      y: activeMesh.userData.initialPosition.y + 0.1, 
      duration: 0.3, 
      yoyo: true, 
      repeat: 1, 
      ease: "sine.inOut" 
    }, 0);
    tl.to(activeMesh.position, { x: targetPos.x, z: targetPos.z, duration: 0.6, ease: "power1.inOut" }, 0);
  } else {
    tl.to(activeMesh.position, { x: targetPos.x, z: targetPos.z, duration: 0.6, ease: "power1.inOut" }, 0);
  }

  if (move.flags.includes('k') || move.flags.includes('q')) {
    const isWhite = move.color === 'w';
    const isKingside = move.flags.includes('k');

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
      
      tl.to(rookMesh.position, {
        x: rookTargetPos.x,
        z: rookTargetPos.z,
        duration: 0.6,
        ease: "power1.inOut"
      }, 0); 
      
      currentBoardState[rookTo] = rookMesh;
      delete currentBoardState[rookFrom];
    }
  }

  //UPDATE INTERNAL STATE
  currentBoardState[move.to] = activeMesh;
  delete currentBoardState[move.from];
}

gsap.delayedCall(2, () => playMove(0));

function resetChessGame() {
  const tl = gsap.timeline({
    onComplete: () => gsap.delayedCall(2, () => playMove(0)) 
  });
  
  Object.values(chessPieces).forEach((piece) => {
    tl.to(piece.position, {
      x: piece.userData.initialPosition.x,
      y: piece.userData.initialPosition.y,
      z: piece.userData.initialPosition.z,
      duration: 1.5,
      ease: "power3.inOut"
    }, 0); 
  });


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
      y: potLid.userData.initialPosition.y + 0.002, 
      duration: 0.12, 
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });
    gsap.to(potLid.rotation, {
      x: potLid.userData.initialRotation.x + 0.05,
      z: potLid.userData.initialRotation.z - 0.05,
      duration: 0.09, 
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });
  }

  controls.enabled = false;
  const scaleUpItems = [];
  interactables.forEach(hitbox => {
    if (hitbox.userData.type && (hitbox.userData.type.toLowerCase().includes('scaleup') || hitbox.userData.type.toLowerCase().includes('sociallink')) && !hitbox.name.includes('Pot') && !hitbox.name.includes('chess_board')) {
      if (hitbox.userData.targets) {
        hitbox.userData.targets.forEach(mesh => {
          if (!mesh.userData.initialScale) mesh.userData.initialScale = mesh.scale.clone();
          if (!mesh.userData.initialRot) mesh.userData.initialRot = mesh.rotation.clone();
          
          const isTarget = hitbox.name.includes('target');
          mesh.scale.set(0, 0, 0);

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

//REVEAL ENTER BUTTON
  const loadingContainer = document.getElementById('loading-bar-container');
  const introBox = document.getElementById('intro-text-box'); 
  

  gsap.to([loadingText, loadingContainer], {
    opacity: 0,
    duration: 0.8,
    ease: "power2.inOut",
    onComplete: () => {
      loadingText.style.display = 'none';
      if (loadingContainer) loadingContainer.style.display = 'none';
      

      if (enterButton) {
        enterButton.style.display = 'block';
        gsap.to(enterButton, { opacity: 1, duration: 0.5 });
      }
    }
  });

  let hasStarted = false;

//ENTRANCE EVENT
  if (enterButton) {
    enterButton.addEventListener('click', () => {

      if (hasStarted) return; 
      hasStarted = true;

      gsap.to(enterButton, { 
        opacity: 0, 
        duration: 0.5, 
        onComplete: () => enterButton.style.display = 'none' 
      });

      if (sounds.uiClick) sounds.uiClick.play();
      gsap.delayedCall(0.8, () => {
        if (sounds.whoosh) sounds.whoosh.play();
      });
      if (sounds.bgm) {
        sounds.bgm.play();
        bgmPlaying = true;
      }
      const toggleBtn = document.getElementById('audio-toggle');
      if (toggleBtn) toggleBtn.innerText = 'TURN: OFF';

      gsap.to(loadingScreen, {
        opacity: 0,
        duration: 2.0, 
        ease: "power2.inOut",
        onComplete: () => {
          if (loadingScreen) loadingScreen.style.display = 'none';
        }
      });

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
        onComplete: () => {
          controls.enabled = true; 
        }
      });

      playPopInSequence(1.5, 0.1); 

      if (introBox) {
        gsap.delayedCall(4.5, () => {
          introBox.style.display = 'block'; 
       
          introBox.innerText = "hold shift + left hold to move camera"; 
          

          const textTimeline = gsap.timeline();
          
          textTimeline

            .to(introBox, { opacity: 1, duration: 1.2, ease: "power2.out" })
            

            .to(introBox, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, "+=3.0")
            .call(() => {
              introBox.innerText = "use WASD + QE to move camera"; 
            })
            .to(introBox, { opacity: 1, duration: 1.2, ease: "power2.out" })
            
            .to(introBox, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, "+=3.0")

            .call(() => {
              introBox.innerText = "or use two fingers to move camera on mobile"; 
            })
            

            .to(introBox, { opacity: 1, duration: 1.2, ease: "power2.out" })
            
            .to(introBox, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, "+=3.0")
            .call(() => {
              introBox.style.display = 'none';
            });
        });
      }
    });
  }
    
  //The Animation Loop
  const render = () => {
    // console.log(camera.position);
    // console.log("00000");
    // console.log(controls.target);
    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    if (rgbUniforms) {
    rgbUniforms.uTime.value = clock.getElapsedTime(); // Animates the RGB wave
    }
    //spritesheet animations
    if (steamTexture) {
      const totalFrames = 5;
      const fps = 5; 

     
      const currentFrame = Math.floor(elapsedTime * fps) % totalFrames;
      
     
      steamTexture.offset.x = currentFrame / totalFrames;
    }
    if (fireTexture) {
      const totalFrames = 10;
      const fps = 15; 


      const currentFrame = Math.floor(elapsedTime * fps) % totalFrames;
      
      fireTexture.offset.x = currentFrame / totalFrames;
    }
    if (laptopScreenTexture) {
      const totalFrames = 102;
      const fps = 10;
      
      const currentFrame = Math.floor(elapsedTime * fps) % totalFrames;
      
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
          blade.rotateX(-2 * delta);
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


    const hoveredHitbox = intersects.length > 0 ? intersects[0].object : null;
    if (hoveredHitbox?.name.includes('target')) {
      

      hud.style.left = ((pointer.x + 1) * sizes.width) / 2 + 20 + 'px';
      hud.style.top = ((-pointer.y + 1) * sizes.height) / 2 + 'px';
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

    //SOAP & BUBBLES CONTINUOUS PHYSICS
    const soapIsHovered = interactables.some(h => h.userData.type === 'soap' && h.userData.isHovered);

    bubblesData.forEach((data) => {
      const sprite = data.sprite;
      
      if (soapIsHovered && sprite.position.y < -10) {
        if (Math.random() > 0.9) { 
          sprite.position.set(
            (Math.random() - 0.5) * 0.1, 
            0.05 + Math.random() * 0.05, 
            (Math.random() - 0.5) * 0.1  
          );

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

        positions[i3] += splashVelocities[i].x;
        positions[i3 + 1] += splashVelocities[i].y;
        positions[i3 + 2] += splashVelocities[i].z;
        splashVelocities[i].y -= 0.005; // Gravity pull

        if (positions[i3 + 1] < -0.1) {
          positions[i3] = 0;
          positions[i3 + 1] = 0;
          positions[i3 + 2] = 0;
          splashVelocities[i].y = Math.random() * 0.004 + 0.02; // Random upward bounce
        }
      }
      splashParticles.geometry.attributes.position.needsUpdate = true;
    } else {
      const positions = splashParticles.geometry.attributes.position.array;
      for (let i = 0; i < splashCount * 3; i++) positions[i] = 0;
      splashParticles.geometry.attributes.position.needsUpdate = true;
    }

    // --- KEYBOARD MOVEMENT LOGIC ---
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward); 
    forward.y = 0; 
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(camera.up, forward).normalize(); 

    const moveVec = new THREE.Vector3();

    if (keys.w) moveVec.add(forward);
    if (keys.s) moveVec.sub(forward);
    if (keys.a) moveVec.add(right);
    if (keys.d) moveVec.sub(right);
    if (keys.e) moveVec.y += 1; 
    if (keys.q) moveVec.y -= 1;

    if (moveVec.length() > 0) {
      moveVec.normalize().multiplyScalar(moveSpeed * delta);

      camera.position.add(moveVec);
      controls.target.add(moveVec);
    }
    updateListener(camera);
    updateCameraConstraints();
    controls.update();
    PostProcessing.render();
    window.requestAnimationFrame(render);
  };



  render();
}

init();