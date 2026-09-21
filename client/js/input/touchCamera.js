export class TouchCamera {
  constructor(opts = {}) {
    this.yaw = 0;
    this.pitch = 0;
    this.distance = opts.initialDistance || 10;
    this.minDistance = opts.minDistance || 4;
    this.maxDistance = opts.maxDistance || 20;

    this.sensitivityYaw = opts.sensitivityYaw || 0.014;
    this.sensitivityPitch = opts.sensitivityPitch || 0.014;
    this.smooth = opts.smooth || 35.0;

    this.minPitch = opts.minPitch !== undefined ? opts.minPitch : -1.2;
    this.maxPitch = opts.maxPitch !== undefined ? opts.maxPitch : 0.6;

    this.el = opts.element || document.body;
    this.screenSplit = opts.screenSplit || 0.5;

    this._targetYaw = 0;
    this._targetPitch = 0;
    this._currentYaw = 0;
    this._currentPitch = 0;

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
      moved: false,
    });

    if (this._pointers.size === 2) {
      this._lastPinchDist = this._pinchDistance();
    }
  }

  _onMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;

    const dx = e.clientX - p.lastX;
    const dy = e.clientY - p.lastY;

    p.lastX = e.clientX;
    p.lastY = e.clientY;
    p.x = e.clientX;
    p.y = e.clientY;

    if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) return;

    p.moved = true;

    if (this._pointers.size === 1) {
      this._targetYaw -= dx * this.sensitivityYaw;
      this._targetPitch -= dy * this.sensitivityPitch;
      this._targetPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this._targetPitch));
    } else if (this._pointers.size === 2) {
      const dist = this._pinchDistance();
      if (this._lastPinchDist > 0) {
        const delta = dist - this._lastPinchDist;
        this.distance -= delta * 0.05;
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
      }
      this._lastPinchDist = dist;
    }
  }

  _onUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size === 0) {
      this._lastPinchDist = 0;
      if (this.resetPitchOnRelease) {
        this._targetPitch = 0;
      }
    } else if (this._pointers.size === 1) {
      this._lastPinchDist = 0;
    }
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
    this._pointers.clear();
  }
}