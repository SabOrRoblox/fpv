import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';

const SCALE = 4.0;

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
    }

    this.group.scale.setScalar(SCALE);
    scene.add(this.group);

    this.buffer = [];
    this.renderPos = new THREE.Vector3();
    this.renderYaw = 0;
    this.hasData = false;
    this.animPhase = 0;

    this.lastX = 0;
    this.lastZ = 0;
    this.moveIntensity = 0;
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
    this.buffer.push({ t, x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0 });
    if (this.buffer.length > 40) this.buffer.shift();
    this.hasData = true;
  }

  update(dt, nowSec) {
    if (!this.hasData || this.buffer.length === 0) return;

    const last = this.buffer[this.buffer.length - 1];
    const dx = last.x - this.lastX;
    const dz = last.z - this.lastZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const targetIntensity = dist > 0.05 ? Math.min(1, dist * 20) : 0;
    this.moveIntensity += (targetIntensity - this.moveIntensity) * (1 - Math.exp(-10 * dt));

    this.lastX = last.x;
    this.lastZ = last.z;

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

    const renderTime = nowSec - CFG.INTERP_DELAY;
    const buf = this.buffer;
    while (buf.length > 2 && buf[0].t < nowSec - 0.5) buf.shift();

    if (buf.length === 1) {
      const s = buf[0];
      this.renderPos.set(s.x, s.y, s.z);
      this.renderYaw = s.yaw;
      this._apply();
      return;
    }

    let a = null, b = null;
    for (let i = buf.length - 1; i > 0; i--) {
      if (buf[i - 1].t <= renderTime && buf[i].t >= renderTime) {
        a = buf[i - 1]; b = buf[i]; break;
      }
    }

    if (!a) {
      const first = buf[0], lastB = buf[buf.length - 1];
      if (renderTime < first.t) {
        this.renderPos.set(first.x, first.y, first.z);
        this.renderYaw = first.yaw;
      } else {
        const prev = buf[Math.max(0, buf.length - 2)];
        const span = Math.max(lastB.t - prev.t, 1e-4);
        const extra = Math.min(nowSec - lastB.t, CFG.EXTRAP_MAX);
        const k = extra / span;
        this.renderPos.set(
          lastB.x + (lastB.x - prev.x) * k,
          lastB.y + (lastB.y - prev.y) * k,
          lastB.z + (lastB.z - prev.z) * k
        );
        this.renderYaw = lastB.yaw;
      }
      this._apply();
      return;
    }

    const span = Math.max(b.t - a.t, 1e-4);
    const alpha = Math.max(0, Math.min(1, (renderTime - a.t) / span));
    this.renderPos.set(
      a.x + (b.x - a.x) * alpha,
      a.y + (b.y - a.y) * alpha,
      a.z + (b.z - a.z) * alpha
    );

    let dYaw = b.yaw - a.yaw;
    if (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    else if (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    this.renderYaw = a.yaw + dYaw * alpha;

    this._apply();
  }

  _apply() {
    this.group.position.copy(this.renderPos);
    this.group.rotation.y = this.renderYaw;
  }

  dispose(scene) { scene.remove(this.group); }
}