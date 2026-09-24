export function createCarEngine(ctx, destination) {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(destination);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 50;

  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = 100;

  const osc3 = ctx.createOscillator();
  osc3.type = 'sawtooth';
  osc3.frequency.value = 25;
  const osc3Gain = ctx.createGain();
  osc3Gain.gain.value = 0.4;
  osc3.connect(osc3Gain);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 300;
  noiseFilter.Q.value = 0.8;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.15;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 3;

  const filter2 = ctx.createBiquadFilter();
  filter2.type = 'lowpass';
  filter2.frequency.value = 800;
  filter2.Q.value = 2;

  const osc1Gain = ctx.createGain();
  osc1Gain.gain.value = 0.55;
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.25;

  osc1.connect(osc1Gain);
  osc1Gain.connect(filter);
  osc2.connect(osc2Gain);
  osc2Gain.connect(filter2);
  osc3Gain.connect(filter);

  filter.connect(master);
  filter2.connect(master);
  noiseGain.connect(master);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 22;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);
  lfo.start();

  osc1.start();
  osc2.start();
  osc3.start();
  noise.start();

  let curRpm = 0;

  return {
    update(rpm, maxRpm, speed, dt) {
      const norm = Math.max(0, Math.min(1, rpm / maxRpm));
      const speedNorm = Math.min(1, speed / 25);

      const baseFreq = 45 + norm * 130;
      const harmFreq = baseFreq * 2;
      const subFreq = baseFreq * 0.5;

      const now = ctx.currentTime;
      const t = 0.05;
      try {
        osc1.frequency.setTargetAtTime(baseFreq, now, t);
        osc2.frequency.setTargetAtTime(harmFreq, now, t);
        osc3.frequency.setTargetAtTime(subFreq, now, t);

        const filterFreq = 400 + norm * 1200;
        filter.frequency.setTargetAtTime(filterFreq, now, t);
        filter2.frequency.setTargetAtTime(filterFreq * 1.2, now, t);

        const vol = 0.06 + norm * 0.22 + speedNorm * 0.08;
        master.gain.setTargetAtTime(vol, now, 0.1);

        noiseGain.gain.setTargetAtTime(0.04 + speedNorm * 0.22, now, t);
        noiseFilter.frequency.setTargetAtTime(200 + speedNorm * 1200, now, t);
      } catch {}

      curRpm = rpm;
    },
    stop() {
      try { osc1.stop(); } catch {}
      try { osc2.stop(); } catch {}
      try { osc3.stop(); } catch {}
      try { noise.stop(); } catch {}
      try { lfo.stop(); } catch {}
      try { master.disconnect(); } catch {}
      try { filter.disconnect(); } catch {}
      try { filter2.disconnect(); } catch {}
      try { noiseFilter.disconnect(); } catch {}
      try { noiseGain.disconnect(); } catch {}
      try { osc1Gain.disconnect(); } catch {}
      try { osc2Gain.disconnect(); } catch {}
      try { osc3Gain.disconnect(); } catch {}
      try { lfoGain.disconnect(); } catch {}
    },
  };
}