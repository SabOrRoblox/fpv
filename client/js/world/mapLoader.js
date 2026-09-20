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