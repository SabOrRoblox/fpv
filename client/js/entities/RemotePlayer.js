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

    if (gltf && gltf.scene) {
      const model = gltf.scene.clone(true);
      this.group.add(model);
      model.traverse((obj) => {
        const n = obj.name ? obj.name.toLowerCase() : '';
        if (n === 'leg1') this.legL = obj;
        else if (n === 'leg2') this.legR = obj;
        else if (n === 'arm1') this.armL = obj;
        else if (n === 'arm2') this.armR = obj;
        else if (n === 'body') this.body = obj;
        else if (n === 'head') this.head = obj;
      });
    }

    this.group.scale.setScalar(SCALE);
    scene.add(this.group);

    this.buffer = [];
    this.renderPos = new THREE.Vector3();
    this.renderYaw = 0;
    this.hasData = false;
    this.animPhase = 0;
  }

  pushState(p) {
    const t = performance.now() / 1000;
    this.buffer.push({ t, x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0 });
    if (this.buffer.length > 40) this.buffer.shift();
    this.hasData = true;
  }

  update(dt, nowSec) {
    if (!this.hasData || this.buffer.length === 0) return;

    this.animPhase += dt * CFG.PLAYER_ANIM_FREQ * 0.7;
    const swing = Math.sin(this.animPhase) * 0.7;
    if (this.legL) this.legL.rotation.x = swing;
    if (this.legR) this.legR.rotation.x = -swing;
    if (this.armL) this.armL.rotation.x = -swing;
    if (this.armR) this.armR.rotation.x = swing;

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
      const first = buf[0], last = buf[buf.length - 1];
      if (renderTime < first.t) {
        this.renderPos.set(first.x, first.y, first.z);
        this.renderYaw = first.yaw;
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
        this.renderYaw = last.yaw;
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