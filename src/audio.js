import * as THREE from 'three';
import { Howl, Howler } from 'howler';

const sharedCloseSound = new Howl({ src: ['/audio/oven_close.wav'] });

export function createAudioManager() {
  const sounds = {
    bgm: new Howl({ src: ['/audio/background.wav'], loop: true, volume: 0.3 }),
    potBoil: new Howl({ src: ['/audio/boiling_pot.mp3'], loop: true, volume: 0.8 }),
    cabinetOpen: new Howl({ src: ['/audio/cabinet_door_open.wav'] }),
    cabinetClose: sharedCloseSound,
    ovenOpen: new Howl({ src: ['/audio/oven_open.wav'] }),
    ovenClose: sharedCloseSound,
    targetHover: new Howl({ src: ['/audio/target_hover.wav'] }),
    doorOpen: new Howl({ src: ['/audio/door_opening.mp3'] }),
    doorClose: new Howl({ src: ['/audio/door_closing.mp3'] }),
    drawerOpen: new Howl({ src: ['/audio/drawer_open.wav'], volume: 1.2 }),
    drawerClose: new Howl({ src: ['/audio/drawer_close.wav'], volume: 1.2 }),
    glass: new Howl({ src: ['/audio/glass.wav'] }),
    laptop: new Howl({ src: ['/audio/laptop_code.wav'], volume: 0.7 }),
    utensils: new Howl({ src: ['/audio/utensils.wav'] }),
    bubbles: new Howl({ src: ['/audio/bubbles.mp3'] }),
    hangingLights: new Howl({ src: ['/audio/hanging_lights.wav'], volume: 0.6 }),
    tapOpen: new Howl({ src: ['/audio/tap_open.wav'], volume: 0.5 }),
    tapClose: new Howl({ src: ['/audio/tap_close.wav'], volume: 0.5 }),
    uiClick: new Howl({ src: ['/audio/ui_hover.mp3'] }),
    highlight: new Howl({ src: ['/audio/tap_light.mp3'], volume: 0.5 }),
    chairSlideOff: new Howl({ src: ['/audio/chair_slide_off.wav'], volume: 0.4 }),
    chairSlideIn: new Howl({ src: ['/audio/chair_slide_in.wav'], volume: 0.4 }),
    pop: new Howl({ src: ['/audio/pop.wav'], volume: 1.2 }),
    acWind: new Howl({ src: ['/audio/ac_wind.wav'], volume: 0.6 }),
    whoosh: new Howl({ src: ['/audio/whoosh.mp3'] }),
  };

  function playSpatialSound(sound, mesh) {
    if (!sound || !mesh) return null;

    const position = new THREE.Vector3();
    mesh.getWorldPosition(position);

    const id = sound.play();
    sound.pos(position.x, position.y, position.z, id);
    sound.pannerAttr({ pannerModel: 'HRTF', refDistance: 1, maxDistance: 10, rolloffFactor: 2 }, id);

    return id;
  }

  function updateListener(camera) {
    if (!camera) return;

    const position = camera.position;
    Howler.pos(position.x, position.y, position.z);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    Howler.orientation(direction.x, direction.y, direction.z, camera.up.x, camera.up.y, camera.up.z);
  }

  function toggleBgm(isPlaying) {
    if (isPlaying) {
      sounds.bgm.pause();
      return false;
    }
    sounds.bgm.play();
    return true;
  }

  return {
    sounds,
    playSpatialSound,
    updateListener,
    toggleBgm,
  };
}
