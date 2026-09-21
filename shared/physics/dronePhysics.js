import { v3, v3set } from '../math/vec3.js';
import { q4, q4normalize } from '../math/quat.js';
import { clamp, degToRad } from '../math/util.js';
import { computeThrust, computeDragLocal } from './aerodynamics.js';

export class DronePhysics {
  constructor(cfg) {
    this.cfg = cfg;
    this.params = { ...cfg.DEFAULT_DRONE_PARAMS };

    this.position = v3(0, 0, 0);
    this.velocity = v3(0, 0, 0);
    this.quaternion = q4(0, 0, 0, 1);
    this.armed = false;
    this.crashed = false;
    this.piloted = false;
    this.groundY = 0;

    this.prevPosition = v3(0, 0, 0);
    this.currPosition = v3(0, 0, 0);
    this.prevQuat = q4(0, 0, 0, 1);
    this.currQuat = q4(0, 0, 0, 1);

    this.rpm = 0;
    this.yaw = 0;
    this._pitchAngle = 0;
    this._rollAngle = 0;
    this._smoothedThrottle = 0;
    this._smoothedYaw = 0;
    this._smoothedPitch = 0;
    this._yawRate = 0;
    this._noiseSeed = Math.random() * 1000;
    this._rpmNoise = 0;
  }

  setParams(params) {
    this.params = { ...this.cfg.DEFAULT_DRONE_PARAMS, ...(params || {}) };
  }

  reset(pos, yaw = 0) {
    v3set(this.position, pos.x, pos.y, pos.z);
    v3set(this.velocity, 0, 0, 0);
    this.quaternion.x = 0;
    this.quaternion.y = 0;
    this.quaternion.z = 0;
    this.quaternion.w = 1;
    this.rpm = 0;
    this.armed = false;
    this.crashed = false;
    this.piloted = false;
    this.yaw = yaw;
    this._pitchAngle = 0;
    this._rollAngle = 0;
    this._smoothedThrottle = 0;
    this._smoothedYaw = 0;
    this._smoothedPitch = 0;
    this._yawRate = 0;
    this._rpmNoise = 0;
    this._setQuat();

    v3set(this.prevPosition, pos.x, pos.y, pos.z);
    v3set(this.currPosition, pos.x, pos.y, pos.z);
    this.prevQuat.x = this.quaternion.x;
    this.prevQuat.y = this.quaternion.y;
    this.prevQuat.z = this.quaternion.z;
    this.prevQuat.w = this.quaternion.w;
    this.currQuat.x = this.quaternion.x;
    this.currQuat.y = this.quaternion.y;
    this.currQuat.z = this.quaternion.z;
    this.currQuat.w = this.quaternion.w;
  }

  step(dt, input) {
    v3set(this.prevPosition, this.position.x, this.position.y, this.position.z);
    this.prevQuat.x = this.quaternion.x;
    this.prevQuat.y = this.quaternion.y;
    this.prevQuat.z = this.quaternion.z;
    this.prevQuat.w = this.quaternion.w;

    const active = this.armed && !this.crashed && this.piloted;
    const p = this.params;

    const thrIn = active ? (input.throttle || 0) : 0;
    const yawIn = active ? (input.yaw || 0) : 0;
    const pitchIn = active ? (input.pitch || 0) : 0;

    const k = 1 - Math.exp(-(p.INPUT_SMOOTH || 16) * dt);
    this._smoothedThrottle += (thrIn - this._smoothedThrottle) * k;
    this._smoothedYaw += (yawIn - this._smoothedYaw) * k;
    this._smoothedPitch += (pitchIn - this._smoothedPitch) * k;

    const thr = this._curve(this._smoothedThrottle, p);
    const yaw = this._curve(this._smoothedYaw, p);
    const pitch = this._curve(this._smoothedPitch, p);

    this._orientation(dt, yaw, pitch, active);
    this._motor(dt, thr, active);
    this._linear(dt);

    v3set(this.currPosition, this.position.x, this.position.y, this.position.z);
    this.currQuat.x = this.quaternion.x;
    this.currQuat.y = this.quaternion.y;
    this.currQuat.z = this.quaternion.z;
    this.currQuat.w = this.quaternion.w;
  }

  getInterpolatedPosition(alpha, out) {
    out.x = this.prevPosition.x + (this.currPosition.x - this.prevPosition.x) * alpha;
    out.y = this.prevPosition.y + (this.currPosition.y - this.prevPosition.y) * alpha;
    out.z = this.prevPosition.z + (this.currPosition.z - this.prevPosition.z) * alpha;
    return out;
  }

