import * as THREE from 'three';

export function createRaycasterManager() {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const updatePointerFromEvent = (event) => {
    const x = event.touches ? event.touches[0].clientX : event.clientX;
    const y = event.touches ? event.touches[0].clientY : event.clientY;

    pointer.x = (x / window.innerWidth) * 2 - 1;
    pointer.y = -(y / window.innerHeight) * 2 + 1;
  };

  const getIntersections = (camera, raycasterObjects) => {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(raycasterObjects);
  };

  return {
    pointer,
    raycaster,
    updatePointerFromEvent,
    getIntersections,
  };
}
