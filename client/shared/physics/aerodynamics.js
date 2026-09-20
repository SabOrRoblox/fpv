export function computeThrust(rpm, kThrust) {
  if (!isFinite(rpm) || rpm <= 0) return 0;
  if (!isFinite(kThrust) || kThrust <= 0) return 0;
  return kThrust * 4 * rpm * rpm;
}

export function computeDragLocal(velLocal, dragCoef) {
  if (!velLocal) return { x: 0, y: 0, z: 0 };
  if (!dragCoef) return { x: 0, y: 0, z: 0 };
  const dx = isFinite(dragCoef.x) ? dragCoef.x : 0;
  const dy = isFinite(dragCoef.y) ? dragCoef.y : 0;
  const dz = isFinite(dragCoef.z) ? dragCoef.z : 0;
  return {
    x: -dx * velLocal.x * Math.abs(velLocal.x),
    y: -dy * velLocal.y * Math.abs(velLocal.y),
    z: -dz * velLocal.z * Math.abs(velLocal.z),
  };
}