  getInterpolatedQuat(alpha, out) {
    let ax = this.prevQuat.x, ay = this.prevQuat.y, az = this.prevQuat.z, aw = this.prevQuat.w;
    let bx = this.currQuat.x, by = this.currQuat.y, bz = this.currQuat.z, bw = this.currQuat.w;
    let dot = ax * bx + ay * by + az * bz + aw * bw;
    if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
    if (dot > 0.9995) {
      out.x = ax + (bx - ax) * alpha;
      out.y = ay + (by - ay) * alpha;
      out.z = az + (bz - az) * alpha;
      out.w = aw + (bw - aw) * alpha;
    } else {
      const t0 = Math.acos(Math.min(1, dot));
      const sT0 = Math.sin(t0);
      if (sT0 < 1e-6) {
        out.x = ax; out.y = ay; out.z = az; out.w = aw;
      } else {
        const sT = Math.sin(t0 * alpha);
        const s0 = Math.cos(t0 * alpha) - dot * sT / sT0;
        const s1 = sT / sT0;
        out.x = ax * s0 + bx * s1;
        out.y = ay * s0 + by * s1;
        out.z = az * s0 + bz * s1;
        out.w = aw * s0 + bw * s1;
      }
    }
    const l = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z + out.w * out.w) || 1;
    out.x /= l; out.y /= l; out.z /= l; out.w /= l;
    return out;
  }

  _curve(v, p) {
    if (!isFinite(v)) return 0;
    const dz = p.STICK_DEADZONE ?? 0.08;
    const av = Math.abs(v);
    if (av < dz) return 0;
    const sign = v < 0 ? -1 : 1;
    const n = (av - dz) / (1 - dz);
    const e = p.STICK_EXPO ?? 0.3;
    return sign * (n * (1 - e) + n * n * n * e);
  }

  _orientation(dt, yaw, pitch, active) {
    const p = this.params;

    const targetPitch = active ? pitch * degToRad(p.MAX_TILT_DEG || 60) : 0;
    const targetRoll = active ? -yaw * degToRad(p.MAX_ROLL_DEG || 45) : 0;

    const k = 1 - Math.exp(-(p.PITCH_GAIN || 10) * dt);
    this._pitchAngle += (targetPitch - this._pitchAngle) * k;
    this._rollAngle += (targetRoll - this._rollAngle) * k;

    if (active) {
      const targetYawRate = degToRad(p.YAW_RATE_DEG || 220) * yaw;
      const inertiaK = 1 - Math.exp(-(1 / Math.max(p.YAW_INERTIA || 0.12, 0.01)) * dt);
      this._yawRate += (targetYawRate - this._yawRate) * inertiaK;
      this.yaw += this._yawRate * dt;
    } else {
      this._yawRate *= Math.exp(-6 * dt);
    }

    const turb = p.TURBULENCE || 0;
    if (active && turb > 0) {
      const t = performance.now() * 0.001 + this._noiseSeed;
      this._pitchAngle += Math.sin(t * 6.1) * turb * 0.5;
      this._rollAngle += Math.sin(t * 5.3) * turb * 0.7;
    }

    if (!isFinite(this.yaw)) this.yaw = 0;
    if (!isFinite(this._pitchAngle)) this._pitchAngle = 0;
    if (!isFinite(this._rollAngle)) this._rollAngle = 0;

    this._setQuat();
  }

  _motor(dt, thr, active) {
    const p = this.params;
    const maxRpm = p.MAX_RPM || 26000;

    let target = active ? thr * maxRpm : 0;

    if (active) {
      const t = performance.now() * 0.001 + this._noiseSeed;

      const noise = (
        Math.sin(t * 17.3) * 0.035 +
        Math.sin(t * 23.7) * 0.025 +
        Math.sin(t * 41.1) * 0.015 +
        Math.sin(t * 67.3) * 0.010
      ) * maxRpm;

      this._rpmNoise += (noise - this._rpmNoise) * 0.35;
      target += this._rpmNoise;

      const vy = this.velocity.y;
      const loadFactor = 1 - Math.min(Math.max(-vy * 0.005, -0.1), 0.15);
      target *= loadFactor;

      const yawAbs = Math.abs(this._smoothedYaw);
      const yawLoad = 1 - Math.min(yawAbs * 0.08, 0.1);
      target *= yawLoad;

      const tiltAbs = Math.abs(this._pitchAngle);
      target *= 1 + tiltAbs * 0.15;

      const airHeight = this.position.y - (this.groundY + this.cfg.DRONE_RADIUS);
      if (airHeight < 2.0 && airHeight > 0) {
        target /= 1 + (1 - airHeight / 2.0) * 0.12;
      }
    }

    const tau = active ? (p.MOTOR_TAU || 0.08) : (p.MOTOR_TAU || 0.08) + (p.MOTOR_DECAY || 0.25);
    const k = Math.min(dt / Math.max(tau, 1e-4), 1);

    this.rpm = clamp(this.rpm + (target - this.rpm) * k, 0, maxRpm);
    if (!isFinite(this.rpm)) this.rpm = 0;
  }

  _setQuat() {
    const pitch = this._pitchAngle;
    const yaw = this.yaw;
    const roll = this._rollAngle;

    const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
    const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
    const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);

    this.quaternion.x = sp * cy * cr + cp * sy * sr;
    this.quaternion.y = sy * cp * cr - cy * sp * sr;
    this.quaternion.z = cy * cp * sr - sy * sp * cr;
    this.quaternion.w = cy * cp * cr + sy * sp * sr;

    q4normalize(this.quaternion, this.quaternion);
  }

  _linear(dt) {
    const p = this.params;
    const thrust = computeThrust(this.rpm, p.K_THRUST || 2.0e-8);
    const up = this._rotateVec({ x: 0, y: 1, z: 0 });

    const velLocal = this._rotateInv(this.velocity);
    const dragLocal = computeDragLocal(velLocal, p.DRAG || { x: 0.008, y: 0.10, z: 0.008 });
    const dragWorld = this._rotateVec(dragLocal);

    const mass = p.DRONE_MASS || 0.7;
    const invMass = 1 / mass;

    const ax = (up.x * thrust + dragWorld.x) * invMass;
    const ay = (up.y * thrust + dragWorld.y) * invMass - this.cfg.GRAVITY;
    const az = (up.z * thrust + dragWorld.z) * invMass;

    this.velocity.x += ax * dt;
    this.velocity.y += ay * dt;
    this.velocity.z += az * dt;

    const turb = p.TURBULENCE || 0;
    if (this.piloted && turb > 0) {
      const t = performance.now() * 0.001 + this._noiseSeed;
      this.velocity.x += Math.sin(t * 3.1) * turb * 0.3 * dt;
      this.velocity.z += Math.sin(t * 4.7) * turb * 0.3 * dt;
    }

    const spdSq = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y + this.velocity.z * this.velocity.z;
    const maxS = p.MAX_SPEED_SOFT || 80;
    const maxSq = maxS * maxS;
    if (spdSq > maxSq) {
      const k = maxS / Math.sqrt(spdSq);
      this.velocity.x *= k;
      this.velocity.y *= k;
      this.velocity.z *= k;
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    const floorY = (this.groundY || 0) + this.cfg.DRONE_RADIUS;
    if (this.position.y < floorY) {
      const teleportUp = floorY - this.position.y;
      this.position.y = floorY;
      if (this.velocity.y < 0) {
        const impact = -this.velocity.y;
        this.velocity.y = 0;
        this.velocity.x *= 0.5;
        this.velocity.z *= 0.5;
        if (impact > this.cfg.DRONE_CRASH_SPEED && teleportUp < 0.5) {
          this.crashed = true;
        }
      }
    }

    if (!isFinite(this.position.x) || !isFinite(this.position.y) || !isFinite(this.position.z)) {
      v3set(this.position, 0, 5, 0);
      v3set(this.velocity, 0, 0, 0);
      this.crashed = true;
    }
  }

  _rotateVec(v) {
    const q = this.quaternion;
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return {
      x: v.x + q.w * tx + (q.y * tz - q.z * ty),
      y: v.y + q.w * ty + (q.z * tx - q.x * tz),
      z: v.z + q.w * tz + (q.x * ty - q.y * tx),
    };
  }

  _rotateInv(v) {
    const q = { x: -this.quaternion.x, y: -this.quaternion.y, z: -this.quaternion.z, w: this.quaternion.w };
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return {
      x: v.x + q.w * tx + (q.y * tz - q.z * ty),
      y: v.y + q.w * ty + (q.z * tx - q.x * tz),
      z: v.z + q.w * tz + (q.x * ty - q.y * tx),
    };
  }

  getSpeed() {
    const s = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
    return isFinite(s) ? s : 0;
  }

  getBattery() {
    return this._battery !== undefined ? this._battery : 100;
  }
}