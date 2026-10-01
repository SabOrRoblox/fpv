export function makePanner(ctx, masterGain, pos, ref = 5, maxDist = 400) {
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = ref;
  panner.maxDistance = maxDist;
  panner.rolloffFactor = 1.5;
  try {
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
  } catch {
    try { panner.setPosition(pos.x, pos.y, pos.z); } catch {}
  }
  panner.connect(masterGain);
  return panner;
}