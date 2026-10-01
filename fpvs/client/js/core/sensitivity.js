import { TouchJoystick } from '../input/touchJoystick.js';
import { TouchCamera } from '../input/touchCamera.js';
import { CFG } from '../../../shared/config/config.js';

export class Sensitivity {
  constructor() {
    this.move = new TouchJoystick(document.getElementById('joy-move'), {});
    this.camera = new TouchCamera({
      initialDistance: CFG.CAMERA_3RD_DIST,
      minDistance: CFG.CAMERA_3RD_DIST_MIN,
      maxDistance: CFG.CAMERA_3RD_DIST_MAX,
      minPitch: CFG.CAMERA_PITCH_MIN,
      maxPitch: CFG.CAMERA_PITCH_MAX,
      sensitivityYaw: CFG.CAMERA_SENSITIVITY_YAW,
      sensitivityPitch: CFG.CAMERA_SENSITIVITY_PITCH,
      smooth: CFG.CAMERA_SMOOTH,
      resetPitchOnRelease: false,
    });

    this.cylTrack = null;
    this.cylBall = null;
    this.cylValue = 0;
    this.cylActiveId = null;
    this.cylTop = 0;
    this.cylHeight = 0;

    const cylEl = document.getElementById('drone-cylinder');
    if (cylEl) {
      this.cylTrack = cylEl.querySelector('.cyl-track');
      this.cylBall = cylEl.querySelector('.cyl-ball');
      if (this.cylTrack) this._bindCylinder();
    }

    this.carThrottleTrack = null;
    this.carThrottleBall = null;
    this.carThrottleActiveId = null;
    this.carThrottleValue = 0;
    this.carThrottleTop = 0;
    this.carThrottleHeight = 0;

    this.carSteerLeft = false;
    this.carSteerRight = false;

    const carCylEl = document.getElementById('car-cylinder');
    if (carCylEl) {
      this.carThrottleTrack = carCylEl.querySelector('.cyl-track');
      this.carThrottleBall = carCylEl.querySelector('.cyl-ball');
      if (this.carThrottleTrack) this._bindCarThrottle();
    }

    const steerLeft = document.getElementById('btn-steer-left');
    const steerRight = document.getElementById('btn-steer-right');
    if (steerLeft) this._bindSteer(steerLeft, 'left');
    if (steerRight) this._bindSteer(steerRight, 'right');
  }

  _bindCylinder() {
    this._cylDown = (e) => {
      if (this.cylActiveId !== null) return;
      this._refreshCyl();
      if (this.cylHeight <= 0) return;
      this.cylActiveId = e.pointerId;
      this.cylBall.classList.add('active');
      this._setBall(e.clientY);
      e.preventDefault();
    };
    this._cylMove = (e) => {
      if (e.pointerId !== this.cylActiveId) return;
      if (this.cylHeight <= 0) this._refreshCyl();
      this._setBall(e.clientY);
    };
    this._cylUp = (e) => {
      if (e.pointerId !== this.cylActiveId) return;
      this.cylActiveId = null;
      this.cylBall.classList.remove('active');
      this.cylValue = 0;
      this.cylBall.style.top = '50%';
      this.cylBall.style.transform = 'translate(-50%, -50%)';
    };
    this.cylTrack.addEventListener('pointerdown', this._cylDown);
    window.addEventListener('pointermove', this._cylMove);
    window.addEventListener('pointerup', this._cylUp);
    window.addEventListener('pointercancel', this._cylUp);
  }

  _refreshCyl() {
    const rect = this.cylTrack.getBoundingClientRect();
    this.cylTop = rect.top;
    this.cylHeight = rect.height;
  }

  _setBall(clientY) {
    const centerY = this.cylTop + this.cylHeight / 2;
    let dy = clientY - centerY;
    const maxDy = this.cylHeight * 0.4;
    if (dy > maxDy) dy = maxDy;
    if (dy < -maxDy) dy = -maxDy;
    const norm = -dy / maxDy;
    this.cylValue = Math.max(0, Math.min(1, (norm + 1) / 2));
    const ballY = dy + this.cylHeight / 2;
    this.cylBall.style.top = ballY + 'px';
    this.cylBall.style.transform = 'translateX(-50%)';
  }

