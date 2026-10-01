import { makePanner } from './panner.js';

export function createRemoteDrone(ctx, masterGain) {
  const bus = ctx.createGain();
  bus.gain.value = 0.0;

  const panner = makePanner(ctx, masterGain, { x: 0, y: 0, z: 0 }, 8, 350);
  bus.connect(panner);

  const bass = ctx.createOscillator();
  bass.type = 'sawtooth';
  bass.frequency.value = 60;
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.3;
  bass.connect(bassGain);
  bassGain.connect(bus);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;

  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 800;
  const ng = ctx.createGain();
  ng.gain.value = 0.25;

  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);

  bass.start();
  noise.start();

  return {
    bus, panner, bass, bassGain, noise, nf, ng,
    update(rpm, maxRpm, pos) {
      const now = ctx.currentTime;
      const ramp = 0.08;
      const t = Math.max(0, Math.min(1, rpm / maxRpm));
      try {
        bass.frequency.linearRampToValueAtTime(45 + t * 130, now + ramp);
        nf.frequency.linearRampToValueAtTime(500 + t * 1800, now + ramp);
        bassGain.gain.linearRampToValueAtTime(0.1 + t * 0.35, now + ramp);
        ng.gain.linearRampToValueAtTime(0.08 + t * 0.3, now + ramp);
        bus.gain.linearRampToValueAtTime(0.15 + t * 0.6, now + ramp);
      } catch {}

      if (pos) {
        try {
          panner.positionX.value = pos.x;
          panner.positionY.value = pos.y;
          panner.positionZ.value = pos.z;
        } catch {
          try { panner.setPosition(pos.x, pos.y, pos.z); } catch {}
        }
      }
    },
    stop() {
      try { bass.stop(); } catch {}
      try { noise.stop(); } catch {}
    }
  };
}