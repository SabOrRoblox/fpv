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

  root.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = true;
      if (o.geometry) o.geometry.computeBoundingSphere();
    }
  });

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
    if (o.userData.isZone) return;
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

export function collectSpawnZones(mapRoot) {
  const zones = [];
  if (!mapRoot) return zones;

  mapRoot.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  mapRoot.traverse((obj) => {
    if (!obj.name) return;
    const name = obj.name.toLowerCase();

    let team = null;
    if (name === 'spawn_red') team = 'red';
    else if (name === 'spawn_blue') team = 'blue';
    if (!team) return;

    box.setFromObject(obj);
    box.getSize(size);
    box.getCenter(center);

    zones.push({
      team,
      x: center.x,
      y: box.min.y,
      z: center.z,
      w: size.x,
      h: size.y,
      d: size.z,
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
    });

    obj.userData.isZone = true;
    obj.visible = false;

    console.log(`[zone] ${team} @ (${center.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${center.z.toFixed(2)}) size (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
  });

  return zones;
}

export function buildZoneMeshes(scene, zones) {
  const group = new THREE.Group();
  group.name = '__zones';

  for (const zone of zones) {
    const geo = new THREE.BoxGeometry(zone.w, zone.h, zone.d);
    const color = zone.team === 'red' ? 0xff3b3b : 0x3b82f6;

    const fillMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(geo, fillMat);
    fill.position.set(zone.x, zone.y + zone.h * 0.5, zone.z);
    fill.userData.isZone = true;
    group.add(fill);

    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
    });
    const line = new THREE.LineSegments(edges, lineMat);
    line.position.copy(fill.position);
    line.userData.isZone = true;
    group.add(line);
  }

  scene.add(group);
  return group;
}