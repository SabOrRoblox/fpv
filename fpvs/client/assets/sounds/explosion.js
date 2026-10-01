import { makePanner } from './panner.js';

export function playExplosion(ctx, masterGain, worldPos) {
  const now = ctx.currentTime;
  const out = worldPos ? makePanner(ctx, masterGain, worldPos, 8, 600) : masterGain;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(22, now + 2.0);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.95, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);
  osc.connect(gain);
  gain.connect(out);
  osc.start(now);
  osc.stop(now + 2.6);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2.5, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(4500, now);
  filter.frequency.exponentialRampToValueAtTime(120, now + 2.0);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.85, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(out);
  noise.start(now);
  noise.stop(now + 2.6);

  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(60, now);
  sub.frequency.exponentialRampToValueAtTime(18, now + 1.4);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.55, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
  sub.connect(subGain);
  subGain.connect(out);
  sub.start(now);
  sub.stop(now + 1.8);
}