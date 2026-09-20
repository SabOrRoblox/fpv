import * as THREE from 'three';

const MAX_BUFFER = 60;
const BUFFER_TIMEOUT = 1.2;

export class InterpolationBuffer {
  constructor(opts = {}) {
    this.delay = opts.delay ?? 0.15;
    this.extrapMax = opts.extrapMax ?? 0.20;
    this.buffer = [];
    this.hasData = false;
    this._lastWasExtrap = false;
    this._extrapFade = 1.0;
  }

  push(t, data) {
    this.buffer.push({ t, ...data });
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    this.hasData = true;
  }

  prune(nowSec) {
    while (this.buffer.length > 2 && this.buffer[0].t < nowSec - BUFFER_TIMEOUT) {
      this.buffer.shift();
    }
  }

  findPair(renderTime) {
    const buf = this.buffer;
    for (let i = buf.length - 1; i > 0; i--) {
      if (buf[i - 1].t <= renderTime && buf[i].t >= renderTime) {
        return { a: buf[i - 1], b: buf[i], index: i - 1 };
      }
    }
    return null;
  }

  get renderTime() {
    return performance.now() / 1000 - this.delay;
  }
}

export function catmull3(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export function catmullVec3(out, p0, p1, p2, p3, t) {
  out.x = catmull3(p0.x, p1.x, p2.x, p3.x, t);
  out.y = catmull3(p0.y, p1.y, p2.y, p3.y, t);
  out.z = catmull3(p0.z, p1.z, p2.z, p3.z, t);
  return out;
}

export function extrapolateVec3(out, prev, last, span, extraT, extrapMax) {
  const fade = 1 - extraT / extrapMax;
  const fadeSq = fade * fade;
  const k = fadeSq * (extraT / span);
  out.x = last.x + (last.x - prev.x) * k;
  out.y = last.y + (last.y - prev.y) * k;
  out.z = last.z + (last.z - prev.z) * k;
  return out;
}

export function smoothLerpVec3(out, target, dt, stiffness) {
  const k = 1 - Math.exp(-stiffness * dt);
  out.x += (target.x - out.x) * k;
  out.y += (target.y - out.y) * k;
  out.z += (target.z - out.z) * k;
  return out;
}

export function smoothSlerpQuat(out, target, dt, stiffness) {
  const k = 1 - Math.exp(-stiffness * dt);
  out.slerp(target, k);
  return out;
}