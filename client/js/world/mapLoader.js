import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { measureBox } from '../core/assetsLoader.js';
import { CFG } from '../../../shared/config/config.js';

export function placeMap(scene, gltf) {
  if (!gltf) return null;
  const root = gltf.scene;
  root.scale.setScalar(CFG.MAP_MODEL_SCALE);
  root.position.y += CFG.MAP_MODEL_Y_OFFSET;
  scene.add(root);
  const m = measureBox(root);
  console.log('[map] size', m.size.x.toFixed(2), m.size.y.toFixed(2), m.size.z.toFixed(2));
  console.log('[map] center', m.center.x.toFixed(2), m.center.y.toFixed(2), m.center.z.toFixed(2));
  return root;
}

export function mergeByMaterial(root) {
  if (!root) return;
  root.updateMatrixWorld(true);

  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (Array.isArray(o.material)) return;
    if (!o.material) return;
    const key = o.material.uuid;
    if (!groups.has(key)) groups.set(key, { material: o.material, meshes: [] });
    groups.get(key).meshes.push(o);
  });

  for (const { material, meshes } of groups.values()) {
    if (meshes.length < 3) continue;

    const geos = [];
    let failed = false;
    for (const m of meshes) {
      try {
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        geos.push(g);
      } catch (e) {
        failed = true;
        break;
      }
    }
    if (failed) continue;

    try {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      meshes.forEach(m => m.parent && m.parent.remove(m));
      root.add(mesh);
    } catch (e) {
      console.warn('[merge] fail:', e.message);
    }
  }
}