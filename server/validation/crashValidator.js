const MAX_CRASH_DIST = 200;

export function validateCrash(player, x, y, z) {
  if (!isFinite(x) || !isFinite(z)) return false;
  if (!player.drone) return false;

  const dx = x - player.drone.x;
  const dz = z - player.drone.z;
  if (Math.hypot(dx, dz) > MAX_CRASH_DIST) return false;

  return true;
}