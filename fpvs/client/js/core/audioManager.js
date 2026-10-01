import { playExplosion } from '../../assets/sounds/explosion.js';
import { createLocalDrone } from '../../assets/sounds/drone_local.js';
import { createRemoteDrone } from '../../assets/sounds/drone_remote.js';
import { playBatteryBeep } from '../../assets/sounds/battery_beep.js';
import { createCarEngine } from '../../assets/sounds/car_engine.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.listener = null;
    this.drone = null;
    this.remoteDrones = new Map();
    this.wind = null;
    this.carEngine = null;
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

  playWind() {
    if (!this.enabled || !this.ctx) return;
    if (this.wind) return;
    const ctx = this.ctx;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();
    this.wind = { src, filter, gain };
  }

  updateWind(speed) {
    if (!this.wind || !this.ctx) return;
    const t = Math.min(speed / 80, 1);
    const now = this.ctx.currentTime;
    try {
      this.wind.gain.gain.linearRampToValueAtTime(t * 0.15, now + 0.1);
      this.wind.filter.frequency.linearRampToValueAtTime(600 + t * 800, now + 0.1);
    } catch {}
  }

  stopWind() {
    if (!this.wind) return;
    try { this.wind.src.stop(); } catch {}
    try { this.wind.src.disconnect(); } catch {}
    try { this.wind.filter.disconnect(); } catch {}
    try { this.wind.gain.disconnect(); } catch {}
    this.wind = null;
  }

  playCarEngine() {
    if (!this.enabled || !this.ctx) return;
    if (this.carEngine) return;
    this.carEngine = createCarEngine(this.ctx, this.masterGain);
  }

  updateCarEngine(rpm, maxRpm, speed, dt) {
    if (!this.carEngine) return;
    this.carEngine.update(rpm, maxRpm, speed, dt);
  }

  stopCarEngine() {
    if (!this.carEngine) return;
    this.carEngine.stop();
    this.carEngine = null;
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