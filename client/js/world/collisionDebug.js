import * as THREE from 'three';

export function showCollisionDebug(scene, collisionRoot) {
  if (!collisionRoot) return null;

  const debugMat = new THREE.MeshBasicMaterial({
    color: 0xff2222,
    wireframe: true,
    transparent: true,
    opacity: 0.4,
    depthTest: false,
    depthWrite: false,
  });

  const group = new THREE.Group();
  group.name = '__collision_debug';
  group.renderOrder = 999;

  collisionRoot.updateMatrixWorld(true);

  collisionRoot.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;

    const geom = obj.geometry.clone();
    const mesh = new THREE.Mesh(geom, debugMat);

    obj.updateWorldMatrix(true, false);
    mesh.applyMatrix4(obj.matrixWorld);
    group.add(mesh);
  });

  scene.add(group);
  return group;
}

export function hideCollisionDebug(scene) {
  const group = scene.getObjectByName('__collision_debug');
  if (!group) return;
  scene.remove(group);
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}