import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import {
  InterpolationBuffer, catmullVec3, extrapolateVec3,
} from '../net/interpolationBuffer.js';

export class RemotePlayer {
  constructor(id, scene, gltf) {
    this.id = id;
    this.scene = scene;
    this.group = new THREE.Group();

    this.body = null;
    this.head = null;
    this.legL = null;
    this.legR = null;
    this.armL = null;
    this.armR = null;

    this.legLPivot = null;
    this.legRPivot = null;
    this.armLPivot = null;
    this.armRPivot = null;

    if (gltf && gltf.scene) {
      this._loadModel(gltf);
    } else {
      this._loadFallback();
    }

    this.group.scale.setScalar(4.0);
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

    this.animPhase = 0;
    this.moveIntensity = 0;
    this.lastX = 0;
    this.lastZ = 0;

    this._justAppeared = true;
    this._lastWasExtrap = false;
  }

  _loadModel(gltf) {
    const model = gltf.scene.clone(true);
    this.group.add(model);

    let legLRaw = null, legRRaw = null;
    let armLRaw = null, armRRaw = null;

    model.traverse((obj) => {
      const n = obj.name ? obj.name.toLowerCase() : '';
      if (n === 'leg1') legLRaw = obj;
      else if (n === 'leg2') legRRaw = obj;
      else if (n === 'arm1') armLRaw = obj;
      else if (n === 'arm2') armRRaw = obj;
      else if (n === 'body') this.body = obj;
      else if (n === 'head') this.head = obj;
    });

    this.legL = legLRaw;
    this.legR = legRRaw;
    this.armL = armLRaw;
    this.armR = armRRaw;

    if (legLRaw) this.legLPivot = this._makeTopPivot(legLRaw);
    if (legRRaw) this.legRPivot = this._makeTopPivot(legRRaw);
    if (armLRaw) this.armLPivot = this._makeTopPivot(armLRaw);
    if (armRRaw) this.armRPivot = this._makeTopPivot(armRRaw);
  }

  _loadFallback() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xff8833 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffcc99 });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x222244 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMat);
    torso.position.y = 1.05;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), skinMat);
    head.position.y = 1.6;
    this.group.add(head);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), legMat);
    legL.position.set(-0.13, 0.35, 0);
    this.group.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), legMat);
    legR.position.set(0.13, 0.35, 0);
    this.group.add(legR);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), bodyMat);
    armL.position.set(-0.32, 1.05, 0);
    this.group.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), bodyMat);
    armR.position.set(0.32, 1.05, 0);
    this.group.add(armR);

    this.legL = legL;
    this.legR = legR;
    this.armL = armL;
    this.armR = armR;
    this.body = torso;
    this.head = head;
    this.legLPivot = legL;
    this.legRPivot = legR;
    this.armLPivot = armL;
    this.armRPivot = armR;
  }

  _makeTopPivot(obj) {
    const parent = obj.parent;
    if (!parent) return null;

    parent.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const pivotWorld = new THREE.Vector3(center.x, box.max.y, center.z);
    const parentWorldInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const pivotLocal = pivotWorld.clone().applyMatrix4(parentWorldInv);

    const pivot = new THREE.Group();
    pivot.name = (obj.name || 'limb') + '_pivot';
    pivot.position.copy(pivotLocal);
    parent.add(pivot);

    const objWorldPos = new THREE.Vector3();
    obj.getWorldPosition(objWorldPos);

    parent.remove(obj);
    pivot.add(obj);

    const objWorldPos2 = new THREE.Vector3();
    obj.getWorldPosition(objWorldPos2);

    obj.position.x += objWorldPos.x - objWorldPos2.x;
    obj.position.y += objWorldPos.y - objWorldPos2.y;
    obj.position.z += objWorldPos.z - objWorldPos2.z;

    return pivot;
  }

  pushState(p) {
    const t = performance.now() / 1000;
    this.interp.push(t, {
      x: p.x, y: p.y, z: p.z,
      yaw: p.yaw || 0,
    });
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
    const targetIntensity = distSq > 0.0025 ? Math.min(1, Math.sqrt(distSq) * 20) : 0;
    this.moveIntensity += (targetIntensity - this.moveIntensity) * (1 - Math.exp(-10 * dt));
    this.lastX = last.x;
    this.lastZ = last.z;

    this._animate(dt);

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
        const k = 1 - Math.exp(-30 * dt);
        this.renderPos.lerp(this._targetPos, k);
        this.renderYaw = this._smoothAngle(this.renderYaw, this._targetYaw, dt, 26);
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
        const k = 1 - Math.exp(-20 * dt);
        if (this._justAppeared) {
          this.renderPos.copy(this._targetPos);
          this.renderYaw = this._targetYaw;
          this._justAppeared = false;
        } else {
          this.renderPos.lerp(this._targetPos, k);
          this.renderYaw = this._smoothAngle(this.renderYaw, this._targetYaw, dt, 26);
        }
      } else {
        const prev = buf[Math.max(0, buf.length - 2)];
        const span = Math.max(lastB.t - prev.t, 1e-4);
        const extraT = Math.min(nowSec - lastB.t, this.interp.extrapMax);

        this._v0.set(prev.x, prev.y, prev.z);
        this._v1.set(lastB.x, lastB.y, lastB.z);
        extrapolateVec3(this._targetPos, this._v0, this._v1, span, extraT, this.interp.extrapMax);
        this._targetYaw = lastB.yaw;

        if (this._justAppeared) {
          this.renderPos.copy(this._targetPos);
          this.renderYaw = this._targetYaw;
          this._justAppeared = false;
        } else {
          const k = 1 - Math.exp(-25 * dt);
          this.renderPos.lerp(this._targetPos, k);
          this.renderYaw = this._smoothAngle(this.renderYaw, this._targetYaw, dt, 26);
        }
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

    catmullVec3(this.renderPos, this._v0, this._v1, this._v2, this._v3, alpha);

    let dYaw = b.yaw - a.yaw;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    this.renderYaw = a.yaw + dYaw * alpha;

    this._justAppeared = false;
    this._apply();
  }

  _smoothAngle(current, target, dt, stiffness) {
    let diff = target - current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const k = 1 - Math.exp(-stiffness * dt);
    return current + diff * k;
  }

  _animate(dt) {
    if (this.moveIntensity > 0.05) {
      this.animPhase += dt * CFG.PLAYER_ANIM_FREQ * this.moveIntensity;
    } else {
      this.animPhase *= Math.exp(-6 * dt);
    }

    const swing = Math.sin(this.animPhase) * 0.7 * this.moveIntensity;

    if (this.legLPivot) this.legLPivot.rotation.x = swing;
    if (this.legRPivot) this.legRPivot.rotation.x = -swing;
    if (this.armLPivot) this.armLPivot.rotation.x = -swing;
    if (this.armRPivot) this.armRPivot.rotation.x = swing;

    const bob = Math.abs(Math.sin(this.animPhase)) * 0.04 * this.moveIntensity;
    if (this.body) this.body.position.y = 1.05 + bob;
    if (this.head) this.head.position.y = 1.6 + bob;
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