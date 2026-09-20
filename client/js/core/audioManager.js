export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.droneNodes = null;
    this._volume = 0.6;
    this.listener = null;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.masterGain.connect(this.ctx.destination);
    this.enabled = true;
  }

  attachListener(camera) {
    this.listener = camera || null;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  playExplosion() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 1.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 2.0);

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2.0, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 1.5);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 2.0);
  }

  playDrone() {
    if (!this.enabled) return;
    if (this.droneNodes) return;
    const ctx = this.ctx;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 80;

    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 160;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = 4;

    const gain1 = ctx.createGain();
    gain1.gain.value = 0.08;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.03;

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(filter);
    gain2.connect(filter);
    filter.connect(this.masterGain);

    osc1.start();
    osc2.start();

    this.droneNodes = { osc1, osc2, filter, gain1, gain2, baseF1: 80, baseF2: 160 };
  }

  stopDrone() {
    if (!this.droneNodes) return;
    const { osc1, osc2 } = this.droneNodes;
    try { osc1.stop(); } catch {}
    try { osc2.stop(); } catch {}
    this.droneNodes = null;
  }

  setDroneRPM(rpm, maxRpm) {
    if (!this.droneNodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (!isFinite(now) || now < 0) return;

    const t = Math.max(0, Math.min(1, rpm / maxRpm));
    const f1 = this.droneNodes.baseF1 * (1 + t * 4.5);
    const f2 = this.droneNodes.baseF2 * (1 + t * 4.5);
    const ramp = 0.08;

    try {
      this.droneNodes.osc1.frequency.linearRampToValueAtTime(f1, now + ramp);
      this.droneNodes.osc2.frequency.linearRampToValueAtTime(f2, now + ramp);
      this.droneNodes.filter.frequency.linearRampToValueAtTime(800 + t * 2200, now + ramp);
      this.droneNodes.gain1.gain.linearRampToValueAtTime(0.05 + t * 0.12, now + ramp);
      this.droneNodes.gain2.gain.linearRampToValueAtTime(0.02 + t * 0.05, now + ramp);
    } catch {}
  }
}