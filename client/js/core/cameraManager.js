import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';

export class CameraManager {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'orbit';
    this.camTilt = THREE.MathUtils.degToRad(CFG.CAMERA_TILT_DEG);
    this._lookAt = new THREE.Vector3();
  }

  setMode(mode) {
    this.mode = mode;
  }

  orbitAround(target, dt) {
    const t = performance.now() / 1000;
    const dist = 6;
    const cx = target.x + Math.cos(t * 0.4) * dist;
    const cz = target.z + Math.sin(t * 0.4) * dist;
    const cy = target.y + 3;
    const k = 1 - Math.exp(-6 * dt);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    this._lookAt.set(target.x, target.y, target.z);
    this.camera.lookAt(this._lookAt);
  }
}