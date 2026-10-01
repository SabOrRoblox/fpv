import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import { CarWheelAnimator } from '../render/carWheelAnimator.js';
import {
  InterpolationBuffer, catmullVec3, extrapolateVec3,
} from '../net/interpolationBuffer.js';

const POS_STIFFNESS = 30;
const YAW_STIFFNESS = 22;

export class RemoteCar {
  constructor(id, scene, gltf) {
    this.id = id;
    this.scene = scene;
    this.group = new THREE.Group();
    this.wheels = null;
    this.speed = 0;
    this.hp = 200;
    this.colorIdx = 0;

    if (gltf && gltf.scene) {
      const model = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetSize = 7.5;
      const scale = maxDim > 0 ? targetSize / maxDim : 1;
      model.scale.setScalar(scale);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.set(
        -center.x * scale,
        -center.y * scale,
        -center.z * scale
      );
      this.group.add(model);
      this.wheels = new CarWheelAnimator(model);
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.6, 5.5),
        new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
      );
      this.group.add(box);
    }

    scene.add(this.group);

    this.interp = new InterpolationBuffer({
      delay: CFG.INTERP_DELAY,
      extrapMax: CFG.EXTRAP_MAX,
    });

    this.renderPos = new THREE.Vector3();
    this.renderYaw = 0;
    this._targetPos = new THREE.Vector3();
    this._targetYaw = 0;
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._justAppeared = true;
    this.lastX = 0;
    this.lastZ = 0;
  }

  pushState(c) {
    const t = performance.now() / 1000;
    this.interp.push(t, {
      x: c.x, y: c.y, z: c.z,
      yaw: c.yaw || 0,
    });
    this.hp = c.hp !== undefined ? c.hp : 200;
    this.colorIdx = c.colorIdx || 0;
  }

  update(dt, nowSec) {
    if (!this.interp.hasData) return;
    const buf = this.interp.buffer;
    if (buf.length === 0) return;

    this.interp.prune(nowSec);

    const last = buf[buf.length - 1];
    const dx = last.x - this.lastX;
    const dz = last.z - this.lastZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > 0.0001) {
      this.speed = Math.sqrt(distSq) * 60;
    } else {
      this.speed *= Math.exp(-3 * dt);
    }
    this.lastX = last.x;
    this.lastZ = last.z;

    if (this.wheels) this.wheels.update(dt, this.speed);

    const renderTime = nowSec - this.interp.delay;

    if (buf.length === 1) {
      const s = buf[0];
      this._targetPos.set(s.x, s.y, s.z);
      this._targetYaw = s.yaw;
      if (this._justAppeared) {
        this.renderPos.copy(this._targetPos);
        this.renderYaw = this._targetYaw;
        this._justAppeared = false;
      } else {
        const k = 1 - Math.exp(-POS_STIFFNESS * dt);
        this.renderPos.lerp(this._targetPos, k);
        this.renderYaw = this._smoothAngle(this.renderYaw, this._targetYaw, dt, YAW_STIFFNESS);
      }
      this._apply();
      return;
    }

    const pair = this.interp.findPair(renderTime);

    if (!pair) {
      const first = buf[0];
      const lastB = buf[buf.length - 1];

      if (renderTime < first.t) {
        this._targetPos.set(first.x, first.y, first.z);
        this._targetYaw = first.yaw;
      } else {
        const prev = buf[Math.max(0, buf.length - 2)];
        const span = Math.max(lastB.t - prev.t, 1e-4);
        const extraT = Math.min(nowSec - lastB.t, this.interp.extrapMax);
        this._v0.set(prev.x, prev.y, prev.z);
        this._v1.set(lastB.x, lastB.y, lastB.z);
        extrapolateVec3(this._targetPos, this._v0, this._v1, span, extraT, this.interp.extrapMax);
        this._targetYaw = lastB.yaw;
      }

      if (this._justAppeared) {
        this.renderPos.copy(this._targetPos);
        this.renderYaw = this._targetYaw;
        this._justAppeared = false;
      } else {
        const k = 1 - Math.exp(-POS_STIFFNESS * dt);
        this.renderPos.lerp(this._targetPos, k);
        this.renderYaw = this._smoothAngle(this.renderYaw, this._targetYaw, dt, YAW_STIFFNESS);
      }
      this._apply();
      return;
    }

    const { a, b, index } = pair;
    const span = Math.max(b.t - a.t, 1e-4);
    const alpha = Math.max(0, Math.min(1, (renderTime - a.t) / span));

    const a2 = buf[index - 1] || a;
    const b2 = buf[index + 2] || b;

    this._v0.set(a2.x, a2.y, a2.z);
    this._v1.set(a.x, a.y, a.z);
    this._v2.set(b.x, b.y, b.z);
    this._v3.set(b2.x, b2.y, b2.z);

    catmullVec3(this._targetPos, this._v0, this._v1, this._v2, this._v3, alpha);

    let dYaw = b.yaw - a.yaw;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    this._targetYaw = a.yaw + dYaw * alpha;

    if (this._justAppeared) {
      this.renderPos.copy(this._targetPos);
      this.renderYaw = this._targetYaw;
      this._justAppeared = false;
    } else {
      const k = 1 - Math.exp(-POS_STIFFNESS * dt);
      this.renderPos.lerp(this._targetPos, k);
      this.renderYaw = this._smoothAngle(this.renderYaw, this._targetYaw, dt, YAW_STIFFNESS);
    }

    this._apply();
  }

  _smoothAngle(current, target, dt, stiffness) {
    let diff = target - current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const k = 1 - Math.exp(-stiffness * dt);
    return current + diff * k;
  }

  _apply() {
    this.group.position.copy(this.renderPos);
    this.group.rotation.y = this.renderYaw;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
