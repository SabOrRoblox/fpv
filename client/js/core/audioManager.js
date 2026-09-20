import { playExplosion } from '../../assets/sounds/explosion.js';
import { createLocalDrone } from '../../assets/sounds/drone_local.js';
import { createRemoteDrone } from '../../assets/sounds/drone_remote.js';
import { playBatteryBeep } from '../../assets/sounds/battery_beep.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.listener = null;

    this.drone = null;
    this.remoteDrones = new Map();
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.55;
    this.masterGain.connect(this.ctx.destination);

    this.enabled = true;
  }

  attachListener(camera) {
    this.listener = camera || null;
  }

  updateListener() {
    if (!this.listener || !this.ctx) return;
    const l = this.ctx.listener;
    const c = this.listener;
    const e = c.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    try {
      if (l.positionX) {
        l.positionX.value = c.position.x;
        l.positionY.value = c.position.y;
        l.positionZ.value = c.position.z;
        l.forwardX.value = fx;
        l.forwardY.value = fy;
        l.forwardZ.value = fz;
        l.upX.value = ux;
        l.upY.value = uy;
        l.upZ.value = uz;
      } else if (l.setPosition) {
        l.setPosition(c.position.x, c.position.y, c.position.z);
        l.setOrientation(fx, fy, fz, ux, uy, uz);
      }
    } catch {}
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  playExplosion(worldPos) {
    if (!this.enabled || !this.ctx) return;
    playExplosion(this.ctx, this.masterGain, worldPos);
  }

  playBeep(urgent) {
    if (!this.enabled || !this.ctx) return;
    playBatteryBeep(this.ctx, this.masterGain, urgent);
  }

  playDrone() {
    if (!this.enabled || !this.ctx) return;
    if (this.drone) return;
    this.drone = createLocalDrone(this.ctx, this.masterGain);
  }

  stopDrone() {
    if (!this.drone) return;
    this.drone.stop();
    this.drone = null;
  }

  updateDrone(rpm, maxRpm, speed, throttle) {
    if (!this.drone) return;
    this.drone.update(rpm, maxRpm, speed, throttle);
  }

  ensureRemoteDrone(id) {
    if (!this.enabled || !this.ctx) return null;
    if (this.remoteDrones.has(id)) return this.remoteDrones.get(id);
    const node = createRemoteDrone(this.ctx, this.masterGain);
    this.remoteDrones.set(id, node);
    return node;
  }

  updateRemoteDrone(id, rpm, maxRpm, pos) {
    const node = this.ensureRemoteDrone(id);
    if (!node) return;
    node.update(rpm, maxRpm, pos);
  }

  removeRemoteDrone(id) {
    const node = this.remoteDrones.get(id);
    if (!node) return;
    node.stop();
    this.remoteDrones.delete(id);
  }
}