  _bindCarThrottle() {
    this._carCylDown = (e) => {
      if (this.carThrottleActiveId !== null) return;
      this._refreshCarCyl();
      if (this.carThrottleHeight <= 0) return;
      this.carThrottleActiveId = e.pointerId;
      this.carThrottleBall.classList.add('active');
      this._setCarBall(e.clientY);
      e.preventDefault();
    };
    this._carCylMove = (e) => {
      if (e.pointerId !== this.carThrottleActiveId) return;
      if (this.carThrottleHeight <= 0) this._refreshCarCyl();
      this._setCarBall(e.clientY);
    };
    this._carCylUp = (e) => {
      if (e.pointerId !== this.carThrottleActiveId) return;
      this.carThrottleActiveId = null;
      this.carThrottleBall.classList.remove('active');
      this.carThrottleValue = 0;
      this.carThrottleBall.style.top = '50%';
      this.carThrottleBall.style.transform = 'translate(-50%, -50%)';
    };
    this.carThrottleTrack.addEventListener('pointerdown', this._carCylDown);
    window.addEventListener('pointermove', this._carCylMove);
    window.addEventListener('pointerup', this._carCylUp);
    window.addEventListener('pointercancel', this._carCylUp);
  }

  _refreshCarCyl() {
    const rect = this.carThrottleTrack.getBoundingClientRect();
    this.carThrottleTop = rect.top;
    this.carThrottleHeight = rect.height;
  }

  _setCarBall(clientY) {
    const centerY = this.carThrottleTop + this.carThrottleHeight / 2;
    let dy = clientY - centerY;
    const maxDy = this.carThrottleHeight * 0.4;
    if (dy > maxDy) dy = maxDy;
    if (dy < -maxDy) dy = -maxDy;
    const norm = -dy / maxDy;
    this.carThrottleValue = Math.max(-1, Math.min(1, norm));
    const ballY = dy + this.carThrottleHeight / 2;
    this.carThrottleBall.style.top = ballY + 'px';
    this.carThrottleBall.style.transform = 'translateX(-50%)';
  }

  _bindSteer(el, side) {
    const onDown = (e) => {
      e.preventDefault();
      el.classList.add('active');
      if (side === 'left') this.carSteerLeft = true;
      else this.carSteerRight = true;
    };
    const onUp = () => {
      el.classList.remove('active');
      if (side === 'left') this.carSteerLeft = false;
      else this.carSteerRight = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
  }

  refresh() {
    this.move.refreshSizes();
    this._refreshCyl();
    if (this.carThrottleTrack) this._refreshCarCyl();
  }

  refreshSizes() {
    this.refresh();
  }

  reset() {
    this.move.value.x = 0;
    this.move.value.y = 0;
    this.cylValue = 0;
    if (this.cylBall) {
      this.cylBall.style.top = '50%';
      this.cylBall.style.transform = 'translate(-50%, -50%)';
    }
    this.carThrottleValue = 0;
    this.carSteerLeft = false;
    this.carSteerRight = false;
    if (this.carThrottleBall) {
      this.carThrottleBall.style.top = '50%';
      this.carThrottleBall.style.transform = 'translate(-50%, -50%)';
    }
    const sl = document.getElementById('btn-steer-left');
    const sr = document.getElementById('btn-steer-right');
    if (sl) sl.classList.remove('active');
    if (sr) sr.classList.remove('active');
  }

  getPlayerInput() {
    return {
      moveX: this.move.value.x,
      moveY: this.move.value.y,
    };
  }

  getDroneInput() {
    return {
      throttle: this.cylValue,
      pitch: this.camera.pitch,
      yaw: this.camera.yaw,
    };
  }

  getCarInput() {
    let steer = 0;
    if (this.carSteerLeft) steer += 1;
    if (this.carSteerRight) steer -= 1;
    return {
      throttle: this.carThrottleValue,
      steer,
    };
  }
}