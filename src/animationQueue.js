import * as THREE from 'three';

export function createAnimationQueue(gsap) {
  function runQueueAnimation(targetMesh, wantsOpen, axis, targetValue, animType = 'rotation', duration = 0.5) {
    if (!targetMesh || !gsap) return;

    targetMesh.userData.wantsOpen = wantsOpen;

    if (!targetMesh.userData.runAnimation) {
      targetMesh.userData.runAnimation = () => {
        if (targetMesh.userData.isAnimating) return;

        const isOpen = !!targetMesh.userData.isOpen;
        const willOpen = !!targetMesh.userData.wantsOpen;
        if (isOpen === willOpen) return;

        targetMesh.userData.isAnimating = true;

        const complete = () => {
          targetMesh.userData.isAnimating = false;
          targetMesh.userData.isOpen = willOpen;
          targetMesh.userData.runAnimation();
        };

        if (animType === 'customRotation') {
          const customAxis = new THREE.Vector3(1, 0, 0).normalize();
          gsap.to(targetMesh.userData, {
            customAngle: willOpen ? -Math.PI / 2 : 0,
            duration,
            ease: 'power2.out',
            overwrite: true,
            onUpdate: () => {
              const quaternion = new THREE.Quaternion().setFromAxisAngle(customAxis, targetMesh.userData.customAngle);
              targetMesh.quaternion.copy(targetMesh.userData.initialQuaternion);
              targetMesh.quaternion.multiply(quaternion);
            },
            onComplete: complete,
          });
          return;
        }

        if (animType === 'color' && targetMesh.material) {
          gsap.to(targetMesh.material.color, {
            r: willOpen ? targetValue : 1.0,
            g: willOpen ? targetValue : 1.0,
            b: willOpen ? targetValue : 1.0,
            duration,
            ease: 'power2.out',
            overwrite: true,
            onComplete: complete,
          });
          return;
        }

        if (animType === 'translation') {
          const initialPos = targetMesh.userData.initialPos || targetMesh.position.clone();
          gsap.to(targetMesh.position, {
            [axis]: willOpen ? initialPos[axis] + targetValue : initialPos[axis],
            duration,
            ease: 'power1.inOut',
            onComplete: complete,
          });
          return;
        }

        if (animType === 'scale') {
          const initialScale = targetMesh.userData.initialScale || targetMesh.scale.clone();
          gsap.to(targetMesh.scale, {
            x: willOpen ? initialScale.x * targetValue : initialScale.x,
            y: willOpen ? initialScale.y * targetValue : initialScale.y,
            z: willOpen ? initialScale.z * targetValue : initialScale.z,
            duration,
            ease: 'power1.out',
            onComplete: complete,
          });
          return;
        }

        const initialRot = targetMesh.userData.initialRot || targetMesh.rotation.clone();
        gsap.to(targetMesh.rotation, {
          [axis]: willOpen ? initialRot[axis] + targetValue : initialRot[axis],
          duration,
          ease: 'power2.out',
          overwrite: true,
          onComplete: complete,
        });
      };
    }

    targetMesh.userData.runAnimation();
  }

  return { runQueueAnimation };
}
