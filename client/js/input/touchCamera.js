import { clamp } from '../../shared/math/util.js';

const DEAD_ZONE = 4;
const RADIUS = 110;
const SPEED_FACTOR_MAX = 3.0;
const SPEED_FACTOR_SENS = 0.005;
const EXPO = 0.65;

export class TouchCamera {
  constructor(opts = {}) {
    this.yaw = 0;
    this.pitch = 0;
    this.distance = opts.initialDistance || 10;
    this.minDistance = opts.minDistance || 4;
    this.maxDistance = opts.maxDistance || 20;

    this.sensitivityYaw = opts.sensitivityYaw || 0.012;
    this.sensitivityPitch = opts.sensitivityPitch || 0.012;
    this.smooth = opts.smooth || 35.0;

    this.minPitch = opts.minPitch !== undefined ? opts.minPitch : -1.2;
    this.maxPitch = opts.maxPitch !== undefined ? opts.maxPitch : 0.6;

    this.el = opts.element || document.body;
    this.screenSplit = opts.screenSplit || 0.5;

    this._targetYaw = 0;
    this._targetPitch = 0;
    this._currentYaw = 0;
    this._currentPitch = 0;

    this._pointerId = null;
    this._anchorX = 0;
    this._anchorY = 0;
    this._lastMoveX = 0;
    this._lastMoveY = 0;
    this._lastMoveT = 0;

    this._pointers = new Map();
    this._lastPinchDist = 0;

    this.resetPitchOnRelease = opts.resetPitchOnRelease === true;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);

    this.el.addEventListener('pointerdown', this._onDown, { passive: false });
    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  _isRightHalf(x) {
    return x > window.innerWidth * this.screenSplit;
  }

  _onDown(e) {
    if (!this._isRightHalf(e.clientX)) return;

    this._pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    });

    if (this._pointers.size === 1) {
      this._pointerId = e.pointerId;
      this._anchorX = e.clientX;
      this._anchorY = e.clientY;
      this._lastMoveX = e.clientX;
      this._lastMoveY = e.clientY;
      this._lastMoveT = performance.now() * 0.001;
    } else if (this._pointers.size === 2) {
      this._lastPinchDist = this._pinchDistance();
      this._pointerId = null;
    }
  }

  _onMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;

    p.x = e.clientX;
    p.y = e.clientY;

    if (this._pointers.size === 1 && e.pointerId === this._pointerId) {
      // floating joystick
      const dx = e.clientX - this._anchorX;
      const dy = e.clientY - this._anchorY;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < DEAD_ZONE) return;

      // нормализация в -1..1
      const nx = clamp(dx / RADIUS, -1, 1);
      const ny = clamp(dy / RADIUS, -1, 1);

      // кривая отклика
      const cx = this._curve(nx, EXPO);
      const cy = this._curve(ny, EXPO);

      // ускорение от скорости
      const now = performance.now() * 0.001;
      const dt = Math.max(now - this._lastMoveT, 1e-4);
      const moveDx = e.clientX - this._lastMoveX;
      const moveDy = e.clientY - this._lastMoveY;
      const speed = Math.sqrt(moveDx * moveDx + moveDy * moveDy) / dt;
      const speedFactor = 1 + Math.min(speed * SPEED_FACTOR_SENS, SPEED_FACTOR_MAX);

      this._lastMoveX = e.clientX;
      this._lastMoveY = e.clientY;
      this._lastMoveT = now;

      this._targetYaw -= cx * this.sensitivityYaw * speedFactor;
      this._targetPitch -= cy * this.sensitivityPitch * speedFactor;
      this._targetPitch = clamp(this._targetPitch, this.minPitch, this.maxPitch);
    } else if (this._pointers.size === 2) {
      const dist = this._pinchDistance();
      if (this._lastPinchDist > 0) {
        const delta = dist - this._lastPinchDist;
        this.distance -= delta * 0.05;
        this.distance = clamp(this.distance, this.minDistance, this.maxDistance);
      }
      this._lastPinchDist = dist;
    }

    p.lastX = e.clientX;
    p.lastY = e.clientY;
  }

  _onUp(e) {
    this._pointers.delete(e.pointerId);

    if (e.pointerId === this._pointerId) {
      this._pointerId = null;
      if (this.resetPitchOnRelease) {
        this._targetPitch = 0;
      }
    }

    if (this._pointers.size === 0) {
      this._lastPinchDist = 0;
    } else if (this._pointers.size === 1) {
      this._lastPinchDist = 0;
    }
  }

  _curve(v, expo) {
    const s = v < 0 ? -1 : 1;
    const a = Math.abs(v);
    return s * (a * (1 - expo) + a * a * a * expo);
  }

  _pinchDistance() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  update(dt) {
    if (!isFinite(dt) || dt <= 0) return;
    const k = 1 - Math.exp(-this.smooth * dt);
    if (!isFinite(k)) return;
    this._currentYaw += (this._targetYaw - this._currentYaw) * k;
    this._currentPitch += (this._targetPitch - this._currentPitch) * k;
    if (!isFinite(this._currentYaw)) this._currentYaw = 0;
    if (!isFinite(this._currentPitch)) this._currentPitch = 0;
    this.yaw = this._currentYaw;
    this.pitch = this._currentPitch;
  }

  reset() {
    this._targetYaw = 0;
    this._targetPitch = 0;
    this._currentYaw = 0;
    this._currentPitch = 0;
    this._pointerId = null;
    this._pointers.clear();
  }
}