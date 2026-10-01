import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { CFG } from '../../../shared/config/config.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export function buildCollision(gltf) {
  if (!gltf || !gltf.scene) return null;

  const root = gltf.scene;
  root.scale.setScalar(CFG.COLLISION_MODEL_SCALE);
  root.position.y += CFG.COLLISION_MODEL_Y_OFFSET;
  root.visible = false;
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!obj.geometry) return;
    if (!obj.geometry.attributes || !obj.geometry.attributes.position) return;
    try {
      obj.geometry.computeBoundsTree();
    } catch (e) {}
  });

  return root;
}