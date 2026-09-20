import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import { PropellerAnimator } from '../render/propellerAnimator.js';

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
      const fb = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.4, 1.6),
        new THREE.MeshLambertMaterial({ color: 0xff2222 })
      );
      this.group.add(fb);
    }

    scene.add(this.group);
    this.buffer = [];
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    this.hasData = false;
  }

  pushState(d) {
    const t = performance.now() / 1000;
    this.buffer.push({
      t,
      x: d.x, y: d.y, z: d.z,
      qx: d.qx, qy: d.qy, qz: d.qz, qw: d.qw,
      rpm: d.rpm || 0,
    });
    if (this.buffer.length > 40) this.buffer.shift();
    this.hasData = true;
    this.rpm = d.rpm || 0;
  }

  update(dt, nowSec) {
    if (this.props) this.props.update(dt, this.rpm);

    if (!this.hasData || this.buffer.length === 0) return;

    const renderTime = nowSec - CFG.INTERP_DELAY;
    const buf = this.buffer;
    while (buf.length > 2 && buf[0].t < nowSec - 0.5) buf.shift();

    if (buf.length === 1) {
      const s = buf[0];
      this.renderPos.set(s.x, s.y, s.z);
      this.renderQuat.set(s.qx, s.qy, s.qz, s.qw);
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
      const first = buf[0], last = buf[buf.length - 1];
      if (renderTime < first.t) {
        this.renderPos.set(first.x, first.y, first.z);
        this.renderQuat.set(first.qx, first.qy, first.qz, first.qw);
      } else {
        const prev = buf[Math.max(0, buf.length - 2)];
        const span = Math.max(last.t - prev.t, 1e-4);
        const extra = Math.min(nowSec - last.t, CFG.EXTRAP_MAX);
        const k = extra / span;
        this.renderPos.set(
          last.x + (last.x - prev.x) * k,
          last.y + (last.y - prev.y) * k,
          last.z + (last.z - prev.z) * k
        );
        this.renderQuat.set(last.qx, last.qy, last.qz, last.qw);
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
    const qa = new THREE.Quaternion(a.qx, a.qy, a.qz, a.qw);
    const qb = new THREE.Quaternion(b.qx, b.qy, b.qz, b.qw);
    this.renderQuat.copy(qa).slerp(qb, alpha);
    this._apply();
  }

  _apply() {
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);
  }

  dispose(scene) { scene.remove(this.group); }
}