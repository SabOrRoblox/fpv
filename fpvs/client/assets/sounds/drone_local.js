export function createLocalDrone(ctx, masterGain) {
  const bus = ctx.createGain();
  bus.gain.value = 0.0;
  bus.connect(masterGain);

  const bass = ctx.createOscillator();
  bass.type = 'sawtooth';
  bass.frequency.value = 60;
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.35;
  bass.connect(bassGain);
  bassGain.connect(bus);

  const harm = ctx.createOscillator();
  harm.type = 'square';
  harm.frequency.value = 180;
  const harmGain = ctx.createGain();
  harmGain.gain.value = 0.1;
  harm.connect(harmGain);
  harmGain.connect(bus);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 1.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.25;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(bus);

  bass.start();
  harm.start();
  noise.start();

  return {
    bus, bass, harm, bassGain, harmGain, noise, noiseFilter, noiseGain,
    update(rpm, maxRpm, speed, throttle) {
      const now = ctx.currentTime;
      const ramp = 0.05;
      const t = Math.max(0, Math.min(1, rpm / maxRpm));
      const sp = Math.max(0, Math.min(1, speed / 80));

      try {
        bass.frequency.linearRampToValueAtTime(45 + t * 130 + sp * 20, now + ramp);
        harm.frequency.linearRampToValueAtTime(130 + t * 340 + sp * 40, now + ramp);
        noiseFilter.frequency.linearRampToValueAtTime(500 + t * 1800 + sp * 400, now + ramp);
        bassGain.gain.linearRampToValueAtTime(0.15 + t * 0.35, now + ramp);
        harmGain.gain.linearRampToValueAtTime(0.03 + t * 0.15, now + ramp);
        noiseGain.gain.linearRampToValueAtTime(0.10 + t * 0.35, now + ramp);
        bus.gain.linearRampToValueAtTime(0.25 + t * 0.5 + throttle * 0.2, now + ramp);
      } catch {}
    },
    stop() {
      try { bass.stop(); } catch {}
      try { harm.stop(); } catch {}
      try { noise.stop(); } catch {}
    }
  };
}