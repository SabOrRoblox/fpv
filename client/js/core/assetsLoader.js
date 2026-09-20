import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AssetsLoader {
  constructor(basePath = './assets/models/') {
    this.basePath = basePath;
    this.loader = new GLTFLoader();
    this.cache = new Map();
  }

  async load(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const url = this.basePath + name;
    const gltf = await this.loader.loadAsync(url);
    this.cache.set(name, gltf);
    return gltf;
  }

  async loadAll(list, onProgress) {
    const results = {};
    let done = 0;
    for (const name of list) {
      try {
        results[name] = await this.load(name);
        done++;
        if (onProgress) onProgress(done / list.length, name);
      } catch (e) {
        console.error(`[assets] fail ${name}: ${e.message}`);
        results[name] = null;
        done++;
        if (onProgress) onProgress(done / list.length, name);
      }
    }
    return results;
  }
}

export function measureBox(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { size, center, box };
}