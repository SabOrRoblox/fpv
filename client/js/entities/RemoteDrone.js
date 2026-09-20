import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import { PropellerAnimator } from '../render/propellerAnimator.js';
import {
  InterpolationBuffer, catmullVec3, extrapolateVec3,
  smoothLerpVec3, smoothSlerpQuat,
} from '../net/interpolationBuffer.js';

const POS_STIFFNESS = 32;
const ROT_STIFFNESS = 40;
const CATCHUP_STIFFNESS = 24;

export class RemoteDrone {
  constructor(id, scene, gltf) {
    this.id = id;
    this.scene = scene;
    this.group = new THREE.Group();
    this.props = null;
    this.rpm = 0;

    if (gltf && gltf.scene) {
      const model = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? (10.0 / maxDim) : 1;
      model.scale.setScalar(scale);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      this.group.add(model);
      this.props = new PropellerAnimator(model);
    } else {
      this.group.add(new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.4, 1.6),
        new THREE.MeshLambertMaterial({ color: 0xff2222 })
      ));
    }

    scene.add(this.group);

    this.interp = new InterpolationBuffer({
      delay: CFG.INTERP_DELAY,
      extrapMax: CFG.EXTRAP_MAX,
    });

    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    this._targetPos = new THREE.Vector3();
    this._targetQuat = new THREE.Quaternion();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._justAppeared = true;
  }

  pushState(d) {
    const t = performance.now() / 1000;
    this.interp.push(t, {
      x: d.x, y: d.y, z: d.z,
      qx: d.qx, qy: d.qy, qz: d.qz, qw: d.qw,
      rpm: d.rpm || 0,
    });
    this.rpm = d.rpm || 0;
  }

  update(dt, nowSec) {
    if (this.props) this.props.update(dt, this.rpm);

    if (!this.interp.hasData) return;
    const buf = this.interp.buffer;
    if (buf.length === 0) return;

    this.interp.prune(nowSec);

    const renderTime = nowSec - this.interp.delay;

    if (buf.length === 1) {
      const s = buf[0];
      this._targetPos.set(s.x, s.y, s.z);
      this._targetQuat.set(s.qx, s.qy, s.qz, s.qw);
      if (this._justAppeared) {
        this.renderPos.copy(this._targetPos);
        this.renderQuat.copy(this._targetQuat);
        this._justAppeared = false;
      } else {
        smoothLerpVec3(this.renderPos, this._targetPos, dt, POS_STIFFNESS);
        smoothSlerpQuat(this.renderQuat, this._targetQuat, dt, ROT_STIFFNESS);
      }
      this._apply();
      return;
    }

    const pair = this.interp.findPair(renderTime);

    if (!pair) {
      const first = buf[0];
      const last = buf[buf.length - 1];

      if (renderTime < first.t) {
        this._targetPos.set(first.x, first.y, first.z);
        this._targetQuat.set(first.qx, first.qy, first.qz, first.qw);
      } else {
        const prev = buf[Math.max(0, buf.length - 2)];
        const span = Math.max(last.t - prev.t, 1e-4);
        const extraT = Math.min(nowSec - last.t, this.interp.extrapMax);

        this._v0.set(prev.x, prev.y, prev.z);
        this._v1.set(last.x, last.y, last.z);
        extrapolateVec3(this._targetPos, this._v0, this._v1, span, extraT, this.interp.extrapMax);
        this._targetQuat.set(last.qx, last.qy, last.qz, last.qw);
        this._lastWasExtrap = true;
      }

      if (this._justAppeared) {
        this.renderPos.copy(this._targetPos);
        this.renderQuat.copy(this._targetQuat);
        this._justAppeared = false;
      } else {
        const stiffness = this._lastWasExtrap ? CATCHUP_STIFFNESS : POS_STIFFNESS;
        smoothLerpVec3(this.renderPos, this._targetPos, dt, stiffness);
        smoothSlerpQuat(this.renderQuat, this._targetQuat, dt, ROT_STIFFNESS);
      }

      this._apply();
      return;
    }

    this._lastWasExtrap = false;

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

    this._qa.set(a.qx, a.qy, a.qz, a.qw);
    this._qb.set(b.qx, b.qy, b.qz, b.qw);
    this._qa.slerp(this._qb, alpha);
    this._targetQuat.copy(this._qa);

    if (this._justAppeared) {
      this.renderPos.copy(this._targetPos);
      this.renderQuat.copy(this._targetQuat);
      this._justAppeared = false;
    } else {
      smoothLerpVec3(this.renderPos, this._targetPos, dt, POS_STIFFNESS);
      smoothSlerpQuat(this.renderQuat, this._targetQuat, dt, ROT_STIFFNESS);
    }

    this._apply();
  }

  _apply() {
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);
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